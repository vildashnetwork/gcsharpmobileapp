# MOBILE BACKEND (complete)
import os
import io
import re
import json
import uuid
import logging
import secrets
import random
import hashlib
import asyncio
import requests
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Literal, Dict
from contextlib import asynccontextmanager

from pydantic import field_validator
from fastapi import (
    FastAPI, APIRouter, HTTPException, Header, Depends, Request, Response,
    WebSocket, WebSocketDisconnect,
)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, Response as FastResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import bcrypt
import jwt as pyjwt
import httpx

# Optional integrations (SMS OTP + scheduled jobs). Guarded so the app still
# boots if these packages aren't installed yet — install with:
#   pip install twilio apscheduler
try:
    from twilio.rest import Client as TwilioClient
    from twilio.base.exceptions import TwilioRestException
except Exception:
    TwilioClient = None
    TwilioRestException = Exception

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.interval import IntervalTrigger
except Exception:
    AsyncIOScheduler = None
    IntervalTrigger = None

# ============================================================
# MOBILE
# ============================================================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

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

# Brevo (Sendinblue) API key
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "noreply@gcsmart.cm")
BREVO_SENDER_NAME = os.environ.get("BREVO_SENDER_NAME", "GC Smart")

# Twilio (SMS OTP) - optional; phone login is disabled automatically if unset
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER")
TWILIO_MESSAGING_SERVICE_SID = os.environ.get("TWILIO_MESSAGING_SERVICE_SID")
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")

twilio_client = None
if TwilioClient and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    try:
        twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        print("Twilio client initialized successfully")
    except Exception as e:
        print(f"Failed to initialize Twilio client: {e}")
else:
    print("Twilio credentials not configured - phone OTP login disabled")

# Initialize MongoDB
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

print(f"Connected to MongoDB: {MONGO_URL[:40]}...")
print(f"Database: {DB_NAME}")

# Scheduler for background jobs (daily streak reminder email/notification)
scheduler = AsyncIOScheduler() if AsyncIOScheduler else None

# ============================================================
# WebSocket Connection Manager for real-time notifications
# ============================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        self.active_connections.pop(user_id, None)

    async def send_personal_message(self, message: dict, user_id: str):
        websocket = self.active_connections.get(user_id)
        if websocket:
            try:
                await websocket.send_json(message)
            except Exception:
                self.disconnect(user_id)

manager = ConnectionManager()

# ============================================================
# Lifespan Events
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Unified GCSMART API Server...")

    try:
        # Existing indexes
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
        # FIX: drafts uniqueness is per (user_id, paper_id), not on an unused
        # "draft_id" field. The old `create_index("draft_id", unique=True)`
        # caused every document (which never set draft_id) to be treated as
        # having a null draft_id — and a non-sparse unique index treats all
        # nulls as duplicates of each other. That meant the *second* draft
        # any user ever saved would hit a duplicate-key error and 500.
        await db.drafts.create_index([("user_id", 1), ("paper_id", 1)], unique=True)
        await db.drafts.create_index("draft_id", unique=True, sparse=True)
        await db.papers.create_index("paper_id", unique=True)
        await db.attempts.create_index("attempt_id", unique=True)
        await db.chat_messages.create_index("session_id", 1)
        await db.chat_messages.create_index("user_id", 1)
        await db.ai_sessions.create_index("session_id", unique=True)
        await db.ai_feedback.create_index([("user_id", 1), ("session_id", 1), ("created_at", -1)])
        await db.study_sessions.create_index("user_id", 1)
        await db.study_sessions.create_index("day", 1)
        
        # PIN auth indexes
        await db.users.create_index("biometric_token_hash", unique=True, sparse=True)
        await db.pin_login_audit.create_index([("user_id", 1), ("created_at", -1)])
        
        # Password reset OTP index
        await db.password_reset_otps.create_index("email", 1)
        await db.password_reset_otps.create_index("expires_at", expireAfterSeconds=0)
        
        # PIN reset OTP index
        await db.pin_reset_otps.create_index("email", 1)
        await db.pin_reset_otps.create_index("expires_at", expireAfterSeconds=0)

        # Phone OTP index
        await db.phone_otps.create_index("expires_at", expireAfterSeconds=0)

        # Notifications / streak / reading-time / video-interaction indexes
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.paper_reading_time.create_index([("user_id", 1), ("paper_id", 1)], unique=True)
        await db.watch_history.create_index([("user_id", 1), ("course_id", 1)], unique=True)
        await db.video_likes.create_index([("user_id", 1), ("course_id", 1)], unique=True)
        await db.video_saves.create_index([("user_id", 1), ("course_id", 1)], unique=True)
        await db.reminder_log.create_index([("user_id", 1), ("date", 1)])
        await db.ai_sessions.create_index([("user_id", 1), ("updated_at", -1)])
        
        print("Indexes created successfully")
    except Exception as e:
        print(f"Index creation warning (may be harmless): {e}")
    
    try:
        await seed_all_data()
    except Exception as e:
        print(f"Seed data warning: {e}")

    if AsyncIOScheduler and IntervalTrigger:
        try:
            scheduler.add_job(daily_reminder_job, IntervalTrigger(hours=1), id="daily_reminder", replace_existing=True)
            scheduler.start()
            print("Scheduler started for daily reminders")
        except Exception as e:
            print(f"Scheduler warning: {e}")
    else:
        print("APScheduler not installed - daily reminder job disabled (pip install apscheduler)")
    
    yield

    if AsyncIOScheduler and IntervalTrigger:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass
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
# LLM Client (unchanged)
# ============================================================

DEFAULT_MODEL_CHAIN = [
    "openai/gpt-oss-20b:free",
    "google/gemma-3n-e4b-it:free",
    "google/gemma-4-31b-it:free",
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
            "temperature": 0.2,
            "max_tokens": 600,
            "stream": False,
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

        logger.warning(f"Model {model} failed: {response.status_code} ({response.text[:300]})")
        return None

    async def send_message(self, message: str) -> str:
        if not self.api_key:
            return "AI service not configured. Please set OPENROUTER_API_KEY in .env"
        models_to_try = (self.models or [])[:3]
        if not models_to_try:
            return "AI model list is empty."
        async with httpx.AsyncClient(timeout=25.0) as hc:
            for model in models_to_try:
                result = await self._call_model(hc, model, message)
                if result is not None:
                    return result
        return "I'm having trouble reaching the AI service. Please try again."

# ============================================================
# Brevo Email Helper
# ============================================================

async def send_brevo_email(to_email: str, subject: str, html_content: str, text_content: Optional[str] = None):
    """Send an email using Brevo (Sendinblue) transactional API."""
    if not BREVO_API_KEY:
        logger.error("BREVO_API_KEY not set. Cannot send email.")
        return False

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
    }
    data = {
        "sender": {
            "name": BREVO_SENDER_NAME,
            "email": BREVO_SENDER_EMAIL,
        },
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content or html_content.replace("<.*?>", ""),  # crude fallback
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, json=data)
            if response.status_code in (200, 201, 202):
                logger.info(f"Email sent to {to_email} via Brevo")
                return True
            else:
                logger.error(f"Brevo API error: {response.status_code} - {response.text}")
                return False
    except Exception as e:
        logger.error(f"Brevo send exception: {e}")
        return False

def generate_otp() -> str:
    return f"{random.randint(100000, 999999)}"

# ============================================================
# Twilio SMS Helper (for phone OTP login)
# ============================================================

def send_sms_via_twilio(to_number: str, message: str) -> dict:
    """Send SMS using Twilio. Returns {'success': bool, 'sid'?: str, 'error'?: str}."""
    if not twilio_client:
        return {"success": False, "error": "Twilio client not initialized. Check your credentials."}

    if not TWILIO_PHONE_NUMBER and not TWILIO_MESSAGING_SERVICE_SID:
        return {"success": False, "error": "No sending phone number or messaging service configured."}

    try:
        if not to_number.startswith("+"):
            to_number = "+" + to_number

        logger.info(f"Sending SMS to: {to_number}")

        if TWILIO_MESSAGING_SERVICE_SID:
            msg = twilio_client.messages.create(
                body=message, messaging_service_sid=TWILIO_MESSAGING_SERVICE_SID, to=to_number
            )
        else:
            msg = twilio_client.messages.create(body=message, from_=TWILIO_PHONE_NUMBER, to=to_number)

        logger.info(f"SMS sent successfully. SID: {msg.sid}")
        return {"success": True, "sid": msg.sid, "status": msg.status}
    except TwilioRestException as e:
        logger.error(f"Twilio error: {e}")
        return {"success": False, "error": f"Twilio error: {getattr(e, 'msg', str(e))}"}
    except Exception as e:
        logger.error(f"Failed to send SMS: {e}")
        return {"success": False, "error": str(e)}

# ============================================================
# PIN Auth Helper Functions
# ============================================================

def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()

def check_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode(), hashed.encode())
    except Exception:
        return False

def hash_biometric_token(token: str) -> str:
    return bcrypt.hashpw(token.encode(), bcrypt.gensalt()).decode()

def check_biometric_token(token: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(token.encode(), hashed.encode())
    except Exception:
        return False

def new_biometric_token() -> str:
    return f"bio_{secrets.token_urlsafe(32)}"

async def create_user_session(user_id: str) -> str:
    session_token = f"tok_{uuid.uuid4().hex}"
    expires_at = datetime.utcnow() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.utcnow().isoformat(),
    })
    return session_token

async def bcrypt_check_dummy_pin(pin: str) -> None:
    dummy_hash = bcrypt.hashpw(b"000000", bcrypt.gensalt())
    try:
        bcrypt.checkpw(pin.encode(), dummy_hash)
    except Exception:
        pass

def pin_lock_remaining(user: dict) -> int:
    locked_until = user.get("pin_locked_until")
    if not locked_until:
        return 0
    if isinstance(locked_until, str):
        locked_until = datetime.fromisoformat(locked_until)
    remaining = (locked_until - datetime.utcnow()).total_seconds()
    return max(0, int(remaining))

