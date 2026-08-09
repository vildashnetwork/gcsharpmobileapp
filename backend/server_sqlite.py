# # server_unified.py - Fixed version with proper index handling
# import os
# import io
# import re
# import json
# import uuid
# import logging
# from pathlib import Path
# from datetime import datetime, timezone, timedelta, date
# from typing import Optional, List, Literal
# from contextlib import asynccontextmanager

# from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Request, Response
# from fastapi.staticfiles import StaticFiles
# from fastapi.responses import StreamingResponse, Response as FastResponse
# from fastapi.middleware.cors import CORSMiddleware
# from dotenv import load_dotenv
# from pydantic import BaseModel, EmailStr, Field
# from motor.motor_asyncio import AsyncIOMotorClient
# import bcrypt
# import jwt as pyjwt
# import httpx

# # ============================================================
# # Configuration & Environment
# # ============================================================

# ROOT_DIR = Path(__file__).parent
# load_dotenv(ROOT_DIR / ".env")

# # Environment variables
# MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
# DB_NAME = os.environ.get("DB_NAME", "gcsmart")
# JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key-change-this-in-production")
# OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
# OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openrouter/free")
# PORT = int(os.environ.get("PORT", 8000))
# APP_URL = os.environ.get("APP_URL", f"http://localhost:{PORT}")
# APP_NAME = os.environ.get("APP_NAME", "GCSMART")
# CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# # Initialize MongoDB
# client = AsyncIOMotorClient(MONGO_URL)
# db = client[DB_NAME]

# print(f"✅ Connected to MongoDB: {MONGO_URL[:40]}...")
# print(f"📚 Database: {DB_NAME}")

# # ============================================================
# # Lifespan Events
# # ============================================================

# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     print("🚀 Starting Unified GCSMART API Server...")
    
#     # ============================================================
#     # FIX: Drop problematic collections and recreate indexes
#     # ============================================================
    
#     # Drop collections that might have index issues
#     try:
#         # Check if drafts collection exists and drop it
#         collections = await db.list_collection_names()
#         if "drafts" in collections:
#             await db.drafts.drop()
#             print("✅ Dropped drafts collection to fix index issues")
#     except Exception as e:
#         print(f"⚠️ Could not drop drafts: {e}")
    
#     try:
#         # Create indexes with proper error handling
#         await db.users.create_index("email", unique=True)
#         await db.users.create_index("user_id", unique=True)
#         await db.user_sessions.create_index("session_token", unique=True)
#         await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
#         await db.subjects.create_index("subject_id", unique=True)
#         await db.past_papers.create_index("paper_id", unique=True)
#         await db.questions.create_index("question_id", unique=True)
#         await db.questions_cache.create_index("cache_key", unique=True)
#         await db.courses.create_index("course_id", unique=True)
#         await db.lesson_videos.create_index("lesson_id", unique=True)
#         await db.drafts.create_index("draft_id", unique=True)
#         await db.papers.create_index("paper_id", unique=True)
#         await db.attempts.create_index("attempt_id", unique=True)
#         await db.chat_messages.create_index("session_id", 1)
#         await db.chat_messages.create_index("user_id", 1)
#         await db.ai_sessions.create_index("session_id", unique=True)
#         await db.study_sessions.create_index("user_id", 1)
#         await db.study_sessions.create_index("day", 1)
#         print("✅ Indexes created successfully")
#     except Exception as e:
#         print(f"⚠️ Index creation warning (may be harmless): {e}")
    
#     # Seed data
#     try:
#         await seed_all_data()
#     except Exception as e:
#         print(f"⚠️ Seed data warning: {e}")
    
#     yield
    
#     # Shutdown
#     client.close()
#     print("🛑 Server shutting down")

# # ============================================================
# # FastAPI App
# # ============================================================

# app = FastAPI(
#     title="GCSMART Unified API",
#     version="2.0.0",
#     description="AI-Powered Educational Platform for Cameroon Students",
#     docs_url="/docs",
#     redoc_url="/redoc",
#     lifespan=lifespan
# )
# api_router = APIRouter(prefix="/api")

# # Serve seeded PDFs
# PDF_DIR = ROOT_DIR / "pdfs"
# PDF_DIR.mkdir(exist_ok=True)
# app.mount("/api/pdfs", StaticFiles(directory=str(PDF_DIR)), name="pdfs")

# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger("gcsmart")

# # ============================================================
# # CORS Configuration
# # ============================================================

# app.add_middleware(
#     CORSMiddleware,
#     allow_credentials=True,
#     allow_origins=CORS_ORIGINS,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # ============================================================
# # LLM Client with Fallback Chain
# # ============================================================

# DEFAULT_MODEL_CHAIN = [
#     "google/gemma-4-31b-it:free",
#     "nvidia/nemotron-3-ultra-550b-a55b:free",
#     "openai/gpt-oss-20b:free",
#     "openrouter/free",
# ]

# def _sanitize_model_id(raw: str) -> str:
#     s = raw.strip()
#     m = re.match(r'^[A-Z][A-Z0-9_]*=(.+)$', s)
#     if m:
#         logger.warning(f"Stripping KEY= prefix from model ID: {s!r}")
#         s = m.group(1).strip()
#     if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
#         s = s[1:-1].strip()
#     return s

# def _get_model_chain() -> List[str]:
#     primary = _sanitize_model_id(os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL_CHAIN[0]))
#     extra_raw = os.environ.get("OPENROUTER_MODEL_FALLBACKS", "")
#     extra = [_sanitize_model_id(m) for m in extra_raw.split(",") if m.strip()]
#     chain = [primary] + extra + DEFAULT_MODEL_CHAIN
#     seen = set()
#     ordered = []
#     for m in chain:
#         if m not in seen:
#             seen.add(m)
#             ordered.append(m)
#     return ordered

# class SimpleLLM:
#     def __init__(self, api_key: str = "", models: Optional[List[str]] = None):
#         self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
#         self.models = models or _get_model_chain()
#         self.base_url = "https://openrouter.ai/api/v1"
#         self.system_message = ""
#         self.session_id = None
#         self.referer = APP_URL
#         self.title = APP_NAME

#     async def _call_model(self, hc: httpx.AsyncClient, model: str, message: str) -> Optional[str]:
#         payload = {
#             "model": model,
#             "messages": [
#                 {"role": "system", "content": self.system_message},
#                 {"role": "user", "content": message},
#             ],
#             "temperature": 0.3,
#             "max_tokens": 1000,
#         }
#         headers = {
#             "Authorization": f"Bearer {self.api_key}",
#             "Content-Type": "application/json",
#             "HTTP-Referer": self.referer,
#             "X-Title": self.title,
#         }
#         try:
#             response = await hc.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
#         except httpx.RequestError as e:
#             logger.warning(f"OpenRouter request error for {model}: {e}")
#             return None

#         if response.status_code == 200:
#             try:
#                 data = response.json()
#                 content = data["choices"][0]["message"]["content"]
#                 if content and content.strip():
#                     return content
#                 logger.warning(f"Model {model} returned empty content")
#                 return None
#             except Exception as e:
#                 logger.warning(f"Model {model} returned unparseable response: {e}")
#                 return None

#         logger.warning(f"Model {model} failed: {response.status_code}")
#         return None

#     async def send_message(self, message: str) -> str:
#         if not self.api_key:
#             return "AI service not configured. Please set OPENROUTER_API_KEY in .env"
#         async with httpx.AsyncClient(timeout=30.0) as hc:
#             for model in self.models:
#                 result = await self._call_model(hc, model, message)
#                 if result is not None:
#                     return result
#         return "I'm having trouble reaching the AI service. Please try again."

# # ============================================================
# # Local Math Solver
# # ============================================================

# def solve_math_local(question: str) -> Optional[str]:
#     try:
#         import sympy as sp
#         from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application

#         q = question.lower().strip()
#         math_signal = re.search(r'[0-9]', q) and re.search(r'[+\-*/=^]|sqrt|solve|simplify|factor|derivative|integrate', q)
#         if not math_signal:
#             return None

#         transformations = standard_transformations + (implicit_multiplication_application,)
#         cleaned = re.sub(r'\b(solve|find|simplify|integrate|differentiate|factor|for|the|of|value|calculate)\b', ' ', q)
#         allowed = re.findall(r'[0-9a-z+\-*/^=().,\s]', cleaned)
#         expr_str = ''.join(allowed).strip()
#         expr_str = re.sub(r'\s+', ' ', expr_str).strip()
#         expr_str = expr_str.replace('^', '**')

#         if not expr_str or not re.search(r'[0-9]', expr_str):
#             return None

#         if '=' in expr_str:
#             parts = expr_str.split('=')
#             if len(parts) != 2:
#                 return None
#             left, right = parts
#             expr = parse_expr(f"({left}) - ({right})", transformations=transformations)
#             free_syms = list(expr.free_symbols)
#             if not free_syms:
#                 return None
#             solutions = sp.solve(expr, free_syms[0] if len(free_syms) == 1 else free_syms)
#             if solutions:
#                 return f"Solutions: {', '.join(str(s) for s in solutions)}"
#             return None
#         else:
#             expr = parse_expr(expr_str, transformations=transformations)
#             simplified = sp.simplify(expr)
#             return str(simplified)
#     except Exception as e:
#         logger.debug(f"Local math solver error: {e}")
#         return None

# # ============================================================
# # Pydantic Models
# # ============================================================

# class RegisterRequest(BaseModel):
#     name: str
#     email: EmailStr
#     password: str

# class LoginRequest(BaseModel):
#     email: EmailStr
#     password: str

# class ProfileUpdate(BaseModel):
#     role: Optional[str] = None
#     bio: Optional[str] = None
#     institution: Optional[str] = None
#     exam_level: Optional[str] = None
#     study_year: Optional[int] = None
#     subjects: Optional[List[str]] = None
#     goals: Optional[List[str]] = None
#     daily_commitment: Optional[str] = None
#     proficiency: Optional[str] = None
#     learning_style: Optional[str] = None
#     specialization: Optional[str] = None
#     onboarded: Optional[bool] = None

# class OnboardingIn(BaseModel):
#     goal: str
#     subjects: List[str]
#     daily_time: str
#     level: str
#     learning_style: str
#     exam_level: str

# class ChatRequest(BaseModel):
#     session_id: Optional[str] = None
#     message: str
#     subject: Optional[str] = "General"
#     current_problem: Optional[str] = None

# class SolveRequest(BaseModel):
#     question: str
#     subject: Optional[str] = None
#     variable: str = "x"

# class GenerateQuestionsRequest(BaseModel):
#     level: str
#     subject: str
#     year: int
#     paper: int = 1
#     count: int = 10

# class SubmitAttemptRequest(BaseModel):
#     level: str
#     subject: str
#     year: int
#     paper: int
#     answers: List[dict]
#     score: int
#     total: int
#     time_spent: int
#     questions_snapshot: Optional[list] = None

# class CourseCreate(BaseModel):
#     title: str
#     description: str
#     subject: str
#     level: str
#     video_url: str
#     thumbnail: Optional[str] = None
#     price: float = 0
#     duration: Optional[str] = "45:00"

# class DraftRequest(BaseModel):
#     paper_id: str

# class AskRequest(BaseModel):
#     paper_id: str
#     question: str

# class AnswerIn(BaseModel):
#     question_id: str
#     selected: str
#     time_taken: int = 0

# class LessonIn(BaseModel):
#     title: str
#     description: str
#     subject_id: Optional[str] = None
#     subject_name: str
#     exam_level: str
#     video_url: str
#     thumbnail: Optional[str] = None
#     duration: Optional[str] = None

# # ============================================================
# # Auth Helpers
# # ============================================================

# def hash_pw(pw: str) -> str:
#     return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

# def check_pw(pw: str, hashed: str) -> bool:
#     try:
#         return bcrypt.checkpw(pw.encode(), hashed.encode())
#     except Exception:
#         return False

# def make_jwt(user_id: str) -> str:
#     payload = {
#         "sub": user_id,
#         "iat": datetime.now(timezone.utc),
#         "exp": datetime.now(timezone.utc) + timedelta(days=7),
#     }
#     return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

# def _new_chat(session_id: str, system: str) -> SimpleLLM:
#     api_key = os.environ.get("OPENROUTER_API_KEY", "")
#     chat = SimpleLLM(api_key=api_key)
#     chat.system_message = system
#     chat.session_id = session_id
#     return chat

# async def get_current_user(authorization: Optional[str] = Header(None)):
#     if not authorization or not authorization.startswith("Bearer "):
#         raise HTTPException(status_code=401, detail="Missing token")
#     token = authorization.split(" ", 1)[1]
    
#     try:
#         decoded = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
#         user_id = decoded.get("sub")
#     except Exception:
#         session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
#         if session:
#             exp = session.get("expires_at")
#             if exp and exp.tzinfo is None:
#                 exp = exp.replace(tzinfo=timezone.utc)
#             if exp and exp > datetime.now(timezone.utc):
#                 user_id = session["user_id"]
#             else:
#                 raise HTTPException(status_code=401, detail="Session expired")
#         else:
#             raise HTTPException(status_code=401, detail="Invalid token")
    
#     if not user_id:
#         raise HTTPException(status_code=401, detail="Invalid token")
    
