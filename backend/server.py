"""GCSMART FastAPI backend - Auth, Content, Analytics, AI Tutor."""
from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt as pyjwt
import httpx
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from typing import Optional, List, Literal
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="GCSMART API")
api = APIRouter(prefix="/api")

# Serve seeded PDFs at /api/pdfs/*
PDF_DIR = ROOT_DIR / "pdfs"
PDF_DIR.mkdir(exist_ok=True)
app.mount("/api/pdfs", StaticFiles(directory=str(PDF_DIR)), name="pdfs")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("gcsmart")


# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Literal["student", "teacher"] = "student"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SessionIn(BaseModel):
    session_id: str


class OnboardingIn(BaseModel):
    goal: str
    subjects: List[str]
    daily_time: str
    level: str
    learning_style: str
    exam_level: str  # GCE O, GCE A, HND, Concours


class AnswerIn(BaseModel):
    question_id: str
    selected: str
    time_taken: int = 0


class ChatIn(BaseModel):
    session_id: str
    message: str
    current_problem: Optional[str] = None


# ---------- Helpers ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    user_id = None
    # Try JWT first
    try:
        decoded = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = decoded.get("sub")
    except Exception:
        # Try session_token (Google auth)
        sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if sess:
            exp = sess.get("expires_at")
            if exp and exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp and exp > datetime.now(timezone.utc):
                user_id = sess["user_id"]
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def serialize(doc: dict) -> dict:
    d = {k: v for k, v in doc.items() if k != "_id"}
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


# ---------- Auth ----------
@api.post("/auth/register")
async def register(inp: RegisterIn):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": inp.email.lower(),
        "password_hash": hash_pw(inp.password),
        "full_name": inp.full_name,
        "role": inp.role,
        "profile_photo": None,
        "onboarded": False,
        "exam_level": None,
        "xp": 0,
        "level": 1,
        "streak": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    token = make_jwt(user_id)
    user = {k: v for k, v in doc.items() if k not in ("_id", "password_hash")}
    return {"token": token, "user": serialize(user)}