def public_user(user: dict) -> dict:
    safe = {k: v for k, v in user.items() if k not in [
        "password_hash", "pin_hash", "biometric_token_hash",
        "failed_pin_attempts", "pin_locked_until", "_id"
    ]}
    safe.setdefault("onboarded", False)
    safe.setdefault("xp", 0)
    safe.setdefault("level", 1)
    safe.setdefault("streak", 0)
    safe.setdefault("profile_photo", None)
    safe.setdefault("exam_level", None)
    safe.setdefault("full_name", safe.get("full_name", "User"))
    safe.setdefault("role", "student")
    safe.setdefault("bio", "")
    safe.setdefault("institution", "")
    safe.setdefault("study_year", None)
    safe.setdefault("subjects", [])
    safe.setdefault("goals", [])
    safe.setdefault("daily_commitment", "")
    safe.setdefault("proficiency", "")
    safe.setdefault("learning_style", "")
    safe.setdefault("specialization", "")
    safe.setdefault("accuracy", 0.0)
    safe.setdefault("settings", DEFAULT_SETTINGS)
    safe.setdefault("last_goal_met_date", None)
    return safe

# ============================================================
# Pydantic Models for PIN Auth
# ============================================================
# NOTE: PIN "strength" rejection has been intentionally removed everywhere
# in this file. The only remaining constraint is the structural one — a PIN
# must be exactly 6 digits — so the app can render a fixed 6-digit PIN pad.
# There is no longer a blocklist of "weak" PINs (000000, 123456, etc.) at
# registration, setup, or reset time.

class RegisterWithPinRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    pin: str
    role: Literal["student", "teacher"] = "student"

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{6}", value):
            raise ValueError("PIN must contain exactly 6 digits")
        return value

class PinLoginRequest(BaseModel):
    email: EmailStr
    pin: str

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{6}", value):
            raise ValueError("PIN must contain exactly 6 digits")
        return value

class BiometricLoginRequest(BaseModel):
    biometric_token: str = Field(min_length=32, max_length=256)

class PinSetupRequest(BaseModel):
    pin: str

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{6}", value):
            raise ValueError("PIN must contain exactly 6 digits")
        return value

class BiometricSetupRequest(BaseModel):
    enable: bool = True

# ============================================================
# Pydantic Models for Password Reset OTP
# ============================================================

class RequestResetOtpRequest(BaseModel):
    email: EmailStr

class ResetPasswordWithOtpRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str = Field(min_length=8, max_length=128)

# ============================================================
# Pydantic Models for PIN Reset OTP
# ============================================================

class RequestPinResetOtpRequest(BaseModel):
    email: EmailStr

class ResetPinWithOtpRequest(BaseModel):
    email: EmailStr
    otp: str
    new_pin: str = Field(min_length=6, max_length=6)

    @field_validator("new_pin")
    @classmethod
    def validate_new_pin(cls, value: str) -> str:
        if not re.fullmatch(r"\d{6}", value):
            raise ValueError("PIN must contain exactly 6 digits")
        return value

# ============================================================
# PUSH NOTIFICATION HELPERS
# ============================================================

EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send"

async def send_expo_push(token: str, title: str, body: str, data: Optional[dict] = None):
    """
    Send a push notification to a single Expo push token.
    """
    if not token:
        return
    payload = {
        "to": token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {},
        "priority": "high",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(EXPO_PUSH_API_URL, json=payload)
            if response.status_code != 200:
                logger.error(f"Expo push failed: {response.text}")
            else:
                logger.info(f"Push sent to {token[:10]}...")
    except Exception as e:
        logger.error(f"Expo push error: {e}")

# ============================================================
# MODIFIED create_notification – now sends push too
# ============================================================

async def create_notification(user_id: str, message: str, type: str = "info", link: Optional[str] = None) -> dict:
    notif = {
        "user_id": user_id,
        "message": message,
        "type": type,
        "link": link,
        "read": False,
        "created_at": datetime.utcnow().isoformat(),
    }
    result = await db.notifications.insert_one(notif)
    notif["_id"] = str(result.inserted_id)

    # WebSocket real‑time
    await manager.send_personal_message(notif, user_id)

    # Push notification (Expo)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "expo_push_token": 1})
    if user_doc and user_doc.get("expo_push_token"):
        title = "GC Smart"
        if type == "streak":
            title = "🔥 Streak Update"
        elif type == "reminder":
            title = "⏰ Study Reminder"
        elif type == "ai_reply":
            title = "🤖 AI Reply"
        await send_expo_push(user_doc["expo_push_token"], title, message, {"link": link})

    return notif

# ============================================================
# PUSH TOKEN REGISTRATION ENDPOINT
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
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(days=7),
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
    
    try:
        decoded = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = decoded.get("sub")
    except:
        session = await db.user_sessions.find_one({"session_token": token})
        if session:
            exp = session.get("expires_at")
            if exp:
                if isinstance(exp, str):
                    try:
                        exp = datetime.fromisoformat(exp)
                    except:
                        pass
                if exp and exp > datetime.utcnow():
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
    
    # ---- FIX: Override full_name and profile_photo with current DB values ----
    if "name" in user:
        user["full_name"] = user["name"]
    if "picture" in user:
        user["profile_photo"] = user["picture"]
    # ---------------------------------------------------------------------
    
    user.pop("_id", None)
    user.pop("password_hash", None)
    
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
    user.setdefault("accuracy", 0.0)
    user.setdefault("settings", DEFAULT_SETTINGS)
    user.setdefault("last_goal_met_date", None)
    
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

class PushTokenRequest(BaseModel):
    token: str

@api_router.post("/notifications/register-push-token")
async def register_push_token(req: PushTokenRequest, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"expo_push_token": req.token}}
    )
    # Send a welcome push as a test
    await create_notification(
        user["user_id"],
        "Push notifications enabled! You'll get study reminders and updates.",
        "info",
        "/dashboard"
    )
    return {"ok": True}


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
# Pydantic Models (existing)
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
    full_name: Optional[str] = None
    picture: Optional[str] = None
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
# Pydantic Models - Phone OTP Auth (Twilio)
# ============================================================

class PhoneLoginRequest(BaseModel):
    phone: str
    country_code: str = "+237"

class PhoneVerifyRequest(BaseModel):
    phone: str
    country_code: str = "+237"
    otp: str

# ============================================================
# Pydantic Models - Settings
# ============================================================

DEFAULT_SETTINGS = {
    "autoplay_next": True,
    "default_playback_speed": 1.0,
    "default_video_quality": "auto",
    "captions_enabled": False,
    "notifications_enabled": True,
    "email_notifications": True,
    "theme": "system",
    "language": "en",
}

class SettingsUpdate(BaseModel):
    autoplay_next: Optional[bool] = None
    default_playback_speed: Optional[float] = None
    default_video_quality: Optional[str] = None
    captions_enabled: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    email_notifications: Optional[bool] = None
    theme: Optional[str] = None
    language: Optional[str] = None

# ============================================================
# Pydantic Models - Reading Time / Highlight Video
# ============================================================

class ReadingTimeRequest(BaseModel):
    seconds: int  # delta seconds since last heartbeat

class HighlightVideoRequest(BaseModel):
    text: str
    context: Optional[str] = None

# ============================================================
# Auth Helpers
# ============================================================
# Authentication Routes (with login notification)
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
        "created_at": datetime.utcnow().isoformat(),
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
    expires_at = datetime.utcnow() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.utcnow().isoformat(),
    })
    
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", path="/",
        max_age=7 * 24 * 60 * 60,
    )
    user.pop("password_hash", None)
    user.pop("_id", None)

    # Send login notification
    await create_notification(
        user["user_id"],
        f"Welcome back, {user.get('full_name', 'Student')}! Keep up your study streak.",
        "info",
        "/dashboard"
    )
    return {"token": session_token, "user": user}

@api_router.post("/auth/session")
async def process_session(request: Request, response: Response):
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
            "created_at": datetime.utcnow().isoformat(),
        }
        await db.users.insert_one(dict(user))
    
    expires_at = datetime.utcnow() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.utcnow().isoformat(),
    })

    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none", path="/",
        max_age=7 * 24 * 60 * 60,
    )
    
    user.pop("password_hash", None)
    user.pop("_id", None)
    user.setdefault("onboarded", False)
    
    # Login notification
    await create_notification(
        user_id,
        f"Welcome back, {user.get('full_name', 'Student')}! Ready to learn?",
        "info",
        "/dashboard"
    )
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
    update = {}
    for k, v in payload.model_dump().items():
        if v is not None:
            if k == "full_name":
                update["name"] = v
                update["full_name"] = v   # keep both in sync
            elif k == "picture":
                update["picture"] = v
                update["profile_photo"] = v   # keep both in sync
            else:
                update[k] = v
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]})
    fresh.pop("_id", None)
    fresh.pop("password_hash", None)
    # Normalise for frontend (already done, but keep for safety)
    if "name" in fresh and "full_name" not in fresh:
        fresh["full_name"] = fresh["name"]
    if "picture" in fresh and "profile_photo" not in fresh:
        fresh["profile_photo"] = fresh["picture"]
    return fresh


# ============================================================
# User Settings
# ============================================================

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    stored = user.get("settings") or {}
    return {**DEFAULT_SETTINGS, **stored}

@api_router.put("/settings")
async def update_settings(payload: SettingsUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    current = user.get("settings") or {}
    merged = {**DEFAULT_SETTINGS, **current, **updates}
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"settings": merged}})
    return merged

@api_router.post("/settings/reset")
async def reset_settings(user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"settings": DEFAULT_SETTINGS}})
    return dict(DEFAULT_SETTINGS)

# ============================================================
# PIN Authentication Routes
# ============================================================