#     user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
#     if not user:
#         raise HTTPException(status_code=401, detail="User not found")
#     return user

# async def get_current_user_optional(authorization: Optional[str] = Header(None)):
#     if not authorization or not authorization.startswith("Bearer "):
#         return None
#     try:
#         return await get_current_user(authorization)
#     except HTTPException:
#         return None

# def serialize(doc: dict) -> dict:
#     if doc is None:
#         return {}
#     d = {k: v for k, v in doc.items() if k != "_id"}
#     for k, v in list(d.items()):
#         if isinstance(v, datetime):
#             d[k] = v.isoformat()
#     return d

# def _clean_json(text: str):
#     text = text.strip()
#     try:
#         return json.loads(text)
#     except:
#         pass
    
#     fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
#     if fence_match:
#         try:
#             return json.loads(fence_match.group(1))
#         except:
#             pass
    
#     start = text.find('{')
#     if start != -1:
#         depth = 0
#         for i in range(start, len(text)):
#             ch = text[i]
#             if ch == '{':
#                 depth += 1
#             elif ch == '}':
#                 depth -= 1
#                 if depth == 0:
#                     try:
#                         return json.loads(text[start:i + 1])
#                     except:
#                         break
#     raise ValueError("Could not extract valid JSON")

# # ============================================================
# # Authentication Routes
# # ============================================================

# @api_router.post("/auth/register")
# async def register_user(req: RegisterRequest):
#     existing = await db.users.find_one({"email": req.email.lower()})
#     if existing:
#         raise HTTPException(400, "Email already registered")
    
#     user_id = f"user_{uuid.uuid4().hex[:12]}"
#     user = {
#         "user_id": user_id,
#         "email": req.email.lower(),
#         "password_hash": hash_pw(req.password),
#         "full_name": req.name,
#         "role": "student",
#         "onboarded": False,
#         "bio": "",
#         "institution": "",
#         "exam_level": "",
#         "study_year": None,
#         "subjects": [],
#         "goals": [],
#         "daily_commitment": "",
#         "proficiency": "",
#         "learning_style": "",
#         "specialization": "",
#         "xp": 0,
#         "level": 1,
#         "streak": 0,
#         "created_at": datetime.now(timezone.utc).isoformat(),
#     }
#     await db.users.insert_one(user)
#     token = make_jwt(user_id)
#     user.pop("password_hash", None)
#     return {"token": token, "user": user}

# @api_router.post("/auth/login")
# async def login_user(req: LoginRequest, response: Response):
#     user = await db.users.find_one({"email": req.email.lower()})
#     if not user or not user.get("password_hash") or not check_pw(req.password, user["password_hash"]):
#         raise HTTPException(401, "Invalid credentials")
    
#     session_token = f"tok_{uuid.uuid4().hex}"
#     expires_at = datetime.now(timezone.utc) + timedelta(days=7)
#     await db.user_sessions.insert_one({
#         "user_id": user["user_id"],
#         "session_token": session_token,
#         "expires_at": expires_at.isoformat(),
#         "created_at": datetime.now(timezone.utc).isoformat(),
#     })
    
#     response.set_cookie(
#         key="session_token", value=session_token,
#         httponly=True, secure=True, samesite="none", path="/",
#         max_age=7 * 24 * 60 * 60,
#     )
#     user.pop("password_hash", None)
#     return {"token": session_token, "user": user}

# @api_router.post("/auth/session")
# async def process_session(request: Request, response: Response):
#     """Process OAuth session from EmergentAgent for Google Sign-In"""
#     session_id = request.headers.get("X-Session-ID")
    
#     if not session_id:
#         try:
#             body = await request.json()
#             session_id = body.get("session_id")
#         except:
#             pass
    
#     if not session_id:
#         raise HTTPException(status_code=400, detail="Missing session id")

#     try:
#         async with httpx.AsyncClient(timeout=15) as hc:
#             r = await hc.get(
#                 "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
#                 headers={"X-Session-ID": session_id},
#             )
#     except Exception as e:
#         logger.error(f"Error calling EmergentAgent: {e}")
#         raise HTTPException(status_code=502, detail=f"Authentication service error: {str(e)}")
    
#     if r.status_code != 200:
#         logger.error(f"EmergentAgent returned {r.status_code}: {r.text}")
#         raise HTTPException(status_code=401, detail="Authentication failed")
    
#     data = r.json()
#     email = data.get("email", "").lower()
#     name = data.get("name", "")
#     picture = data.get("picture")
#     session_token = data.get("session_token") or f"tok_{uuid.uuid4().hex}"

#     existing = await db.users.find_one({"email": email})
    
#     if existing:
#         user = existing
#         user_id = user["user_id"]
#         if picture and not user.get("profile_photo"):
#             await db.users.update_one({"user_id": user_id}, {"$set": {"profile_photo": picture}})
#             user["profile_photo"] = picture
#     else:
#         user_id = f"user_{uuid.uuid4().hex[:12]}"
#         user = {
#             "user_id": user_id,
#             "email": email,
#             "full_name": name,
#             "profile_photo": picture,
#             "password_hash": "",
#             "role": "student",
#             "onboarded": True,
#             "bio": "",
#             "institution": "",
#             "exam_level": "",
#             "study_year": None,
#             "subjects": [],
#             "goals": [],
#             "daily_commitment": "",
#             "proficiency": "",
#             "learning_style": "",
#             "specialization": "",
#             "xp": 0,
#             "level": 1,
#             "streak": 0,
#             "created_at": datetime.now(timezone.utc).isoformat(),
#         }
#         await db.users.insert_one(dict(user))
    
#     expires_at = datetime.now(timezone.utc) + timedelta(days=7)
#     await db.user_sessions.insert_one({
#         "session_token": session_token,
#         "user_id": user_id,
#         "expires_at": expires_at.isoformat(),
#         "created_at": datetime.now(timezone.utc).isoformat(),
#     })

#     response.set_cookie(
#         key="session_token", value=session_token,
#         httponly=True, secure=True, samesite="none", path="/",
#         max_age=7 * 24 * 60 * 60,
#     )
    
#     user.pop("password_hash", None)
#     user.pop("_id", None)
#     return {"session_token": session_token, "user": user}

# @api_router.get("/auth/me")
# async def auth_me(user: dict = Depends(get_current_user)):
#     user.pop("password_hash", None)
#     return {"user": user}

# @api_router.post("/auth/logout")
# async def logout(request: Request, response: Response):
#     token = request.cookies.get("session_token")
#     if token:
#         await db.user_sessions.delete_one({"session_token": token})
#     response.delete_cookie("session_token", path="/")
#     return {"ok": True}

# @api_router.put("/auth/profile")
# async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
#     update = {k: v for k, v in payload.model_dump().items() if v is not None}
#     if update:
#         await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
#     fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
#     fresh.pop("password_hash", None)
#     return fresh

# # ============================================================
# # Onboarding
# # ============================================================

# @api_router.post("/users/onboarding")
# async def onboarding(inp: OnboardingIn, user: dict = Depends(get_current_user)):
#     await db.users.update_one(
#         {"user_id": user["user_id"]},
#         {"$set": {
#             "onboarded": True,
#             "goal": inp.goal,
#             "onboarding_subjects": inp.subjects,
#             "daily_time": inp.daily_time,
#             "level": inp.level,
#             "learning_style": inp.learning_style,
#             "exam_level": inp.exam_level,
#         }},
#     )
#     return {"ok": True}

# # ============================================================
# # Subjects & Exam Structure
# # ============================================================

# EXAM_STRUCTURE = {
#     "GCE O Level": ["Mathematics", "English Language", "French", "Physics", "Chemistry",
#                     "Biology", "History", "Geography", "Economics", "Literature", "Additional Mathematics"],
#     "GCE A Level": ["Pure Mathematics", "Further Mathematics", "Physics", "Chemistry", "Biology",
#                     "Economics", "Accounting", "Business Studies", "French", "English Literature"],
#     "HND": ["Computer Science", "Business Management", "Accounting", "Marketing", "Law", "Engineering"],
#     "Concours": ["General Knowledge", "Mathematics", "French", "English", "Sciences"],
# }

# @api_router.get("/exam/structure")
# async def exam_structure():
#     years = list(range(2026, 2009, -1))
#     return {"levels": EXAM_STRUCTURE, "years": years, "papers": [1, 2, 3]}

# @api_router.get("/subjects")
# async def list_subjects(exam_level: Optional[str] = None):
#     q = {"exam_level": exam_level} if exam_level else {}
#     items = await db.subjects.find(q, {"_id": 0}).to_list(500)
#     return {"items": items}

# # ============================================================
# # Past Papers (Mobile & Web compatible)
# # ============================================================

# @api_router.get("/past-papers")
# async def list_past_papers(exam_level: Optional[str] = None, subject_id: Optional[str] = None):
#     q = {}
#     if exam_level:
#         q["exam_level"] = exam_level
#     if subject_id:
#         q["subject_id"] = subject_id
#     items = await db.past_papers.find(q, {"_id": 0}).sort("year", -1).to_list(500)
#     return {"items": items}

# @api_router.get("/past-papers/{paper_id}")
# async def get_paper(paper_id: str):
#     paper = await db.past_papers.find_one({"paper_id": paper_id}, {"_id": 0})
#     if not paper:
#         raise HTTPException(404, "Not found")
#     questions = await db.questions.find({"paper_id": paper_id}, {"_id": 0}).to_list(200)
#     return {"paper": paper, "questions": questions}

# @api_router.get("/papers")
# async def list_papers(level: Optional[str] = None, subject: Optional[str] = None,
#                       year: Optional[int] = None, paper: Optional[int] = None,
#                       q: Optional[str] = None, user: dict = Depends(get_current_user_optional)):
#     query = {}
#     if level: query["level"] = level
#     if subject: query["subject"] = subject
#     if year: query["year"] = year
#     if paper: query["paper_number"] = paper
#     if q: query["title"] = {"$regex": re.escape(q), "$options": "i"}
#     papers = await db.papers.find(query, {"_id": 0}).sort([("year", -1), ("subject", 1)]).to_list(500)
    
#     drafts = []
#     if user:
#         drafts = await db.drafts.find({"user_id": user["user_id"]}, {"_id": 0, "paper_id": 1}).to_list(500)
#     saved = {d["paper_id"] for d in drafts}
#     for p in papers:
#         p["saved"] = p["paper_id"] in saved
#     return {"items": papers}

# @api_router.get("/papers/filters")
# async def paper_filters():
#     papers = await db.papers.find({}, {"_id": 0}).to_list(1000)
#     levels = sorted({p.get("level") for p in papers if p.get("level")})
#     subjects = sorted({p.get("subject") for p in papers if p.get("subject")})
#     years = sorted({p.get("year") for p in papers if p.get("year")}, reverse=True)
#     return {"levels": levels, "subjects": subjects, "years": years, "papers": [1, 2, 3]}

# @api_router.get("/papers/{paper_id}")
# async def get_paper_detail(paper_id: str):
#     p = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
#     if not p:
#         raise HTTPException(404, "Paper not found")
#     return p

# @api_router.get("/papers/{paper_id}/pdf")
# async def proxy_pdf(paper_id: str):
#     p = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
#     if not p:
#         raise HTTPException(404, "Paper not found")
#     try:
#         data = await fetch_pdf_bytes(p["pdf_url"])
#     except Exception:
#         raise HTTPException(502, "Could not load PDF")
#     return FastResponse(content=data, media_type="application/pdf",
#                         headers={"Cache-Control": "public, max-age=86400"})

# # ============================================================
# # Questions
# # ============================================================

# @api_router.post("/questions/answer")
# async def answer_question(inp: AnswerIn, user: dict = Depends(get_current_user)):
#     q = await db.questions.find_one({"question_id": inp.question_id}, {"_id": 0})
#     if not q:
#         raise HTTPException(404, "Question not found")
#     correct = inp.selected.strip().upper() == q.get("correct_answer", "").strip().upper()
#     await db.user_answers.insert_one({
#         "user_id": user["user_id"],
#         "question_id": inp.question_id,
#         "paper_id": q.get("paper_id"),
#         "selected": inp.selected,
#         "is_correct": correct,
#         "time_taken": inp.time_taken,
#         "created_at": datetime.now(timezone.utc),
#     })
#     if correct:
#         await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"xp": 10}})
#     today = date.today().isoformat()
#     await db.study_sessions.update_one(
#         {"user_id": user["user_id"], "day": today},
#         {"$inc": {"seconds": inp.time_taken, "attempted": 1, "correct": 1 if correct else 0},
#          "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
#         upsert=True,
#     )
#     return {
#         "correct": correct,
#         "correct_answer": q.get("correct_answer", ""),
#         "explanation": q.get("explanation", ""),
#     }

# # ============================================================
# # Math Solver
# # ============================================================

# @api_router.post("/solve")
# async def solve_math_problem(req: SolveRequest, user: dict = Depends(get_current_user_optional)):
#     local_result = solve_math_local(req.question)
#     if local_result:
#         return {
#             "success": True,
#             "answer": local_result,
#             "source": "local_solver",
#             "confidence": 0.95,
#             "question": req.question,
#             "subject": req.subject or "Mathematics"
#         }

