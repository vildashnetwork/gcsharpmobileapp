# server_sqlite.py - GCSHARP API with SQLite (Fixed)
import os
import json
import uuid
import sqlite3
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr
import bcrypt
import jwt as pyjwt
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Environment variables
JWT_SECRET = os.environ.get("JWT_SECRET", "secret-key-change-me")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openrouter/free")

# SQLite Database
DB_PATH = ROOT_DIR / "gcsharp.db"

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            full_name TEXT NOT NULL,
            role TEXT DEFAULT 'student',
            profile_photo TEXT,
            onboarded INTEGER DEFAULT 0,
            exam_level TEXT,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            streak INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)
    
    # Subjects table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            subject_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT UNIQUE,
            exam_level TEXT,
            icon TEXT
        )
    """)
    
    # Past papers table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS past_papers (
            paper_id TEXT PRIMARY KEY,
            subject_id TEXT,
            subject_name TEXT,
            exam_level TEXT,
            year INTEGER,
            paper_number INTEGER,
            total_marks INTEGER,
            question_count INTEGER,
            duration_minutes INTEGER,
            pdf_url TEXT,
            title TEXT
        )
    """)
    
    # Questions table - FIXED: removed 'index' as column name
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            question_id TEXT PRIMARY KEY,
            paper_id TEXT,
            question_number INTEGER,
            question_text TEXT,
            options TEXT,
            correct_answer TEXT,
            explanation TEXT,
            marks INTEGER
        )
    """)
    
    # User answers table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            question_id TEXT,
            paper_id TEXT,
            selected TEXT,
            is_correct INTEGER,
            time_taken INTEGER,
            created_at TEXT
        )
    """)
    
    # Chat messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            session_id TEXT,
            role TEXT,
            content TEXT,
            created_at TEXT
        )
    """)
    
    # Courses table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS courses (
            course_id TEXT PRIMARY KEY,
            title TEXT,
            subject_name TEXT,
            exam_level TEXT,
            teacher_name TEXT,
            teacher_avatar TEXT,
            thumbnail TEXT,
            video_url TEXT,
            duration TEXT,
            views INTEGER DEFAULT 0,
            rating REAL DEFAULT 5.0,
            description TEXT
        )
    """)
    
    conn.commit()
    conn.close()
    print(f"✅ SQLite database initialized at: {DB_PATH}")

# Initialize database
init_db()

# Seed data
def seed_data():
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if subjects exist
    cursor.execute("SELECT COUNT(*) FROM subjects")
    if cursor.fetchone()[0] == 0:
        subjects = [
            ("Mathematics", "MATH-O", "GCE O"),
            ("Physics", "PHY-O", "GCE O"),
            ("Chemistry", "CHEM-O", "GCE O"),
            ("Pure Mathematics", "PMATH-A", "GCE A"),
            ("Further Mathematics", "FMATH-A", "GCE A"),
            ("Computer Science", "CS-HND", "HND"),
            ("Business Management", "BM-HND", "HND"),
        ]
        for name, code, level in subjects:
            cursor.execute(
                "INSERT INTO subjects (subject_id, name, code, exam_level) VALUES (?, ?, ?, ?)",
                (f"subj_{uuid.uuid4().hex[:8]}", name, code, level)
            )
    
    # Check if demo users exist
    cursor.execute("SELECT COUNT(*) FROM users WHERE email = ?", ("student@gcsmart.cm",))
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO users (user_id, email, password_hash, full_name, role, onboarded, exam_level, xp, level, streak, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            f"user_{uuid.uuid4().hex[:12]}",
            "student@gcsmart.cm",
            bcrypt.hashpw("Student123!".encode(), bcrypt.gensalt()).decode(),
            "Alex Ngwa",
            "student",
            1,
            "GCE A",
            320,
            4,
            5,
            datetime.now(timezone.utc).isoformat()
        ))
    
    conn.commit()
    conn.close()
    print("✅ Seed data inserted")

seed_data()