@api_router.post("/auth/register-with-pin")
async def register_with_pin(
    req: RegisterWithPinRequest,
    response: Response,
):
    email = req.email.lower().strip()

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An account already exists for this email",
        )

    # NOTE: no weak-PIN blocklist here anymore — any 6-digit PIN is accepted.

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    biometric_token = new_biometric_token()

    user = {
        "user_id": user_id,
        "email": email,
        "password_hash": hash_pw(req.password),
        "pin_hash": hash_pin(req.pin),
        "biometric_token_hash": hash_biometric_token(biometric_token),
        "full_name": req.name.strip(),
        "role": req.role,
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
        "failed_pin_attempts": 0,
        "pin_locked_until": None,
        "pin_created_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }

    try:
        await db.users.insert_one(dict(user))
    except Exception:
        logger.exception("PIN registration failed")
        raise HTTPException(
            status_code=500,
            detail="Could not create the account",
        )

    session_token = await create_user_session(user_id)

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )

    # Send welcome notification
    await create_notification(user_id, "Account created! Start your learning journey.", "info", "/dashboard")

    return {
        "token": session_token,
        "biometric_token": biometric_token,
        "user": public_user(user),
    }


@api_router.post("/auth/pin-login")
async def pin_login(
    req: PinLoginRequest,
    request: Request,
    response: Response,
):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})

    if not user or not user.get("pin_hash"):
        await bcrypt_check_dummy_pin(req.pin)
        raise HTTPException(
            status_code=401,
            detail="Invalid email or PIN",
        )

    remaining = pin_lock_remaining(user)
    if remaining > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {remaining} seconds.",
        )

    if not check_pin(req.pin, user["pin_hash"]):
        attempts = int(user.get("failed_pin_attempts", 0)) + 1

        updates = {
            "failed_pin_attempts": attempts,
        }

        if attempts >= 5:
            updates["failed_pin_attempts"] = 0
            updates["pin_locked_until"] = (
                datetime.utcnow() + timedelta(minutes=15)
            )

        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": updates}
        )

        await db.pin_login_audit.insert_one({
            "user_id": user["user_id"],
            "success": False,
            "ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "created_at": datetime.utcnow(),
        })

        raise HTTPException(
            status_code=401,
            detail="Invalid PIN",
        )

    biometric_token = new_biometric_token()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "failed_pin_attempts": 0,
            "pin_locked_until": None,
            "biometric_token_hash": hash_biometric_token(biometric_token),
            "biometric_enabled": True,
        }}
    )

    await db.pin_login_audit.insert_one({
        "user_id": user["user_id"],
        "success": True,
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "created_at": datetime.utcnow(),
    })

    session_token = await create_user_session(user["user_id"])

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )

    fresh_user = await db.users.find_one({"user_id": user["user_id"]})

    # Login notification
    await create_notification(
        user["user_id"],
        f"Welcome back, {fresh_user.get('full_name', 'Student')}!",
        "info",
        "/dashboard"
    )

    return {
        "token": session_token,
        "biometric_token": biometric_token,
        "user": public_user(fresh_user),
    }


@api_router.post("/auth/biometric-login")
async def biometric_login(
    req: BiometricLoginRequest,
    request: Request,
    response: Response,
):
    candidates = await db.users.find(
        {"biometric_token_hash": {"$exists": True, "$ne": None}}
    ).to_list(length=5000)

    user = None
    for candidate in candidates:
        hashed = candidate.get("biometric_token_hash")
        if hashed and check_biometric_token(req.biometric_token, hashed):
            user = candidate
            break

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid biometric token",
        )

    await db.pin_login_audit.insert_one({
        "user_id": user["user_id"],
        "success": True,
        "method": "biometric",
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "created_at": datetime.utcnow(),
    })

    session_token = await create_user_session(user["user_id"])

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )

    # Login notification
    await create_notification(
        user["user_id"],
        f"Welcome back, {user.get('full_name', 'Student')}!",
        "info",
        "/dashboard"
    )

    return {
        "token": session_token,
        "user": public_user(user),
    }


@api_router.post("/auth/setup-pin")
async def setup_pin(
    req: PinSetupRequest,
    user: dict = Depends(get_current_user),
):
    # NOTE: no weak-PIN blocklist here anymore — any 6-digit PIN is accepted.
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "pin_hash": hash_pin(req.pin),
            "pin_created_at": datetime.utcnow(),
            "failed_pin_attempts": 0,
            "pin_locked_until": None,
        }}
    )

    return {"ok": True, "message": "PIN set successfully"}


@api_router.post("/auth/setup-biometric")
async def setup_biometric(
    req: BiometricSetupRequest,
    user: dict = Depends(get_current_user),
):
    if req.enable:
        biometric_token = new_biometric_token()
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "biometric_token_hash": hash_biometric_token(biometric_token),
                "biometric_enabled": True,
            }}
        )
        return {
            "ok": True,
            "biometric_token": biometric_token,
            "message": "Biometric authentication enabled",
        }
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "biometric_token_hash": None,
                "biometric_enabled": False,
            }}
        )
        return {
            "ok": True,
            "message": "Biometric authentication disabled",
        }


@api_router.get("/auth/pin-status")
async def pin_status(
    user: dict = Depends(get_current_user),
):
    raw_user = await db.users.find_one({"user_id": user["user_id"]})
    has_pin = bool(raw_user and raw_user.get("pin_hash"))
    has_biometric = bool(raw_user and raw_user.get("biometric_enabled", False))
    
    return {
        "has_pin": has_pin,
        "has_biometric": has_biometric,
        "biometric_available": True,
    }


@api_router.post("/auth/reset-pin")
async def reset_pin(
    req: PinSetupRequest,
    user: dict = Depends(get_current_user),
):
    # NOTE: no weak-PIN blocklist here anymore — any 6-digit PIN is accepted.
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "pin_hash": hash_pin(req.pin),
            "pin_created_at": datetime.utcnow(),
            "failed_pin_attempts": 0,
            "pin_locked_until": None,
        }}
    )

    return {"ok": True, "message": "PIN reset successfully"}


# ============================================================
# Phone Authentication (Twilio SMS OTP)
# ============================================================

@api_router.post("/auth/phone/send-otp")
async def send_phone_otp(req: PhoneLoginRequest):
    """Send a 6-digit OTP to a phone number via Twilio SMS."""
    try:
        otp_code = generate_otp()
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        await db.phone_otps.insert_one({
            "phone": req.phone,
            "country_code": req.country_code,
            "otp": otp_code,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.utcnow().isoformat(),
            "verified": False,
        })

        full_number = f"{req.country_code}{req.phone}"
        sms_message = f"Your GCSHARP verification code is: {otp_code}. Valid for 5 minutes."
        result = send_sms_via_twilio(full_number, sms_message)

        if result["success"]:
            logger.info(f"OTP sent to {full_number} via SMS. SID: {result.get('sid')}")
            return {"success": True, "message": "Verification code sent via SMS", "expires_in": 300}

        logger.error(f"SMS failed for {full_number}: {result.get('error')}")
        if ENVIRONMENT == "development":
            logger.info(f"Development mode: OTP for {full_number} is {otp_code}")
            return {
                "success": True,
                "message": "OTP generated (development mode - SMS not sent)",
                "otp": otp_code,
                "expires_in": 300,
                "warning": "SMS not sent - " + result.get("error", "Unknown error"),
            }
        return {"success": False, "message": "Failed to send verification code. Please try again.",
                "error": "SMS delivery failed"}
    except Exception as e:
        logger.error(f"Send phone OTP error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send verification code")