#     try:
#         system = "You are a math expert. Solve the problem step by step. Return the final answer clearly."
#         chat = _new_chat(f"solve_{uuid.uuid4().hex[:12]}", system)
#         response = await chat.send_message(req.question)
#         return {
#             "success": True,
#             "answer": response,
#             "source": "ai_solver",
#             "confidence": 0.85,
#             "question": req.question,
#             "subject": req.subject or "General"
#         }
#     except Exception as e:
#         logger.error(f"Solve endpoint error: {e}")
#         return {
#             "success": False,
#             "error": str(e),
#             "suggestion": "Try rephrasing your question or use specific math notation"
#         }

# # ============================================================
# # AI Question Generation
# # ============================================================

# @api_router.post("/questions/generate")
# async def generate_questions(req: GenerateQuestionsRequest, user: dict = Depends(get_current_user)):
#     cache_key = f"{req.level}|{req.subject}|{req.year}|{req.paper}|{req.count}"
#     cached = await db.questions_cache.find_one({"cache_key": cache_key}, {"_id": 0})
#     if cached:
#         return {"questions": cached["questions"], "cached": True}

#     system = (
#         "You are an expert Cameroon GCE/HND examiner creating authentic multiple-choice exam questions. "
#         "Always return STRICT valid JSON only, no markdown, no commentary."
#     )
#     prompt = (
#         f"Create {req.count} exam-standard multiple-choice questions for {req.level} "
#         f"{req.subject}, year {req.year}, Paper {req.paper}. "
#         "Return a JSON object with key 'questions' as an array. Each item must have: "
#         "id (string), text (the question), options (array of exactly 4 strings), "
#         "correct_index (0-3 integer), explanation (clear step-by-step solution, 2-4 sentences), "
#         "topic (short topic name), difficulty (one of easy/medium/hard), marks (integer 1-4). "
#         "Make questions realistic and curriculum-appropriate. Return ONLY the JSON object."
#     )
#     chat = _new_chat(f"gen_{uuid.uuid4().hex}", system)
#     resp = await chat.send_message(prompt)
#     try:
#         data = _clean_json(resp)
#         questions = data.get("questions", data if isinstance(data, list) else [])
#         if not questions:
#             raise ValueError("empty questions list")
#     except Exception:
#         logger.error(f"Failed to parse AI questions: {resp[:200]}")
#         raise HTTPException(502, "Couldn't generate questions right now. Please try again shortly.")

#     for i, q in enumerate(questions):
#         q["id"] = q.get("id") or f"q{i+1}"

#     await db.questions_cache.insert_one({
#         "cache_key": cache_key,
#         "questions": questions,
#         "created_at": datetime.now(timezone.utc).isoformat(),
#     })
#     return {"questions": questions, "cached": False}

# # ============================================================
# # Attempts & Progress
# # ============================================================

# @api_router.post("/attempts")
# async def submit_attempt(req: SubmitAttemptRequest, user: dict = Depends(get_current_user)):
#     accuracy = round((req.score / req.total) * 100) if req.total else 0
#     topic_stats = {}
#     for a in req.answers:
#         t = a.get("topic", "General")
#         topic_stats.setdefault(t, {"correct": 0, "total": 0})
#         topic_stats[t]["total"] += 1
#         if a.get("selected") == a.get("correct"):
#             topic_stats[t]["correct"] += 1
#     weak = [t for t, s in topic_stats.items() if s["total"] and s["correct"] / s["total"] < 0.5]
#     strong = [t for t, s in topic_stats.items() if s["total"] and s["correct"] / s["total"] >= 0.8]

#     attempt = {
#         "attempt_id": f"att_{uuid.uuid4().hex[:12]}",
#         "user_id": user["user_id"],
#         "level": req.level, "subject": req.subject, "year": req.year, "paper": req.paper,
#         "score": req.score, "total": req.total, "accuracy": accuracy,
#         "time_spent": req.time_spent,
#         "weak_topics": weak, "strong_topics": strong,
#         "answers": req.answers,
#         "created_at": datetime.now(timezone.utc).isoformat(),
#     }
#     await db.attempts.insert_one(dict(attempt))

#     xp_gain = req.score * 10 + (25 if accuracy == 100 else 0)
#     new_xp = user.get("xp", 0) + xp_gain
#     new_level = 1 + new_xp // 500
#     await db.users.update_one({"user_id": user["user_id"]},
#                               {"$set": {"xp": new_xp, "level": new_level}})
#     attempt.pop("_id", None)
#     return {"attempt": attempt, "xp_gain": xp_gain, "new_xp": new_xp, "new_level": new_level}

# @api_router.get("/attempts")
# async def list_attempts(user: dict = Depends(get_current_user)):
#     items = await db.attempts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
#     return items

# @api_router.get("/dashboard/stats")
# async def dashboard_stats(user: dict = Depends(get_current_user)):
#     attempts = await db.attempts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
#     questions_attempted = sum(a["total"] for a in attempts)
#     correct = sum(a["score"] for a in attempts)
#     accuracy = round((correct / questions_attempted) * 100) if questions_attempted else 0
#     study_seconds = sum(a.get("time_spent", 0) for a in attempts)
#     study_hours = round(study_seconds / 3600, 1)

#     weak_counter, strong_counter = {}, {}
#     for a in attempts:
#         for t in a.get("weak_topics", []):
#             weak_counter[t] = weak_counter.get(t, 0) + 1
#         for t in a.get("strong_topics", []):
#             strong_counter[t] = strong_counter.get(t, 0) + 1
#     weak = sorted(weak_counter, key=weak_counter.get, reverse=True)[:4]
#     strong = sorted(strong_counter, key=strong_counter.get, reverse=True)[:4]

#     now = datetime.now(timezone.utc)
#     week = [0] * 7
#     for a in attempts:
#         try:
#             d = datetime.fromisoformat(a["created_at"])
#             if d.tzinfo is None:
#                 d = d.replace(tzinfo=timezone.utc)
#             delta = (now.date() - d.date()).days
#             if 0 <= delta < 7:
#                 week[6 - delta] += round(a.get("time_spent", 0) / 60)
#         except Exception:
#             pass
#     days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
#     weekday_today = now.weekday()
#     consistency = []
#     for i in range(7):
#         idx = (weekday_today - 6 + i) % 7
#         consistency.append({"day": days[idx], "minutes": week[i]})

#     return {
#         "study_hours": study_hours,
#         "questions_attempted": questions_attempted,
#         "accuracy": accuracy,
#         "streak": user.get("streak", 0),
#         "xp": user.get("xp", 0),
#         "level": user.get("level", 1),
#         "xp_to_next": 500 - (user.get("xp", 0) % 500),
#         "weak_topics": weak,
#         "strong_topics": strong,
#         "recent_attempts": sorted(attempts, key=lambda a: a["created_at"], reverse=True)[:5],
#         "consistency": consistency,
#         "total_attempts": len(attempts),
#     }

# @api_router.get("/leaderboard")
# async def leaderboard():
#     users = await db.users.find({"role": "student"}, {"_id": 0, "name": 1, "xp": 1, "level": 1, "user_id": 1}).to_list(500)
#     users.sort(key=lambda u: u.get("xp", 0), reverse=True)
#     board = []
#     for i, u in enumerate(users):
#         entry = {"rank": i + 1, "name": u.get("name", "Student"), "xp": u.get("xp", 0), "level": u.get("level", 1)}
#         board.append(entry)
#     return {"top": board[:10]}

# # ============================================================
# # AI Tutor (Streaming)
# # ============================================================

# @api_router.get("/ai/sessions")
# async def ai_sessions(user: dict = Depends(get_current_user)):
#     items = await db.ai_sessions.find({"user_id": user["user_id"]}, {"_id": 0, "messages": 0}).sort("updated_at", -1).to_list(100)
#     return items

# @api_router.get("/ai/sessions/{session_id}")
# async def ai_session_detail(session_id: str, user: dict = Depends(get_current_user)):
#     s = await db.ai_sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
#     if not s:
#         raise HTTPException(404, "Not found")
#     return s

# @api_router.post("/ai/chat")
# async def ai_chat(req: ChatRequest, user: dict = Depends(get_current_user)):
#     session_id = req.session_id or f"chat_{uuid.uuid4().hex[:12]}"
#     session = await db.ai_sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
#     if not session:
#         session = {
#             "session_id": session_id,
#             "user_id": user["user_id"],
#             "title": req.message[:50],
#             "subject": req.subject,
#             "messages": [],
#             "created_at": datetime.now(timezone.utc).isoformat(),
#             "updated_at": datetime.now(timezone.utc).isoformat(),
#         }
#         await db.ai_sessions.insert_one(dict(session))

#     history = session.get("messages", [])
#     system = (
#         f"You are GC AI, an expert, patient tutor for Cameroon students preparing for "
#         f"GCE O/A Level, HND and Concours exams. Subject focus: {req.subject}. "
#         "Explain step by step, use clear structure, give worked examples, and end with a short "
#         "'Related topics' list when helpful. Be encouraging and exam-focused."
#     )
#     chat = _new_chat(session_id, system)

#     async def event_gen():
#         full = ""
#         try:
#             context_prefix = ""
#             if history:
#                 recent = history[-6:]
#                 context_prefix = "Conversation so far:\n" + "\n".join(
#                     f"{m['role'].upper()}: {m['content']}" for m in recent
#                 ) + "\n\nNow answer the new question.\n\n"
#             response = await chat.send_message(context_prefix + req.message)
#             full = response
#             for chunk in [response[i:i+50] for i in range(0, len(response), 50)]:
#                 yield f"data: {json.dumps({'delta': chunk})}\n\n"
#         except Exception as e:
#             logger.error(f"AI stream error: {e}")
#             error_msg = "I'm having trouble connecting to my AI service. Please try again in a moment."
#             full = error_msg
#             for chunk in [error_msg[i:i+50] for i in range(0, len(error_msg), 50)]:
#                 yield f"data: {json.dumps({'delta': chunk})}\n\n"

#         new_messages = history + [
#             {"role": "user", "content": req.message, "ts": datetime.now(timezone.utc).isoformat()},
#             {"role": "assistant", "content": full, "ts": datetime.now(timezone.utc).isoformat()},
#         ]
#         await db.ai_sessions.update_one(
#             {"session_id": session_id, "user_id": user["user_id"]},
#             {"$set": {"messages": new_messages, "updated_at": datetime.now(timezone.utc).isoformat()}},
#         )
#         yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"

#     return StreamingResponse(
#         event_gen(),
#         media_type="text/event-stream",
#         headers={
#             "Cache-Control": "no-cache",
#             "X-Accel-Buffering": "no",
#             "Content-Type": "text/event-stream",
#         }
#     )

# @api_router.get("/ai/health")
# async def ai_health():
#     api_key = os.environ.get("OPENROUTER_API_KEY", "")
#     result = {
#         "api_key_configured": bool(api_key),
#         "api_key_prefix": (api_key[:12] + "...") if api_key else None,
#         "models_tested": [],
#     }
#     if not api_key:
#         result["diagnosis"] = "OPENROUTER_API_KEY is not set."
#         return result

#     models = _get_model_chain()
#     headers = {
#         "Authorization": f"Bearer {api_key}",
#         "Content-Type": "application/json",
#         "HTTP-Referer": APP_URL,
#         "X-Title": APP_NAME,
#     }
#     any_success = False
#     async with httpx.AsyncClient(timeout=15.0) as hc:
#         for model in models:
#             entry = {"model": model}
#             try:
#                 resp = await hc.post(
#                     "https://openrouter.ai/api/v1/chat/completions",
#                     headers=headers,
#                     json={
#                         "model": model,
#                         "messages": [{"role": "user", "content": "Reply with just: OK"}],
#                         "max_tokens": 10,
#                     },
#                 )
#                 entry["status_code"] = resp.status_code
#                 if resp.status_code == 200:
#                     data = resp.json()
#                     content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
#                     entry["ok"] = bool(content and content.strip())
#                     if entry["ok"]:
#                         any_success = True
#                 else:
#                     entry["ok"] = False
#                     try:
#                         err = resp.json()
#                         entry["error"] = err.get("error", {}).get("message", resp.text[:200])
#                     except Exception:
#                         entry["error"] = resp.text[:200]
#             except httpx.RequestError as e:
#                 entry["ok"] = False
#                 entry["error"] = f"Network error: {e}"
#             result["models_tested"].append(entry)

#     result["diagnosis"] = "At least one model works." if any_success else "All models failed."
#     return result

# @api_router.post("/ai/explain")
# async def ai_explain(req: ChatRequest, user: dict = Depends(get_current_user)):
#     local_result = solve_math_local(req.message)
#     if local_result:
#         return {"answer": local_result, "source": "local_solver"}
#     system = "You are GC AI, an expert exam tutor. Give a concise, clear step-by-step explanation."
#     chat = _new_chat(f"explain_{uuid.uuid4().hex}", system)
#     try:
#         resp = await chat.send_message(req.message)
#         return {"answer": resp, "source": "ai_solver"}
#     except Exception as e:
#         logger.error(f"AI explain error: {e}")
#         return {"answer": "I'm having trouble connecting to my AI service. Please try again later.", "source": "error"}

# # ============================================================
# # Teacher: Courses & Earnings
# # ============================================================

# VIEW_RATE_FCFA = 90