@api.post("/auth/login")
async def login(inp: LoginIn):
    user = await db.users.find_one({"email": inp.email.lower()})
    if not user or not user.get("password_hash") or not check_pw(inp.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_jwt(user["user_id"])
    user.pop("password_hash", None)
    return {"token": token, "user": serialize(user)}


@api.post("/auth/session")
async def google_session(inp: SessionIn):
    """Exchange Emergent session_id for a session_token."""
    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": inp.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session")
    data = r.json()
    email = data.get("email", "").lower()
    name = data.get("name", "")
    picture = data.get("picture")
    session_token = data.get("session_token")

    user = await db.users.find_one({"email": email})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        doc = {
            "user_id": user_id,
            "email": email,
            "full_name": name,
            "profile_photo": picture,
            "role": "student",
            "onboarded": False,
            "exam_level": None,
            "xp": 0,
            "level": 1,
            "streak": 0,
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(doc)
        user = doc
    else:
        user_id = user["user_id"]
        if picture and not user.get("profile_photo"):
            await db.users.update_one({"user_id": user_id}, {"$set": {"profile_photo": picture}})
            user["profile_photo"] = picture

    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })
    user.pop("password_hash", None)
    return {"session_token": session_token, "user": serialize(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return {"user": serialize(user)}


# ---------- Onboarding ----------
@api.post("/users/onboarding")
async def onboarding(inp: OnboardingIn, user: dict = Depends(current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "onboarded": True,
            "goal": inp.goal,
            "onboarding_subjects": inp.subjects,
            "daily_time": inp.daily_time,
            "level": inp.level,
            "learning_style": inp.learning_style,
            "exam_level": inp.exam_level,
        }},
    )
    return {"ok": True}


# ---------- Subjects & Past Papers ----------
@api.get("/subjects")
async def list_subjects(exam_level: Optional[str] = None):
    q = {"exam_level": exam_level} if exam_level else {}
    items = await db.subjects.find(q, {"_id": 0}).to_list(500)
    return {"items": items}


@api.get("/past-papers")
async def list_past_papers(exam_level: Optional[str] = None, subject_id: Optional[str] = None):
    q = {}
    if exam_level:
        q["exam_level"] = exam_level
    if subject_id:
        q["subject_id"] = subject_id
    items = await db.past_papers.find(q, {"_id": 0}).sort("year", -1).to_list(500)
    return {"items": items}


@api.get("/past-papers/{paper_id}")
async def get_paper(paper_id: str):
    paper = await db.past_papers.find_one({"paper_id": paper_id}, {"_id": 0})
    if not paper:
        raise HTTPException(404, "Not found")
    questions = await db.questions.find({"paper_id": paper_id}, {"_id": 0}).to_list(200)
    return {"paper": paper, "questions": questions}


@api.post("/questions/answer")
async def answer(inp: AnswerIn, user: dict = Depends(current_user)):
    q = await db.questions.find_one({"question_id": inp.question_id}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Question not found")
    correct = inp.selected.strip().upper() == q["correct_answer"].strip().upper()
    await db.user_answers.insert_one({
        "user_id": user["user_id"],
        "question_id": inp.question_id,
        "paper_id": q["paper_id"],
        "selected": inp.selected,
        "is_correct": correct,
        "time_taken": inp.time_taken,
        "created_at": datetime.now(timezone.utc),
    })
    # XP + streak
    if correct:
        await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"xp": 10}})
    # Record daily study session
    today = date.today().isoformat()
    await db.study_sessions.update_one(
        {"user_id": user["user_id"], "day": today},
        {"$inc": {"seconds": inp.time_taken, "attempted": 1, "correct": 1 if correct else 0},
         "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {
        "correct": correct,
        "correct_answer": q["correct_answer"],
        "explanation": q.get("explanation", ""),
    }


# ---------- Analytics ----------
@api.get("/analytics/student")
async def analytics(user: dict = Depends(current_user)):
    uid = user["user_id"]
    # Papers completed = distinct papers with at least one answer
    papers = await db.user_answers.distinct("paper_id", {"user_id": uid})
    answers = await db.user_answers.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    total = len(answers)
    correct = sum(1 for a in answers if a.get("is_correct"))
    accuracy = round((correct / total) * 100, 1) if total else 0.0
    total_seconds = sum(a.get("time_taken", 0) for a in answers)
    # Weekly activity: last 7 days
    today = date.today()
    days = [(today - timedelta(days=i)) for i in range(6, -1, -1)]
    sessions = await db.study_sessions.find(
        {"user_id": uid, "day": {"$in": [d.isoformat() for d in days]}}, {"_id": 0}
    ).to_list(50)
    smap = {s["day"]: s for s in sessions}
    weekly = []
    for d in days:
        s = smap.get(d.isoformat(), {})
        weekly.append({
            "day": d.strftime("%a"),
            "minutes": round(s.get("seconds", 0) / 60, 1),
            "attempted": s.get("attempted", 0),
        })
    return {
        "study_hours": round(total_seconds / 3600, 1),
        "accuracy_rate": accuracy,
        "papers_completed": len(papers),
        "target_papers": 20,
        "questions_attempted": total,
        "xp": user.get("xp", 0),
        "streak": user.get("streak", 0),
        "weekly": weekly,
    }


# ---------- Library ----------
@api.get("/library/courses")
async def list_courses():
    items = await db.courses.find({}, {"_id": 0}).to_list(200)
    return {"items": items}


@api.get("/library/courses/{course_id}")
async def get_course(course_id: str):
    c = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    return {"course": c}


# ---------- Teacher ----------
@api.get("/teacher/overview")
async def teacher_overview(user: dict = Depends(current_user)):
    # Basic mock-derived analytics using existing courses / users
    students = await db.users.count_documents({"role": "student"})
    my_courses = await db.courses.find({"teacher_id": user["user_id"]}, {"_id": 0}).to_list(50)
    if not my_courses:
        my_courses = await db.courses.find({}, {"_id": 0}).limit(5).to_list(5)
    monthly_views = sum(c.get("views", 0) for c in my_courses)
    earnings_fcfa = monthly_views * 90
    return {
        "students": students,
        "courses": my_courses,
        "monthly_views": monthly_views,
        "earnings_fcfa": earnings_fcfa,
        "rate_per_view": 90,
    }


# ---------- AI Chat ----------
@api.post("/ai/chat")
async def ai_chat(inp: ChatIn, user: dict = Depends(current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(500, f"AI unavailable: {e}")

    # Load history for this session (last 20 messages)
    history = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": inp.session_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(20)

    system = (
        "You are GC AI Assistant, an expert academic tutor for Cameroon students preparing for "
        "GCE O Level, GCE A Level, HND and Concours exams. Explain step-by-step, use clear math "
        "notation, and be encouraging. Keep answers concise but complete."
    )
    if inp.current_problem:
        system += f"\n\nCurrent problem context:\n{inp.current_problem}"

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=inp.session_id,
        system_message=system,
    ).with_model("anthropic", "claude-haiku-4-5-20251001")

    # Replay history so the model has prior turns
    for m in history:
        if m.get("role") == "user":
            try:
                await chat.send_message(UserMessage(text=m["content"]))
            except Exception:
                pass

    try:
        reply = await chat.send_message(UserMessage(text=inp.message))
    except Exception as e:
        log.exception("AI error")
        raise HTTPException(500, f"AI error: {e}")

    now = datetime.now(timezone.utc)
    await db.chat_messages.insert_many([
        {"user_id": user["user_id"], "session_id": inp.session_id, "role": "user",
         "content": inp.message, "created_at": now},
        {"user_id": user["user_id"], "session_id": inp.session_id, "role": "assistant",
         "content": reply, "created_at": now},
    ])
    return {"reply": reply}


@api.get("/ai/history")
async def ai_history(session_id: str, user: dict = Depends(current_user)):
    msgs = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return {"messages": [serialize(m) for m in msgs]}


# ---------- Health ----------
@api.get("/")
async def root():
    return {"service": "gcsmart", "ok": True}


# ---------- Seed ----------
async def seed():
    if await db.subjects.count_documents({}) > 0:
        return
    log.info("Seeding sample data...")

    subjects_data = [
        # GCE O Level
        ("Mathematics", "MATH-O", "GCE O", "calculator-outline"),
        ("English Language", "ENG-O", "GCE O", "book-outline"),
        ("Physics", "PHY-O", "GCE O", "flash-outline"),
        ("Chemistry", "CHEM-O", "GCE O", "flask-outline"),
        ("Biology", "BIO-O", "GCE O", "leaf-outline"),
        ("Geography", "GEO-O", "GCE O", "earth-outline"),
        # GCE A Level
        ("Pure Mathematics", "PMATH-A", "GCE A", "calculator-outline"),
        ("Further Mathematics", "FMATH-A", "GCE A", "infinite-outline"),
        ("Physics", "PHY-A", "GCE A", "flash-outline"),
        ("Chemistry", "CHEM-A", "GCE A", "flask-outline"),
        ("Economics", "ECON-A", "GCE A", "trending-up-outline"),
        ("Literature", "LIT-A", "GCE A", "library-outline"),
        # HND
        ("Computer Science", "CS-HND", "HND", "code-slash-outline"),
        ("Business Management", "BM-HND", "HND", "briefcase-outline"),
        ("Accounting", "ACC-HND", "HND", "cash-outline"),
        # Concours
        ("General Knowledge", "GK-CON", "Concours", "bulb-outline"),
        ("French", "FR-CON", "Concours", "language-outline"),
    ]
    subjects = []
    for name, code, level, icon in subjects_data:
        subjects.append({
            "subject_id": f"subj_{uuid.uuid4().hex[:8]}",
            "name": name, "code": code, "exam_level": level, "icon": icon,
        })
    await db.subjects.insert_many(subjects)

    # Real GCE A-Level 2025 PDF papers (uploaded by user)
    pmath_a = next(s for s in subjects if s["code"] == "PMATH-A")
    real_pdf_papers = [
        {
            "paper_id": f"paper_{uuid.uuid4().hex[:10]}",
            "subject_id": pmath_a["subject_id"],
            "subject_name": "Pure Mathematics with Mechanics",
            "exam_level": "GCE A",
            "year": 2025,
            "paper_number": 2,
            "total_marks": 100,
            "question_count": 0,
            "duration_minutes": 180,
            "pdf_url": "/api/pdfs/pmm2.pdf",
            "title": "A-Level 2025 Pure Mathematics with Mechanics — Paper 2",
        },
        {
            "paper_id": f"paper_{uuid.uuid4().hex[:10]}",
            "subject_id": pmath_a["subject_id"],
            "subject_name": "Pure Mathematics with Mechanics",
            "exam_level": "GCE A",
            "year": 2025,
            "paper_number": 3,
            "total_marks": 100,
            "question_count": 0,
            "duration_minutes": 180,
            "pdf_url": "/api/pdfs/pmm3.pdf",
            "title": "A-Level 2025 Pure Mathematics with Mechanics — Paper 3",
        },
    ]
    await db.past_papers.insert_many(real_pdf_papers)

    # Sample past papers with questions for A-Level Pure Math and O-Level Math
    math_a = next(s for s in subjects if s["code"] == "PMATH-A")
    math_o = next(s for s in subjects if s["code"] == "MATH-O")
    phy_a = next(s for s in subjects if s["code"] == "PHY-A")

    papers = []
    for subj in [math_a, math_o, phy_a]:
        for year in [2024, 2023, 2022, 2021]:
            for paper_no in [1, 2]:
                papers.append({
                    "paper_id": f"paper_{uuid.uuid4().hex[:10]}",
                    "subject_id": subj["subject_id"],
                    "subject_name": subj["name"],
                    "exam_level": subj["exam_level"],
                    "year": year,
                    "paper_number": paper_no,
                    "total_marks": 100 if paper_no == 2 else 50,
                    "question_count": 5 if paper_no == 1 else 3,
                    "duration_minutes": 90 if paper_no == 1 else 180,
                })
    await db.past_papers.insert_many(papers)

    # Add MCQ questions to Paper 1s only
    mcq_bank_math = [
        {"q": "Given that f(x) = ∫(3x² - 4x + 1)dx, find the value of the constant of integration c if f(1) = 5.",
         "opts": {"A": "c = 2", "B": "c = 4", "C": "c = 5", "D": "c = 6"}, "ans": "C",
         "exp": "Integrating: x³ - 2x² + x + c. Substituting x=1: 1 - 2 + 1 + c = 5, so c = 5."},
        {"q": "The derivative of sin(2x) with respect to x is:",
         "opts": {"A": "cos(2x)", "B": "2cos(2x)", "C": "-2cos(2x)", "D": "sin(2x)/2"}, "ans": "B",
         "exp": "By chain rule: d/dx[sin(2x)] = 2cos(2x)."},
        {"q": "Solve for x: 2^(x+1) = 32",
         "opts": {"A": "x = 3", "B": "x = 4", "C": "x = 5", "D": "x = 6"}, "ans": "B",
         "exp": "32 = 2⁵, so x + 1 = 5, giving x = 4."},
        {"q": "The value of lim(x→0) sin(x)/x is:",
         "opts": {"A": "0", "B": "1", "C": "∞", "D": "undefined"}, "ans": "B",
         "exp": "This is a standard limit equal to 1."},
        {"q": "If log₁₀(x) = 2, then x equals:",
         "opts": {"A": "20", "B": "100", "C": "200", "D": "1000"}, "ans": "B",
         "exp": "log₁₀(x) = 2 means x = 10² = 100."},
    ]
    mcq_bank_phy = [
        {"q": "A body of mass 2 kg accelerates at 3 m/s². The net force is:",
         "opts": {"A": "1 N", "B": "5 N", "C": "6 N", "D": "9 N"}, "ans": "C",
         "exp": "F = ma = 2 × 3 = 6 N."},
        {"q": "The SI unit of electric charge is:",
         "opts": {"A": "Ampere", "B": "Volt", "C": "Coulomb", "D": "Ohm"}, "ans": "C",
         "exp": "Charge is measured in Coulombs (C)."},
        {"q": "Which of the following is a vector quantity?",
         "opts": {"A": "Mass", "B": "Time", "C": "Velocity", "D": "Energy"}, "ans": "C",
         "exp": "Velocity has both magnitude and direction."},
        {"q": "The acceleration due to gravity on Earth is approximately:",
         "opts": {"A": "1.8 m/s²", "B": "9.8 m/s²", "C": "20 m/s²", "D": "100 m/s²"}, "ans": "B",
         "exp": "Standard value is 9.8 m/s²."},
        {"q": "Ohm's law states that V = ?",
         "opts": {"A": "IR", "B": "I/R", "C": "R/I", "D": "I + R"}, "ans": "A",
         "exp": "Voltage = Current × Resistance."},
    ]

    questions = []
    for p in papers:
        if p["paper_number"] != 1:
            continue
        bank = mcq_bank_phy if "Physics" in p["subject_name"] else mcq_bank_math
        for i, item in enumerate(bank):
            questions.append({
                "question_id": f"q_{uuid.uuid4().hex[:10]}",
                "paper_id": p["paper_id"],
                "index": i,
                "question_text": item["q"],
                "options": item["opts"],
                "correct_answer": item["ans"],
                "explanation": item["exp"],
                "marks": 2,
            })
    await db.questions.insert_many(questions)

    # Library courses
    thumb = "https://images.unsplash.com/photo-1708011271954-c0d2b3155ded?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTJ8MHwxfHNlYXJjaHwxfHxtYXRoJTIwcGh5c2ljcyUyMHRleHRib29rfGVufDB8fHx8MTc4NjE2OTQ0OXww&ixlib=rb-4.1.0&q=85"
    tavatar = "https://images.unsplash.com/photo-1541178735493-479c1a27ed24?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwxfHxhZnJpY2FuJTIwdGVhY2hlciUyMGxhcHRvcHxlbnwwfHx8fDE3ODYxNjk0NDl8MA&ixlib=rb-4.1.0&q=85"

    courses = [
        {
            "course_id": f"course_{uuid.uuid4().hex[:8]}",
            "title": "Advanced Mechanics: Rotating Rigid Body Dynamics",
            "subject_name": "Physics", "exam_level": "GCE A",
            "teacher_name": "Dr. Nkeng Paul",
            "teacher_avatar": tavatar,
            "thumbnail": thumb,
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            "duration": "42:15",
            "views": 1240,
            "rating": 4.8,
            "description": "Master torque, angular momentum and rotational kinematics for Paper 2.",
            "methodology": [
                {"title": "Variable Identification", "text": "Isolate the known parameters from the problem text. In Paper 2, marks are awarded for clearly stating assumptions and given values before calculation."},
                {"title": "Vector Decomposition", "text": "Break down the diagonal forces into horizontal and vertical components using trigonometric identities. Ensure your calculator is in Degree mode."},
                {"title": "Apply Newton's Second Law", "text": "Sum torques about the pivot: τ_net = I·α. State the moment of inertia formula clearly."},
            ],
            "chapters": [
                {"title": "Torque method", "duration": "12:04"},
                {"title": "Moments of inertia", "duration": "09:22"},
                {"title": "Small-angle oscillation", "duration": "20:49"},
            ],
        },
        {
            "course_id": f"course_{uuid.uuid4().hex[:8]}",
            "title": "Calculus Masterclass: Integration Techniques",
            "subject_name": "Pure Mathematics", "exam_level": "GCE A",
            "teacher_name": "Ms. Fon Bih",
            "teacher_avatar": tavatar,
            "thumbnail": thumb,
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
            "duration": "38:00",
            "views": 980,
            "rating": 4.9,
            "description": "Substitution, by parts, partial fractions — with GCE-style examples.",
            "methodology": [
                {"title": "Recognize the pattern", "text": "Look for u-substitution first before attempting integration by parts."},
                {"title": "LIATE Rule", "text": "Choose u by the LIATE order: Logarithm, Inverse, Algebraic, Trigonometric, Exponential."},
            ],
            "chapters": [
                {"title": "u-Substitution", "duration": "10:12"},
                {"title": "Integration by parts", "duration": "13:45"},
                {"title": "Partial fractions", "duration": "14:03"},
            ],
        },
        {
            "course_id": f"course_{uuid.uuid4().hex[:8]}",
            "title": "Organic Chemistry: Reaction Mechanisms",
            "subject_name": "Chemistry", "exam_level": "GCE A",
            "teacher_name": "Mr. Tabi Enow",
            "teacher_avatar": tavatar,
            "thumbnail": thumb,
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            "duration": "29:30",
            "views": 720,
            "rating": 4.7,
            "description": "SN1, SN2, E1, E2 — decision trees and past exam questions.",
            "methodology": [
                {"title": "Identify substrate", "text": "Primary, secondary or tertiary carbon dictates the mechanism."},
            ],
            "chapters": [{"title": "Substitution", "duration": "14:00"}, {"title": "Elimination", "duration": "15:30"}],
        },
    ]
    await db.courses.insert_many(courses)
    log.info(f"Seeded {len(subjects)} subjects, {len(papers)} papers, {len(questions)} questions, {len(courses)} courses.")


async def ensure_pdf_papers():
    """Idempotent: add real PDF papers if missing."""
    pmath = await db.subjects.find_one({"code": "PMATH-A"}, {"_id": 0})
    if not pmath:
        return
    for pnum, fname in [(2, "pmm2.pdf"), (3, "pmm3.pdf")]:
        existing = await db.past_papers.find_one({
            "subject_id": pmath["subject_id"], "year": 2025, "paper_number": pnum,
            "pdf_url": f"/api/pdfs/{fname}",
        })
        if existing:
            continue
        await db.past_papers.insert_one({
            "paper_id": f"paper_{uuid.uuid4().hex[:10]}",
            "subject_id": pmath["subject_id"],
            "subject_name": "Pure Mathematics with Mechanics",
            "exam_level": "GCE A",
            "year": 2025,
            "paper_number": pnum,
            "total_marks": 100,
            "question_count": 0,
            "duration_minutes": 180,
            "pdf_url": f"/api/pdfs/{fname}",
            "title": f"A-Level 2025 Pure Mathematics with Mechanics — Paper {pnum}",
        })


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.subjects.create_index("subject_id", unique=True)
    await db.past_papers.create_index("paper_id", unique=True)
    await db.questions.create_index("question_id", unique=True)
    await db.courses.create_index("course_id", unique=True)
    await seed()
    await ensure_pdf_papers()

    # Seed a demo teacher account
    if not await db.users.find_one({"email": "teacher@gcsmart.cm"}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": "teacher@gcsmart.cm",
            "password_hash": hash_pw("Teacher123!"),
            "full_name": "Dr. Nkeng Paul",
            "role": "teacher",
            "onboarded": True,
            "exam_level": "GCE A",
            "xp": 0, "level": 1, "streak": 0,
            "created_at": datetime.now(timezone.utc),
        })
    if not await db.users.find_one({"email": "student@gcsmart.cm"}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": "student@gcsmart.cm",
            "password_hash": hash_pw("Student123!"),
            "full_name": "Alex Ngwa",
            "role": "student",
            "onboarded": True,
            "exam_level": "GCE A",
            "onboarding_subjects": ["Pure Mathematics", "Physics"],
            "xp": 320, "level": 4, "streak": 5,
            "created_at": datetime.now(timezone.utc),
        })


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