@api_router.post("/auth/phone/verify")
async def verify_phone_otp(req: PhoneVerifyRequest, response: Response):
    """Verify a phone OTP and log in / register the user."""
    try:
        otp_record = await db.phone_otps.find_one({
            "phone": req.phone, "country_code": req.country_code,
            "otp": req.otp, "verified": False,
        })
        if not otp_record:
            raise HTTPException(status_code=401, detail="Invalid verification code")

        expires_at = otp_record["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at < datetime.utcnow():
            raise HTTPException(status_code=401, detail="Verification code expired")

        await db.phone_otps.update_one({"_id": otp_record["_id"]}, {"$set": {"verified": True}})

        phone_full = f"{req.country_code}{req.phone}"
        user = await db.users.find_one({"phone": phone_full})

        if not user:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            user = {
                "user_id": user_id,
                "phone": phone_full,
                "email": f"user_{uuid.uuid4().hex[:8]}@gcsmart.temp",
                "full_name": f"User {phone_full[-4:]}",
                "role": "student",
                "onboarded": False,
                "bio": "", "institution": "", "exam_level": "", "study_year": None,
                "subjects": [], "goals": [], "daily_commitment": "", "proficiency": "",
                "learning_style": "", "specialization": "",
                "xp": 0, "level": 1, "streak": 0, "profile_photo": None,
                "created_at": datetime.utcnow().isoformat(),
            }
            await db.users.insert_one(dict(user))

        session_token = await create_user_session(user["user_id"])

        response.set_cookie(
            key="session_token", value=session_token,
            httponly=True, secure=True, samesite="none", path="/",
            max_age=7 * 24 * 60 * 60,
        )

        user.pop("_id", None)
        user.pop("password_hash", None)

        # Login notification
        await create_notification(
            user["user_id"],
            f"Welcome, {user.get('full_name', 'Student')}!",
            "info",
            "/dashboard"
        )

        return {"success": True, "token": session_token, "user": public_user(user)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verify phone OTP error: {e}")
        raise HTTPException(status_code=500, detail="Verification failed")


@api_router.post("/auth/exchange-session")
async def exchange_session(request: Request, response: Response):
    """Alternate OAuth session exchange endpoint (mirrors /auth/session, JSON body form)."""
    try:
        body = await request.json()
        session_id = body.get("sessionId") or body.get("session_id")
        if not session_id:
            raise HTTPException(status_code=400, detail="Missing session_id")

        async with httpx.AsyncClient(timeout=15) as hc:
            r = await hc.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
            )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Authentication failed")

        data = r.json()
        email = data.get("email", "").lower()
        if not email:
            raise HTTPException(status_code=400, detail="No email in session data")

        existing = await db.users.find_one({"email": email})
        if existing:
            user = existing
            user_id = user["user_id"]
        else:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            user = {
                "user_id": user_id,
                "email": email,
                "full_name": data.get("name", ""),
                "profile_photo": data.get("picture"),
                "password_hash": "",
                "role": "student",
                "onboarded": False,
                "bio": "", "institution": "", "exam_level": "", "study_year": None,
                "subjects": [], "goals": [], "daily_commitment": "", "proficiency": "",
                "learning_style": "", "specialization": "",
                "xp": 0, "level": 1, "streak": 0,
                "created_at": datetime.utcnow().isoformat(),
            }
            await db.users.insert_one(dict(user))

        session_token = data.get("session_token") or f"tok_{uuid.uuid4().hex}"
        expires_at = datetime.utcnow() + timedelta(days=7)
        await db.user_sessions.insert_one({
            "session_token": session_token, "user_id": user_id,
            "expires_at": expires_at.isoformat(), "created_at": datetime.utcnow().isoformat(),
        })

        response.set_cookie(
            key="session_token", value=session_token,
            httponly=True, secure=True, samesite="none", path="/",
            max_age=7 * 24 * 60 * 60,
        )

        user.pop("_id", None)
        user.pop("password_hash", None)

        # Login notification
        await create_notification(
            user_id,
            f"Welcome back, {user.get('full_name', 'Student')}!",
            "info",
            "/dashboard"
        )

        return {"session_token": session_token, "user": user}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Exchange session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Password Reset with OTP (Brevo) Routes
# ============================================================

@api_router.post("/auth/request-reset-otp")
async def request_reset_otp(req: RequestResetOtpRequest):
    email = req.email.lower().strip()

    user = await db.users.find_one({"email": email})
    if not user:
        return {"ok": True, "message": "If an account exists, an OTP has been sent."}

    otp = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    await db.password_reset_otps.update_one(
        {"email": email},
        {"$set": {
            "otp": otp,
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.utcnow(),
        }},
        upsert=True,
    )

    subject = "Password Reset OTP - GC Sharp"
    html_content = f"""
    <html>
    <body>
        <h2>Password Reset Request</h2>
        <p>Hi there,</p>
        <p>You requested to reset your password for your GC Sharp account.</p>
        <p>Your OTP is: <strong>{otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
        <br>
        <p>GC Sharp Team</p>
    </body>
    </html>
    """
    text_content = f"Your OTP is: {otp}. It expires in 10 minutes."

    sent = await send_brevo_email(email, subject, html_content, text_content)

    if not sent:
        logger.error(f"Failed to send OTP email to {email}")

    return {"ok": True, "message": "If an account exists, an OTP has been sent."}


@api_router.post("/auth/reset-password-with-otp")
async def reset_password_with_otp(req: ResetPasswordWithOtpRequest):
    email = req.email.lower().strip()

    record = await db.password_reset_otps.find_one({"email": email})
    if not record:
        raise HTTPException(status_code=400, detail="No OTP request found for this email.")

    if record.get("used", False):
        raise HTTPException(status_code=400, detail="This OTP has already been used.")

    if datetime.utcnow() > record["expires_at"]:
        raise HTTPException(status_code=400, detail="OTP has expired. Request a new one.")

    if record["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    new_hash = hash_pw(req.new_password)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": new_hash}}
    )

    await db.password_reset_otps.update_one(
        {"_id": record["_id"]},
        {"$set": {"used": True}}
    )

    return {"ok": True, "message": "Password reset successful."}


# ============================================================
# PIN Reset with OTP (Brevo) Routes
# ============================================================

@api_router.post("/auth/request-pin-reset-otp")
async def request_pin_reset_otp(req: RequestPinResetOtpRequest):
    email = req.email.lower().strip()

    user = await db.users.find_one({"email": email})
    if not user:
        return {"ok": True, "message": "If an account exists, an OTP has been sent."}

    otp = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    await db.pin_reset_otps.update_one(
        {"email": email},
        {"$set": {
            "otp": otp,
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.utcnow(),
        }},
        upsert=True,
    )

    subject = "PIN Reset OTP - GC Sharp"
    html_content = f"""
    <html>
    <body>
        <h2>PIN Reset Request</h2>
        <p>Hi there,</p>
        <p>You requested to reset your PIN for your GC Sharp account.</p>
        <p>Your OTP is: <strong>{otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
        <br>
        <p>GC Sharp Team</p>
    </body>
    </html>
    """
    text_content = f"Your OTP is: {otp}. It expires in 10 minutes."

    sent = await send_brevo_email(email, subject, html_content, text_content)

    if not sent:
        logger.error(f"Failed to send OTP email to {email}")

    return {"ok": True, "message": "If an account exists, an OTP has been sent."}


@api_router.post("/auth/reset-pin-with-otp")
async def reset_pin_with_otp(req: ResetPinWithOtpRequest):
    email = req.email.lower().strip()

    record = await db.pin_reset_otps.find_one({"email": email})
    if not record:
        raise HTTPException(status_code=400, detail="No OTP request found for this email.")

    if record.get("used", False):
        raise HTTPException(status_code=400, detail="This OTP has already been used.")

    if datetime.utcnow() > record["expires_at"]:
        raise HTTPException(status_code=400, detail="OTP has expired. Request a new one.")

    if record["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    new_pin_hash = hash_pin(req.new_pin)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "pin_hash": new_pin_hash,
            "failed_pin_attempts": 0,
            "pin_locked_until": None,
            "pin_created_at": datetime.utcnow(),
        }}
    )

    await db.pin_reset_otps.update_one(
        {"_id": record["_id"]},
        {"$set": {"used": True}}
    )

    return {"ok": True, "message": "PIN reset successful."}


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
    "GCE O Level": ["MATHEMATICS", "English Language", "French", "Physics", "Chemistry",
                    "Biology", "History", "Geography", "Economics", "Literature", "Additional Mathematics"],
    "GCE A Level": ["Pure Mathematics with stat", "Pure Mathematics with mech", "Further Mathematics", "Physics", "Chemistry", "Biology",
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
        "created_at": datetime.utcnow(),
    })
    if correct:
        await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"xp": 10}})
    today = date.today().isoformat()
    await db.study_sessions.update_one(
        {"user_id": user["user_id"], "day": today},
        {"$inc": {"seconds": inp.time_taken, "attempted": 1, "correct": 1 if correct else 0},
         "$setOnInsert": {"created_at": datetime.utcnow()}},
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
        "created_at": datetime.utcnow().isoformat(),
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
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.attempts.insert_one(dict(attempt))

    xp_gain = req.score * 10 + (25 if accuracy == 100 else 0)
    new_xp = user.get("xp", 0) + xp_gain
    new_level = 1 + new_xp // 500
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"xp": new_xp, "level": new_level}})
    attempt.pop("_id", None)

    # Keep the profile's overall accuracy in sync with every new attempt.
    overall_accuracy = await recompute_user_accuracy(user["user_id"])

    # Notify about progress
    if accuracy == 100:
        await create_notification(
            user["user_id"],
            f"🎉 Perfect score! You got 100% on {req.subject} Paper {req.paper}!",
            "streak",
            "/attempts"
        )
    elif accuracy >= 80:
        await create_notification(
            user["user_id"],
            f"Great job! You scored {accuracy}% on {req.subject} Paper {req.paper}.",
            "info",
            "/attempts"
        )

    return {
        "attempt": attempt, "xp_gain": xp_gain, "new_xp": new_xp,
        "new_level": new_level, "accuracy": overall_accuracy,
    }

@api_router.get("/attempts")
async def list_attempts(user: dict = Depends(get_current_user)):
    items = await db.attempts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    attempts = await db.attempts.find({"user_id": uid}, {"_id": 0}).to_list(500)
    questions_attempted = sum(a["total"] for a in attempts)
    correct = sum(a["score"] for a in attempts)
    accuracy = round((correct / questions_attempted) * 100) if questions_attempted else 0

    attempt_seconds = sum(a.get("time_spent", 0) for a in attempts)

    # Same pattern as the web backend: one query against paper_reading_time
    # gives us both the reading-time total AND the distinct-papers count,
    # since this collection has exactly one doc per (user_id, paper_id).
    reading_docs_full = await db.paper_reading_time.find(
        {"user_id": uid},
        {"_id": 0, "total_seconds": 1, "daily_seconds": 1}
    ).to_list(2000)
    reading_seconds = sum(d.get("total_seconds", 0) for d in reading_docs_full)

    practice_docs = await db.study_sessions.find({"user_id": uid}, {"_id": 0, "seconds": 1}).to_list(1000)
    practice_seconds = sum(d.get("seconds", 0) for d in practice_docs)

    study_seconds = attempt_seconds + reading_seconds + practice_seconds
    study_hours = round(study_seconds / 3600, 1)

    weak_counter, strong_counter = {}, {}
    for a in attempts:
        for t in a.get("weak_topics", []):
            weak_counter[t] = weak_counter.get(t, 0) + 1
        for t in a.get("strong_topics", []):
            strong_counter[t] = strong_counter.get(t, 0) + 1
    weak = sorted(weak_counter, key=weak_counter.get, reverse=True)[:4]
    strong = sorted(strong_counter, key=strong_counter.get, reverse=True)[:4]

    today = datetime.utcnow().date()
    days_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    consistency = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        seconds = await get_study_time_for_date(uid, d)
        consistency.append({
            "day": days_labels[d.weekday()],
            "minutes": round(seconds / 60),
        })

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
        "total_papers_viewed": len(reading_docs_full),
    }


@api_router.get("/leaderboard")
async def leaderboard(user: dict = Depends(get_current_user_optional)):
    users = await db.users.find(
        {"role": "student"},
        {"_id": 0, "full_name": 1, "xp": 1, "level": 1, "user_id": 1, "profile_photo": 1, "picture": 1}
    ).to_list(500)
    users.sort(key=lambda u: u.get("xp", 0), reverse=True)

    my_user_id = user["user_id"] if user else None
    board = []
    my_rank = None
    for i, u in enumerate(users):
        entry = {
            "rank": i + 1,
            "name": u.get("full_name", "Student"),
            "picture": u.get("profile_photo") or u.get("picture") or None,
            "xp": u.get("xp", 0),
            "level": u.get("level", 1),
            "is_me": u["user_id"] == my_user_id if my_user_id else False,
        }
        if entry["is_me"]:
            my_rank = entry
        board.append(entry)

    return {"top": board[:10], "my_rank": my_rank}