# @api_router.post("/courses")
# async def create_course(req: CourseCreate, user: dict = Depends(get_current_user)):
#     if user.get("role") != "teacher":
#         raise HTTPException(403, "Teachers only")
    
#     course = {
#         "course_id": f"crs_{uuid.uuid4().hex[:12]}",
#         "teacher_id": user["user_id"],
#         "teacher_name": user.get("full_name", ""),
#         "teacher_picture": user.get("profile_photo", ""),
#         "title": req.title,
#         "description": req.description,
#         "subject": req.subject,
#         "level": req.level,
#         "video_url": req.video_url,
#         "thumbnail": req.thumbnail or "",
#         "price": req.price,
#         "duration": req.duration or "45:00",
#         "views": 0,
#         "earnings": 0,
#         "students": 0,
#         "created_at": datetime.now(timezone.utc).isoformat(),
#     }
#     await db.courses.insert_one(dict(course))
#     course.pop("_id", None)
#     return course

# @api_router.get("/courses")
# async def list_courses(mine: bool = False, user: dict = Depends(get_current_user_optional)):
#     if mine and user:
#         q = {"teacher_id": user["user_id"]}
#     else:
#         q = {}
#     items = await db.courses.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
#     return items

# @api_router.get("/courses/{course_id}")
# async def get_course(course_id: str):
#     c = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
#     if not c:
#         raise HTTPException(404, "Not found")
#     return c

# @api_router.post("/courses/{course_id}/view")
# async def register_view(course_id: str, user: dict = Depends(get_current_user)):
#     course = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
#     if not course:
#         raise HTTPException(404, "Not found")
#     existing = await db.course_views.find_one(
#         {"course_id": course_id, "student_id": user["user_id"]}, {"_id": 0})
#     if existing:
#         return {"counted": False, "earnings": course.get("earnings", 0)}
#     await db.course_views.insert_one({
#         "view_id": f"vw_{uuid.uuid4().hex[:10]}",
#         "course_id": course_id,
#         "student_id": user["user_id"],
#         "teacher_id": course["teacher_id"],
#         "earning": VIEW_RATE_FCFA,
#         "created_at": datetime.now(timezone.utc).isoformat(),
#     })
#     await db.courses.update_one({"course_id": course_id},
#                                 {"$inc": {"views": 1, "students": 1, "earnings": VIEW_RATE_FCFA}})
#     return {"counted": True, "rate": VIEW_RATE_FCFA}

# @api_router.get("/teacher/stats")
# async def teacher_stats(user: dict = Depends(get_current_user)):
#     courses = await db.courses.find({"teacher_id": user["user_id"]}, {"_id": 0}).to_list(200)
#     total_earnings = sum(c.get("earnings", 0) for c in courses)
#     total_views = sum(c.get("views", 0) for c in courses)
#     total_students = sum(c.get("students", 0) for c in courses)
#     views = await db.course_views.find({"teacher_id": user["user_id"]}, {"_id": 0}).to_list(2000)
#     now = datetime.now(timezone.utc)
#     monthly = {}
#     for v in views:
#         try:
#             d = datetime.fromisoformat(v["created_at"])
#             key = d.strftime("%b")
#             monthly[key] = monthly.get(key, 0) + v.get("earning", 0)
#         except Exception:
#             pass
#     months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
#     chart = [{"month": m, "earnings": monthly.get(m, 0)} for m in months[max(0, now.month - 6):now.month]]
#     return {
#         "courses": len(courses),
#         "students": total_students,
#         "views": total_views,
#         "earnings": total_earnings,
#         "rate": VIEW_RATE_FCFA,
#         "chart": chart,
#         "course_table": [{"title": c["title"], "students": c.get("students", 0),
#                           "views": c.get("views", 0), "earnings": c.get("earnings", 0)} for c in courses],
#     }

# # ============================================================
# # Drafts
# # ============================================================

# @api_router.get("/drafts")
# async def list_drafts(user: dict = Depends(get_current_user)):
#     drafts = await db.drafts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
#     ids = [d["paper_id"] for d in drafts]
#     papers = await db.papers.find({"paper_id": {"$in": ids}}, {"_id": 0}).to_list(500)
#     pmap = {p["paper_id"]: p for p in papers}
#     result = []
#     for d in drafts:
#         pp = pmap.get(d["paper_id"])
#         if pp:
#             pp = dict(pp)
#             pp["saved"] = True
#             pp["saved_at"] = d["created_at"]
#             result.append(pp)
#     return result

# @api_router.post("/drafts")
# async def save_draft(req: DraftRequest, user: dict = Depends(get_current_user)):
#     existing = await db.drafts.find_one({"user_id": user["user_id"], "paper_id": req.paper_id})
#     if existing:
#         await db.drafts.delete_one({"user_id": user["user_id"], "paper_id": req.paper_id})
#         return {"saved": False}
#     await db.drafts.insert_one({"user_id": user["user_id"], "paper_id": req.paper_id,
#                                 "created_at": datetime.now(timezone.utc).isoformat()})
#     return {"saved": True}

# @api_router.delete("/drafts/{paper_id}")
# async def delete_draft(paper_id: str, user: dict = Depends(get_current_user)):
#     await db.drafts.delete_one({"user_id": user["user_id"], "paper_id": paper_id})
#     return {"ok": True}

# # ============================================================
# # Lesson Videos
# # ============================================================

# @api_router.get("/lessons")
# async def list_lessons(exam_level: Optional[str] = None):
#     q = {} if not exam_level else {"exam_level": exam_level}
#     items = await db.lesson_videos.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
#     return {"items": [serialize(x) for x in items]}

# @api_router.get("/lessons/{lesson_id}")
# async def get_lesson(lesson_id: str):
#     l = await db.lesson_videos.find_one({"lesson_id": lesson_id}, {"_id": 0})
#     if not l:
#         raise HTTPException(404, "Not found")
#     await db.lesson_videos.update_one({"lesson_id": lesson_id}, {"$inc": {"views": 1}})
#     l["views"] = l.get("views", 0) + 1
#     return {"lesson": serialize(l)}

# @api_router.post("/lessons")
# async def create_lesson(req: LessonIn, user: dict = Depends(get_current_user)):
#     if user.get("role") != "teacher":
#         raise HTTPException(403, "Teachers only")
#     lesson_id = f"lesson_{uuid.uuid4().hex[:10]}"
#     doc = {
#         "lesson_id": lesson_id,
#         "teacher_id": user["user_id"],
#         "teacher_name": user["full_name"],
#         "teacher_avatar": user.get("profile_photo"),
#         "title": req.title,
#         "description": req.description,
#         "subject_id": req.subject_id,
#         "subject_name": req.subject_name,
#         "exam_level": req.exam_level,
#         "video_url": req.video_url,
#         "thumbnail": req.thumbnail or "https://images.unsplash.com/photo-1708011271954-c0d2b3155ded?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
#         "duration": req.duration or "10:00",
#         "views": 0,
#         "rating": 5.0,
#         "created_at": datetime.now(timezone.utc),
#     }
#     await db.lesson_videos.insert_one(doc)
#     return {"lesson": serialize(doc)}

# @api_router.get("/teacher/lessons")
# async def teacher_lessons(user: dict = Depends(get_current_user)):
#     if user.get("role") != "teacher":
#         raise HTTPException(403, "Teachers only")
#     items = await db.lesson_videos.find({"teacher_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
#     return {"items": [serialize(x) for x in items]}

# # ============================================================
# # PDF Helpers
# # ============================================================

# _pdf_cache = {}

# async def fetch_pdf_bytes(url: str) -> bytes:
#     if url in _pdf_cache:
#         return _pdf_cache[url]
#     async with httpx.AsyncClient(timeout=45, follow_redirects=True) as hc:
#         r = await hc.get(url)
#     r.raise_for_status()
#     _pdf_cache[url] = r.content
#     return r.content

# def extract_pdf_text(data: bytes, max_chars: int = 9000) -> str:
#     reader = PdfReader(io.BytesIO(data))
#     parts = []
#     for p in reader.pages:
#         parts.append(p.extract_text() or "")
#     return "\n".join(parts)[:max_chars]

# # ============================================================
# # Root Endpoints
# # ============================================================

# @api_router.get("/")
# async def root():
#     return {
#         "service": "GCSMART Unified API",
#         "version": "2.0.0",
#         "status": "running",
#         "database": "MongoDB",
#         "endpoints": {
#             "auth": "/api/auth/register, /api/auth/login, /api/auth/session, /api/auth/me",
#             "subjects": "/api/subjects",
#             "papers": "/api/papers",
#             "past-papers": "/api/past-papers",
#             "courses": "/api/courses",
#             "ai": "/api/ai/chat",
#             "docs": "/docs"
#         }
#     }

# app.include_router(api_router)

# # ============================================================
# # Seed Data (Complete)
# # ============================================================

# async def seed_all_data():
#     # Check if data already exists
#     if await db.subjects.count_documents({}) > 0:
#         return
    
#     logger.info("🌱 Seeding sample data...")
    
#     # Subjects
#     subjects_data = [
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Mathematics", "code": "MATH-O", "exam_level": "GCE O", "icon": "calculator-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "English Language", "code": "ENG-O", "exam_level": "GCE O", "icon": "book-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Physics", "code": "PHY-O", "exam_level": "GCE O", "icon": "flash-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Chemistry", "code": "CHEM-O", "exam_level": "GCE O", "icon": "flask-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Biology", "code": "BIO-O", "exam_level": "GCE O", "icon": "leaf-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Pure Mathematics", "code": "PMATH-A", "exam_level": "GCE A", "icon": "calculator-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Physics", "code": "PHY-A", "exam_level": "GCE A", "icon": "flash-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Chemistry", "code": "CHEM-A", "exam_level": "GCE A", "icon": "flask-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Computer Science", "code": "CS-HND", "exam_level": "HND", "icon": "code-slash-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Business Management", "code": "BM-HND", "exam_level": "HND", "icon": "briefcase-outline"},
#         {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "General Knowledge", "code": "GK-CON", "exam_level": "Concours", "icon": "bulb-outline"},
#     ]
#     await db.subjects.insert_many(subjects)
    
#     # Demo users
#     if not await db.users.find_one({"email": "student@gcsmart.cm"}):
#         await db.users.insert_one({
#             "user_id": f"user_{uuid.uuid4().hex[:12]}",
#             "email": "student@gcsmart.cm",
#             "password_hash": hash_pw("Student123!"),
#             "full_name": "Alex Ngwa",
#             "role": "student",
#             "onboarded": True,
#             "exam_level": "GCE A",
#             "xp": 320,
#             "level": 4,
#             "streak": 5,
#             "created_at": datetime.now(timezone.utc).isoformat(),
#         })
    
#     if not await db.users.find_one({"email": "teacher@gcsmart.cm"}):
#         await db.users.insert_one({
#             "user_id": f"user_{uuid.uuid4().hex[:12]}",
#             "email": "teacher@gcsmart.cm",
#             "password_hash": hash_pw("Teacher123!"),
#             "full_name": "Dr. Nkeng Paul",
#             "role": "teacher",
#             "onboarded": True,
#             "exam_level": "GCE A",
#             "xp": 0,
#             "level": 1,
#             "streak": 0,
#             "created_at": datetime.now(timezone.utc).isoformat(),
#         })
    
#     # Past papers
#     pmath = await db.subjects.find_one({"code": "PMATH-A"})
#     if pmath:
#         STAT1 = "https://customer-assets-0z36b82j.emergentagent.net/job_cameroon-study-hub/artifacts/bpetqdqc_PURE%20MATHEMATICS%20with%20statistics%20paper%201.pdf"
#         STAT2 = "https://customer-assets-0z36b82j.emergentagent.net/job_cameroon-study-hub/artifacts/uar8038x_A-LEVEL-2025-Pure-mathematics-with-statistics-2.pdf"
#         MECH2 = "https://customer-assets-0z36b82j.emergentagent.net/job_cameroon-study-hub/artifacts/zo09xaaa_A-LEVEL-2025-Pure-mathematics-with-mechanics-2.pdf"
        
#         await db.papers.insert_many([
#             {
#                 "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
#                 "subject_id": pmath["subject_id"],
#                 "subject": "Pure Mathematics",
#                 "title": "Pure Mathematics with Statistics — Paper 1 (MCQ)",
#                 "level": "GCE A Level",
#                 "year": 2025,
#                 "paper_number": 1,
#                 "pdf_url": STAT1,
#                 "description": "Official 2025 A-Level multiple choice paper.",
#                 "created_at": datetime.now(timezone.utc).isoformat(),
#             },
#             {
#                 "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
#                 "subject_id": pmath["subject_id"],
#                 "subject": "Pure Mathematics",
#                 "title": "Pure Mathematics with Statistics — Paper 2",
#                 "level": "GCE A Level",
#                 "year": 2025,
#                 "paper_number": 2,
#                 "pdf_url": STAT2,
#                 "description": "Official 2025 A-Level structured/theory paper.",
#                 "created_at": datetime.now(timezone.utc).isoformat(),
#             },
#             {
#                 "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
#                 "subject_id": pmath["subject_id"],
#                 "subject": "Pure Mathematics",
#                 "title": "Pure Mathematics with Mechanics — Paper 2",
#                 "level": "GCE A Level",
#                 "year": 2025,
#                 "paper_number": 2,
#                 "pdf_url": MECH2,
#                 "description": "Official 2025 A-Level mechanics paper.",
#                 "created_at": datetime.now(timezone.utc).isoformat(),
#             },
#         ])
        