# FastAPI app
app = FastAPI(title="GCSHARP API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("gcsharp")

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Literal["student", "teacher"] = "student"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

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

async def current_user(authorization: Optional[str] = None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        decoded = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = decoded.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    conn = get_db()
    cursor = conn.cursor()
    user = cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return dict(user)

def serialize(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}

# ---------- AI Helper ----------
async def call_openrouter(message: str, system: str) -> str:
    if not OPENROUTER_API_KEY:
        return "AI service not configured. Please set OPENROUTER_API_KEY."
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:8000",
                    "X-Title": "GCSHARP AI"
                },
                json={
                    "model": OPENROUTER_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": message}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 1000,
                }
            )
            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"]
            return f"AI error: {response.status_code}"
    except Exception as e:
        return f"Error: {str(e)}"

# ---------- Routes ----------
@api.get("/")
async def root():
    return {"service": "gcsharp", "ok": True, "database": "SQLite"}

@api.get("/subjects")
async def list_subjects(exam_level: Optional[str] = None):
    conn = get_db()
    cursor = conn.cursor()
    if exam_level:
        items = cursor.execute("SELECT * FROM subjects WHERE exam_level = ?", (exam_level,)).fetchall()
    else:
        items = cursor.execute("SELECT * FROM subjects").fetchall()
    conn.close()
    return {"items": [dict(item) for item in items]}

@api.post("/auth/register")
async def register(inp: RegisterIn):
    conn = get_db()
    cursor = conn.cursor()
    existing = cursor.execute("SELECT * FROM users WHERE email = ?", (inp.email.lower(),)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(400, "Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    cursor.execute("""
        INSERT INTO users (user_id, email, password_hash, full_name, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user_id, inp.email.lower(), hash_pw(inp.password), inp.full_name, inp.role, datetime.now(timezone.utc).isoformat()))
    conn.commit()
    conn.close()
    
    token = make_jwt(user_id)
    return {"token": token, "user": {"user_id": user_id, "email": inp.email, "full_name": inp.full_name, "role": inp.role}}

@api.post("/auth/login")
async def login(inp: LoginIn):
    conn = get_db()
    cursor = conn.cursor()
    user = cursor.execute("SELECT * FROM users WHERE email = ?", (inp.email.lower(),)).fetchone()
    conn.close()
    
    if not user or not user["password_hash"] or not check_pw(inp.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    
    token = make_jwt(user["user_id"])
    return {"token": token, "user": dict(user)}

@api.post("/ai/chat")
async def ai_chat(inp: ChatIn, user: dict = Depends(current_user)):
    system = "You are GC AI Assistant, an expert academic tutor for Cameroon students preparing for GCE O Level, GCE A Level, HND and Concours exams. Explain step-by-step and be encouraging. Use plain text only, no markdown."
    
    if inp.current_problem:
        system += f"\n\nCurrent problem context:\n{inp.current_problem}"
    
    reply = await call_openrouter(inp.message, system)
    
    # Save chat history
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        "INSERT INTO chat_messages (user_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        (user["user_id"], inp.session_id, "user", inp.message, now)
    )
    cursor.execute(
        "INSERT INTO chat_messages (user_id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        (user["user_id"], inp.session_id, "assistant", reply, now)
    )
    conn.commit()
    conn.close()
    
    return {"reply": reply}

@api.get("/chat/history")
async def chat_history(session_id: str, user: dict = Depends(current_user)):
    conn = get_db()
    cursor = conn.cursor()
    messages = cursor.execute(
        "SELECT * FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY id",
        (user["user_id"], session_id)
    ).fetchall()
    conn.close()
    return {"messages": [dict(m) for m in messages]}

@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return {"user": user}

@api.post("/auth/logout")
async def logout():
    return {"ok": True}

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api)

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting GCSHARP API Server (SQLite)...")
    print(f"📁 Database: {DB_PATH}")
    print(f"🤖 OpenRouter: {'✅' if OPENROUTER_API_KEY else '❌'}")
    print("📖 API Docs: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)