# ============================================================
# Library Routes
# ============================================================

@api_router.get("/library/courses")
async def list_library_courses(user: dict = Depends(get_current_user_optional)):
    items = await db.courses.find({}, {"_id": 0}).to_list(200)
    if user:
        liked_docs = await db.video_likes.find(
            {"user_id": user["user_id"]}, {"_id": 0, "course_id": 1}
        ).to_list(500)
        saved_docs = await db.video_saves.find(
            {"user_id": user["user_id"]}, {"_id": 0, "course_id": 1}
        ).to_list(500)
        liked_ids = {d["course_id"] for d in liked_docs}
        saved_ids = {d["course_id"] for d in saved_docs}
        for it in items:
            it["liked"] = it["course_id"] in liked_ids
            it["saved"] = it["course_id"] in saved_ids
    else:
        for it in items:
            it["liked"] = False
            it["saved"] = False
    return {"items": items}

@api_router.get("/library/courses/{course_id}")
async def get_library_course(course_id: str, user: dict = Depends(get_current_user_optional)):
    c = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    c = dict(c)
    c["liked"] = False
    c["saved"] = False
    if user:
        liked = await db.video_likes.find_one({"course_id": course_id, "user_id": user["user_id"]})
        saved = await db.video_saves.find_one({"course_id": course_id, "user_id": user["user_id"]})
        c["liked"] = bool(liked)
        c["saved"] = bool(saved)
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
# AI Chat with Emergent (kept as is, not used by PDF viewer)
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

    now = datetime.utcnow()
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

# ============================================================
# AI Solution – Now using OpenRouter (SimpleLLM)
# ============================================================

@api_router.post("/ai/solution")
async def ai_solution(inp: SolutionIn, user: dict = Depends(get_current_user)):
    """
    Generate a step‑by‑step solution with narration using OpenRouter.
    """
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
    chat = _new_chat(f"sol_{uuid.uuid4().hex[:8]}", system)
    try:
        reply = await chat.send_message(inp.question)
    except Exception as e:
        logger.exception("AI solution generation error")
        raise HTTPException(500, f"AI error: {e}")

    # Strip any markdown code fences
    reply_clean = reply.strip()
    if reply_clean.startswith("```"):
        reply_clean = reply_clean.strip("`")
        if reply_clean.lower().startswith("json"):
            reply_clean = reply_clean[4:].strip()
    try:
        data = json.loads(reply_clean)
        # Ensure required keys exist
        if "title" not in data:
            data["title"] = "Solution"
        if "steps" not in data or not data["steps"]:
            data["steps"] = [{"heading": "Solution", "body": reply}]
        if "narration" not in data:
            data["narration"] = reply
        return data
    except Exception:
        # Fallback structure if parsing fails
        return {
            "title": "Solution",
            "steps": [{"heading": "Solution", "body": reply}],
            "narration": reply,
        }


# ============================================================
# AI Tutor (Streaming with OpenRouter) – with notification after reply
# ============================================================

async def _load_ai_session_history(user_id: str, session_id: str) -> list:
    session = await db.ai_sessions.find_one({"session_id": session_id, "user_id": user_id}, {"_id": 0})
    history = list(session.get("messages", [])) if session else []

    legacy_msgs = await db.chat_messages.find(
        {"user_id": user_id, "session_id": session_id},
        {"_id": 0, "role": 1, "content": 1, "created_at": 1}
    ).sort("created_at", 1).to_list(200)

    if legacy_msgs:
        legacy_history = []
        for m in legacy_msgs:
            if m.get("role") not in {"user", "assistant"}:
                continue
            legacy_history.append({
                "role": m.get("role"),
                "content": m.get("content", ""),
                "ts": str(m.get("created_at") or datetime.utcnow().isoformat()),
            })
        if legacy_history:
            merged = history + legacy_history
            seen = set()
            deduped = []
            for message in merged:
                key = (message.get("role"), message.get("content"), message.get("ts"))
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(message)
            history = deduped

    return history[-30:]


@api_router.post("/ai/chat")
async def ai_chat(req: ChatRequest, user: dict = Depends(get_current_user)):
    session_id = (req.session_id or "").strip() or f"chat_{uuid.uuid4().hex[:12]}"
    session = await db.ai_sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not session:
        history = await _load_ai_session_history(user["user_id"], session_id)
        session = {
            "session_id": session_id,
            "user_id": user["user_id"],
            "title": (req.message or "New chat")[:50],
            "subject": req.subject,
            "messages": history,
            "profile_snapshot": {
                "full_name": user.get("full_name", "Student"),
                "exam_level": user.get("exam_level") or "Not set",
                "subjects": user.get("subjects", []),
                "goals": user.get("goals", []),
                "learning_style": user.get("learning_style") or "Not set",
                "daily_commitment": user.get("daily_commitment") or "Not set",
            },
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        await db.ai_sessions.insert_one(dict(session))
    else:
        history = list(session.get("messages", []))

    profile_snapshot = session.get("profile_snapshot") or {
        "full_name": user.get("full_name", "Student"),
        "exam_level": user.get("exam_level") or "Not set",
        "subjects": user.get("subjects", []),
        "goals": user.get("goals", []),
        "learning_style": user.get("learning_style") or "Not set",
        "daily_commitment": user.get("daily_commitment") or "Not set",
    }
    recent_history = history[-30:]
    history_context = ""
    if recent_history:
        history_context = "Conversation memory:\n" + "\n".join(
            f"{m.get('role', 'user').upper()}: {m.get('content', '')}" for m in recent_history
        ) + "\n\n"

    system = (
        f"You are a patient academic tutor helping a student in Cameroon. "
        f"Never introduce yourself as GCSharp, GC AI, or the app name unless the student asks directly. "
        f"Keep the conversation personal and continuous across this thread. "
        f"Student profile: {json.dumps(profile_snapshot, ensure_ascii=False)}. "
        f"Subject focus: {req.subject}. "
        "Use the memory above to remember the student's previous questions, goals, and context. "
        "Explain step by step, use clear structure, give worked examples, and keep the tone encouraging and exam-focused. "
        "If the question is multiple-choice, end the answer with a final line exactly in this format: 'Final answer: X' where X is the option letter or final result. "
        "If the question is not multiple-choice, still finish with a final line starting with 'Final answer:' followed by the final result."
    )
    chat = _new_chat(session_id, system)

    async def event_gen():
        nonlocal history
        full = ""
        try:
            prompt = history_context + "Current question:\n" + req.message
            response = await chat.send_message(prompt)
            full = response.strip()
            for chunk in [full[i:i+50] for i in range(0, len(full), 50)]:
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
        except Exception as e:
            logger.error(f"AI stream error: {e}")
            full = "I'm having trouble connecting to my AI service. Please try again in a moment."
            for chunk in [full[i:i+50] for i in range(0, len(full), 50)]:
                yield f"data: {json.dumps({'delta': chunk})}\n\n"

        new_user_msg = {"role": "user", "content": req.message, "ts": datetime.utcnow().isoformat()}
        new_assistant_msg = {"role": "assistant", "content": full, "ts": datetime.utcnow().isoformat()}
        history = history + [new_user_msg, new_assistant_msg]
        history = history[-50:]

        await db.ai_sessions.update_one(
            {"session_id": session_id, "user_id": user["user_id"]},
            {"$set": {"messages": history, "updated_at": datetime.utcnow().isoformat()}},
        )
        await db.chat_messages.insert_many([
            {"user_id": user["user_id"], "session_id": session_id, "role": "user", "content": req.message, "created_at": new_user_msg["ts"]},
            {"user_id": user["user_id"], "session_id": session_id, "role": "assistant", "content": full, "created_at": new_assistant_msg["ts"]},
        ])
        yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"

        await create_notification(
            user["user_id"],
            f"🤖 AI Tutor replied to your question: \"{req.message[:40]}...\"",
            "ai_reply",
            f"/ai/chat?s={session_id}"
        )

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
# AI SESSIONS MANAGEMENT (new routes for frontend)
# ============================================================

@api_router.post("/ai/feedback")
async def ai_feedback(req: dict, user: dict = Depends(get_current_user)):
    """Store quick thumbs up/down feedback for a model response."""
    rating = str(req.get("rating", "")).strip().lower()
    session_id = str(req.get("session_id") or "").strip()
    message = (req.get("message") or "").strip()
    reason = (req.get("reason") or "").strip()
    if rating not in {"good", "bad"}:
        raise HTTPException(400, "rating must be 'good' or 'bad'")
    if not session_id:
        raise HTTPException(400, "session_id is required")
    await db.ai_feedback.insert_one({
        "user_id": user["user_id"],
        "session_id": session_id,
        "rating": rating,
        "message": message,
        "reason": reason,
        "created_at": datetime.utcnow().isoformat(),
    })
    return {"ok": True}

@api_router.get("/ai/sessions")
async def list_ai_sessions(user: dict = Depends(get_current_user)):
    """List all AI chat sessions for the authenticated user, ordered by updated_at descending."""
    sessions = await db.ai_sessions.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "session_id": 1, "title": 1, "subject": 1, "updated_at": 1, "pinned": 1}
    ).sort("updated_at", -1).to_list(100)
    return sessions

@api_router.get("/ai/sessions/{session_id}")
async def get_ai_session(session_id: str, user: dict = Depends(get_current_user)):
    """Get a specific AI session including its messages."""
    session = await db.ai_sessions.find_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not session:
        raise HTTPException(404, "Session not found")
    return session

@api_router.put("/ai/sessions/{session_id}/title")
async def update_ai_session_title(session_id: str, req: dict, user: dict = Depends(get_current_user)):
    """Update the title of an AI session."""
    title = req.get("title")
    if not title:
        raise HTTPException(400, "Title required")
    result = await db.ai_sessions.update_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"$set": {"title": title, "updated_at": datetime.utcnow().isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}

@api_router.put("/ai/sessions/{session_id}/pin")
async def toggle_ai_session_pin(session_id: str, req: dict, user: dict = Depends(get_current_user)):
    """Pin or unpin an AI session."""
    pinned = req.get("pinned", False)
    if not isinstance(pinned, bool):
        raise HTTPException(400, "pinned must be a boolean")
    result = await db.ai_sessions.update_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"$set": {"pinned": pinned, "updated_at": datetime.utcnow().isoformat()}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}