#         await db.past_papers.insert_many([
#             {
#                 "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
#                 "subject_id": pmath["subject_id"],
#                 "subject_name": "Pure Mathematics",
#                 "exam_level": "GCE A",
#                 "year": 2025,
#                 "paper_number": 1,
#                 "total_marks": 100,
#                 "question_count": 0,
#                 "duration_minutes": 180,
#                 "pdf_url": STAT1,
#                 "title": "A-Level 2025 Pure Mathematics — Paper 1",
#             },
#             {
#                 "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
#                 "subject_id": pmath["subject_id"],
#                 "subject_name": "Pure Mathematics",
#                 "exam_level": "GCE A",
#                 "year": 2025,
#                 "paper_number": 2,
#                 "total_marks": 100,
#                 "question_count": 0,
#                 "duration_minutes": 180,
#                 "pdf_url": STAT2,
#                 "title": "A-Level 2025 Pure Mathematics — Paper 2",
#             },
#         ])
    
#     # Lesson videos
#     thumb = "https://images.unsplash.com/photo-1708011271954-c0d2b3155ded?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
#     tavatar = "https://images.unsplash.com/photo-1541178735493-479c1a27ed24?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
    
#     await db.lesson_videos.insert_many([
#         {
#             "lesson_id": f"lesson_{uuid.uuid4().hex[:10]}",
#             "teacher_id": "seed_teacher",
#             "teacher_name": "Dr. Nkeng Paul",
#             "teacher_avatar": tavatar,
#             "title": "Integration by Parts — 5-Minute Masterclass",
#             "description": "The LIATE rule and 3 worked examples from A-Level papers.",
#             "subject_name": "Pure Mathematics",
#             "exam_level": "GCE A",
#             "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
#             "thumbnail": thumb,
#             "duration": "05:12",
#             "views": 843,
#             "rating": 4.8,
#             "created_at": datetime.now(timezone.utc).isoformat(),
#         }
#     ])
    
#     logger.info("✅ Seed data complete")

# # ============================================================
# # Main Entry Point
# # ============================================================

# if __name__ == "__main__":
#     import uvicorn
    
#     PORT = int(os.environ.get("PORT", 8000))
#     APP_URL = os.environ.get("APP_URL", f"http://localhost:{PORT}")
    
#     print("🚀 Starting Unified GCSMART API Server...")
#     print(f"📚 Database: {DB_NAME}")
#     print(f"🤖 OpenRouter: {'✅' if OPENROUTER_API_KEY else '❌'}")
#     print(f"🌐 API: {APP_URL}")
#     print(f"📖 Docs: {APP_URL}/docs")
#     print(f"📋 CORS Origins: {CORS_ORIGINS}")
#     print(f"🔗 AI Model Chain: {_get_model_chain()}")
    
#     uvicorn.run(
#         app,
#         host="0.0.0.0",
#         port=PORT,
#         log_level="info"
#     )
































# server_unified.py - Complete version with all endpoints
import os
import io
import re
import json
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, Response as FastResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt
import jwt as pyjwt
import httpx

# ============================================================
# Configuration & Environment
# ============================================================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Environment variables
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "gcsmart")
JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key-change-this-in-production")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openrouter/free")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
PORT = int(os.environ.get("PORT", 8000))
APP_URL = os.environ.get("APP_URL", f"http://localhost:{PORT}")
APP_NAME = os.environ.get("APP_NAME", "GCSMART")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

# Initialize MongoDB
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

print(f"Connected to MongoDB: {MONGO_URL[:40]}...")
print(f"Database: {DB_NAME}")

# ============================================================
# Lifespan Events
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Unified GCSMART API Server...")
    
    try:
        collections = await db.list_collection_names()
        if "drafts" in collections:
            await db.drafts.drop()
            print("Dropped drafts collection to fix index issues")
    except Exception as e:
        print(f"Could not drop drafts: {e}")
    
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.subjects.create_index("subject_id", unique=True)
        await db.past_papers.create_index("paper_id", unique=True)
        await db.questions.create_index("question_id", unique=True)
        await db.questions_cache.create_index("cache_key", unique=True)
        await db.courses.create_index("course_id", unique=True)
        await db.lesson_videos.create_index("lesson_id", unique=True)
        await db.drafts.create_index("draft_id", unique=True)
        await db.papers.create_index("paper_id", unique=True)
        await db.attempts.create_index("attempt_id", unique=True)
        await db.chat_messages.create_index("session_id", 1)
        await db.chat_messages.create_index("user_id", 1)
        await db.ai_sessions.create_index("session_id", unique=True)
        await db.study_sessions.create_index("user_id", 1)
        await db.study_sessions.create_index("day", 1)
        print("Indexes created successfully")
    except Exception as e:
        print(f"Index creation warning (may be harmless): {e}")
    
    try:
        await seed_all_data()
    except Exception as e:
        print(f"Seed data warning: {e}")
    
    yield
    
    client.close()
    print("Server shutting down")

# ============================================================
# FastAPI App
# ============================================================

app = FastAPI(
    title="GCSMART Unified API",
    version="2.0.0",
    description="AI-Powered Educational Platform for Cameroon Students",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)
api_router = APIRouter(prefix="/api")

# Serve seeded PDFs
PDF_DIR = ROOT_DIR / "pdfs"
PDF_DIR.mkdir(exist_ok=True)
app.mount("/api/pdfs", StaticFiles(directory=str(PDF_DIR)), name="pdfs")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gcsmart")

# ============================================================
# CORS Configuration
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# LLM Client with Fallback Chain
# ============================================================

DEFAULT_MODEL_CHAIN = [
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "openai/gpt-oss-20b:free",
    "openrouter/free",
]

def _sanitize_model_id(raw: str) -> str:
    s = raw.strip()
    m = re.match(r'^[A-Z][A-Z0-9_]*=(.+)$', s)
    if m:
        logger.warning(f"Stripping KEY= prefix from model ID: {s!r}")
        s = m.group(1).strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ('"', "'"):
        s = s[1:-1].strip()
    return s

def _get_model_chain() -> List[str]:
    primary = _sanitize_model_id(os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL_CHAIN[0]))
    extra_raw = os.environ.get("OPENROUTER_MODEL_FALLBACKS", "")
    extra = [_sanitize_model_id(m) for m in extra_raw.split(",") if m.strip()]
    chain = [primary] + extra + DEFAULT_MODEL_CHAIN
    seen = set()
    ordered = []
    for m in chain:
        if m not in seen:
            seen.add(m)
            ordered.append(m)
    return ordered

class SimpleLLM:
    def __init__(self, api_key: str = "", models: Optional[List[str]] = None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.models = models or _get_model_chain()
        self.base_url = "https://openrouter.ai/api/v1"
        self.system_message = ""
        self.session_id = None
        self.referer = APP_URL
        self.title = APP_NAME

    async def _call_model(self, hc: httpx.AsyncClient, model: str, message: str) -> Optional[str]:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": self.system_message},
                {"role": "user", "content": message},
            ],
            "temperature": 0.3,
            "max_tokens": 1000,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": self.referer,
            "X-Title": self.title,
        }
        try:
            response = await hc.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
        except httpx.RequestError as e:
            logger.warning(f"OpenRouter request error for {model}: {e}")
            return None

        if response.status_code == 200:
            try:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                if content and content.strip():
                    return content
                logger.warning(f"Model {model} returned empty content")
                return None
            except Exception as e:
                logger.warning(f"Model {model} returned unparseable response: {e}")
                return None

        logger.warning(f"Model {model} failed: {response.status_code}")
        return None

    async def send_message(self, message: str) -> str:
        if not self.api_key:
            return "AI service not configured. Please set OPENROUTER_API_KEY in .env"
        async with httpx.AsyncClient(timeout=30.0) as hc:
            for model in self.models:
                result = await self._call_model(hc, model, message)
                if result is not None:
                    return result
        return "I'm having trouble reaching the AI service. Please try again."

# ============================================================
# Local Math Solver
# ============================================================

def solve_math_local(question: str) -> Optional[str]:
    try:
        import sympy as sp
        from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application

        q = question.lower().strip()
        math_signal = re.search(r'[0-9]', q) and re.search(r'[+\-*/=^]|sqrt|solve|simplify|factor|derivative|integrate', q)
        if not math_signal:
            return None

        transformations = standard_transformations + (implicit_multiplication_application,)
        cleaned = re.sub(r'\b(solve|find|simplify|integrate|differentiate|factor|for|the|of|value|calculate)\b', ' ', q)
        allowed = re.findall(r'[0-9a-z+\-*/^=().,\s]', cleaned)
        expr_str = ''.join(allowed).strip()
        expr_str = re.sub(r'\s+', ' ', expr_str).strip()
        expr_str = expr_str.replace('^', '**')

        if not expr_str or not re.search(r'[0-9]', expr_str):
            return None

        if '=' in expr_str:
            parts = expr_str.split('=')
            if len(parts) != 2:
                return None
            left, right = parts
            expr = parse_expr(f"({left}) - ({right})", transformations=transformations)
            free_syms = list(expr.free_symbols)
            if not free_syms:
                return None
            solutions = sp.solve(expr, free_syms[0] if len(free_syms) == 1 else free_syms)
            if solutions:
                return f"Solutions: {', '.join(str(s) for s in solutions)}"
            return None
        else:
            expr = parse_expr(expr_str, transformations=transformations)
            simplified = sp.simplify(expr)
            return str(simplified)
    except Exception as e:
        logger.debug(f"Local math solver error: {e}")
        return None

# ============================================================
# Pydantic Models
# ============================================================

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class SessionIn(BaseModel):
    session_id: str

class ProfileUpdate(BaseModel):
    role: Optional[str] = None
    bio: Optional[str] = None
    institution: Optional[str] = None
    exam_level: Optional[str] = None
    study_year: Optional[int] = None
    subjects: Optional[List[str]] = None
    goals: Optional[List[str]] = None
    daily_commitment: Optional[str] = None
    proficiency: Optional[str] = None
    learning_style: Optional[str] = None
    specialization: Optional[str] = None
    onboarded: Optional[bool] = None

class OnboardingIn(BaseModel):
    goal: str
    subjects: List[str]
    daily_time: str
    level: str
    learning_style: str
    exam_level: str

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    subject: Optional[str] = "General"
    current_problem: Optional[str] = None

class SolveRequest(BaseModel):
    question: str
    subject: Optional[str] = None
    variable: str = "x"

class SolutionIn(BaseModel):
    question: str

class GenerateQuestionsRequest(BaseModel):
    level: str
    subject: str
    year: int
    paper: int = 1
    count: int = 10

class SubmitAttemptRequest(BaseModel):
    level: str
    subject: str
    year: int
    paper: int
    answers: List[dict]
    score: int
    total: int
    time_spent: int
    questions_snapshot: Optional[list] = None

class CourseCreate(BaseModel):
    title: str
    description: str
    subject: str
    level: str
    video_url: str
    thumbnail: Optional[str] = None
    price: float = 0
    duration: Optional[str] = "45:00"

class DraftRequest(BaseModel):
    paper_id: str

class AskRequest(BaseModel):
    paper_id: str
    question: str

class AnswerIn(BaseModel):
    question_id: str
    selected: str
    time_taken: int = 0

class LessonIn(BaseModel):
    title: str
    description: str
    subject_id: Optional[str] = None
    subject_name: str
    exam_level: str
    video_url: str
    thumbnail: Optional[str] = None
    duration: Optional[str] = None

# ============================================================
# Auth Helpers - FIXED
# ============================================================

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

def _new_chat(session_id: str, system: str) -> SimpleLLM:
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    chat = SimpleLLM(api_key=api_key)
    chat.system_message = system
    chat.session_id = session_id
    return chat

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    
    user_id = None
    
    # First try to decode as JWT
    try:
        decoded = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = decoded.get("sub")
    except:
        # Not a JWT, try as session token
        session = await db.user_sessions.find_one({"session_token": token})
        if session:
            exp = session.get("expires_at")
            if exp:
                if isinstance(exp, str):
                    try:
                        exp = datetime.fromisoformat(exp)
                    except:
                        pass
                if hasattr(exp, 'tzinfo') and exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if hasattr(exp, 'tzinfo') and exp > datetime.now(timezone.utc):
                    user_id = session["user_id"]
                else:
                    raise HTTPException(status_code=401, detail="Session expired")
            else:
                user_id = session["user_id"]
        else:
            raise HTTPException(status_code=401, detail="Invalid token")
    
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Remove sensitive data
    user.pop("_id", None)
    user.pop("password_hash", None)
    
    # Ensure all required fields exist
    user.setdefault("onboarded", False)
    user.setdefault("xp", 0)
    user.setdefault("level", 1)
    user.setdefault("streak", 0)
    user.setdefault("profile_photo", None)
    user.setdefault("exam_level", None)
    user.setdefault("full_name", user.get("full_name", "User"))
    user.setdefault("role", "student")
    user.setdefault("bio", "")
    user.setdefault("institution", "")
    user.setdefault("study_year", None)
    user.setdefault("subjects", [])
    user.setdefault("goals", [])
    user.setdefault("daily_commitment", "")
    user.setdefault("proficiency", "")
    user.setdefault("learning_style", "")
    user.setdefault("specialization", "")
    
    return user