@api_router.delete("/ai/sessions/{session_id}")
async def delete_ai_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete an AI session."""
    result = await db.ai_sessions.delete_one(
        {"session_id": session_id, "user_id": user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}

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
        "created_at": datetime.utcnow().isoformat(),
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
        "created_at": datetime.utcnow().isoformat(),
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
    now = datetime.utcnow()
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
# Video Interactions: Likes, Saves, Recently Watched
# ============================================================

# ---------- Likes ----------

@api_router.post("/courses/{course_id}/like")
async def toggle_like_video(course_id: str, user: dict = Depends(get_current_user)):
    course = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(404, "Video not found")

    existing = await db.video_likes.find_one({"course_id": course_id, "user_id": user["user_id"]})
    if existing:
        await db.video_likes.delete_one({"_id": existing["_id"]})
        await db.courses.update_one({"course_id": course_id}, {"$inc": {"likes": -1}})
        liked = False
    else:
        await db.video_likes.insert_one({
            "like_id": f"lk_{uuid.uuid4().hex[:12]}",
            "course_id": course_id,
            "user_id": user["user_id"],
            "created_at": datetime.utcnow().isoformat(),
        })
        await db.courses.update_one({"course_id": course_id}, {"$inc": {"likes": 1}})
        liked = True

    fresh = await db.courses.find_one({"course_id": course_id}, {"_id": 0, "likes": 1})
    return {"liked": liked, "likes": max(0, (fresh or {}).get("likes", 0))}

@api_router.get("/videos/liked")
async def list_liked_videos(user: dict = Depends(get_current_user)):
    likes = await db.video_likes.find(
        {"user_id": user["user_id"]}, {"_id": 0, "course_id": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(500)
    if not likes:
        return []
    ids = [l["course_id"] for l in likes]
    courses = await db.courses.find({"course_id": {"$in": ids}}, {"_id": 0}).to_list(500)
    cmap = {c["course_id"]: c for c in courses}
    result = []
    for l in likes:
        c = cmap.get(l["course_id"])
        if c:
            c = dict(c)
            c["liked"] = True
            c["liked_at"] = l["created_at"]
            result.append(c)
    return result

# ---------- Saved videos ----------

@api_router.post("/courses/{course_id}/save")
async def toggle_save_video(course_id: str, user: dict = Depends(get_current_user)):
    course = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(404, "Video not found")

    existing = await db.video_saves.find_one({"course_id": course_id, "user_id": user["user_id"]})
    if existing:
        await db.video_saves.delete_one({"_id": existing["_id"]})
        return {"saved": False}

    await db.video_saves.insert_one({
        "save_id": f"sv_{uuid.uuid4().hex[:12]}",
        "course_id": course_id,
        "user_id": user["user_id"],
        "created_at": datetime.utcnow().isoformat(),
    })
    return {"saved": True}

@api_router.get("/videos/saved")
async def list_saved_videos(user: dict = Depends(get_current_user)):
    saves = await db.video_saves.find(
        {"user_id": user["user_id"]}, {"_id": 0, "course_id": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(500)
    if not saves:
        return []
    ids = [s["course_id"] for s in saves]
    courses = await db.courses.find({"course_id": {"$in": ids}}, {"_id": 0}).to_list(500)
    cmap = {c["course_id"]: c for c in courses}
    result = []
    for s in saves:
        c = cmap.get(s["course_id"])
        if c:
            c = dict(c)
            c["saved"] = True
            c["saved_at"] = s["created_at"]
            result.append(c)
    return result

# ---------- Recently watched ----------

@api_router.post("/courses/{course_id}/watch")
async def record_watch(course_id: str, user: dict = Depends(get_current_user)):
    course = await db.courses.find_one({"course_id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(404, "Video not found")

    now_iso = datetime.utcnow().isoformat()
    await db.watch_history.update_one(
        {"course_id": course_id, "user_id": user["user_id"]},
        {
            "$set": {"watched_at": now_iso},
            "$setOnInsert": {
                "history_id": f"wh_{uuid.uuid4().hex[:12]}",
                "course_id": course_id,
                "user_id": user["user_id"],
            },
        },
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/videos/recently-watched")
async def list_recently_watched(limit: int = 20, user: dict = Depends(get_current_user)):
    capped_limit = max(1, min(limit, 100))
    history = await db.watch_history.find(
        {"user_id": user["user_id"]}, {"_id": 0, "course_id": 1, "watched_at": 1}
    ).sort("watched_at", -1).to_list(capped_limit)
    if not history:
        return []
    ids = [h["course_id"] for h in history]
    courses = await db.courses.find({"course_id": {"$in": ids}}, {"_id": 0}).to_list(500)
    cmap = {c["course_id"]: c for c in courses}
    result = []
    for h in history:
        c = cmap.get(h["course_id"])
        if c:
            c = dict(c)
            c["watched_at"] = h["watched_at"]
            result.append(c)
    return result

@api_router.delete("/videos/recently-watched")
async def clear_recently_watched(user: dict = Depends(get_current_user)):
    await db.watch_history.delete_many({"user_id": user["user_id"]})
    return {"ok": True}

@api_router.delete("/videos/recently-watched/{course_id}")
async def remove_recently_watched(course_id: str, user: dict = Depends(get_current_user)):
    await db.watch_history.delete_one({"course_id": course_id, "user_id": user["user_id"]})
    return {"ok": True}


# ============================================================
# PDF Upload (extract text from an uploaded PDF, e.g. homework scan)
# ============================================================

@api_router.post("/upload/pdf")
async def upload_pdf(request: Request, user: dict = Depends(get_current_user)):
    try:
        form = await request.form()
        file = form.get("file")
        if not file:
            raise HTTPException(400, "No file uploaded")

        content = await file.read()
        text = extract_pdf_text(content, max_chars=5000)
        return {"text": text, "filename": file.filename}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF upload error: {e}")
        raise HTTPException(500, str(e))


# ============================================================
# Drafts
# ============================================================

@api_router.post("/drafts")
async def save_draft(req: DraftRequest, user: dict = Depends(get_current_user)):
    existing = await db.drafts.find_one({"user_id": user["user_id"], "paper_id": req.paper_id})
    if existing:
        await db.drafts.delete_one({"user_id": user["user_id"], "paper_id": req.paper_id})
        return {"saved": False}
    # FIX: always give the document a real, unique draft_id. Combined with
    # the (user_id, paper_id) unique index above, this is what makes saving
    # a second (or third, ...) draft work instead of 500ing on a duplicate
    # null draft_id.
    await db.drafts.insert_one({
        "draft_id": f"draft_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "paper_id": req.paper_id,
        "created_at": datetime.utcnow().isoformat(),
    })
    return {"saved": True}


@api_router.get("/drafts")
async def list_drafts(user: dict = Depends(get_current_user)):
    user_id = user["user_id"]
    print(f"📡 /drafts called for user: {user_id}")

    drafts = await db.drafts.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    print(f"📄 Found {len(drafts)} drafts")

    if not drafts:
        return []

    ids = [d["paper_id"] for d in drafts]
    print(f"📋 Paper IDs: {ids}")

    papers = await db.papers.find({"paper_id": {"$in": ids}}, {"_id": 0}).to_list(500)
    paper_map = {p["paper_id"]: p for p in papers}
    print(f"📚 Found {len(papers)} matching papers")

    result = []
    for d in drafts:
        pid = d["paper_id"]
        pp = paper_map.get(pid)
        if pp:
            item = dict(pp)
            item["saved"] = True
            item["saved_at"] = d["created_at"]
        else:
            # Fallback – draft exists but paper is gone
            print(f"⚠️ Paper {pid} missing – returning placeholder")
            item = {
                "paper_id": pid,
                "title": "Missing paper (draft saved)",
                "subject": "Unknown",
                "level": "Unknown",
                "year": None,
                "paper_number": None,
                "pdf_url": None,
                "saved_at": d["created_at"],
                "saved": True,
            }
        result.append(item)

    print(f" Returning {len(result)} items")
    return result


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
        "created_at": datetime.utcnow(),
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

async def _ask_ai_for_json(chat: SimpleLLM, prompt: str, required_key: str, retries: int = 1) -> dict:
    last_resp = ""
    for attempt in range(retries + 1):
        this_prompt = prompt if attempt == 0 else (
            prompt + "\n\nIMPORTANT: Your previous reply could not be parsed as JSON. "
            "Reply again with ONLY the JSON object — no markdown code fences, "
            "no explanation, nothing before or after it."
        )
        resp = await chat.send_message(this_prompt)
        last_resp = resp
        try:
            parsed = _clean_json(resp)
            if parsed.get(required_key):
                return parsed
        except Exception:
            continue
    logger.error(f"AI JSON generation failed for key '{required_key}'. Last raw (truncated): {last_resp[:500]!r}")
    raise ValueError(f"Could not get valid JSON with key '{required_key}' from AI")

def _strip_reasoning_preamble(text: str) -> str:
    match = re.search(r'##\s*(Given|Solution)', text)
    if match and match.start() > 0:
        return text[match.start():].strip()
    return text


# ============================================================
# AI-Generated Paper Solutions (Ask / Step-by-step QA / Video walkthroughs)
# ============================================================

@api_router.post("/papers/ask")
async def ask_about_paper(req: AskRequest, user: dict = Depends(get_current_user_optional)):
    p = await db.papers.find_one({"paper_id": req.paper_id}, {"_id": 0})
    subject = p["subject"] if p else "General"
    system = (
        f"You are GC AI, an expert {subject} exam tutor writing a final worked solution for a student. "
        "CRITICAL: Do NOT show your internal reasoning process. Never write phrases like "
        "'We are given', 'We need to find', 'Let's define', 'Let's assume', or any narration of "
        "how you are thinking through the problem. Go straight to the structured solution as if "
        "writing model answers for an exam mark scheme.\n\n"
        "Format your answer using these markdown sections:\n"
        "## Given\n"
        "A short bullet list of the known quantities from the question.\n\n"
        "## Solution\n"
        "Clearly numbered steps (1., 2., 3. ...), each showing the working, not the thought process. "
        "Use $ ... $ for inline math and $$ ... $$ for standalone equations.\n\n"
        "## Answer\n"
        "The final numeric or symbolic result, stated in one line.\n\n"
        "Be concise. Do not restate the question. Do not apologize or hedge."
    )
    chat = _new_chat(f"ask_{uuid.uuid4().hex}", system)
    resp = await chat.send_message(f"Question:\n\n{req.question}")
    resp = _strip_reasoning_preamble(resp)
    return {"answer": resp}


@api_router.post("/papers/{paper_id}/qa")
async def generate_paper_qa(paper_id: str, user: dict = Depends(get_current_user)):
    p = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paper not found")
    cached = await db.paper_qa_cache.find_one({"paper_id": paper_id}, {"_id": 0})
    if cached:
        return {"items": cached["items"], "cached": True}

    data = await fetch_pdf_bytes(p["pdf_url"])
    text = extract_pdf_text(data)
    system = ("You are a senior Cameroon GCE examiner. Read the exam paper text and produce a clear, "
              "step-by-step worked solution section. Return STRICT JSON only, with no reasoning or thinking text before or after it.")
    prompt = (
        f"This is {p['level']} {p['subject']} {p['year']} Paper {p['paper_number']}.\n\n"
        f"PAPER TEXT:\n{text}\n\n"
        "Extract the individual questions and for each return a JSON object. "
        "Return JSON: {\"items\":[{\"number\":\"1\",\"question\":\"...\",\"steps\":[\"step 1\",\"step 2\"],\"answer\":\"final answer\"}]}. "
        "Solve at least the first 8 questions you can identify. Keep steps concise and mathematically correct. Return ONLY JSON."
    )
    chat = _new_chat(f"qa_{uuid.uuid4().hex}", system)
    resp = await chat.send_message(prompt)
    try:
        parsed = _clean_json(resp)
        items = parsed.get("items", [])
        if not items:
            raise ValueError("empty items")
    except Exception:
        logger.error(f"QA parse fail: {resp[:200]}")
        raise HTTPException(502, "Couldn't generate a solution for this paper right now. Please try again shortly.")
    await db.paper_qa_cache.insert_one({"paper_id": paper_id, "items": items,
                                        "created_at": datetime.utcnow().isoformat()})
    return {"items": items, "cached": False}


@api_router.post("/papers/{paper_id}/video")
async def generate_video_solution(paper_id: str, user: dict = Depends(get_current_user)):
    p = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paper not found")
    cached = await db.paper_video_cache.find_one({"paper_id": paper_id}, {"_id": 0})
    if cached:
        return {"scenes": cached["scenes"], "cached": True}

    data = await fetch_pdf_bytes(p["pdf_url"])
    text = extract_pdf_text(data, max_chars=7000)
    system = ("You are a master teacher creating a narrated video lesson that solves an exam question "
              "step by step on a virtual whiteboard. Return STRICT JSON only, with no reasoning or thinking text before or after it. "
              "If the question has multiple-choice options, clearly state the final answer at the end of the final scene and in the final narration sentence. "
              "Use the exact ending format: 'Final answer: X' where X is the correct option letter or final result.")
    prompt = (
        f"This is {p['level']} {p['subject']} {p['year']} Paper {p['paper_number']}.\n\n"
        f"PAPER TEXT:\n{text}\n\n"
        "Pick the FIRST substantial question and create a video walkthrough that solves it. "
        "Return JSON: {\"title\":\"...\",\"question\":\"...\",\"scenes\":[{\"heading\":\"Step title\","
        "\"board\":[\"line shown on whiteboard\",\"another line\"],\"narration\":\"what the teacher says, <= 500 chars\"}]}. "
        "Create 4 to 6 scenes, and the last scene must end with a clear final answer, e.g. 'Final answer: B'. "
        "Narration must be natural spoken English. Return ONLY JSON."
    )
    chat = _new_chat(f"vid_{uuid.uuid4().hex}", system)
    resp = await chat.send_message(prompt)
    try:
        parsed = _clean_json(resp)
        raw_scenes = parsed.get("scenes", [])
        if not raw_scenes:
            raise ValueError("empty scenes")
    except Exception:
        logger.error(f"Video parse fail: {resp[:200]}")
        raise HTTPException(502, "Couldn't build a video solution right now. Please try again shortly.")

    scenes = []
    for i, sc in enumerate(raw_scenes[:6]):
        narration = (sc.get("narration") or sc.get("heading") or "")[:900]
        scenes.append({
            "heading": sc.get("heading", f"Step {i+1}"),
            "board": sc.get("board", []),
            "narration": narration,
            "audio": "",
        })
    doc = {"paper_id": paper_id, "title": parsed.get("title", p["title"]),
           "question": parsed.get("question", ""), "scenes": scenes,
           "created_at": datetime.utcnow().isoformat()}
    await db.paper_video_cache.insert_one(dict(doc))
    return {"scenes": scenes, "title": doc["title"], "question": doc["question"], "cached": False}


@api_router.post("/papers/{paper_id}/video/highlight")
async def generate_video_from_highlight(paper_id: str, req: HighlightVideoRequest, user: dict = Depends(get_current_user)):
    p = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paper not found")

    text_hash = hashlib.sha256(req.text.encode("utf-8")).hexdigest()[:16]
    cache_key = f"{paper_id}_{text_hash}"
    cached = await db.highlight_video_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        return {"scenes": cached["scenes"], "title": cached["title"], "question": cached["question"], "cached": True}

    data = await fetch_pdf_bytes(p["pdf_url"])
    full_text = extract_pdf_text(data, max_chars=3000)

    system = (
        "You are a master teacher creating a narrated video lesson that solves a specific "
        "exam question that a student has highlighted. Return STRICT JSON only, "
        "with no reasoning or thinking text before or after it. If the highlighted work is a multiple-choice question, "
        "the last narration sentence must clearly end with 'Final answer: X' where X is the correct option letter or result."
    )
    prompt = (
        f"This is {p['level']} {p['subject']} {p['year']} Paper {p['paper_number']}.\n\n"
        f"STUDENT HIGHLIGHTED THIS TEXT:\n{req.text}\n\n"
        f"PAPER CONTEXT (for reference):\n{full_text[:1500]}\n\n"
        "Create a video walkthrough that solves the question or explains the concept "
        "the student highlighted. If it's a question, solve it step by step. "
        "If it's a concept, explain it clearly with examples. "
        "Return JSON: {\"title\":\"...\",\"question\":\"...\","
        "\"scenes\":[{\"heading\":\"Step title\","
        "\"board\":[\"line shown on whiteboard\",\"another line\"],"
        "\"narration\":\"what the teacher says, <= 500 chars\"}]}. "
        "Create 3-6 scenes. Ensure the final scene ends with a final answer, e.g. 'Final answer: B'. Return ONLY JSON."
    )
    chat = _new_chat(f"highlight_vid_{uuid.uuid4().hex}", system)

    try:
        parsed = await _ask_ai_for_json(chat, prompt, "scenes", retries=1)
        raw_scenes = parsed["scenes"]
    except Exception as e:
        logger.error(f"Highlight video generation failed for paper {paper_id}: {e}")
        raise HTTPException(502, "Couldn't build a video solution for your selection. Please try again.")

    scenes = []
    for i, sc in enumerate(raw_scenes[:8]):
        narration = (sc.get("narration") or sc.get("heading") or "")[:900]
        scenes.append({
            "heading": sc.get("heading", f"Step {i+1}"),
            "board": sc.get("board", []),
            "narration": narration,
            "audio": "",
        })

    doc = {
        "cache_key": cache_key, "paper_id": paper_id,
        "title": parsed.get("title", "Solution for highlighted text"),
        "question": parsed.get("question", req.text[:200]),
        "scenes": scenes, "created_at": datetime.utcnow().isoformat(),
    }
    await db.highlight_video_cache.insert_one(dict(doc))
    return {"scenes": scenes, "title": doc["title"], "question": doc["question"], "cached": False}


# ============================================================
# Reading Time Tracking
# ============================================================

@api_router.post("/papers/{paper_id}/reading-time")
async def record_reading_time(paper_id: str, req: ReadingTimeRequest, user: dict = Depends(get_current_user)):
    seconds = max(0, min(req.seconds, 120))
    now = datetime.utcnow()
    now_iso = now.isoformat()
    today_key = now.date().isoformat()

    await db.paper_reading_time.update_one(
        {"paper_id": paper_id, "user_id": user["user_id"]},
        {
            "$inc": {"total_seconds": seconds, f"daily_seconds.{today_key}": seconds},
            "$set": {"last_updated": now_iso},
            "$setOnInsert": {
                "record_id": f"rt_{uuid.uuid4().hex[:12]}",
                "paper_id": paper_id, "user_id": user["user_id"],
                "created_at": now_iso,
            },
        },
        upsert=True,
    )
    doc = await db.paper_reading_time.find_one({"paper_id": paper_id, "user_id": user["user_id"]}, {"_id": 0})
    # Fire-and-forget streak check — recomputes from fresh DB state so
    # overlapping pings can't double-credit the same day.
    asyncio.create_task(update_user_streak(user))
    return {"ok": True, "total_seconds": doc.get("total_seconds", 0) if doc else seconds}

@api_router.get("/papers/{paper_id}/reading-time")
async def get_reading_time(paper_id: str, user: dict = Depends(get_current_user)):
    doc = await db.paper_reading_time.find_one({"paper_id": paper_id, "user_id": user["user_id"]}, {"_id": 0})
    return {"total_seconds": (doc or {}).get("total_seconds", 0)}


# ============================================================
# Streak, XP and Accuracy System
# ============================================================
# - A calendar day (UTC) counts as "complete" once the user's total study
#   time that day (reading time + quiz time_spent) reaches their
#   daily_commitment target.
# - Completing a day earns a flat STREAK_XP_PER_DAY XP.
# - A day can only ever be credited once (tracked via last_goal_met_date).
# - Missing a day resets the streak to 0 (caught by the hourly job).
# - Level is the higher of the XP-based level and the streak-based level.
# - `accuracy` is the overall percentage of quiz questions answered
#   correctly across all /attempts, recomputed on submit and daily.

STREAK_XP_PER_DAY = 5

def parse_daily_commitment(commitment_str: str) -> int:
    """Return required study seconds, default 3600 if unparsable."""
    if not commitment_str:
        return 3600
    commitment_str = commitment_str.lower().strip()
    match = re.match(r'(\d+)\s*(hour|hours|minute|minutes|min|mins|h|m)', commitment_str)
    if not match:
        return 3600
    value = int(match.group(1))
    unit = match.group(2)
    if unit.startswith('hour') or unit == 'h':
        return value * 3600
    return value * 60

async def get_study_time_for_date(user_id: str, target_date: date) -> int:
    start = datetime.combine(target_date, datetime.min.time())
    end = datetime.combine(target_date, datetime.max.time())

    attempt_seconds = 0
    async for att in db.attempts.find({
        "user_id": user_id,
        "created_at": {"$gte": start.isoformat(), "$lte": end.isoformat()}
    }):
        attempt_seconds += att.get("time_spent", 0)

    reading_seconds = 0
    date_str = target_date.isoformat()
    async for doc in db.paper_reading_time.find({"user_id": user_id}):
        daily = doc.get("daily_seconds", {})
        reading_seconds += daily.get(date_str, 0)

    return attempt_seconds + reading_seconds

async def recompute_user_accuracy(user_id: str) -> float:
    attempts = await db.attempts.find(
        {"user_id": user_id}, {"_id": 0, "score": 1, "total": 1}
    ).to_list(2000)
    total_q = sum(a.get("total", 0) for a in attempts)
    correct = sum(a.get("score", 0) for a in attempts)
    accuracy = round((correct / total_q) * 100, 1) if total_q else 0.0
    await db.users.update_one({"user_id": user_id}, {"$set": {"accuracy": accuracy}})
    return accuracy

async def _credit_streak_day(user_id: str, new_streak: int, credited_date: date) -> int:
    """Persists a newly-credited streak day exactly once. Both the
    real-time path (update_user_streak) and the daily fallback job
    (daily_reminder_job) route through this function so a day can never
    be double-credited or double-paid."""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "xp": 1})
    new_xp = (user_doc.get("xp", 0) if user_doc else 0) + STREAK_XP_PER_DAY
    xp_level = 1 + new_xp // 500
    streak_level = 1 + new_streak // 7
    new_level = max(xp_level, streak_level)

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "streak": new_streak,
            "last_goal_met_date": credited_date.isoformat(),
            "xp": new_xp,
            "level": new_level,
        }},
    )
    await recompute_user_accuracy(user_id)
    logger.info(
        f"Streak credited: user={user_id} date={credited_date.isoformat()} "
        f"streak={new_streak} +{STREAK_XP_PER_DAY}xp level={new_level}"
    )
    # This will also trigger a push notification via create_notification
    await create_notification(
        user_id, f"🔥 You've reached a {new_streak}-day study streak!",
        "streak", "/dashboard"
    )
    return new_level

async def update_user_streak(user: dict) -> dict:
    """Real-time check, called after every reading-time ping. Re-reads
    streak state fresh from the DB rather than trusting the possibly
    stale `user` snapshot, so overlapping pings can't race each other."""
    user_id = user["user_id"]
    today = datetime.utcnow().date()
    today_seconds = await get_study_time_for_date(user_id, today)
    goal_seconds = parse_daily_commitment(user.get("daily_commitment", "1 hour"))
    met_goal = today_seconds >= goal_seconds

    fresh = await db.users.find_one(
        {"user_id": user_id}, {"_id": 0, "streak": 1, "last_goal_met_date": 1, "level": 1}
    ) or {}
    streak = fresh.get("streak", 0)
    last_met = fresh.get("last_goal_met_date")
    last_met_date = date.fromisoformat(last_met) if last_met else None
    level = fresh.get("level", 1)

    if met_goal and last_met_date != today:
        new_streak = streak + 1 if last_met_date == today - timedelta(days=1) else 1
        level = await _credit_streak_day(user_id, new_streak, today)
        streak = new_streak

    return {
        "streak": streak, "level": level, "met_goal": met_goal,
        "today_seconds": today_seconds, "goal_seconds": goal_seconds,
    }