async def get_current_user_optional(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None

def serialize(doc: dict) -> dict:
    if doc is None:
        return {}
    d = {k: v for k, v in doc.items() if k != "_id"}
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d

def _clean_json(text: str):
    text = text.strip()
    try:
        return json.loads(text)
    except:
        pass
    
    fence_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except:
            pass
    
    start = text.find('{')
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            ch = text[i]
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except:
                        break
    raise ValueError("Could not extract valid JSON")

# ============================================================
# Authentication Routes
# ============================================================

@api_router.post("/auth/register")
async def register_user(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user = {
        "user_id": user_id,
        "email": req.email.lower(),
        "password_hash": hash_pw(req.password),
        "full_name": req.name,
        "role": "student",
        "onboarded": False,
        "bio": "",
        "institution": "",
        "exam_level": "",
        "study_year": None,
        "subjects": [],
        "goals": [],
        "daily_commitment": "",
        "proficiency": "",
        "learning_style": "",
        "specialization": "",
        "xp": 0,
        "level": 1,
        "streak": 0,
        "profile_photo": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = make_jwt(user_id)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"token": token, "user": user}

@api_router.post("/auth/login")
async def login_user(req: LoginRequest, response: Response):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not user.get("password_hash") or not check_pw(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    
    session_token = f"tok_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", path="/",
        max_age=7 * 24 * 60 * 60,
    )
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"token": session_token, "user": user}

@api_router.post("/auth/session")
async def process_session(request: Request, response: Response):
    """Process OAuth session from EmergentAgent for Google Sign-In"""
    session_id = request.headers.get("X-Session-ID")
    
    if not session_id:
        try:
            body = await request.json()
            session_id = body.get("session_id")
        except:
            pass
    
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session id")

    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            r = await hc.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
            )
    except Exception as e:
        logger.error(f"Error calling EmergentAgent: {e}")
        raise HTTPException(status_code=502, detail=f"Authentication service error: {str(e)}")
    
    if r.status_code != 200:
        logger.error(f"EmergentAgent returned {r.status_code}: {r.text}")
        raise HTTPException(status_code=401, detail="Authentication failed")
    
    data = r.json()
    email = data.get("email", "").lower()
    name = data.get("name", "")
    picture = data.get("picture")
    session_token = data.get("session_token") or f"tok_{uuid.uuid4().hex}"

    existing = await db.users.find_one({"email": email})
    
    if existing:
        user = existing
        user_id = user["user_id"]
        updates = {}
        if picture and not user.get("profile_photo"):
            updates["profile_photo"] = picture
        if name and user.get("full_name") != name:
            updates["full_name"] = name
        if updates:
            await db.users.update_one({"user_id": user_id}, {"$set": updates})
            user.update(updates)
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "full_name": name,
            "profile_photo": picture,
            "password_hash": "",
            "role": "student",
            "onboarded": False,
            "bio": "",
            "institution": "",
            "exam_level": "",
            "study_year": None,
            "subjects": [],
            "goals": [],
            "daily_commitment": "",
            "proficiency": "",
            "learning_style": "",
            "specialization": "",
            "xp": 0,
            "level": 1,
            "streak": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(dict(user))
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", path="/",
        max_age=7 * 24 * 60 * 60,
    )
    
    # Clean up user data
    user.pop("password_hash", None)
    user.pop("_id", None)
    user.setdefault("onboarded", False)
    
    return {"session_token": session_token, "user": user}

@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {"user": user}

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api_router.put("/auth/profile")
async def update_profile(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]})
    fresh.pop("_id", None)
    fresh.pop("password_hash", None)
    return fresh

# ============================================================
# Onboarding
# ============================================================

@api_router.post("/users/onboarding")
async def onboarding(inp: OnboardingIn, user: dict = Depends(get_current_user)):
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

# ============================================================
# Analytics Routes
# ============================================================

@api_router.get("/analytics/student")
async def analytics_student(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    papers = await db.user_answers.distinct("paper_id", {"user_id": uid})
    answers = await db.user_answers.find({"user_id": uid}, {"_id": 0}).to_list(5000)
    total = len(answers)
    correct = sum(1 for a in answers if a.get("is_correct"))
    accuracy = round((correct / total) * 100, 1) if total else 0.0
    total_seconds = sum(a.get("time_taken", 0) for a in answers)
    
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

# ============================================================
# Subjects & Exam Structure
# ============================================================

EXAM_STRUCTURE = {
    "GCE O Level": ["Mathematics", "English Language", "French", "Physics", "Chemistry",
                    "Biology", "History", "Geography", "Economics", "Literature", "Additional Mathematics"],
    "GCE A Level": ["Pure Mathematics", "Further Mathematics", "Physics", "Chemistry", "Biology",
                    "Economics", "Accounting", "Business Studies", "French", "English Literature"],
    "HND": ["Computer Science", "Business Management", "Accounting", "Marketing", "Law", "Engineering"],
    "Concours": ["General Knowledge", "Mathematics", "French", "English", "Sciences"],
}

@api_router.get("/exam/structure")
async def exam_structure():
    years = list(range(2026, 2009, -1))
    return {"levels": EXAM_STRUCTURE, "years": years, "papers": [1, 2, 3]}

@api_router.get("/subjects")
async def list_subjects(exam_level: Optional[str] = None):
    q = {"exam_level": exam_level} if exam_level else {}
    items = await db.subjects.find(q, {"_id": 0}).to_list(500)
    return {"items": items}

# ============================================================
# Past Papers (Mobile & Web compatible)
# ============================================================

@api_router.get("/past-papers")
async def list_past_papers(exam_level: Optional[str] = None, subject_id: Optional[str] = None):
    q = {}
    if exam_level:
        q["exam_level"] = exam_level
    if subject_id:
        q["subject_id"] = subject_id
    items = await db.past_papers.find(q, {"_id": 0}).sort("year", -1).to_list(500)
    return {"items": items}

@api_router.get("/past-papers/{paper_id}")
async def get_paper(paper_id: str):
    paper = await db.past_papers.find_one({"paper_id": paper_id}, {"_id": 0})
    if not paper:
        raise HTTPException(404, "Not found")
    questions = await db.questions.find({"paper_id": paper_id}, {"_id": 0}).to_list(200)
    return {"paper": paper, "questions": questions}

@api_router.get("/papers")
async def list_papers(level: Optional[str] = None, subject: Optional[str] = None,
                      year: Optional[int] = None, paper: Optional[int] = None,
                      q: Optional[str] = None, user: dict = Depends(get_current_user_optional)):
    query = {}
    if level: query["level"] = level
    if subject: query["subject"] = subject
    if year: query["year"] = year
    if paper: query["paper_number"] = paper
    if q: query["title"] = {"$regex": re.escape(q), "$options": "i"}
    papers = await db.papers.find(query, {"_id": 0}).sort([("year", -1), ("subject", 1)]).to_list(500)
    
    drafts = []
    if user:
        drafts = await db.drafts.find({"user_id": user["user_id"]}, {"_id": 0, "paper_id": 1}).to_list(500)
    saved = {d["paper_id"] for d in drafts}
    for p in papers:
        p["saved"] = p["paper_id"] in saved
    return {"items": papers}

@api_router.get("/papers/filters")
async def paper_filters():
    papers = await db.papers.find({}, {"_id": 0}).to_list(1000)
    levels = sorted({p.get("level") for p in papers if p.get("level")})
    subjects = sorted({p.get("subject") for p in papers if p.get("subject")})
    years = sorted({p.get("year") for p in papers if p.get("year")}, reverse=True)
    return {"levels": levels, "subjects": subjects, "years": years, "papers": [1, 2, 3]}

@api_router.get("/papers/{paper_id}")
async def get_paper_detail(paper_id: str):
    p = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paper not found")
    return p

@api_router.get("/papers/{paper_id}/pdf")
async def proxy_pdf(paper_id: str):
    p = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paper not found")
    try:
        data = await fetch_pdf_bytes(p["pdf_url"])
    except Exception:
        raise HTTPException(502, "Could not load PDF")
    return FastResponse(content=data, media_type="application/pdf",
                        headers={"Cache-Control": "public, max-age=86400"})

# ============================================================
# Questions
# ============================================================

@api_router.post("/questions/answer")
async def answer_question(inp: AnswerIn, user: dict = Depends(get_current_user)):
    q = await db.questions.find_one({"question_id": inp.question_id}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Question not found")
    correct = inp.selected.strip().upper() == q.get("correct_answer", "").strip().upper()
    await db.user_answers.insert_one({
        "user_id": user["user_id"],
        "question_id": inp.question_id,
        "paper_id": q.get("paper_id"),
        "selected": inp.selected,
        "is_correct": correct,
        "time_taken": inp.time_taken,
        "created_at": datetime.now(timezone.utc),
    })
    if correct:
        await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"xp": 10}})
    today = date.today().isoformat()
    await db.study_sessions.update_one(
        {"user_id": user["user_id"], "day": today},
        {"$inc": {"seconds": inp.time_taken, "attempted": 1, "correct": 1 if correct else 0},
         "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {
        "correct": correct,
        "correct_answer": q.get("correct_answer", ""),
        "explanation": q.get("explanation", ""),
    }

# ============================================================
# Math Solver
# ============================================================

@api_router.post("/solve")
async def solve_math_problem(req: SolveRequest, user: dict = Depends(get_current_user_optional)):
    local_result = solve_math_local(req.question)
    if local_result:
        return {
            "success": True,
            "answer": local_result,
            "source": "local_solver",
            "confidence": 0.95,
            "question": req.question,
            "subject": req.subject or "Mathematics"
        }

    try:
        system = "You are a math expert. Solve the problem step by step. Return the final answer clearly."
        chat = _new_chat(f"solve_{uuid.uuid4().hex[:12]}", system)
        response = await chat.send_message(req.question)
        return {
            "success": True,
            "answer": response,
            "source": "ai_solver",
            "confidence": 0.85,
            "question": req.question,
            "subject": req.subject or "General"
        }
    except Exception as e:
        logger.error(f"Solve endpoint error: {e}")
        return {
            "success": False,
            "error": str(e),
            "suggestion": "Try rephrasing your question or use specific math notation"
        }

# ============================================================
# AI Question Generation
# ============================================================

@api_router.post("/questions/generate")
async def generate_questions(req: GenerateQuestionsRequest, user: dict = Depends(get_current_user)):
    cache_key = f"{req.level}|{req.subject}|{req.year}|{req.paper}|{req.count}"
    cached = await db.questions_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        return {"questions": cached["questions"], "cached": True}

    system = (
        "You are an expert Cameroon GCE/HND examiner creating authentic multiple-choice exam questions. "
        "Always return STRICT valid JSON only, no markdown, no commentary."
    )
    prompt = (
        f"Create {req.count} exam-standard multiple-choice questions for {req.level} "
        f"{req.subject}, year {req.year}, Paper {req.paper}. "
        "Return a JSON object with key 'questions' as an array. Each item must have: "
        "id (string), text (the question), options (array of exactly 4 strings), "
        "correct_index (0-3 integer), explanation (clear step-by-step solution, 2-4 sentences), "
        "topic (short topic name), difficulty (one of easy/medium/hard), marks (integer 1-4). "
        "Make questions realistic and curriculum-appropriate. Return ONLY the JSON object."
    )
    chat = _new_chat(f"gen_{uuid.uuid4().hex}", system)
    resp = await chat.send_message(prompt)
    try:
        data = _clean_json(resp)
        questions = data.get("questions", data if isinstance(data, list) else [])
        if not questions:
            raise ValueError("empty questions list")
    except Exception:
        logger.error(f"Failed to parse AI questions: {resp[:200]}")
        raise HTTPException(502, "Couldn't generate questions right now. Please try again shortly.")

    for i, q in enumerate(questions):
        q["id"] = q.get("id") or f"q{i+1}"

    await db.questions_cache.insert_one({
        "cache_key": cache_key,
        "questions": questions,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"questions": questions, "cached": False}

# ============================================================
# Attempts & Progress
# ============================================================

@api_router.post("/attempts")
async def submit_attempt(req: SubmitAttemptRequest, user: dict = Depends(get_current_user)):
    accuracy = round((req.score / req.total) * 100) if req.total else 0
    topic_stats = {}
    for a in req.answers:
        t = a.get("topic", "General")
        topic_stats.setdefault(t, {"correct": 0, "total": 0})
        topic_stats[t]["total"] += 1
        if a.get("selected") == a.get("correct"):
            topic_stats[t]["correct"] += 1
    weak = [t for t, s in topic_stats.items() if s["total"] and s["correct"] / s["total"] < 0.5]
    strong = [t for t, s in topic_stats.items() if s["total"] and s["correct"] / s["total"] >= 0.8]

    attempt = {
        "attempt_id": f"att_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "level": req.level, "subject": req.subject, "year": req.year, "paper": req.paper,
        "score": req.score, "total": req.total, "accuracy": accuracy,
        "time_spent": req.time_spent,
        "weak_topics": weak, "strong_topics": strong,
        "answers": req.answers,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.attempts.insert_one(dict(attempt))

    xp_gain = req.score * 10 + (25 if accuracy == 100 else 0)
    new_xp = user.get("xp", 0) + xp_gain
    new_level = 1 + new_xp // 500
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"xp": new_xp, "level": new_level}})
    attempt.pop("_id", None)
    return {"attempt": attempt, "xp_gain": xp_gain, "new_xp": new_xp, "new_level": new_level}