async def daily_reminder_job():
    """Runs hourly, only doing real work at hour==15 UTC (4pm WAT). Safety
    net for anyone the real-time path missed crediting for yesterday, and
    sends a reminder email/notification to anyone who missed their goal."""
    now = datetime.utcnow()
    if now.hour != 15:
        return

    logger.info("Running daily reminder check")
    yesterday = (now - timedelta(days=1)).date()
    users = await db.users.find({}).to_list(1000)

    for user in users:
        user_id = user["user_id"]
        email = user.get("email")
        if not email:
            continue

        log = await db.reminder_log.find_one({"user_id": user_id, "date": yesterday.isoformat()})
        if log:
            continue

        seconds = await get_study_time_for_date(user_id, yesterday)
        goal = parse_daily_commitment(user.get("daily_commitment", "1 hour"))

        last_met = user.get("last_goal_met_date")
        last_met_date = date.fromisoformat(last_met) if last_met else None

        if seconds >= goal:
            if last_met_date != yesterday:
                streak = user.get("streak", 0)
                new_streak = streak + 1 if last_met_date == yesterday - timedelta(days=1) else 1
                await _credit_streak_day(user_id, new_streak, yesterday)
        else:
            await db.users.update_one({"user_id": user_id}, {"$set": {"streak": 0}})
            await recompute_user_accuracy(user_id)

            name = user.get("full_name", "Student")
            subject = "Don't break your study streak!"
            html = f"""
            <h2>Hi {name},</h2>
            <p>We noticed you didn't study yesterday. Your current streak is <strong>{user.get('streak', 0)}</strong> days.</p>
            <p>Remember, your daily goal is <strong>{user.get('daily_commitment', '1 hour')}</strong>.</p>
            <p>Keep going and don't break the chain!</p>
            <a href="{APP_URL}/dashboard" style="background:#4F46E5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Go to Dashboard</a>
            """
            await send_brevo_email(email, subject, html, f"Your current streak is {user.get('streak', 0)} days.")
            await create_notification(
                user_id,
                f"⏰ Don't forget to study today! Your daily goal is {user.get('daily_commitment', '1 hour')}.",
                "reminder", "/study"
            )

        await db.reminder_log.insert_one({
            "user_id": user_id, "date": yesterday.isoformat(), "sent_at": now.isoformat(),
        })