@api_router.get("/attempts")
async def list_attempts(user: dict = Depends(get_current_user)):
    items = await db.attempts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    attempts = await db.attempts.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    questions_attempted = sum(a["total"] for a in attempts)
    correct = sum(a["score"] for a in attempts)
    accuracy = round((correct / questions_attempted) * 100) if questions_attempted else 0
    study_seconds = sum(a.get("time_spent", 0) for a in attempts)
    study_hours = round(study_seconds / 3600, 1)

    weak_counter, strong_counter = {}, {}
    for a in attempts:
        for t in a.get("weak_topics", []):
            weak_counter[t] = weak_counter.get(t, 0) + 1
        for t in a.get("strong_topics", []):
            strong_counter[t] = strong_counter.get(t, 0) + 1
    weak = sorted(weak_counter, key=weak_counter.get, reverse=True)[:4]
    strong = sorted(strong_counter, key=strong_counter.get, reverse=True)[:4]

    now = datetime.now(timezone.utc)
    week = [0] * 7
    for a in attempts:
        try:
            d = datetime.fromisoformat(a["created_at"])
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
            delta = (now.date() - d.date()).days
            if 0 <= delta < 7:
                week[6 - delta] += round(a.get("time_spent", 0) / 60)
        except Exception:
            pass
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    weekday_today = now.weekday()
    consistency = []
    for i in range(7):
        idx = (weekday_today - 6 + i) % 7
        consistency.append({"day": days[idx], "minutes": week[i]})

    return {
        "study_hours": study_hours,
        "questions_attempted": questions_attempted,
        "accuracy": accuracy,
        "streak": user.get("streak", 0),
        "xp": user.get("xp", 0),
        "level": user.get("level", 1),
        "xp_to_next": 500 - (user.get("xp", 0) % 500),
        "weak_topics": weak,
        "strong_topics": strong,
        "recent_attempts": sorted(attempts, key=lambda a: a["created_at"], reverse=True)[:5],
        "consistency": consistency,
        "total_attempts": len(attempts),
    }

@api_router.get("/leaderboard")
async def leaderboard():
    users = await db.users.find({"role": "student"}, {"_id": 0, "full_name": 1, "xp": 1, "level": 1, "user_id": 1}).to_list(500)
    users.sort(key=lambda u: u.get("xp", 0), reverse=True)
    board = []
    for i, u in enumerate(users):
        entry = {"rank": i + 1, "name": u.get("full_name", "Student"), "xp": u.get("xp", 0), "level": u.get("level", 1)}
        board.append(entry)
    return {"top": board[:10]}

# ============================================================
# Library Routes
# ============================================================

@api_router.get("/library/courses")
async def list_library_courses():
    items = await db.courses.find({}, {"_id": 0}).to_list(200)
    return {"items": items}

@api_router.get("/library/courses/{course_id}")
async def get_library_course(course_id: str):
    c = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    return {"course": c}

# ============================================================
# Teacher Overview
# ============================================================

@api_router.get("/teacher/overview")
async def teacher_overview(user: dict = Depends(get_current_user)):
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

# ============================================================
# AI Chat with Emergent
# ============================================================

@api_router.post("/ai/chat/emergent")
async def ai_chat_emergent(inp: ChatRequest, user: dict = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(500, f"AI unavailable: {e}")

    history = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": inp.session_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(20)

    system = (
        "You are GC AI Assistant, an expert academic tutor for Cameroon students preparing for "
        "GCE O Level, GCE A Level, HND and Concours exams. Explain step-by-step and be encouraging.\n\n"
        "OUTPUT FORMAT - VERY IMPORTANT:\n"
        "- Reply in PLAIN TEXT only. No Markdown. No asterisks for bold. No hashes for headings. "
        "No backticks. No code fences.\n"
        "- Do NOT use LaTeX. Write math using Unicode: x², x³, √, π, θ, α, β, Δ, Σ, ∫, ∞, "
        "≤, ≥, ≠, ≈, ×, ÷, ± , →, ⇒. For fractions write like '1/2' or '(a+b)/(c+d)'.\n"
        "- Structure with plain numbered steps: '1) ...' or bullet points '• ...'.\n"
        "- Keep answers concise but complete."
    )
    if inp.current_problem:
        system += f"\n\nCurrent problem context:\n{inp.current_problem}"

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=inp.session_id,
        system_message=system,
    ).with_model("anthropic", "claude-haiku-4-5-20251001")

    for m in history:
        if m.get("role") == "user":
            try:
                await chat.send_message(UserMessage(text=m["content"]))
            except Exception:
                pass

    try:
        reply = await chat.send_message(UserMessage(text=inp.message))
    except Exception as e:
        logger.exception("AI error")
        raise HTTPException(500, f"AI error: {e}")

    now = datetime.now(timezone.utc)
    await db.chat_messages.insert_many([
        {"user_id": user["user_id"], "session_id": inp.session_id, "role": "user",
         "content": inp.message, "created_at": now},
        {"user_id": user["user_id"], "session_id": inp.session_id, "role": "assistant",
         "content": reply, "created_at": now},
    ])
    return {"reply": reply}