@api_router.get("/user/streak")
async def get_user_streak(user: dict = Depends(get_current_user)):
    today = datetime.utcnow().date()
    today_seconds = await get_study_time_for_date(user["user_id"], today)
    goal = parse_daily_commitment(user.get("daily_commitment", "1 hour"))
    progress_percent = min(100, int((today_seconds / goal) * 100)) if goal > 0 else 0
    return {
        "streak": user.get("streak", 0),
        "level": user.get("level", 1),
        "xp": user.get("xp", 0),
        "accuracy": user.get("accuracy", 0),
        "today_seconds": today_seconds,
        "goal_seconds": goal,
        "progress_percent": progress_percent,
        "last_goal_met_date": user.get("last_goal_met_date"),
        "daily_commitment": user.get("daily_commitment", "1 hour"),
    }


# ============================================================
# WebSocket + REST Notifications
# ============================================================
# Mounted on api_router (prefix="/api"), so the path to connect to is:
#     ws(s)://<host>/api/ws/notifications?user_id=<user_id>

@api_router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket, user_id: str = None):
    if not user_id:
        await websocket.close(code=1008)
        return
    await manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id)

@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifs

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    try:
        obj_id = ObjectId(notification_id)
    except Exception:
        raise HTTPException(400, "Invalid notification ID")
    result = await db.notifications.update_one(
        {"_id": obj_id, "user_id": user["user_id"]}, {"$set": {"read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["user_id"], "read": False}, {"$set": {"read": True}}
    )
    return {"ok": True}


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
            "auth": "/api/auth/register, /api/auth/login, /api/auth/session, /api/auth/me, /api/auth/register-with-pin, /api/auth/pin-login, /api/auth/biometric-login, /api/auth/setup-pin, /api/auth/setup-biometric, /api/auth/pin-status, /api/auth/reset-pin, /api/auth/request-reset-otp, /api/auth/reset-password-with-otp, /api/auth/request-pin-reset-otp, /api/auth/reset-pin-with-otp",
            "subjects": "/api/subjects",
            "papers": "/api/papers",
            "past-papers": "/api/past-papers",
            "courses": "/api/courses",
            "library": "/api/library/courses",
            "analytics": "/api/analytics/student",
            "ai": "/api/ai/chat, /api/ai/chat/emergent, /api/ai/solution, /api/papers/ask, /api/papers/{id}/qa, /api/papers/{id}/video",
            "settings": "/api/settings",
            "streak": "/api/user/streak",
            "notifications": "/api/notifications, /api/ws/notifications",
            "video_interactions": "/api/courses/{id}/like, /api/courses/{id}/save, /api/courses/{id}/watch",
            "phone_auth": "/api/auth/phone/send-otp, /api/auth/phone/verify",
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
            "created_at": datetime.utcnow().isoformat(),
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
            "created_at": datetime.utcnow().isoformat(),
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
                "created_at": datetime.utcnow().isoformat(),
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
                "created_at": datetime.utcnow().isoformat(),
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
                "created_at": datetime.utcnow().isoformat(),
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
            "created_at": datetime.utcnow().isoformat(),
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
    print(f"Brevo Email: {'Enabled' if BREVO_API_KEY else 'Disabled'}")
    print(f"Twilio SMS: {'Enabled' if twilio_client else 'Disabled'}")
    print(f"Scheduler (daily reminders): {'Enabled' if scheduler else 'Disabled (pip install apscheduler)'}")
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