@api_router.get("/ai/history")
async def ai_history(session_id: str, user: dict = Depends(get_current_user)):
    msgs = await db.chat_messages.find(
        {"user_id": user["user_id"], "session_id": session_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return {"messages": [serialize(m) for m in msgs]}

@api_router.post("/ai/solution")
async def ai_solution(inp: SolutionIn, user: dict = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        raise HTTPException(500, f"AI unavailable: {e}")

    system = (
        "You are a GCE examiner-tutor. Given a question, produce a JSON object with these keys:\n"
        "- title: short problem title (max 8 words)\n"
        "- steps: array of 4-7 objects each with 'heading' and 'body' (concise, exam-style)\n"
        "- narration: single paragraph script (150-250 words) suitable for text-to-speech, spoken naturally.\n\n"
        "OUTPUT FORMAT - VERY IMPORTANT:\n"
        "- The values inside 'heading', 'body', and 'narration' must be PLAIN TEXT - no Markdown, "
        "no asterisks, no hashes, no LaTeX, no backticks.\n"
        "- Write math with Unicode: x², √, π, θ, α, Δ, Σ, ∫, ∞, ≤, ≥, ≠, ≈, ×, ÷, →. "
        "For fractions use '1/2' style. For narration, spell numbers/symbols naturally so a TTS engine "
        "reads them well.\n"
        "Return ONLY valid JSON, no markdown, no code fences."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"sol_{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", "claude-haiku-4-5-20251001")
    try:
        reply = await chat.send_message(UserMessage(text=inp.question))
    except Exception as e:
        raise HTTPException(500, f"AI error: {e}")

    reply_clean = reply.strip()
    if reply_clean.startswith("```"):
        reply_clean = reply_clean.strip("`")
        if reply_clean.lower().startswith("json"):
            reply_clean = reply_clean[4:].strip()
    try:
        data = json.loads(reply_clean)
    except Exception:
        data = {"title": "Solution", "steps": [{"heading": "Solution", "body": reply}], "narration": reply}
    return data

# ============================================================
# AI Tutor (Streaming with OpenRouter)
# ============================================================

@api_router.get("/ai/sessions")
async def ai_sessions(user: dict = Depends(get_current_user)):
    items = await db.ai_sessions.find({"user_id": user["user_id"]}, {"_id": 0, "messages": 0}).sort("updated_at", -1).to_list(100)
    return items

@api_router.get("/ai/sessions/{session_id}")
async def ai_session_detail(session_id: str, user: dict = Depends(get_current_user)):
    s = await db.ai_sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Not found")
    return s

@api_router.post("/ai/chat")
async def ai_chat(req: ChatRequest, user: dict = Depends(get_current_user)):
    session_id = req.session_id or f"chat_{uuid.uuid4().hex[:12]}"
    session = await db.ai_sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not session:
        session = {
            "session_id": session_id,
            "user_id": user["user_id"],
            "title": req.message[:50],
            "subject": req.subject,
            "messages": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ai_sessions.insert_one(dict(session))

    history = session.get("messages", [])
    system = (
        f"You are GC AI, an expert, patient tutor for Cameroon students preparing for "
        f"GCE O/A Level, HND and Concours exams. Subject focus: {req.subject}. "
        "Explain step by step, use clear structure, give worked examples, and end with a short "
        "'Related topics' list when helpful. Be encouraging and exam-focused."
    )
    chat = _new_chat(session_id, system)

    async def event_gen():
        full = ""
        try:
            context_prefix = ""
            if history:
                recent = history[-6:]
                context_prefix = "Conversation so far:\n" + "\n".join(
                    f"{m['role'].upper()}: {m['content']}" for m in recent
                ) + "\n\nNow answer the new question.\n\n"
            response = await chat.send_message(context_prefix + req.message)
            full = response
            for chunk in [response[i:i+50] for i in range(0, len(response), 50)]:
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
        except Exception as e:
            logger.error(f"AI stream error: {e}")
            error_msg = "I'm having trouble connecting to my AI service. Please try again in a moment."
            full = error_msg
            for chunk in [error_msg[i:i+50] for i in range(0, len(error_msg), 50)]:
                yield f"data: {json.dumps({'delta': chunk})}\n\n"

        new_messages = history + [
            {"role": "user", "content": req.message, "ts": datetime.now(timezone.utc).isoformat()},
            {"role": "assistant", "content": full, "ts": datetime.now(timezone.utc).isoformat()},
        ]
        await db.ai_sessions.update_one(
            {"session_id": session_id, "user_id": user["user_id"]},
            {"$set": {"messages": new_messages, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream",
        }
    )

@api_router.get("/ai/health")
async def ai_health():
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    result = {
        "api_key_configured": bool(api_key),
        "api_key_prefix": (api_key[:12] + "...") if api_key else None,
        "models_tested": [],
    }
    if not api_key:
        result["diagnosis"] = "OPENROUTER_API_KEY is not set."
        return result

    models = _get_model_chain()
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": APP_URL,
        "X-Title": APP_NAME,
    }
    any_success = False
    async with httpx.AsyncClient(timeout=15.0) as hc:
        for model in models:
            entry = {"model": model}
            try:
                resp = await hc.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers,
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": "Reply with just: OK"}],
                        "max_tokens": 10,
                    },
                )
                entry["status_code"] = resp.status_code
                if resp.status_code == 200:
                    data = resp.json()
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    entry["ok"] = bool(content and content.strip())
                    if entry["ok"]:
                        any_success = True
                else:
                    entry["ok"] = False
                    try:
                        err = resp.json()
                        entry["error"] = err.get("error", {}).get("message", resp.text[:200])
                    except Exception:
                        entry["error"] = resp.text[:200]
            except httpx.RequestError as e:
                entry["ok"] = False
                entry["error"] = f"Network error: {e}"
            result["models_tested"].append(entry)

    result["diagnosis"] = "At least one model works." if any_success else "All models failed."
    return result

@api_router.post("/ai/explain")
async def ai_explain(req: ChatRequest, user: dict = Depends(get_current_user)):
    local_result = solve_math_local(req.message)
    if local_result:
        return {"answer": local_result, "source": "local_solver"}
    system = "You are GC AI, an expert exam tutor. Give a concise, clear step-by-step explanation."
    chat = _new_chat(f"explain_{uuid.uuid4().hex}", system)
    try:
        resp = await chat.send_message(req.message)
        return {"answer": resp, "source": "ai_solver"}
    except Exception as e:
        logger.error(f"AI explain error: {e}")
        return {"answer": "I'm having trouble connecting to my AI service. Please try again later.", "source": "error"}

# ============================================================
# Teacher: Courses & Earnings
# ============================================================

VIEW_RATE_FCFA = 90

@api_router.post("/courses")
async def create_course(req: CourseCreate, user: dict = Depends(get_current_user)):
    if user.get("role") != "teacher":
        raise HTTPException(403, "Teachers only")
    
    course = {
        "course_id": f"crs_{uuid.uuid4().hex[:12]}",
        "teacher_id": user["user_id"],
        "teacher_name": user.get("full_name", ""),
        "teacher_picture": user.get("profile_photo", ""),
        "title": req.title,
        "description": req.description,
        "subject": req.subject,
        "level": req.level,
        "video_url": req.video_url,
        "thumbnail": req.thumbnail or "",
        "price": req.price,
        "duration": req.duration or "45:00",
        "views": 0,
        "earnings": 0,
        "students": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.courses.insert_one(dict(course))
    course.pop("_id", None)
    return course

@api_router.get("/courses")
async def list_courses(mine: bool = False, user: dict = Depends(get_current_user_optional)):
    if mine and user:
        q = {"teacher_id": user["user_id"]}
    else:
        q = {}
    items = await db.courses.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/courses/{course_id}")
async def get_course(course_id: str):
    c = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    return c

@api_router.post("/courses/{course_id}/view")
async def register_view(course_id: str, user: dict = Depends(get_current_user)):
    course = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(404, "Not found")
    existing = await db.course_views.find_one(
        {"course_id": course_id, "student_id": user["user_id"]}, {"_id": 0})
    if existing:
        return {"counted": False, "earnings": course.get("earnings", 0)}
    await db.course_views.insert_one({
        "view_id": f"vw_{uuid.uuid4().hex[:10]}",
        "course_id": course_id,
        "student_id": user["user_id"],
        "teacher_id": course["teacher_id"],
        "earning": VIEW_RATE_FCFA,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.courses.update_one({"course_id": course_id},
                                {"$inc": {"views": 1, "students": 1, "earnings": VIEW_RATE_FCFA}})
    return {"counted": True, "rate": VIEW_RATE_FCFA}

@api_router.get("/teacher/stats")
async def teacher_stats(user: dict = Depends(get_current_user)):
    courses = await db.courses.find({"teacher_id": user["user_id"]}, {"_id": 0}).to_list(200)
    total_earnings = sum(c.get("earnings", 0) for c in courses)
    total_views = sum(c.get("views", 0) for c in courses)
    total_students = sum(c.get("students", 0) for c in courses)
    views = await db.course_views.find({"teacher_id": user["user_id"]}, {"_id": 0}).to_list(2000)
    now = datetime.now(timezone.utc)
    monthly = {}
    for v in views:
        try:
            d = datetime.fromisoformat(v["created_at"])
            key = d.strftime("%b")
            monthly[key] = monthly.get(key, 0) + v.get("earning", 0)
        except Exception:
            pass
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    chart = [{"month": m, "earnings": monthly.get(m, 0)} for m in months[max(0, now.month - 6):now.month]]
    return {
        "courses": len(courses),
        "students": total_students,
        "views": total_views,
        "earnings": total_earnings,
        "rate": VIEW_RATE_FCFA,
        "chart": chart,
        "course_table": [{"title": c["title"], "students": c.get("students", 0),
                          "views": c.get("views", 0), "earnings": c.get("earnings", 0)} for c in courses],
    }

# ============================================================
# Drafts
# ============================================================

@api_router.get("/drafts")
async def list_drafts(user: dict = Depends(get_current_user)):
    drafts = await db.drafts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [d["paper_id"] for d in drafts]
    papers = await db.papers.find({"paper_id": {"$in": ids}}, {"_id": 0}).to_list(500)
    pmap = {p["paper_id"]: p for p in papers}
    result = []
    for d in drafts:
        pp = pmap.get(d["paper_id"])
        if pp:
            pp = dict(pp)
            pp["saved"] = True
            pp["saved_at"] = d["created_at"]
            result.append(pp)
    return result

@api_router.post("/drafts")
async def save_draft(req: DraftRequest, user: dict = Depends(get_current_user)):
    existing = await db.drafts.find_one({"user_id": user["user_id"], "paper_id": req.paper_id})
    if existing:
        await db.drafts.delete_one({"user_id": user["user_id"], "paper_id": req.paper_id})
        return {"saved": False}
    await db.drafts.insert_one({"user_id": user["user_id"], "paper_id": req.paper_id,
                                "created_at": datetime.now(timezone.utc).isoformat()})
    return {"saved": True}

@api_router.delete("/drafts/{paper_id}")
async def delete_draft(paper_id: str, user: dict = Depends(get_current_user)):
    await db.drafts.delete_one({"user_id": user["user_id"], "paper_id": paper_id})
    return {"ok": True}

# ============================================================
# Lesson Videos
# ============================================================

@api_router.get("/lessons")
async def list_lessons(exam_level: Optional[str] = None):
    q = {} if not exam_level else {"exam_level": exam_level}
    items = await db.lesson_videos.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": [serialize(x) for x in items]}

@api_router.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: str):
    l = await db.lesson_videos.find_one({"lesson_id": lesson_id}, {"_id": 0})
    if not l:
        raise HTTPException(404, "Not found")
    await db.lesson_videos.update_one({"lesson_id": lesson_id}, {"$inc": {"views": 1}})
    l["views"] = l.get("views", 0) + 1
    return {"lesson": serialize(l)}

@api_router.post("/lessons")
async def create_lesson(req: LessonIn, user: dict = Depends(get_current_user)):
    if user.get("role") != "teacher":
        raise HTTPException(403, "Teachers only")
    lesson_id = f"lesson_{uuid.uuid4().hex[:10]}"
    doc = {
        "lesson_id": lesson_id,
        "teacher_id": user["user_id"],
        "teacher_name": user["full_name"],
        "teacher_avatar": user.get("profile_photo"),
        "title": req.title,
        "description": req.description,
        "subject_id": req.subject_id,
        "subject_name": req.subject_name,
        "exam_level": req.exam_level,
        "video_url": req.video_url,
        "thumbnail": req.thumbnail or "https://images.unsplash.com/photo-1708011271954-c0d2b3155ded?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
        "duration": req.duration or "10:00",
        "views": 0,
        "rating": 5.0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.lesson_videos.insert_one(doc)
    return {"lesson": serialize(doc)}

@api_router.get("/teacher/lessons")
async def teacher_lessons(user: dict = Depends(get_current_user)):
    if user.get("role") != "teacher":
        raise HTTPException(403, "Teachers only")
    items = await db.lesson_videos.find({"teacher_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": [serialize(x) for x in items]}

# ============================================================
# PDF Helpers
# ============================================================

_pdf_cache = {}

async def fetch_pdf_bytes(url: str) -> bytes:
    if url in _pdf_cache:
        return _pdf_cache[url]
    async with httpx.AsyncClient(timeout=45, follow_redirects=True) as hc:
        r = await hc.get(url)
    r.raise_for_status()
    _pdf_cache[url] = r.content
    return r.content

def extract_pdf_text(data: bytes, max_chars: int = 9000) -> str:
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for p in reader.pages:
            parts.append(p.extract_text() or "")
        return "\n".join(parts)[:max_chars]
    except:
        return ""

# ============================================================
# Root Endpoints
# ============================================================

@api_router.get("/")
async def root():
    return {
        "service": "GCSMART Unified API",
        "version": "2.0.0",
        "status": "running",
        "database": "MongoDB",
        "endpoints": {
            "auth": "/api/auth/register, /api/auth/login, /api/auth/session, /api/auth/me",
            "subjects": "/api/subjects",
            "papers": "/api/papers",
            "past-papers": "/api/past-papers",
            "courses": "/api/courses",
            "library": "/api/library/courses",
            "analytics": "/api/analytics/student",
            "ai": "/api/ai/chat, /api/ai/chat/emergent, /api/ai/solution",
            "docs": "/docs"
        }
    }

app.include_router(api_router)

# ============================================================
# Seed Data (Complete)
# ============================================================

async def seed_all_data():
    if await db.subjects.count_documents({}) > 0:
        return
    
    logger.info("Seeding sample data...")
    
    subjects_data = [
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Mathematics", "code": "MATH-O", "exam_level": "GCE O", "icon": "calculator-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "English Language", "code": "ENG-O", "exam_level": "GCE O", "icon": "book-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Physics", "code": "PHY-O", "exam_level": "GCE O", "icon": "flash-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Chemistry", "code": "CHEM-O", "exam_level": "GCE O", "icon": "flask-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Biology", "code": "BIO-O", "exam_level": "GCE O", "icon": "leaf-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Pure Mathematics", "code": "PMATH-A", "exam_level": "GCE A", "icon": "calculator-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Physics", "code": "PHY-A", "exam_level": "GCE A", "icon": "flash-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Chemistry", "code": "CHEM-A", "exam_level": "GCE A", "icon": "flask-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Computer Science", "code": "CS-HND", "exam_level": "HND", "icon": "code-slash-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "Business Management", "code": "BM-HND", "exam_level": "HND", "icon": "briefcase-outline"},
        {"subject_id": f"subj_{uuid.uuid4().hex[:8]}", "name": "General Knowledge", "code": "GK-CON", "exam_level": "Concours", "icon": "bulb-outline"},
    ]
    await db.subjects.insert_many(subjects_data)
    
    if not await db.users.find_one({"email": "student@gcsmart.cm"}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": "student@gcsmart.cm",
            "password_hash": hash_pw("Student123!"),
            "full_name": "Alex Ngwa",
            "role": "student",
            "onboarded": True,
            "exam_level": "GCE A",
            "xp": 320,
            "level": 4,
            "streak": 5,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    
    if not await db.users.find_one({"email": "teacher@gcsmart.cm"}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": "teacher@gcsmart.cm",
            "password_hash": hash_pw("Teacher123!"),
            "full_name": "Dr. Nkeng Paul",
            "role": "teacher",
            "onboarded": True,
            "exam_level": "GCE A",
            "xp": 0,
            "level": 1,
            "streak": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    
    pmath = await db.subjects.find_one({"code": "PMATH-A"})
    if pmath:
        STAT1 = "https://customer-assets-0z36b82j.emergentagent.net/job_cameroon-study-hub/artifacts/bpetqdqc_PURE%20MATHEMATICS%20with%20statistics%20paper%201.pdf"
        STAT2 = "https://customer-assets-0z36b82j.emergentagent.net/job_cameroon-study-hub/artifacts/uar8038x_A-LEVEL-2025-Pure-mathematics-with-statistics-2.pdf"
        MECH2 = "https://customer-assets-0z36b82j.emergentagent.net/job_cameroon-study-hub/artifacts/zo09xaaa_A-LEVEL-2025-Pure-mathematics-with-mechanics-2.pdf"
        
        await db.papers.insert_many([
            {
                "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
                "subject_id": pmath["subject_id"],
                "subject": "Pure Mathematics",
                "title": "Pure Mathematics with Statistics — Paper 1 (MCQ)",
                "level": "GCE A Level",
                "year": 2025,
                "paper_number": 1,
                "pdf_url": STAT1,
                "description": "Official 2025 A-Level multiple choice paper.",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
                "subject_id": pmath["subject_id"],
                "subject": "Pure Mathematics",
                "title": "Pure Mathematics with Statistics — Paper 2",
                "level": "GCE A Level",
                "year": 2025,
                "paper_number": 2,
                "pdf_url": STAT2,
                "description": "Official 2025 A-Level structured/theory paper.",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
                "subject_id": pmath["subject_id"],
                "subject": "Pure Mathematics",
                "title": "Pure Mathematics with Mechanics — Paper 2",
                "level": "GCE A Level",
                "year": 2025,
                "paper_number": 2,
                "pdf_url": MECH2,
                "description": "Official 2025 A-Level mechanics paper.",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ])
        
        await db.past_papers.insert_many([
            {
                "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
                "subject_id": pmath["subject_id"],
                "subject_name": "Pure Mathematics",
                "exam_level": "GCE A",
                "year": 2025,
                "paper_number": 1,
                "total_marks": 100,
                "question_count": 0,
                "duration_minutes": 180,
                "pdf_url": STAT1,
                "title": "A-Level 2025 Pure Mathematics — Paper 1",
            },
            {
                "paper_id": f"pap_{uuid.uuid4().hex[:12]}",
                "subject_id": pmath["subject_id"],
                "subject_name": "Pure Mathematics",
                "exam_level": "GCE A",
                "year": 2025,
                "paper_number": 2,
                "total_marks": 100,
                "question_count": 0,
                "duration_minutes": 180,
                "pdf_url": STAT2,
                "title": "A-Level 2025 Pure Mathematics — Paper 2",
            },
        ])
    
    thumb = "https://images.unsplash.com/photo-1708011271954-c0d2b3155ded?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
    tavatar = "https://images.unsplash.com/photo-1541178735493-479c1a27ed24?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
    
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
        },
    ]
    await db.courses.insert_many(courses)
    
    await db.lesson_videos.insert_many([
        {
            "lesson_id": f"lesson_{uuid.uuid4().hex[:10]}",
            "teacher_id": "seed_teacher",
            "teacher_name": "Dr. Nkeng Paul",
            "teacher_avatar": tavatar,
            "title": "Integration by Parts — 5-Minute Masterclass",
            "description": "The LIATE rule and 3 worked examples from A-Level papers.",
            "subject_name": "Pure Mathematics",
            "exam_level": "GCE A",
            "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
            "thumbnail": thumb,
            "duration": "05:12",
            "views": 843,
            "rating": 4.8,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    ])
    
    logger.info("Seed data complete")

# ============================================================
# Main Entry Point
# ============================================================

if __name__ == "__main__":
    import uvicorn
    
    PORT = int(os.environ.get("PORT", 8000))
    APP_URL = os.environ.get("APP_URL", f"http://localhost:{PORT}")
    
    print("Starting Unified GCSMART API Server...")
    print(f"Database: {DB_NAME}")
    print(f"OpenRouter: {'Enabled' if OPENROUTER_API_KEY else 'Disabled'}")
    print(f"Emergent LLM: {'Enabled' if EMERGENT_LLM_KEY else 'Disabled'}")
    print(f"API: {APP_URL}")
    print(f"Docs: {APP_URL}/docs")
    print(f"CORS Origins: {CORS_ORIGINS}")
    print(f"AI Model Chain: {_get_model_chain()}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info"
    )