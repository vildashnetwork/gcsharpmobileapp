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
    # Needed by the voice-input endpoint (`POST /ai/transcribe`): the recorded
    # clip arrives as multipart form data.
    File, UploadFile, Form,
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

# GC AI self-learning engine (NLP, knowledge base, web search, multi-provider LLM)
import gc_ai_engine as gc_ai

# GCSharp personal model adapter (STRICT: the only runtime generator for
# tutor answers, highlight explanations and video scripts - no external LLM).
from gc_model import get_gc_model, GCModelUnavailableError

# Continuous knowledge growth (Phase 3) + controlled training (Phase 4)
import gc_knowledge_growth as gc_kg
import gc_training as gc_train

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
    """Manages WebSocket connections for real-time updates (Phase 5).

    Upgrades over the original single-socket manager:
      * Multiple sockets per user (reconnects no longer drop the newer one).
      * Topic-based broadcast (e.g. "feed") alongside per-user messages.
      * Event validation and delivery-failure tolerance.
    """

    def __init__(self):
        # user_id -> set of sockets (a user may have several devices/reconnects)
        self.active_connections: Dict[str, set] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: str, websocket: Optional[WebSocket] = None):
        socks = self.active_connections.get(user_id)
        if not socks:
            return
        if websocket is not None:
            socks.discard(websocket)
            if not socks:
                self.active_connections.pop(user_id, None)
        else:
            self.active_connections.pop(user_id, None)

    async def send_personal_message(self, message: dict, user_id: str):
        socks = self.active_connections.get(user_id)
        if not socks:
            return
        dead = []
        for ws in list(socks):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            socks.discard(ws)
        if not socks:
            self.active_connections.pop(user_id, None)

    async def broadcast(self, message: dict, topic: str = "feed") -> int:
        """Send an event to every connected socket. Returns delivery count.

        Delivery failures on individual sockets are swallowed so one bad
        client cannot break a broadcast.
        """
        payload = dict(message)
        payload.setdefault("topic", topic)
        delivered = 0
        for user_id, socks in list(self.active_connections.items()):
            for ws in list(socks):
                try:
                    await ws.send_json(payload)
                    delivered += 1
                except Exception:
                    socks.discard(ws)
            if not socks:
                self.active_connections.pop(user_id, None)
        return delivered

    def online_user_ids(self) -> List[str]:
        return list(self.active_connections.keys())

    def connection_count(self) -> int:
        return sum(len(s) for s in self.active_connections.values())

manager = ConnectionManager()

# ============================================================
# Persistent real-time events (Phase 5)
# Important events are stored so users recover them after reconnecting;
# delivery never depends solely on an open socket.
# ============================================================

REALTIME_EVENT_RETENTION_DAYS = 14


async def emit_event(event_type: str, payload: dict, *,
                     topic: str = "feed",
                     target_user_id: Optional[str] = None,
                     persist: bool = True,
                     deliver: bool = True) -> dict:
    """Store (optionally) and push a real-time event.

    If `target_user_id` is given the event is delivered to that user only;
    otherwise it is broadcast on `topic`. The event is persisted first so a
    client that reconnects later can fetch missed events via
    GET /api/realtime/events?since=<iso>.
    """
    event = {
        "event_id": "ev_" + uuid.uuid4().hex[:16],
        "type": event_type,
        "topic": topic,
        "target_user_id": target_user_id,
        "payload": payload,
        "created_at": datetime.utcnow().isoformat(),
    }
    if persist:
        try:
            await db.realtime_events.insert_one(dict(event))
            # Bounded retention: prune old events opportunistically.
            cutoff = (datetime.utcnow() - timedelta(
                days=REALTIME_EVENT_RETENTION_DAYS)).isoformat()
            await db.realtime_events.delete_many({"created_at": {"$lt": cutoff}})
        except Exception as e:
            logger.warning(f"realtime event persist failed: {e}")
    if deliver:
        try:
            if target_user_id:
                await manager.send_personal_message(event, target_user_id)
            else:
                await manager.broadcast(event, topic=topic)
        except Exception as e:
            # Socket delivery is best-effort; the persisted event covers misses.
            logger.warning(f"realtime event delivery failed: {e}")
    return event

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
        await db.teacher_follows.create_index([("teacher_id", 1), ("follower_id", 1)], unique=True)
        # Study groups: group lookup, membership checks, request dedupe, chat history.
        await db.study_groups.create_index("group_id", unique=True)
        await db.study_groups.create_index([("exam_level", 1), ("updated_at", -1)])
        await db.study_groups.create_index("members.user_id")
        await db.study_group_requests.create_index(
            [("group_id", 1), ("user_id", 1)], unique=True)
        await db.study_group_requests.create_index([("group_id", 1), ("status", 1)])
        await db.study_group_messages.create_index([("group_id", 1), ("created_at", -1)])
        await db.reminder_log.create_index([("user_id", 1), ("date", 1)])
        await db.ai_sessions.create_index([("user_id", 1), ("updated_at", -1)])

        # ---- Phase 1: Learning feed indexes ----
        await db.feed_posts.create_index("post_id", unique=True)
        await db.feed_posts.create_index([("created_at", -1)])
        await db.feed_posts.create_index([("author_id", 1), ("created_at", -1)])
        await db.feed_posts.create_index([("subject", 1), ("created_at", -1)])
        await db.feed_posts.create_index([("topic", 1), ("created_at", -1)])
        await db.feed_posts.create_index([("exam_level", 1), ("created_at", -1)])
        await db.feed_posts.create_index([("question_type", 1), ("created_at", -1)])
        await db.feed_posts.create_index([("like_count", -1)])
        # Text index powers post search (guarded: may fail if already exists).
        try:
            await db.feed_posts.create_index(
                [("title", "text"), ("body", "text")], name="feed_text_search")
        except Exception:
            pass
        await db.feed_comments.create_index("comment_id", unique=True)
        await db.feed_comments.create_index([("post_id", 1), ("created_at", 1)])
        await db.feed_comments.create_index([("parent_comment_id", 1)])
        await db.feed_likes.create_index(
            [("post_id", 1), ("user_id", 1)], unique=True)
        await db.feed_saves.create_index(
            [("post_id", 1), ("user_id", 1)], unique=True)

        # ---- Phase 5: persistent real-time events ----
        await db.realtime_events.create_index("event_id", unique=True)
        await db.realtime_events.create_index(
            [("target_user_id", 1), ("created_at", -1)])
        await db.realtime_events.create_index(
            [("topic", 1), ("created_at", -1)])
        await db.realtime_events.create_index(
            "created_at", expireAfterSeconds=REALTIME_EVENT_RETENTION_DAYS * 86400)

        # ---- Phase 6: push reliability ----
        await db.push_log.create_index("dedupe_key")
        await db.push_log.create_index("created_at")

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
        # Phase 3: continuous knowledge growth (bounded, restartable).
        try:
            gc_kg.schedule_job(scheduler, db,
                               interval_hours=int(os.environ.get("KG_INTERVAL_HOURS", "6")))
            print("Scheduler registered knowledge-growth job")
        except Exception as e:
            print(f"Knowledge-growth scheduler warning: {e}")
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

# Learning Feed media (Phase 1): images + short videos uploaded by students.
FEED_MEDIA_DIR = ROOT_DIR / "feed_media"
FEED_MEDIA_DIR.mkdir(exist_ok=True)
app.mount("/api/feed/media", StaticFiles(directory=str(FEED_MEDIA_DIR)), name="feed_media")

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
# LLM Client (fixed for long JSON video generation)
# ============================================================

# NOTE: these must all be REAL OpenRouter model IDs. The old chain contained
# "google/gemma-4-31b-it:free" and "openrouter/free" which do not exist, so
# every call to those models returned 404 and video generation always failed
# once the (few) working models were exhausted / rate-limited.
DEFAULT_MODEL_CHAIN = [
    # Verified live with this project's key (HTTP 200 + real content).
    "nex-agi/nex-n2.5-mini:free",
    "dots-studio/dots-3-note-preview:free",
    "liquid/lfm-2.5-2.6b:free",
    "cohere/north-mini-code:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "poolside/laguna-xs-2.1:free",
    "poolside/laguna-s-2.1:free",
    "nex-agi/nex-n2.5-pro:free",
    "inclusionai/ling-3.0-flash-vl:free",
    "inclusionai/ling-3.0-flash-sante:free",
    "inclusionai/ling-3.0-flash-fin:free",
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
    def __init__(self, api_key: str = "", models: Optional[List[str]] = None,
                 max_tokens: int = 600, timeout: float = 25.0):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self.models = models or _get_model_chain()
        self.base_url = "https://openrouter.ai/api/v1"
        self.system_message = ""
        self.session_id = None
        self.referer = APP_URL
        self.title = APP_NAME
        # Long-form endpoints (video walkthroughs, paper Q&A) override these
        # per-call via send_message(..., max_tokens=..., timeout=...).
        self.default_max_tokens = max_tokens
        self.default_timeout = timeout

    async def _call_model(self, hc: httpx.AsyncClient, model: str, message: str,
                          max_tokens: int) -> Optional[str]:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": self.system_message},
                {"role": "user", "content": message},
            ],
            "temperature": 0.2,
            "max_tokens": max_tokens,
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

    async def send_message(self, message: str, max_tokens: Optional[int] = None,
                           timeout: Optional[float] = None,
                           num_models: int = 3) -> str:
        if not self.api_key:
            return "AI service not configured. Please set OPENROUTER_API_KEY in .env"
        models_to_try = (self.models or [])[:max(1, num_models)]
        if not models_to_try:
            return "AI model list is empty."
        use_tokens = max_tokens or self.default_max_tokens
        use_timeout = timeout or self.default_timeout
        async with httpx.AsyncClient(timeout=use_timeout) as hc:
            for model in models_to_try:
                result = await self._call_model(hc, model, message, use_tokens)
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

EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/payloads"
# The legacy single-send endpoint is still honoured as a fallback.
EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send"

# Push reliability (Phase 6): bounded retries with exponential backoff.
PUSH_MAX_ATTEMPTS = 3
_PUSH_DEDUP_TTL_SECONDS = 300  # suppress identical pushes within 5 minutes


def _push_dedupe_key(user_id: str, title: str, body: str) -> str:
    return hashlib.sha1(f"{user_id}|{title}|{body}".encode()).hexdigest()


async def _mark_token_invalid(user_id: str, token: str) -> None:
    """Clear a dead Expo token so we stop re-sending to it."""
    try:
        await db.users.update_one(
            {"user_id": user_id},
            {"$unset": {"expo_push_token": ""},
             "$push": {"invalid_push_tokens": {"$each": [token],
                                                "$slice": -20}}})
        logger.info(f"Cleared invalid push token for user {user_id}")
    except Exception as e:
        logger.warning(f"Failed to clear invalid push token: {e}")


async def send_expo_push(token: str, title: str, body: str,
                         data: Optional[dict] = None,
                         user_id: Optional[str] = None) -> bool:
    """Send a push to one Expo token with retry + invalid-token cleanup.

    Returns True when Expo accepted the message. Failures are retried up to
    PUSH_MAX_ATTEMPTS with backoff. A dead token is removed from the user.
    """
    if not token:
        return False

    if user_id:
        dkey = _push_dedupe_key(user_id, title, body)
        try:
            recent = await db.push_log.find_one(
                {"dedupe_key": dkey, "created_at": {
                    "$gte": (datetime.utcnow() - timedelta(
                        seconds=_PUSH_DEDUP_TTL_SECONDS)).isoformat()}})
            if recent:
                logger.info(f"Push suppressed as duplicate for user {user_id}")
                return False
        except Exception:
            pass  # logging issues must never block a send

    payload = {
        "to": token, "sound": "default", "title": title, "body": body,
        "data": data or {}, "priority": "high",
    }
    ok = False
    for attempt in range(1, PUSH_MAX_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(EXPO_PUSH_SEND_URL, json=payload)
            if response.status_code == 200:
                try:
                    ticket_data = response.json().get("data", {})
                except (ValueError, AttributeError):
                    ticket_data = {}
                tickets = ticket_data if isinstance(ticket_data, list) else [ticket_data]
                ticket = next((item for item in tickets if isinstance(item, dict)), {})
                if ticket.get("status") == "ok":
                    ok = True
                    break
                details = ticket.get("details") or {}
                error_code = str(details.get("error") or "").lower()
                message = str(ticket.get("message") or "").lower()
                if error_code in {"devicenotregistered", "invalidpushtoken"}:
                    if user_id:
                        await _mark_token_invalid(user_id, token)
                    return False
                logger.warning(
                    "Expo push ticket rejected (attempt %s): %s %s",
                    attempt, error_code or "unknown", message[:160])
            else:
                txt = (response.text or "").lower()
                if any(m in txt for m in ("devicenotregistered", "device not found",
                                          "invalidpushtoken", "notregistered")):
                    if user_id:
                        await _mark_token_invalid(user_id, token)
                    return False
                logger.warning(f"Expo push attempt {attempt} -> {response.status_code}")
                if 400 <= response.status_code < 500 and response.status_code != 429:
                    break
        except Exception as e:
            logger.warning(f"Expo push attempt {attempt} error: {e}")
        if attempt < PUSH_MAX_ATTEMPTS:
            await asyncio.sleep(0.8 * (2 ** (attempt - 1)))  # 0.8s, 1.6s, ...

    if user_id:
        try:
            await db.push_log.insert_one({
                "dedupe_key": _push_dedupe_key(user_id, title, body),
                "user_id": user_id, "ok": ok,
                "created_at": datetime.utcnow().isoformat()})
        except Exception:
            pass
    return ok

# ============================================================
# MODIFIED create_notification – now sends push too
# ============================================================

# Notification type -> push title mapping (extensible).
_NOTIF_TITLES = {
    "streak": "\U0001F525 Streak Update",
    "reminder": "⏰ Study Reminder",
    "ai_reply": "\U0001F916 AI Reply",
    "reply": "\U0001F4AC New Reply",
    "mention": "\U0001F4CC You were mentioned",
    "feed_post": "\U0001F4E2 New in Learning Feed",
    "video_ready": "\U0001F3A5 Video Ready",
    "ai_answer": "\U0001F916 AI Answer Ready",
}


async def create_notification(user_id: str, message: str, type: str = "info",
                              link: Optional[str] = None,
                              dedupe: bool = True) -> dict:
    """Persist + push a notification, with duplicate suppression.

    `dedupe=True` skips storing an identical unread notification for the same
    user within the suppression window (stops double-fires on retries).
    """
    if dedupe:
        try:
            recent = await db.notifications.find_one({
                "user_id": user_id, "message": message, "read": False,
                "created_at": {"$gte": (
                    datetime.utcnow() - timedelta(
                        seconds=_PUSH_DEDUP_TTL_SECONDS)).isoformat()}})
            if recent:
                return {**recent, "_id": str(recent.get("_id", ""))}
        except Exception:
            pass

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

    # Preserve the legacy notification socket message shape.
    try:
        await manager.send_personal_message(notif, user_id)
    except Exception:
        pass
    try:
        await emit_event("notification", {
            "notification_id": notif["_id"],
            "message": message,
            "type": type,
            "link": link,
            "read": False,
        }, topic="notification", target_user_id=user_id, deliver=False)
    except Exception as e:
        logger.warning("Could not publish notification event: %s", e)

    # Push notification (Expo) - resilient to provider failures.
    try:
        user_doc = await db.users.find_one(
            {"user_id": user_id}, {"_id": 0, "expo_push_token": 1})
        if user_doc and user_doc.get("expo_push_token"):
            title = _NOTIF_TITLES.get(type, "GC Smart")
            await send_expo_push(user_doc["expo_push_token"], title, message,
                                 {"link": link, "type": type}, user_id=user_id)
    except Exception as e:
        # A push-provider outage must never break the API response.
        logger.warning(f"Push dispatch failed (non-fatal): {e}")

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
    token: str = Field(
        min_length=20, max_length=200,
        pattern=r"^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$")

@api_router.post("/notifications/register-push-token")
async def register_push_token(req: PushTokenRequest, user: dict = Depends(get_current_user)):
    # A device token belongs to one account at a time. Remove stale ownership
    # when someone signs out and another account signs in on the same device.
    await db.users.update_many(
        {"user_id": {"$ne": user["user_id"]},
         "expo_push_token": req.token},
        {"$unset": {"expo_push_token": ""}})
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"expo_push_token": req.token}}
    )
    return {"ok": True}


@api_router.delete("/notifications/register-push-token")
async def unregister_push_token(token: str,
                                user: dict = Depends(get_current_user)):
    # Reuse the registration validator to reject malformed token values.
    PushTokenRequest(token=token)
    await db.users.update_one(
        {"user_id": user["user_id"], "expo_push_token": token},
        {"$unset": {"expo_push_token": ""}})
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


class TextToVideoRequest(BaseModel):
    """Text-to-video (Phase 2): student's text or topic -> structured lesson."""
    text: str = Field(..., min_length=3, max_length=6000)
    subject: str = Field(default="General", max_length=80)
    level: str = Field(default="General", max_length=40)
    lesson_focus: str = Field(default="explain", max_length=40)  # explain | solve

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
    "GCE O Level": ["MATHEMATICS", "BIOLOGY", "FRENCH", "COMPUTER SCIENCE", "ADDITIONAL MATHS","CHEMISTRY", "History", "ENGLISH LANGUAGE","GEOGRAPHY", "Literature in English", "CITIZENSHIP", "COMMERCE", "ECONOMICS", "FOOD AND NUTRITION",
                    "HUMAN BIOLOGY", "History", "LOGIC"],
    "GCE A Level": ["ICT","HISTORY","ECONOMICS","Pure Mathematics with stat", "Pure Mathematics with mech", "Further Mathematics", "Physics", "Chemistry", "Biology",
                     "Accounting", "Business Studies", "French", "English Literature"],
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
async def list_papers(level: Optional[str] = None, levels: Optional[str] = None,
                      subject: Optional[str] = None,
                      year: Optional[int] = None, paper: Optional[int] = None,
                      q: Optional[str] = None, user: dict = Depends(get_current_user_optional)):
    query = {}
    if level: query["level"] = level
    # Teachers browse several exam categories at once - `levels` is a
    # comma-separated list and takes precedence over the single `level`.
    if levels:
        wanted = [item.strip() for item in levels.split(",") if item.strip()]
        if wanted:
            query["level"] = {"$in": wanted}
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
    # level -> subjects actually present in the library. Teachers use this to
    # filter accurately even for levels missing from EXAM_STRUCTURE.
    level_subjects: Dict[str, list] = {}
    for p in papers:
        lvl = p.get("level")
        subj = p.get("subject")
        if lvl and subj:
            level_subjects.setdefault(lvl, [])
            if subj not in level_subjects[lvl]:
                level_subjects[lvl].append(subj)
    for lvl in level_subjects:
        level_subjects[lvl].sort()
    return {"levels": levels, "subjects": subjects, "years": years,
            "papers": [1, 2, 3], "level_subjects": level_subjects}

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
        # Phase 2: the GCSharp model solves it (no external LLM fallback).
        _ensure_gc_model()
        model = get_gc_model()
        response = await model.generate(req.question, system=system,
                                        max_tokens=1000, timeout=QA_TIMEOUT)
        return {
            "success": True,
            "answer": response,
            "source": "gc_model",
            "confidence": 0.85,
            "question": req.question,
            "subject": req.subject or "General"
        }
    except (GCModelUnavailableError, HTTPException) as e:
        detail = getattr(e, "detail", str(e))
        return {
            "success": False,
            "error": detail,
            "retryable": True,
            "suggestion": "The GCSharp model is unavailable right now - please retry shortly."
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
    # Phase 2: exam-question content is generated by the GCSharp model only.
    _ensure_gc_model()
    model = get_gc_model()
    try:
        resp = await model.generate(prompt, system=system,
                                    max_tokens=VIDEO_MAX_TOKENS,
                                    timeout=QA_TIMEOUT)
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)
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
            "user_id": u["user_id"],
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


@api_router.get("/students/{student_id}/profile")
async def get_student_profile(student_id: str, user: dict = Depends(get_current_user)):
    student = await db.users.find_one(
        {"user_id": student_id, "role": "student"},
        {"_id": 0, "email": 0, "password_hash": 0, "pin_hash": 0},
    )
    if not student:
        raise HTTPException(404, "Student not found")
    return {
        "user_id": student.get("user_id"),
        "full_name": student.get("full_name", "Student"),
        "bio": student.get("bio", ""),
        "institution": student.get("institution", ""),
        "exam_level": student.get("exam_level", ""),
        "profile_photo": student.get("profile_photo") or student.get("picture"),
        "xp": student.get("xp", 0),
        "level": student.get("level", 1),
        "streak": student.get("streak", 0),
    }

# ============================================================
# Library Routes
# ============================================================

@api_router.get("/library/courses")
async def list_library_courses(user: dict = Depends(get_current_user_optional)):
    # Lessons tab shows one unified feed: legacy courses + teacher lesson uploads.
    courses = await db.courses.find({}, {"_id": 0}).to_list(200)
    lessons = await db.lesson_videos.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    items = list(courses)
    for l in lessons:
        try:
            created = l.get("created_at")
            created_str = created.isoformat() if hasattr(created, "isoformat") else (created or "")
        except Exception:
            created_str = ""
        items.append({
            "course_id": l.get("lesson_id"),
            "lesson_id": l.get("lesson_id"),
            "teacher_id": l.get("teacher_id"),
            "teacher_name": l.get("teacher_name", ""),
            "teacher_avatar": l.get("teacher_avatar"),
            "title": l.get("title", ""),
            "description": l.get("description", ""),
            "subject": l.get("subject_name", ""),
            "subject_name": l.get("subject_name", ""),
            "level": l.get("exam_level", ""),
            "exam_level": l.get("exam_level", ""),
            "video_url": l.get("video_url", ""),
            "thumbnail": l.get("thumbnail", ""),
            "duration": l.get("duration", "10:00"),
            "views": l.get("views", 0),
            "rating": l.get("rating", 5.0),
            "created_at": created_str,
        })
    if user:
        liked_docs = await db.video_likes.find(
            {"user_id": user["user_id"]}, {"_id": 0, "course_id": 1}
        ).to_list(500)

    # Resolve each teacher's CURRENT profile photo so video cards always
    # show the live avatar (stored teacher_avatar/teacher_picture snapshots
    # go stale the moment the teacher updates their photo).
    teacher_ids = list({it.get("teacher_id") for it in items if it.get("teacher_id")})
    if teacher_ids:
        tdocs = await db.users.find(
            {"user_id": {"$in": teacher_ids}},
            {"_id": 0, "user_id": 1, "profile_photo": 1, "picture": 1},
        ).to_list(500)
        tmap = {t["user_id"]: (t.get("profile_photo") or t.get("picture") or "") for t in tdocs}
        for it in items:
            live = tmap.get(it.get("teacher_id"))
            if live:
                it["teacher_avatar"] = live
            elif not it.get("teacher_avatar"):
                it["teacher_avatar"] = it.get("teacher_picture") or ""

    if user:
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
    is_lesson_video = False
    if not c:
        # Teacher lesson uploads live in lesson_videos — expose them as courses
        # so tapping a teacher upload from the Lessons feed opens its detail page.
        l = await db.lesson_videos.find_one({"lesson_id": course_id}, {"_id": 0})
        if l:
            is_lesson_video = True
            try:
                created = l.get("created_at")
                created_str = created.isoformat() if hasattr(created, "isoformat") else (created or "")
            except Exception:
                created_str = ""
            c = {
                "course_id": l.get("lesson_id"),
                "lesson_id": l.get("lesson_id"),
                "teacher_id": l.get("teacher_id"),
                "teacher_name": l.get("teacher_name", ""),
                "teacher_avatar": l.get("teacher_avatar"),
                "title": l.get("title", ""),
                "description": l.get("description", ""),
                "subject": l.get("subject_name", ""),
                "subject_name": l.get("subject_name", ""),
                "level": l.get("exam_level", ""),
                "exam_level": l.get("exam_level", ""),
                "video_url": l.get("video_url", ""),
                "thumbnail": l.get("thumbnail", ""),
                "duration": l.get("duration", "10:00"),
                "views": l.get("views", 0),
                "rating": l.get("rating", 5.0),
                "created_at": created_str,
            }
    if not c:
        raise HTTPException(404, "Not found")

    # --- View counting ---------------------------------------------------
    # The player screens fetch this endpoint when a student opens a video,
    # so count the view here. One view per user per video (deduped via the
    # same course_views collection POST /courses/{id}/view uses) so re-opens
    # and refreshes don't inflate the count. Anonymous requests still count
    # a raw view since there's no identity to dedupe against.
    counted = False
    if user:
        already = await db.course_views.find_one(
            {"course_id": course_id, "student_id": user["user_id"]}, {"_id": 0}
        )
        if not already:
            await db.course_views.insert_one({
                "view_id": f"vw_{uuid.uuid4().hex[:10]}",
                "course_id": course_id,
                "student_id": user["user_id"],
                "teacher_id": c.get("teacher_id"),
                "earning": 0 if is_lesson_video else VIEW_RATE_FCFA,
                "created_at": datetime.utcnow().isoformat(),
            })
            counted = True
    else:
        counted = True

    if counted:
        if is_lesson_video:
            await db.lesson_videos.update_one(
                {"lesson_id": course_id}, {"$inc": {"views": 1}}
            )
        else:
            await db.courses.update_one(
                {"course_id": course_id},
                {"$inc": {"views": 1, "students": 1, "earnings": VIEW_RATE_FCFA}},
            )

    c = dict(c)

    # Live avatar: resolve the teacher's CURRENT profile photo so the
    # player screens show the real picture, not a stale upload-time copy.
    _tid = c.get("teacher_id")
    if _tid:
        _tdoc = await db.users.find_one(
            {"user_id": _tid}, {"_id": 0, "profile_photo": 1, "picture": 1}
        )
        _live = (_tdoc.get("profile_photo") or _tdoc.get("picture") or "") if _tdoc else ""
        if _live:
            c["teacher_avatar"] = _live
        elif not c.get("teacher_avatar"):
            c["teacher_avatar"] = c.get("teacher_picture") or ""
    if counted:
        c["views"] = c.get("views", 0) + 1
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
    """Legacy chat route, now served by the GCSharp personal model.

    Phase 2: the external Emergent/Claude path is gone - this route keeps its
    storage contract but generates with the GCSharp model only.
    """
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

    # Conversation memory from this session (plain-text context).
    mem_lines = [f"{m.get('role','user').upper()}: {m.get('content','')}"
                 for m in history if m.get("content")]
    prompt = (("Conversation so far:\n" + "\n".join(mem_lines[-10:]) + "\n\n")
              if mem_lines else "") + inp.message

    _ensure_gc_model()
    model = get_gc_model()
    try:
        reply = await model.generate(prompt, system=system,
                                     max_tokens=1000, timeout=QA_TIMEOUT)
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)

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
    model = get_gc_model()
    _ensure_gc_model()
    try:
        reply = await model.generate(inp.question, system=system,
                                     max_tokens=QA_MAX_TOKENS,
                                     timeout=QA_TIMEOUT)
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)
    except HTTPException:
        raise
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
                key = (message.get("role"), message.get("content"))
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(message)
            history = sorted(
                deduped,
                key=lambda message: str(message.get("ts") or ""),
            )

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
        # Reconcile both stores on every turn so older chats and messages
        # written by another request are available without a page refresh.
        history = await _load_ai_session_history(user["user_id"], session_id)

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

    async def event_gen():
        nonlocal history
        full = ""
        source = "ai"
        learned = False
        try:
            # GC AI brain: local solver -> knowledge base -> web research +
            # GCSharp personal model synthesis (Phase 2: NO external LLM).
            outcome = await gc_ai.answer_question(
                db,
                req.message,
                subject=req.subject or "General",
                history_context=history_context,
                profile_snapshot=profile_snapshot,
                allow_web_learning=True,
                use_local_solver=solve_math_local,
                use_gc_model=True,
            )
            full = (outcome.get("answer") or "").strip()
            source = outcome.get("source") or "ai"
            learned = bool(outcome.get("learned"))
            if source == "gc_model_unavailable":
                # Clear, retryable message - never a silent external fallback.
                full = ("The GCSharp model is unavailable right now, so I can't "
                        "generate a new answer. Please tap retry in a moment. "
                        f"({(outcome.get('error') or '')[:160]})")
                source = "gc_model_unavailable"
            elif not full:
                full = ("I could not generate a complete answer just now. Please try "
                        "rephrasing the question or ask again in a moment.")
            for chunk in [full[i:i+50] for i in range(0, len(full), 50)]:
                yield f"data: {json.dumps({'delta': chunk})}\n\n"
        except Exception as e:
            logger.error(f"AI stream error: {e}")
            full = ("I could not complete that answer right now. Please try again in "
                    "a moment - or try rephrasing your question.")
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
        yield f"data: {json.dumps({'done': True, 'session_id': session_id, 'source': source, 'learned': learned})}\n\n"

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
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    search_key = os.environ.get("GOOGLE_SEARCH_API_KEY", "")
    kb = gc_ai.KnowledgeBase(db)
    result = {
        "api_key_configured": bool(api_key),
        "gemini_configured": bool(gemini_key),
        "google_search_configured": bool(search_key and os.environ.get("GOOGLE_SEARCH_CX", "")),
        "keyless_web_search": True,  # DuckDuckGo fallback always available
        "knowledge_base": await kb.stats(),
        "providers": {
            "google_gemini": "primary" if gemini_key else "not_configured",
            "openrouter": "fallback" if api_key else "not_configured",
        },
        "models_tested": [],
    }
    if not api_key and not gemini_key:
        result["diagnosis"] = ("No LLM provider configured. GC AI will answer from its "
                               "knowledge base, local math solver, and web research only. "
                               "Set GEMINI_API_KEY or OPENROUTER_API_KEY.")
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
    # GCSharp tutor brain: local solver -> knowledge base -> web research +
    # GCSharp personal model synthesis (NO external LLM). Returns clickable
    # source citations gathered from real research.
    outcome = await gc_ai.answer_question(
        db,
        req.message,
        subject=req.subject or "General",
        allow_web_learning=True,
        use_local_solver=solve_math_local,
        use_gc_model=True,
    )
    # The GCSharp model could not serve this request -> clear retryable 503.
    if outcome.get("source") == "gc_model_unavailable":
        raise HTTPException(503, outcome.get("error") or
                            "The GCSharp model is unavailable. Please retry.")
    return {
        "answer": outcome["answer"],
        "source": outcome["source"],
        "learned": outcome.get("learned", False),
        "citations": outcome.get("citations", []),
    }


# ============================================================
# GC AI VOICE - text to speech (human voice replies)
# ============================================================

class VoiceRequest(BaseModel):
    text: str
    voice: str = "female"   # female | male | bright | calm (Gemini voices)
    lang: str = "en"


_TTS_CACHE: Dict[str, dict] = {}
_TTS_CACHE_MAX = 80


@api_router.post("/ai/voice")
async def ai_voice(req: VoiceRequest, user: dict = Depends(get_current_user)):
    """Convert an AI answer (or any text) to human speech audio.

    Returns {"format": "wav"|"mp3", "audio": <base64>, "engine": ...}.
    If all speech services fail, returns {"fallback": true} so the app
    uses the on-device voice instead of showing an error.
    """
    key = hashlib.sha1(
        f"{req.lang}|{req.voice}|{req.text}".encode("utf-8", "ignore")
    ).hexdigest()
    if key in _TTS_CACHE:
        return _TTS_CACHE[key]

    out = await gc_ai.synthesize_speech(req.text, voice=req.voice, lang=req.lang)
    if not out:
        return {"fallback": True,
                "message": "Speech service unavailable - using on-device voice."}

    payload = {"format": out["format"], "audio": out["audio"],
               "engine": out.get("engine", "google"), "fallback": False}
    if len(_TTS_CACHE) >= _TTS_CACHE_MAX:
        _TTS_CACHE.clear()
    _TTS_CACHE[key] = payload
    return payload


@api_router.post("/ai/transcribe")
async def ai_transcribe(
    file: UploadFile = File(...),
    lang: str = Form("en-US"),
    user: dict = Depends(get_current_user),
):
    """Recorded voice -> text (speech to text) for voice chat.

    Accepts the phone's recording (m4a/aac/3gp/wav/ogg/flac) as multipart
    `file`. Transcodes server-side and transcribes with keyless Google
    Speech, falling back to Gemini when configured. Never raises for a
    failed recognition - returns {"text": ""} so the app can ask again.
    """
    try:
        raw = await file.read()
    except Exception:
        raw = b""
    if not raw:
        return {"text": "", "engine": None, "fallback": True}

    try:
        out = await gc_ai.transcribe_audio(
            raw, filename=file.filename or "clip.m4a", lang=lang or "en-US"
        )
    except Exception as e:
        logger.warning(f"transcribe failed: {e}")
        out = None

    if not out or not out.get("text"):
        return {"text": "", "engine": None, "fallback": True,
                "message": "I could not hear that clearly - please try again."}
    return {"text": out["text"], "engine": out.get("engine", "google"),
            "confidence": out.get("confidence", 0.0), "fallback": False}


# ============================================================
# GC AI KNOWLEDGE BASE - learning memory endpoints
# ============================================================

@api_router.get("/ai/knowledge/stats")
async def ai_knowledge_stats(user: dict = Depends(get_current_user)):
    """How much GC AI has learned so far."""
    kb = gc_ai.KnowledgeBase(db)
    return await kb.stats()


@api_router.get("/ai/knowledge/search")
async def ai_knowledge_search(q: str, user: dict = Depends(get_current_user)):
    """Search what GC AI has already learned (TF-IDF cosine matching)."""
    kb = gc_ai.KnowledgeBase(db)
    match = await kb.find_match(q)
    if not match:
        return {"found": False}
    return {
        "found": True,
        "question": match.get("question"),
        "answer": match.get("answer"),
        "source": match.get("source"),
        "similarity": match.get("_similarity"),
    }


@api_router.post("/ai/knowledge/cleanup")
async def ai_knowledge_cleanup(user: dict = Depends(get_current_user)):
    """Remove junk/low-quality entries GC AI learned before the NLP guards
    existed (e.g. greetings or one-word queries). Teachers/admins only."""
    if user.get("role") not in {"teacher", "admin"}:
        raise HTTPException(403, "Teachers and admins only")
    # Junk = entries with fewer than 3 distinct terms (e.g. a stored "hi").
    junk = await db.ai_knowledge.find({}, {"_id": 1, "tf": 1}).to_list(5000)
    bad_ids = [j["_id"] for j in junk if len(j.get("tf", {})) < 3]
    deleted_count = 0
    if bad_ids:
        res = await db.ai_knowledge.delete_many({"_id": {"$in": bad_ids}})
        deleted_count = res.deleted_count
    gc_kb = gc_ai.KnowledgeBase(db)
    gc_kb.invalidate_cache()
    return {"ok": True, "deleted_junk_entries": deleted_count}

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
    if user.get("role") not in ("teacher", "admin"):
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

    # Notify followers (email + push) in the background so the upload
    # response returns immediately and email-provider latency/slowness
    # can never fail the publish.
    try:
        followers = await db.teacher_follows.find(
            {"teacher_id": user["user_id"]}
        ).to_list(1000)
        if followers:
            follower_ids = [f["follower_id"] for f in followers]
            follower_docs = await db.users.find(
                {"user_id": {"$in": follower_ids}},
                {"_id": 0, "email": 1, "full_name": 1, "expo_push_token": 1},
            ).to_list(1000)
            asyncio.create_task(
                _notify_followers_new_lesson(user["full_name"], doc, follower_docs)
            )
    except Exception as e:
        logger.error(f"New-lesson notification dispatch failed: {e}")

    return {"lesson": serialize(doc)}

@api_router.get("/teacher/lessons")
async def teacher_lessons(user: dict = Depends(get_current_user)):
    if user.get("role") not in ("teacher", "admin"):
        raise HTTPException(403, "Teachers only")
    q = {} if user.get("role") == "admin" else {"teacher_id": user["user_id"]}
    items = await db.lesson_videos.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": [serialize(x) for x in items]}


class LessonUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    exam_level: Optional[str] = None
    video_url: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[str] = None


def _lesson_owner_or_403(lesson: dict, user: dict):
    if user.get("role") == "admin":
        return
    if lesson.get("teacher_id") != user.get("user_id"):
        raise HTTPException(403, "Not your lesson")


@api_router.put("/lessons/{lesson_id}")
async def update_lesson(lesson_id: str, req: LessonUpdate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("teacher", "admin"):
        raise HTTPException(403, "Teachers only")
    lesson = await db.lesson_videos.find_one({"lesson_id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(404, "Not found")
    _lesson_owner_or_403(lesson, user)
    patch = {k: v for k, v in req.model_dump().items() if v is not None}
    if not patch:
        return {"lesson": serialize(lesson)}
    await db.lesson_videos.update_one({"lesson_id": lesson_id}, {"$set": patch})
    updated = await db.lesson_videos.find_one({"lesson_id": lesson_id}, {"_id": 0})
    return {"lesson": serialize(updated)}


@api_router.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("teacher", "admin"):
        raise HTTPException(403, "Teachers only")
    lesson = await db.lesson_videos.find_one({"lesson_id": lesson_id}, {"_id": 0})
    if not lesson:
        raise HTTPException(404, "Not found")
    _lesson_owner_or_403(lesson, user)
    await db.lesson_videos.delete_one({"lesson_id": lesson_id})
    return {"deleted": True, "lesson_id": lesson_id}


# ============================================================
# Teacher Profiles & Follows (Facebook-style)
# ============================================================

# Safe subset of the user doc exposed on a public teacher profile —
# never leaks email, password/pin hashes, or auth bookkeeping.
TEACHER_PROFILE_FIELDS = {
    "_id": 0, "user_id": 1, "full_name": 1, "profile_photo": 1,
    "bio": 1, "institution": 1, "specialization": 1,
    "exam_level": 1, "role": 1, "subjects": 1, "created_at": 1,
}


def _normalize_teacher_video(doc: dict) -> dict:
    """Shape both legacy `courses` and teacher `lesson_videos` uploads into
    one card format for the teacher profile grid."""
    return {
        "course_id": doc.get("course_id") or doc.get("lesson_id"),
        "title": doc.get("title", ""),
        "description": doc.get("description", ""),
        "subject_name": doc.get("subject_name") or doc.get("subject", ""),
        "exam_level": doc.get("exam_level") or doc.get("level", ""),
        "thumbnail": doc.get("thumbnail", ""),
        "duration": doc.get("duration", ""),
        "views": doc.get("views", 0),
        "video_url": doc.get("video_url", ""),
        "teacher_id": doc.get("teacher_id"),
        "teacher_name": doc.get("teacher_name", ""),
        "created_at": doc.get("created_at").isoformat() if hasattr(doc.get("created_at"), "isoformat") else (doc.get("created_at") or ""),
    }


@api_router.get("/teachers/{teacher_id}")
async def get_teacher_profile(teacher_id: str, user: dict = Depends(get_current_user_optional)):
    q = {"user_id": teacher_id, "role": {"$in": ("teacher", "admin")}}
    # Self-view fallback: a teacher must always be able to open their own
    # profile, even on a legacy account whose `role` was never set.
    if user and user.get("user_id") == teacher_id:
        q = {"user_id": teacher_id}
    t = await db.users.find_one(
        q,
        TEACHER_PROFILE_FIELDS,
    )
    if not t:
        raise HTTPException(404, "Teacher not found")

    # Hard guarantees so the profile page can never crash on a legacy
    # account that's missing fields (this crashed the screen before).
    t.setdefault("full_name", "")
    t.setdefault("profile_photo", None)
    t.setdefault("bio", "")
    t.setdefault("institution", "")
    t.setdefault("specialization", "")
    t.setdefault("exam_level", "")
    t.setdefault("subjects", [])

    followers = await db.teacher_follows.count_documents({"teacher_id": teacher_id})
    is_following = False
    if user:
        is_following = bool(await db.teacher_follows.find_one(
            {"teacher_id": teacher_id, "follower_id": user["user_id"]}
        ))

    # Their published videos: teacher uploads + any legacy courses they own.
    lessons = await db.lesson_videos.find(
        {"teacher_id": teacher_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    courses = await db.courses.find(
        {"teacher_id": teacher_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    videos = [_normalize_teacher_video(x) for x in lessons] + [_normalize_teacher_video(x) for x in courses]
    videos.sort(key=lambda v: str(v.get("created_at") or ""), reverse=True)

    # Earnings shown only on self-view (never leak to public visitors).
    total_earnings = 0
    if user and user.get("user_id") == teacher_id:
        total_earnings = sum(
            (c.get("earnings", 0) or 0) for c in await db.courses.find(
                {"teacher_id": teacher_id}, {"_id": 0, "earnings": 1}
            ).to_list(200)
        )

    t["created_at"] = t["created_at"].isoformat() if hasattr(t.get("created_at"), "isoformat") else (t.get("created_at") or "")
    return {
        "teacher": t,
        "followers": followers,
        "is_following": is_following,
        "videos": videos,
        "total_views": sum(v.get("views", 0) for v in videos),
        "total_earnings": total_earnings,
        "is_self": bool(user and user.get("user_id") == teacher_id),
    }


@api_router.post("/teachers/{teacher_id}/follow")
async def toggle_follow_teacher(teacher_id: str, user: dict = Depends(get_current_user)):
    if teacher_id == user["user_id"]:
        raise HTTPException(400, "You cannot follow yourself")
    t = await db.users.find_one({"user_id": teacher_id, "role": {"$in": ("teacher", "admin")}})
    if not t:
        raise HTTPException(404, "Teacher not found")

    existing = await db.teacher_follows.find_one(
        {"teacher_id": teacher_id, "follower_id": user["user_id"]}
    )
    if existing:
        await db.teacher_follows.delete_one({"_id": existing["_id"]})
    else:
        await db.teacher_follows.insert_one({
            "follow_id": f"flw_{uuid.uuid4().hex[:10]}",
            "teacher_id": teacher_id,
            "follower_id": user["user_id"],
            "created_at": datetime.utcnow(),
        })
    followers = await db.teacher_follows.count_documents({"teacher_id": teacher_id})
    return {"following": not existing, "followers": followers}


@api_router.get("/me/following")
async def my_following(user: dict = Depends(get_current_user)):
    follows = await db.teacher_follows.find(
        {"follower_id": user["user_id"]}, {"_id": 0, "teacher_id": 1}
    ).to_list(500)
    ids = [f["teacher_id"] for f in follows]
    if not ids:
        return {"items": []}
    teachers = await db.users.find({"user_id": {"$in": ids}}, TEACHER_PROFILE_FIELDS).to_list(500)
    items = []
    for t in teachers:
        t["created_at"] = t["created_at"].isoformat() if hasattr(t.get("created_at"), "isoformat") else (t.get("created_at") or "")
        items.append({
            "user_id": t.get("user_id"),
            "full_name": t.get("full_name", ""),
            "profile_photo": t.get("profile_photo"),
            "institution": t.get("institution", ""),
            "specialization": t.get("specialization", ""),
            "followers": await db.teacher_follows.count_documents({"teacher_id": t["user_id"]}),
        })
    return {"items": items}


async def _notify_followers_new_lesson(teacher_name: str, lesson: dict, followers: list):
    """Background task: email (Brevo) + push (Expo) every follower about a
    newly published lesson. Runs outside the request so publishing stays fast
    and a slow email provider never fails the upload."""
    title = lesson.get("title", "a new lesson")
    thumb = lesson.get("thumbnail") or ""
    subject_line = lesson.get("subject_name") or ""
    level = lesson.get("exam_level") or ""

    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden">
      <div style="background:#4f46e5;padding:18px 24px;color:#fff;font-size:18px;font-weight:800">GC SHARP</div>
      <div style="padding:24px">
        <p style="margin:0 0 12px;font-size:15px;color:#333">
          <strong>{teacher_name}</strong> just published a new lesson:
        </p>
        <h2 style="margin:0 0 8px;font-size:20px;color:#111">{title}</h2>
        <p style="margin:0 0 16px;font-size:13px;color:#666">{subject_line}{' &middot; ' if subject_line and level else ''}{level}</p>
        {f'<img src="{thumb}" alt="" style="width:100%;border-radius:8px;margin-bottom:16px" />' if thumb else ''}
        <a href="https://gcsharpmobileapp.onrender.com" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">Watch it now in the app</a>
        <p style="margin:16px 0 0;font-size:12px;color:#999">You're receiving this because you follow {teacher_name} on GC SHARP.</p>
      </div>
    </div>"""

    email_sent = 0
    for f in followers:
        email = (f.get("email") or "").strip()
        if email:
            try:
                await send_brevo_email(email, f"{teacher_name} posted a new lesson: {title}", html)
                email_sent += 1
            except Exception as e:
                logger.error(f"Follower email to {email} failed: {e}")
        token = f.get("expo_push_token")
        if token:
            try:
                await send_expo_push(token, f"New lesson from {teacher_name}", title,
                                     {"lesson_id": lesson.get("lesson_id")})
            except Exception as e:
                logger.error(f"Follower push failed: {e}")
    logger.info(f"New-lesson notifications: {email_sent} emails sent for '{title}'")


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
        try:
            from pypdf import PdfReader  # requirements.txt installs `pypdf`
        except ImportError:
            from PyPDF2 import PdfReader  # fallback for older envs
        reader = PdfReader(io.BytesIO(data))
        parts = []
        for p in reader.pages:
            try:
                parts.append(p.extract_text() or "")
            except Exception:
                continue
        return "\n".join(parts)[:max_chars]
    except Exception as e:
        logger.warning(f"PDF text extraction failed: {e}")
        return ""

# Tokens/timeouts sized for long structured JSON (video walkthroughs, Q&A).
# The old defaults (600 tokens / 25s / 3 models) truncated every video JSON,
# which is why generation always ended in a 502.
VIDEO_MAX_TOKENS = 2500
VIDEO_TIMEOUT = 90.0
VIDEO_NUM_MODELS = 6
QA_MAX_TOKENS = 2500
QA_TIMEOUT = 90.0

AI_NOT_CONFIGURED_MARKERS = (
    "AI service not configured",
    "having trouble reaching the AI service",
    "AI model list is empty",
)

def _is_ai_error_text(resp: str) -> bool:
    return any(m in resp for m in AI_NOT_CONFIGURED_MARKERS)

async def _ask_ai_for_json(chat: SimpleLLM, prompt: str, required_key: str, retries: int = 2,
                           max_tokens: int = VIDEO_MAX_TOKENS,
                           timeout: float = VIDEO_TIMEOUT,
                           num_models: int = VIDEO_NUM_MODELS) -> dict:
    # Phase 2 STRICT RULE: this legacy helper drove the external OpenRouter
    # chain. No production endpoint calls it anymore (all video/QA routes use
    # get_gc_model().generate_json). The guard below guarantees it can never
    # silently generate educational content through an external LLM again.
    raise HTTPException(
        503,
        "External LLM generation is disabled. Use get_gc_model().generate_json() "
        "so content is produced by the GCSharp model. See backend/DEPLOY_GCSHARP_MODEL.md.",
    )
    last_resp = ""
    for attempt in range(retries + 1):
        this_prompt = prompt if attempt == 0 else (
            prompt + "\n\nIMPORTANT: Your previous reply could not be parsed as JSON. "
            "Reply again with ONLY the JSON object — no markdown code fences, "
            "no explanation, nothing before or after it."
        )
        resp = await chat.send_message(this_prompt, max_tokens=max_tokens,
                                       timeout=timeout, num_models=num_models)
        last_resp = resp
        if _is_ai_error_text(resp):
            # No point retrying — key missing or every model is down.
            break
        try:
            parsed = _clean_json(resp)
            if parsed.get(required_key):
                return parsed
        except Exception:
            continue
    logger.error(f"AI JSON generation failed for key '{required_key}'. Last raw (truncated): {last_resp[:500]!r}")
    raise ValueError(f"Could not get valid JSON with key '{required_key}' from AI")

def _as_text(value, limit: int = 900) -> str:
    """Coerce any model-returned value into a plain string.

    Models sometimes answer with a nested object or list where a string is
    expected; slicing/joining those directly raised TypeError -> HTTP 500.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value[:limit]
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, (int, float)):
        return str(value)[:limit]
    if isinstance(value, (list, tuple)):
        return " ".join(_as_text(v, limit) for v in value).strip()[:limit]
    if isinstance(value, dict):
        for key in ("text", "body", "narration", "explanation", "answer", "result", "solution", "content"):
            found = _as_text(value.get(key), limit)
            if found:
                return found
        return " ".join(_as_text(v, limit) for v in value.values()).strip()[:limit]
    return str(value)[:limit]


def _normalise_video_scenes(raw_scenes: list, limit: int = 6) -> list:
    """Coerce model output into the {heading, board, narration, audio} shape.

    Models sometimes return scenes as plain strings or with missing keys;
    without this the endpoint crashed with AttributeError -> HTTP 500.
    """
    if not isinstance(raw_scenes, (list, tuple)):
        return []
    scenes = []
    for i, sc in enumerate(list(raw_scenes)[:limit]):
        if isinstance(sc, str):
            sc = {"heading": f"Step {i+1}", "board": [sc], "narration": sc}
        elif not isinstance(sc, dict):
            continue
        narration = _as_text(sc.get("narration") or sc.get("text") or sc.get("heading"), 900)
        board = sc.get("board") or sc.get("lines") or []
        if isinstance(board, str):
            board = [board]
        elif isinstance(board, dict):
            board = list(board.values())
        elif not isinstance(board, (list, tuple)):
            board = [board] if board else []
        board = [_as_text(line, 300) for line in board]
        board = [line for line in board if line][:8]
        if not narration and not board:
            continue
        heading = _as_text(sc.get("heading"), 120) or f"Step {i+1}"
        scenes.append({
            "heading": heading,
            "board": board,
            "narration": narration or " ".join(board),
            "audio": "",
        })
    return scenes

async def _load_paper_or_404(paper_id: str) -> dict:
    p = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Paper not found")
    return p

async def _fetch_paper_text(p: dict, max_chars: int = 7000) -> str:
    pdf_url = (p.get("pdf_url") or "").strip()
    if not pdf_url:
        raise HTTPException(502, "This paper has no PDF attached, so a video solution can't be built for it.")
    try:
        data = await fetch_pdf_bytes(pdf_url)
    except Exception as e:
        logger.error(f"PDF download failed for paper {p.get('paper_id')}: {e}")
        raise HTTPException(502, "Could not download the paper PDF. Check the paper link and try again.")
    text = extract_pdf_text(data, max_chars=max_chars)
    if not text or len(text.strip()) < 50:
        # Scanned-image PDFs have no extractable text.
        raise HTTPException(
            422,
            "This paper looks like a scanned image with no readable text, "
            "so an automatic video solution can't be generated. Try the highlight option on a typed question instead.",
        )
    return text

def _ensure_gc_model():
    """Phase 2 STRICT rule: video/answer scripts come from the GCSharp model.

    Raises HTTP 503 with a clear, retryable message when the personal model is
    not configured or unreachable. We NEVER fall back to an external LLM.
    """
    model = get_gc_model()
    if not model.configured:
        raise HTTPException(
            503,
            model.unavailable_reason()
            + " (Retry once the GCSharp model server is running.)",
        )


def _gc_unavailable_to_http(e: GCModelUnavailableError) -> HTTPException:
    """Convert a model failure into a clear, retryable 503 for the app."""
    logger.error(f"GCSharp model unavailable: {e}")
    return HTTPException(503, f"{e} Please retry.")


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
    _ensure_gc_model()
    model = get_gc_model()
    try:
        resp = await model.generate(f"Question:\n\n{req.question}",
                                    system=system, max_tokens=QA_MAX_TOKENS,
                                    timeout=QA_TIMEOUT)
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)
    resp = _strip_reasoning_preamble(resp)
    return {"answer": resp}


def _normalise_qa_items(raw_items: list) -> list:
    """Coerce model output into the {number, question, steps, answer} shape.

    Models sometimes return `steps` as a single string, as a dict, or omit the
    key entirely. Without this the mobile app crashed with
    "Cannot read property 'map' of undefined" while rendering worked solutions.
    """
    items = []
    for i, it in enumerate(raw_items or []):
        if isinstance(it, str):
            it = {"number": str(i + 1), "question": it, "steps": [], "answer": ""}
        elif not isinstance(it, dict):
            continue

        steps_raw = it.get("steps") or it.get("working") or it.get("solution") or []
        if isinstance(steps_raw, str):
            steps_raw = [steps_raw]
        elif isinstance(steps_raw, dict):
            steps_raw = [str(v) for v in steps_raw.values()]
        elif not isinstance(steps_raw, (list, tuple)):
            steps_raw = []
        steps = [str(s).strip()[:600] for s in steps_raw if str(s).strip()][:12]

        question = str(it.get("question") or it.get("text") or "").strip()[:1200]
        answer = it.get("answer") or it.get("final_answer") or it.get("result") or ""
        if isinstance(answer, (list, tuple)):
            answer = " ".join(str(a) for a in answer)
        answer = str(answer).strip()[:600]

        number = str(it.get("number") or it.get("question_number") or (i + 1)).strip()[:12]

        if not question and not steps:
            continue
        items.append({
            "number": number,
            "question": question or f"Question {number}",
            "steps": steps,
            "answer": answer,
        })
    return items


@api_router.post("/papers/{paper_id}/qa")
async def generate_paper_qa(paper_id: str, user: dict = Depends(get_current_user)):
    p = await _load_paper_or_404(paper_id)
    cached = await db.paper_qa_cache.find_one({"paper_id": paper_id}, {"_id": 0})
    if cached:
        return {"items": _normalise_qa_items(cached.get("items")), "cached": True}

    _ensure_gc_model()
    text = await _fetch_paper_text(p, max_chars=9000)
    system = ("You are a senior Cameroon GCE examiner. Read the exam paper text and produce a clear, "
              "step-by-step worked solution section. Return STRICT JSON only, with no reasoning or thinking text before or after it.")
    prompt = (
        f"This is {p['level']} {p['subject']} {p['year']} Paper {p['paper_number']}.\n\n"
        f"PAPER TEXT:\n{text}\n\n"
        "Extract the individual questions and for each return a JSON object. "
        "Return JSON: {\"items\":[{\"number\":\"1\",\"question\":\"...\",\"steps\":[\"step 1\",\"step 2\"],\"answer\":\"final answer\"}]}. "
        "Solve at least the first 8 questions you can identify. Keep steps concise and mathematically correct. Return ONLY JSON."
    )
    model = get_gc_model()
    try:
        parsed = await model.generate_json(prompt, "items", system=system,
                                           max_tokens=QA_MAX_TOKENS,
                                           timeout=QA_TIMEOUT, retries=2)
        items = _normalise_qa_items(parsed.get("items", []))
        if not items:
            raise ValueError("empty items")
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"QA generation failed for paper {paper_id}: {e}")
        raise HTTPException(502, "Couldn't generate a solution for this paper right now. Please try again shortly.")
    await db.paper_qa_cache.insert_one({"paper_id": paper_id, "items": items,
                                        "created_at": datetime.utcnow().isoformat()})
    return {"items": items, "cached": False}


@api_router.post("/papers/{paper_id}/video")
async def generate_video_solution(paper_id: str, user: dict = Depends(get_current_user)):
    p = await _load_paper_or_404(paper_id)
    cached = await db.paper_video_cache.find_one({"paper_id": paper_id}, {"_id": 0})
    if cached:
        return {"scenes": cached["scenes"], "title": cached.get("title", p.get("title", "")),
                "question": cached.get("question", ""), "cached": True}

    _ensure_gc_model()
    text = await _fetch_paper_text(p, max_chars=7000)
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
    model = get_gc_model()
    try:
        parsed = await model.generate_json(prompt, "scenes", system=system,
                                           max_tokens=VIDEO_MAX_TOKENS,
                                           timeout=VIDEO_TIMEOUT, retries=2)
        raw_scenes = parsed.get("scenes", [])
        if not raw_scenes:
            raise ValueError("empty scenes")
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Video generation failed for paper {paper_id}: {e}")
        raise HTTPException(502, "Couldn't build a video solution right now. Please try again shortly.")

    scenes = _normalise_video_scenes(raw_scenes, limit=6)
    if not scenes:
        raise HTTPException(502, "The AI returned an empty video script. Please try again.")
    doc = {"paper_id": paper_id, "title": parsed.get("title", p["title"]),
           "question": parsed.get("question", ""), "scenes": scenes,
           "created_at": datetime.utcnow().isoformat()}
    await db.paper_video_cache.insert_one(dict(doc))
    return {"scenes": scenes, "title": doc["title"], "question": doc["question"], "cached": False}


@api_router.post("/papers/{paper_id}/video/highlight")
async def generate_video_from_highlight(paper_id: str, req: HighlightVideoRequest, user: dict = Depends(get_current_user)):
    p = await _load_paper_or_404(paper_id)

    highlighted = (req.text or "").strip()
    if len(highlighted) < 5:
        raise HTTPException(400, "Please highlight a longer piece of text (at least a few words).")

    text_hash = hashlib.sha256(req.text.encode("utf-8")).hexdigest()[:16]
    cache_key = f"{paper_id}_{text_hash}"
    cached = await db.highlight_video_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        return {"scenes": cached["scenes"], "title": cached["title"], "question": cached["question"], "cached": True}

    _ensure_gc_model()
    # Highlight videos don't strictly need the full PDF — the selection itself
    # is enough. Only use the PDF as optional context so a broken PDF link
    # can't break this endpoint.
    full_text = ""
    try:
        full_text = await _fetch_paper_text(p, max_chars=3000)
    except HTTPException as e:
        if e.status_code == 422:
            raise
        logger.warning(f"Highlight video proceeding without PDF context for {paper_id}: {e.detail}")
    except Exception as e:
        logger.warning(f"Highlight video proceeding without PDF context for {paper_id}: {e}")

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
    model = get_gc_model()

    try:
        parsed = await model.generate_json(prompt, "scenes", system=system,
                                           max_tokens=VIDEO_MAX_TOKENS,
                                           timeout=VIDEO_TIMEOUT, retries=2)
        raw_scenes = parsed["scenes"]
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Highlight video generation failed for paper {paper_id}: {e}")
        raise HTTPException(502, "Couldn't build a video solution for your selection. Please try again.")

    scenes = _normalise_video_scenes(raw_scenes, limit=8)
    if not scenes:
        raise HTTPException(502, "The AI returned an empty video script. Please try again.")

    doc = {
        "cache_key": cache_key, "paper_id": paper_id,
        "title": parsed.get("title", "Solution for highlighted text"),
        "question": parsed.get("question", req.text[:200]),
        "scenes": scenes, "created_at": datetime.utcnow().isoformat(),
    }
    await db.highlight_video_cache.insert_one(dict(doc))
    return {"scenes": scenes, "title": doc["title"], "question": doc["question"], "cached": False}


# ============================================================
# Text-to-video + PDF-to-video (Phase 2 - GCSharp model ONLY)
# The GCSharp backend model generates the lesson script (scenes with
# heading/whiteboard/narration); existing TTS + audio cache + player
# components consume the same scene shape as the other video routes.
# ============================================================

_VIDEO_SCENE_SYSTEM = (
    "You are a master teacher creating a narrated video lesson on a virtual "
    "whiteboard for a student in Cameroon. Return STRICT JSON only, with no "
    "reasoning or thinking text before or after it. Narration must be natural "
    "spoken English (<= 500 chars per scene), plain text only. If the lesson "
    "has a single result or multiple-choice answer, the last narration "
    "sentence must end with 'Final answer: X'."
)


async def _generate_text_lesson(source_text: str, *, title_hint: str,
                                subject: str, level: str,
                                focus: str) -> dict:
    """Shared GCSharp-model lesson builder used by text-to-video routes."""
    _ensure_gc_model()
    focus_line = ("Solve the problem step by step." if focus == "solve"
                  else "Explain the concept clearly with a worked example.")
    prompt = (
        f"Subject: {subject}\nLevel: {level}\n\n"
        f"SOURCE MATERIAL:\n{source_text[:6000]}\n\n"
        "Create a 4 to 6 scene video lesson from this material. "
        "Pick the most important idea or the first substantial problem. "
        f"{focus_line} "
        "Return JSON: {\"title\":\"...\",\"question\":\"...\",\"scenes\":[{"
        "\"heading\":\"Step title\","
        "\"board\":[\"line shown on whiteboard\",\"another line\"],"
        "\"narration\":\"what the teacher says, <= 500 chars\"}]}. "
        "The last scene must end with a clear final answer or takeaway. "
        "Return ONLY JSON."
    )
    model = get_gc_model()
    parsed = await model.generate_json(prompt, "scenes",
                                       system=_VIDEO_SCENE_SYSTEM,
                                       max_tokens=VIDEO_MAX_TOKENS,
                                       timeout=VIDEO_TIMEOUT, retries=2)
    raw_scenes = parsed.get("scenes", [])
    scenes = _normalise_video_scenes(raw_scenes, limit=8)
    if not scenes:
        raise HTTPException(502, "The GCSharp model returned an empty video script. Please retry.")
    return {
        "title": parsed.get("title") or title_hint[:80],
        "question": parsed.get("question") or title_hint[:200],
        "scenes": scenes,
    }


def _rate_limit_text_video(user_id: str) -> bool:
    """Small per-user budget for expensive video generation (10 / 10 min)."""
    import time as _t
    key = f"t2v:{user_id}"
    now = _t.time()
    hits = globals().setdefault("_t2v_hits", {}).setdefault(key, [])
    hits[:] = [h for h in hits if now - h < 600]
    if len(hits) >= 10:
        return False
    hits.append(now)
    return True


@api_router.post("/ai/video/from-text")
async def text_to_video(req: TextToVideoRequest,
                        user: dict = Depends(get_current_user)):
    """Text/topic -> structured educational lesson (GCSharp model only)."""
    if not _rate_limit_text_video(user["user_id"]):
        raise HTTPException(429, "Too many video generations. Try again later.")
    text = (req.text or "").strip()
    if len(text.strip()) < 3:
        raise HTTPException(400, "Provide a topic or some text to build the lesson from.")
    cache_key = "t2v_" + hashlib.sha256(
        f"{text}|{req.subject}|{req.level}|{req.lesson_focus}".encode()).hexdigest()[:24]
    cached = await db.text_video_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        return {**cached, "cached": True}

    try:
        lesson = await _generate_text_lesson(
            text, title_hint=text[:80], subject=req.subject,
            level=req.level, focus=req.lesson_focus)
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Text-to-video failed: {e}")
        raise HTTPException(502, "Couldn't build the lesson video right now. Please retry.")

    doc = {**lesson, "cache_key": cache_key, "kind": "text",
           "created_at": datetime.utcnow().isoformat()}
    await db.text_video_cache.insert_one(dict(doc))
    return {**lesson, "cached": False}


@api_router.post("/ai/video/from-pdf")
async def pdf_to_video(file: UploadFile, user: dict = Depends(get_current_user)):
    """Uploaded PDF -> extracted content -> GCSharp-model video lesson."""
    if not _rate_limit_text_video(user["user_id"]):
        raise HTTPException(429, "Too many video generations. Try again later.")
    content = await file.read(15 * 1024 * 1024 + 1)
    if not content:
        raise HTTPException(400, "Empty PDF upload.")
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(413, "PDF too large (max 15 MB).")
    if content[:5] != b"%PDF-":
        raise HTTPException(415, "That file is not a PDF.")
    # Step 1: extract + analyse the PDF content before generating the lesson.
    text = extract_pdf_text(content, max_chars=7000)
    if not text or len(text.strip()) < 50:
        raise HTTPException(
            422, "This PDF has no readable text (it may be a scanned image), "
                 "so a video lesson can't be generated from it.")
    filename = (file.filename or "document.pdf")[:80]
    cache_key = "p2v_" + hashlib.sha256(
        f"{filename}|{len(content)}|{text[:500]}".encode()).hexdigest()[:24]
    cached = await db.text_video_cache.find_one({"cache_key": cache_key}, {"_id": 0})
    if cached:
        return {**cached, "cached": True}

    try:
        lesson = await _generate_text_lesson(
            text, title_hint=filename, subject="General",
            level="General", focus="explain")
    except GCModelUnavailableError as e:
        raise _gc_unavailable_to_http(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF-to-video failed: {e}")
        raise HTTPException(502, "Couldn't build the lesson video right now. Please retry.")

    doc = {**lesson, "cache_key": cache_key, "kind": "pdf",
           "source_name": filename, "created_at": datetime.utcnow().isoformat()}
    await db.text_video_cache.insert_one(dict(doc))
    return {**lesson, "cached": False}


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
    now = datetime.utcnow()
    if now.hour not in (6, 18):
        return
    logger.info("Running streak job")
    yesterday = (now - timedelta(days=1)).date()
    today = now.date()
    users = await db.users.find({}).to_list(2000)

    for user in users:
        user_id = user.get("user_id")
        if not user_id:
            continue
        try:
            if now.hour == 6:
                await _streak_settle_yesterday(user, yesterday)
            else:
                await _streak_evening_nudge(user, today)
        except Exception as e:
            logger.warning(f"Streak job skipped user: {e}")
            continue


async def _streak_settle_yesterday(user: dict, yesterday):
    user_id = user.get("user_id")
    email = user.get("email")
    now = datetime.utcnow()
    log = await db.reminder_log.find_one(
        {"user_id": user_id, "date": yesterday.isoformat()})
    if log:
        return
    seconds = await get_study_time_for_date(user_id, yesterday)
    goal = parse_daily_commitment(user.get("daily_commitment", "1 hour"))
    last_met = user.get("last_goal_met_date")
    try:
        last_met_date = date.fromisoformat(last_met) if last_met else None
    except Exception:
        last_met_date = None
    if seconds >= goal:
        if last_met_date != yesterday:
            streak = user.get("streak", 0)
            ns = streak + 1 if last_met_date == yesterday - timedelta(days=1) else 1
            await _credit_streak_day(user_id, ns, yesterday)
    else:
        await db.users.update_one({"user_id": user_id}, {"$set": {"streak": 0}})
        await recompute_user_accuracy(user_id)
        if email:
            try:
                await send_brevo_email(
                    email,
                    "Do not break your study streak!",
                    "You missed yesterday goal. Study today to start a new streak!")
            except Exception as e:
                logger.warning(f"Streak email failed: {e}")
        await create_notification(
            user_id,
            "You missed yesterday goal. Study today to start a new streak!",
            "reminder", "/study")
    await db.reminder_log.insert_one({
        "user_id": user_id, "date": yesterday.isoformat(),
        "sent_at": now.isoformat()})


async def _streak_evening_nudge(user: dict, today):
    user_id = user.get("user_id")
    email = user.get("email")
    now = datetime.utcnow()
    key = today.isoformat() + "_nudge"
    log = await db.reminder_log.find_one({"user_id": user_id, "date": key})
    if log:
        return
    seconds = await get_study_time_for_date(user_id, today)
    goal = parse_daily_commitment(user.get("daily_commitment", "1 hour"))
    if seconds < goal:
        left_min = max(1, (goal - seconds + 59) // 60)
        streak = user.get("streak", 0)
        msg = "Study reminder"
        detail = "minutes left to keep streak"
        try:
            note = str(left_min) + " " + detail + " " + str(streak)
        except Exception:
            note = msg
        if email:
            try:
                await send_brevo_email(email, "Your streak needs you tonight!", note)
            except Exception as e:
                logger.warning(f"Streak nudge email failed: {e}")
        await create_notification(user_id, note, "reminder", "/study")
    else:
        try:
            fresh = await db.users.find_one(
                {"user_id": user_id},
                {"_id": 0, "streak": 1, "last_goal_met_date": 1})
            last = (fresh or {}).get("last_goal_met_date")
            if last != today.isoformat():
                lm = date.fromisoformat(last) if last else None
                st = (fresh or {}).get("streak", 0)
                ns = st + 1 if lm == today - timedelta(days=1) else 1
                await _credit_streak_day(user_id, ns, today)
        except Exception as e:
            logger.warning(f"Streak credit failed: {e}")
    await db.reminder_log.insert_one({
        "user_id": user_id, "date": key, "sent_at": now.isoformat()})


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

# Study groups: models + helpers
# ============================================================

class StudyGroupIn(BaseModel):
    name: str
    description: Optional[str] = ""
    # Optional explicit level; students default to their own exam_level.
    exam_level: Optional[str] = None
    avatar: Optional[str] = None


class StudyGroupPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar: Optional[str] = None


def _study_group_public(g: dict, viewer_id: Optional[str] = None) -> dict:
    members = g.get("members") or []
    member_ids = [m.get("user_id") for m in members if isinstance(m, dict)]
    return {
        "group_id": g.get("group_id"),
        "name": g.get("name", "Study group"),
        "description": g.get("description", ""),
        "exam_level": g.get("exam_level", ""),
        "avatar": g.get("avatar"),
        "created_by": g.get("created_by"),
        "member_count": len(members),
        "is_member": (viewer_id in member_ids) if viewer_id else False,
        "is_admin": any(
            isinstance(m, dict) and m.get("user_id") == viewer_id
            and m.get("role") == "admin" for m in members
        ) if viewer_id else False,
        "my_status": next(
            (m.get("status", "member") for m in members
             if isinstance(m, dict) and m.get("user_id") == viewer_id),
            None,
        ),
        "members": [
            {
                "user_id": m.get("user_id"),
                "full_name": m.get("full_name", "Student"),
                "profile_photo": m.get("profile_photo"),
                "role": m.get("role", "member"),
                "status": m.get("status", "member"),
                "joined_at": m.get("joined_at"),
            }
            for m in members if isinstance(m, dict)
        ],
        "last_message": g.get("last_message"),
        "created_at": g.get("created_at"),
        "updated_at": g.get("updated_at"),
    }


def _require_group_member(group: dict, user_id: str) -> dict:
    for m in group.get("members") or []:
        if isinstance(m, dict) and m.get("user_id") == user_id:
            if m.get("status") in (None, "member"):
                return m
            raise HTTPException(403, "You are not an active member of this group")
    raise HTTPException(403, "You are not a member of this group")


def _require_group_admin(group: dict, user_id: str, user_role: str = ""):
    if user_role == "admin":
        return
    for m in group.get("members") or []:
        if (isinstance(m, dict) and m.get("user_id") == user_id
                and m.get("role") == "admin"):
            return
    raise HTTPException(403, "Group admins only")


async def _serialize_group_message(m: dict) -> dict:
    d = serialize(m)
    d.pop("sender_profile_photo", None)
    return d


# Per-group live sockets. Keyed by group_id -> {user_id -> WebSocket}.
# Runs over TCP (like every WebSocket) and carries text, voice-note
# references, paper attachments, highlights, typing and @GC-AI answers
# in real time.
_group_sockets: Dict[str, Dict[str, WebSocket]] = {}


async def _broadcast_group(group_id: str, payload: dict, exclude: Optional[str] = None):
    targets = list((_group_sockets.get(group_id) or {}).items())
    dead: List[str] = []
    for uid, ws in targets:
        if exclude is not None and uid == exclude:
            continue
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(uid)
    if dead:
        room = _group_sockets.get(group_id) or {}
        for uid in dead:
            room.pop(uid, None)
        if not room:
            _group_sockets.pop(group_id, None)


async def _notify_group_event(member_ids: List[str], message: str,
                              ntype: str, link: str):
    for uid in member_ids:
        try:
            await create_notification(uid, message, ntype, link)
        except Exception:
            continue


def _group_ai_history(messages: List[dict], limit: int = 12) -> str:
    recent = [m for m in messages if (m.get("kind") in ("text", "ai_answer"))][-limit:]
    lines = []
    for m in recent:
        who = "GC AI" if m.get("kind") == "ai_answer" else m.get("sender_name", "Student")
        body = (m.get("text") or "").strip()
        if body:
            lines.append(f"{who}: {body[:600]}")
    return "\n".join(lines)


async def _answer_group_ai(db, group: dict, question: str, asker: dict) -> Dict:
    """Answer a group question with the shared GC AI brain (non-streaming)."""
    history_docs = await db.study_group_messages.find(
        {"group_id": group["group_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(12)
    history_docs.reverse()
    outcome = await gc_ai.answer_question(
        db,
        question,
        subject="General",
        history_context=(
            f"Study group '{group.get('name')}' ({group.get('exam_level')}) "
            f"chat so far:\n{_group_ai_history(history_docs)}\n\n" if history_docs else ""
        ),
        profile_snapshot={
            "full_name": asker.get("full_name", "Student"),
            "exam_level": group.get("exam_level") or asker.get("exam_level") or "Not set",
            "subjects": asker.get("subjects", []),
            "group": group.get("name"),
        },
        use_local_solver=solve_math_local,
        use_gc_model=True,
    )
    return outcome




async def _store_group_message(group: dict, sender: dict, payload: dict) -> dict:
    kind = str(payload.get("kind") or "text").strip().lower()
    if kind not in ("text", "voice", "paper", "highlight", "question", "ai_answer"):
        raise HTTPException(400, "Unsupported message kind")
    text = str(payload.get("text") or "").strip()
    if kind == "text" and not text:
        raise HTTPException(400, "Message text is required")
    if kind == "text" and len(text) > 4000:
        text = text[:4000]
    meta: dict = {}
    if kind == "voice":
        url = str(payload.get("audio_url") or "").strip()
        if not url:
            raise HTTPException(400, "audio_url is required for voice notes")
        try:
            meta["duration_sec"] = max(1, int(float(payload.get("duration_sec") or 0)))
        except Exception:
            meta["duration_sec"] = 0
        meta["audio_url"] = url
        meta["transcript"] = str(payload.get("transcript") or "")[:2000]
    elif kind == "paper":
        paper_id = str(payload.get("paper_id") or "").strip()
        if not paper_id:
            raise HTTPException(400, "paper_id is required")
        paper = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
        if not paper:
            raise HTTPException(404, "Paper not found")
        meta.update({
            "paper_id": paper.get("paper_id"),
            "paper_title": paper.get("title", "Past paper"),
            "subject": paper.get("subject", ""),
            "year": paper.get("year"),
            "paper_number": paper.get("paper_number"),
            "level": paper.get("level", ""),
            "pdf_url": paper.get("pdf_url", ""),
        })
    elif kind in ("highlight", "question"):
        qtext = text or str(payload.get("question") or "").strip()
        if not qtext:
            raise HTTPException(400, "Question text is required")
        text = qtext[:2000]
        if payload.get("paper_id"):
            paper = await db.papers.find_one(
                {"paper_id": str(payload["paper_id"])}, {"_id": 0})
            if paper:
                meta.update({
                    "paper_id": paper.get("paper_id"),
                    "paper_title": paper.get("title", "Past paper"),
                    "subject": paper.get("subject", ""),
                    "year": paper.get("year"),
                    "paper_number": paper.get("paper_number"),
                })
        if payload.get("page") is not None:
            try:
                meta["page"] = int(payload["page"])
            except Exception:
                pass
    now = datetime.utcnow().isoformat()
    doc = {
        "message_id": f"sgm_{uuid.uuid4().hex[:12]}",
        "group_id": group["group_id"],
        "kind": kind,
        "sender_id": sender.get("user_id", "gc_ai") if kind != "ai_answer" else "gc_ai",
        "sender_name": sender.get("full_name", "Student") if kind != "ai_answer" else "GC AI",
        "sender_photo": sender.get("profile_photo") if kind != "ai_answer" else None,
        "text": text,
        "meta": meta,
        "created_at": now,
    }
    await db.study_group_messages.insert_one(dict(doc))
    preview = text[:80] if text else {
        "voice": "Voice note", "paper": "Shared a past paper",
        "highlight": "Shared a highlighted question",
        "question": "Asked a question",
        "ai_answer": "GC AI answered",
    }.get(kind, "New message")
    await db.study_groups.update_one(
        {"group_id": group["group_id"]},
        {"$set": {"updated_at": now,
                  "last_message": {"kind": kind, "text": preview,
                                   "sender_name": doc["sender_name"],
                                   "created_at": now}}})
    return serialize(doc)




async def _reply_group_ai(group: dict, trigger_msg: dict, asker: dict) -> dict:
    question = (trigger_msg.get("text") or "").strip()
    if question.lower().startswith("@ai"):
        question = question[3:].strip()
    if not question:
        return {}
    await _broadcast_group(group["group_id"], {"type": "ai_typing", "typing": True,
                                               "question": question[:160]})
    try:
        outcome = await _answer_group_ai(db, group, question, asker)
    except Exception as e:
        logger.warning(f"Group AI failed: {e}")
        outcome = {"answer": "I could not answer that just now - please try again.",
                   "source": "error", "learned": False}
    finally:
        await _broadcast_group(group["group_id"], {"type": "ai_typing", "typing": False})
    if outcome.get("source") == "gc_model_unavailable":
        # Clear retryable notice - never a silent external fallback.
        outcome = {
            "answer": ("The GCSharp model is unavailable right now, so I can't "
                       "generate a new answer. Please try again in a moment."),
            "source": "gc_model_unavailable", "learned": False,
        }
    ai_msg = await _store_group_message(
        group,
        {"user_id": "gc_ai", "full_name": "GC AI", "profile_photo": None},
        {"kind": "ai_answer",
         "text": str(outcome.get("answer") or "I could not answer that just now.")[:4000]})
    ai_msg["ai_source"] = outcome.get("source", "")
    ai_msg["ai_learned"] = bool(outcome.get("learned"))
    await _broadcast_group(group["group_id"], {"type": "message", "message": ai_msg})
    return ai_msg


async def _maybe_answer_group_ai(group_id: str, msg: dict, sender: dict):
    try:
        text = (msg.get("text") or "")
        if msg.get("kind") not in ("text", "highlight", "question"):
            return
        if not text.lower().lstrip().startswith("@ai"):
            return
        group = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
        if not group:
            return
        await _reply_group_ai(group, msg, sender)
    except Exception as e:
        logger.warning(f"Group AI auto-answer failed: {e}")



@api_router.get("/study-groups")
async def list_study_groups(user: dict = Depends(get_current_user)):
    mine = await db.study_groups.find(
        {"members.user_id": user["user_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    level = (user.get("exam_level") or "").strip()
    discover = []
    if level:
        discover = await db.study_groups.find(
            {"exam_level": level, "members.user_id": {"$ne": user["user_id"]}},
            {"_id": 0},
        ).sort("updated_at", -1).to_list(50)
    pending_out, pending_in = [], []
    if user.get("role") != "teacher":
        pending_out = await db.study_group_requests.find(
            {"user_id": user["user_id"], "status": "pending"}, {"_id": 0}
        ).to_list(100)
    else:
        pending_in = await db.study_group_requests.find(
            {"status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    return {
        "mine": [_study_group_public(g, user["user_id"]) for g in mine],
        "discover": [_study_group_public(g, user["user_id"]) for g in discover],
        "my_level": level,
        "pending_out": pending_out,
        "pending_in": pending_in,
    }


@api_router.post("/study-groups")
async def create_study_group(inp: StudyGroupIn, user: dict = Depends(get_current_user)):
    if user.get("role") == "teacher":
        raise HTTPException(403, "Study groups are for students")
    name = (inp.name or "").strip()
    if not name:
        raise HTTPException(400, "Group name is required")
    level = (inp.exam_level or user.get("exam_level") or "").strip()
    if not level:
        raise HTTPException(400, "Set your exam level first (Profile > Edit)")
    now = datetime.utcnow().isoformat()
    doc = {
        "group_id": f"sg_{uuid.uuid4().hex[:12]}",
        "name": name[:80],
        "description": (inp.description or "")[:500],
        "exam_level": level,
        "avatar": inp.avatar,
        "created_by": user["user_id"],
        "members": [{
            "user_id": user["user_id"],
            "full_name": user.get("full_name", "Student"),
            "profile_photo": user.get("profile_photo"),
            "role": "admin",
            "status": "member",
            "joined_at": now,
        }],
        "last_message": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.study_groups.insert_one(dict(doc))
    return {"group": _study_group_public(doc, user["user_id"])}

@api_router.get("/study-groups/{group_id}")
async def get_study_group(group_id: str, user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    if not any(isinstance(m, dict) and m.get("user_id") == user["user_id"]
               for m in g.get("members") or []):
        if (g.get("exam_level") or "") != (user.get("exam_level") or ""):
            raise HTTPException(403, "This group is for another exam level")
    return {"group": _study_group_public(g, user["user_id"])}


@api_router.get("/study-groups/{group_id}/messages")
async def list_group_messages(group_id: str, limit: int = 60,
                              before: Optional[str] = None,
                              user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_member(g, user["user_id"])
    q: dict = {"group_id": group_id}
    if before:
        q["created_at"] = {"$lt": before}
    docs = await db.study_group_messages.find(q, {"_id": 0}).sort(
        "created_at", -1).to_list(min(max(limit, 1), 100))
    docs.reverse()
    return {"items": [serialize(m) for m in docs]}


@api_router.post("/study-groups/{group_id}/messages")
async def post_group_message_http(group_id: str, payload: dict,
                                  user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_member(g, user["user_id"])
    msg = await _store_group_message(g, user, payload or {})
    await _broadcast_group(group_id, {"type": "message", "message": msg})
    asyncio.create_task(_maybe_answer_group_ai(group_id, msg, dict(user)))
    return {"message": msg}


@api_router.post("/study-groups/{group_id}/ask-ai")
async def ask_group_ai_http(group_id: str, payload: dict,
                            user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_member(g, user["user_id"])
    question = str((payload or {}).get("question") or (payload or {}).get("text") or "").strip()
    if not question:
        raise HTTPException(400, "Question is required")
    qmsg = await _store_group_message(g, user, {"kind": "text", "text": question})
    await _broadcast_group(group_id, {"type": "message", "message": qmsg})
    fresh = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    answer = await _reply_group_ai(fresh or g, qmsg, dict(user))
    return {"question": qmsg, "answer": answer}

@api_router.get("/study-groups/{group_id}/requests")
async def list_group_requests(group_id: str, user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    items = await db.study_group_requests.find(
        {"group_id": group_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


@api_router.post("/study-groups/{group_id}/requests")
async def request_join_group(group_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") == "teacher":
        raise HTTPException(403, "Study groups are for students")
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    if any(isinstance(m, dict) and m.get("user_id") == user["user_id"]
           for m in g.get("members") or []):
        return {"ok": True, "status": "member"}
    if (g.get("exam_level") or "") != (user.get("exam_level") or ""):
        raise HTTPException(403, "This group is for another exam level")
    existing = await db.study_group_requests.find_one(
        {"group_id": group_id, "user_id": user["user_id"]}, {"_id": 0})
    if existing and existing.get("status") == "pending":
        return {"ok": True, "status": "pending"}
    now = datetime.utcnow().isoformat()
    req = {
        "request_id": f"sgr_{uuid.uuid4().hex[:12]}",
        "group_id": group_id,
        "group_name": g.get("name", "Study group"),
        "user_id": user["user_id"],
        "full_name": user.get("full_name", "Student"),
        "profile_photo": user.get("profile_photo"),
        "exam_level": user.get("exam_level", ""),
        "status": "pending",
        "created_at": now,
    }
    await db.study_group_requests.update_one(
        {"group_id": group_id, "user_id": user["user_id"]},
        {"$set": req}, upsert=True)
    admins = [m.get("user_id") for m in g.get("members") or []
              if isinstance(m, dict) and m.get("role") == "admin"]
    await _broadcast_group(group_id, {"type": "join_request", "request": req})
    asyncio.create_task(_notify_group_event(
        admins, f"{req['full_name']} wants to join '{g.get('name')}'",
        "group_join_request", f"/study-groups/{group_id}"))
    return {"ok": True, "status": "pending"}

@api_router.post("/study-groups/{group_id}/requests/{request_id}")
async def decide_join_request(group_id: str, request_id: str, payload: dict,
                              user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    req = await db.study_group_requests.find_one(
        {"request_id": request_id, "group_id": group_id}, {"_id": 0})
    if not req or req.get("status") != "pending":
        raise HTTPException(404, "Request not found")
    action = str((payload or {}).get("action") or "").lower()
    if action not in ("approve", "reject"):
        raise HTTPException(400, "action must be approve or reject")
    if action == "reject":
        await db.study_group_requests.update_one(
            {"request_id": request_id}, {"$set": {"status": "rejected"}})
        await _broadcast_group(group_id, {"type": "request_decided",
                                          "request_id": request_id, "action": "reject"})
        return {"ok": True, "action": "reject"}
    now = datetime.utcnow().isoformat()
    await db.study_group_requests.update_one(
        {"request_id": request_id}, {"$set": {"status": "approved"}})
    if not any(isinstance(m, dict) and m.get("user_id") == req["user_id"]
               for m in g.get("members") or []):
        await db.study_groups.update_one(
            {"group_id": group_id},
            {"$push": {"members": {
                "user_id": req["user_id"],
                "full_name": req.get("full_name", "Student"),
                "profile_photo": req.get("profile_photo"),
                "role": "member", "status": "member", "joined_at": now}},
             "$set": {"updated_at": now}})
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    await _broadcast_group(group_id, {
        "type": "member_joined",
        "member": {"user_id": req["user_id"],
                   "full_name": req.get("full_name", "Student"),
                   "profile_photo": req.get("profile_photo")},
        "group": _study_group_public(g, None),
    })
    asyncio.create_task(_notify_group_event(
        [req["user_id"]], f"You joined '{g.get('name')}'", "group_joined",
        f"/study-groups/{group_id}"))
    return {"ok": True, "action": "approve"}


@api_router.post("/study-groups/{group_id}/invite")
async def invite_group_member(group_id: str, payload: dict,
                              user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    target_id = str((payload or {}).get("user_id") or "").strip()
    if not target_id:
        raise HTTPException(400, "user_id is required")
    target = await db.users.find_one({"user_id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Student not found")
    if target.get("role") == "teacher":
        raise HTTPException(403, "Study groups are for students")
    if (target.get("exam_level") or "") != (g.get("exam_level") or ""):
        raise HTTPException(403, "That student is in a different exam level")
    if any(isinstance(m, dict) and m.get("user_id") == target_id
           for m in g.get("members") or []):
        return {"ok": True, "status": "member"}
    now = datetime.utcnow().isoformat()
    await db.study_groups.update_one(
        {"group_id": group_id},
        {"$push": {"members": {
            "user_id": target_id,
            "full_name": target.get("full_name", "Student"),
            "profile_photo": target.get("profile_photo"),
            "role": "member", "status": "member", "joined_at": now}},
         "$set": {"updated_at": now}})
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    await _broadcast_group(group_id, {
        "type": "member_joined",
        "member": {"user_id": target_id,
                   "full_name": target.get("full_name", "Student"),
                   "profile_photo": target.get("profile_photo")},
        "group": _study_group_public(g, None),
    })
    asyncio.create_task(_notify_group_event(
        [target_id], f"You were added to '{g.get('name')}'", "group_joined",
        f"/study-groups/{group_id}"))
    return {"ok": True, "status": "member"}

@api_router.get("/study-groups/{group_id}/candidates")
async def list_group_candidates(group_id: str, q: Optional[str] = None,
                                user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    member_ids = {m.get("user_id") for m in g.get("members") or [] if isinstance(m, dict)}
    query: dict = {"role": {"$ne": "teacher"}, "exam_level": g.get("exam_level")}
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"email": rx}]
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(50)
    return {"items": [
        {"user_id": d.get("user_id"), "full_name": d.get("full_name", "Student"),
         "email": d.get("email", ""), "profile_photo": d.get("profile_photo"),
         "exam_level": d.get("exam_level", "")}
        for d in docs if d.get("user_id") not in member_ids][:30]}


@api_router.post("/study-groups/{group_id}/leave")
async def leave_study_group(group_id: str, user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    member = next((m for m in g.get("members") or []
                   if isinstance(m, dict) and m.get("user_id") == user["user_id"]), None)
    if not member:
        return {"ok": True}
    remaining = [m for m in g.get("members") or []
                 if not (isinstance(m, dict) and m.get("user_id") == user["user_id"])]
    if not remaining:
        await db.study_groups.delete_one({"group_id": group_id})
        await db.study_group_messages.delete_many({"group_id": group_id})
        await db.study_group_requests.delete_many({"group_id": group_id})
        await _broadcast_group(group_id, {"type": "group_deleted", "group_id": group_id})
        return {"ok": True, "deleted": True}
    if member.get("role") == "admin" and not any(
            isinstance(m, dict) and m.get("role") == "admin" for m in remaining):
        remaining[0]["role"] = "admin"
        await db.study_groups.update_one(
            {"group_id": group_id},
            {"$set": {"members": remaining,
                      "updated_at": datetime.utcnow().isoformat()}})
    else:
        await db.study_groups.update_one(
            {"group_id": group_id},
            {"$pull": {"members": {"user_id": user["user_id"]}},
             "$set": {"updated_at": datetime.utcnow().isoformat()}})
    await _broadcast_group(group_id, {"type": "member_left",
                                      "user_id": user["user_id"]})
    return {"ok": True}


@api_router.patch("/study-groups/{group_id}")
async def patch_study_group(group_id: str, inp: StudyGroupPatch,
                            user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    patch = {}
    if inp.name is not None and inp.name.strip():
        patch["name"] = inp.name.strip()[:80]
    if inp.description is not None:
        patch["description"] = inp.description[:500]
    if inp.avatar is not None:
        patch["avatar"] = inp.avatar
    if not patch:
        return {"group": _study_group_public(g, user["user_id"])}
    patch["updated_at"] = datetime.utcnow().isoformat()
    await db.study_groups.update_one({"group_id": group_id}, {"$set": patch})
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    await _broadcast_group(group_id, {"type": "group_updated",
                                      "group": _study_group_public(g, None)})
    return {"group": _study_group_public(g, user["user_id"])}

@api_router.websocket("/ws/study-groups/{group_id}")
async def websocket_study_group(websocket: WebSocket, group_id: str,
                                token: Optional[str] = None,
                                user_id: Optional[str] = None):
    user: Optional[dict] = None
    if token:
        try:
            user = await get_current_user(f"Bearer {token}")
        except HTTPException:
            user = None
    if user is None and user_id:
        doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if doc:
            doc.pop("password_hash", None)
            user = doc
    if user is None:
        await websocket.close(code=1008)
        return
    group = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not group:
        await websocket.close(code=1008)
        return
    try:
        _require_group_member(group, user["user_id"])
    except HTTPException:
        await websocket.close(code=1008)
        return
    room = _group_sockets.setdefault(group_id, {})
    room[user["user_id"]] = websocket
    try:
        await websocket.accept()
    except Exception:
        room.pop(user["user_id"], None)
        return
    await websocket.send_json({
        "type": "ready",
        "group": _study_group_public(group, user["user_id"]),
        "online_count": len(room),
        "online_ids": sorted(room.keys()),
    })
    await _broadcast_group(group_id, {
        "type": "presence", "user_id": user["user_id"],
        "online_count": len(room),
        "online_ids": sorted(room.keys()),
    }, exclude=user["user_id"])
    try:
        while True:
            data = await websocket.receive_json()
            etype = str(data.get("type") or "").strip().lower()
            if etype == "ping":
                await websocket.send_json({"type": "pong"})
            elif etype == "typing":
                await _broadcast_group(group_id, {
                    "type": "typing", "user_id": user["user_id"],
                    "full_name": user.get("full_name", "Student"),
                    "typing": bool(data.get("typing", True)),
                }, exclude=user["user_id"])
            elif etype in ("send", "ask_ai"):
                try:
                    fresh = await db.study_groups.find_one(
                        {"group_id": group_id}, {"_id": 0})
                    if not fresh:
                        await websocket.send_json({"type": "error",
                                                   "message": "Group no longer exists"})
                        continue
                    _require_group_member(fresh, user["user_id"])
                    if etype == "ask_ai":
                        question = str(data.get("question") or data.get("text") or "").strip()
                        if not question:
                            await websocket.send_json({"type": "error",
                                                       "message": "Question is required"})
                            continue
                        qmsg = await _store_group_message(
                            fresh, user, {"kind": "text", "text": question})
                        await _broadcast_group(group_id, {"type": "message",
                                                          "message": qmsg})
                        asyncio.create_task(_reply_group_ai(fresh, qmsg, dict(user)))
                    else:
                        msg = await _store_group_message(fresh, user, data)
                        await _broadcast_group(group_id, {"type": "message",
                                                          "message": msg})
                        asyncio.create_task(
                            _maybe_answer_group_ai(group_id, msg, dict(user)))
                except HTTPException as e:
                    await websocket.send_json({"type": "error",
                                               "message": e.detail})
                except Exception as e:
                    logger.warning(f"Group WS event failed: {e}")
                    await websocket.send_json({"type": "error",
                                               "message": "Could not send message"})
            else:
                await websocket.send_json({"type": "error",
                                           "message": "Unknown event"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"Group WS error: {e}")
    finally:
        room.pop(user["user_id"], None)
        if not room:
            _group_sockets.pop(group_id, None)
        else:
            try:
                await _broadcast_group(group_id, {
                    "type": "presence", "user_id": user["user_id"],
                    "online_count": len(room),
                    "online_ids": sorted(room.keys()),
                })
            except Exception:
                pass


@api_router.get("/users/peers")
async def list_peer_students(q: Optional[str] = None, limit: int = 30,
                             user: dict = Depends(get_current_user)):
    query: dict = {"role": {"$ne": "teacher"}}
    if user.get("role") != "teacher" and user.get("exam_level"):
        query["exam_level"] = user["exam_level"]
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"full_name": rx}, {"email": rx}]
    docs = await db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(
        min(max(limit, 1), 50))
    return {"items": [
        {"user_id": d.get("user_id"), "full_name": d.get("full_name", "Student"),
         "email": d.get("email", ""), "profile_photo": d.get("profile_photo"),
         "exam_level": d.get("exam_level", "")}
        for d in docs if d.get("user_id") != user["user_id"]][:30]}


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

# ============================================================
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


# ============================================================
# Phase 7: Learning feed router (reuses this server's db/manager/auth)
# ============================================================
try:
    from gc_feed import build_feed_router as _build_feed_router
    _feed_router = _build_feed_router(
        db=db, manager=manager, emit_event=emit_event,
        create_notification=create_notification,
        get_current_user=get_current_user,
        get_current_user_optional=get_current_user_optional,
        media_dir=str(FEED_MEDIA_DIR),
        media_base_url=(APP_URL.rstrip("/") + "/api/feed/media"),
    )
    api_router.include_router(_feed_router)
    print("Learning feed router mounted at /api/feed")
except Exception as _feed_err:
    print(f"Learning feed router failed to mount: {_feed_err}")


# ============================================================
# Phase 2: GCSharp model status + probe (operators + in-app retry UX)
# ============================================================

@api_router.get("/ai/model/status")
async def gc_model_status(probe: int = 0):
    """Status of the GCSharp personal model. ?probe=1 does a live call."""
    model = get_gc_model()
    if probe:
        st = await model.healthcheck()
    else:
        st = model.status()
    return {**st, "unavailable_reason": None if st.get("configured") else model.unavailable_reason()}


# ============================================================
# Phase 5: authenticated learning WebSocket + missed-event recovery
# ============================================================

@api_router.get("/realtime/events")
async def realtime_events(since: Optional[str] = None, limit: int = 50,
                          user: dict = Depends(get_current_user)):
    """Recover events missed while disconnected (persistent event log)."""
    limit = max(1, min(limit, 100))
    q: Dict = {"$or": [{"target_user_id": None},
                       {"target_user_id": user["user_id"]}]}
    if since:
        q["created_at"] = {"$gt": since}
    rows = await db.realtime_events.find(q, {"_id": 0}).sort(
        "created_at", -1).limit(limit).to_list(limit)
    return {"events": list(reversed(rows)),
            "server_time": datetime.utcnow().isoformat()}


@api_router.websocket("/ws/learning")
async def websocket_learning(websocket: WebSocket, token: str = None,
                             since: Optional[str] = None):
    """Authenticated real-time channel for feed + AI + video events.

    Auth: a valid JWT must be supplied as ?token= (browsers cannot send
    headers on websockets). Invalid/missing tokens close with 1008.
    On connect, events newer than ?since= are replayed from the persistent
    log so nothing important depends solely on an open socket.
    """
    user_id = None
    if token:
        try:
            decoded = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = decoded.get("sub")
        except Exception:
            user_id = None
    if not user_id:
        await websocket.close(code=1008, reason="unauthorized")
        return
    exists = await db.users.find_one({"user_id": user_id}, {"_id": 1})
    if not exists:
        await websocket.close(code=1008, reason="unauthorized")
        return

    await manager.connect(user_id, websocket)
    try:
        # Replay missed persistent events first (recovery after reconnect).
        try:
            q: Dict = {"$or": [{"target_user_id": None},
                               {"target_user_id": user_id}]}
            if since:
                q["created_at"] = {"$gt": since}
            missed = await db.realtime_events.find(q, {"_id": 0}).sort(
                "created_at", 1).limit(50).to_list(50)
            if missed:
                await websocket.send_json({"type": "replay", "events": missed})
            else:
                await websocket.send_json({"type": "ready", "user_id": user_id})
        except Exception:
            pass
        while True:
            raw = await websocket.receive_text()
            # Validate inbound frames; keep-alives and acks only.
            try:
                msg = json.loads(raw) if raw.startswith("{") else {"type": raw}
            except Exception:
                continue
            mtype = str(msg.get("type", ""))
            if mtype == "ping":
                try:
                    await websocket.send_json({"type": "pong",
                                               "ts": datetime.utcnow().isoformat()})
                except Exception:
                    break
            elif mtype == "ack":
                # Client confirms it persisted an event; optional bookkeeping.
                continue
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:
        manager.disconnect(user_id, websocket)


# ============================================================
# Phase 6: notification history helpers (read/unread state + badge count)
# ============================================================

@api_router.get("/notifications/unread-count")
async def notifications_unread_count(user: dict = Depends(get_current_user)):
    n = await db.notifications.count_documents(
        {"user_id": user["user_id"], "read": False})
    return {"unread": n}


@api_router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str,
                              user: dict = Depends(get_current_user)):
    res = await db.notifications.delete_one(
        {"_id": ObjectId(notification_id), "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"deleted": True}


# ============================================================
# Phase 3: knowledge growth - observability + controlled triggers
# ============================================================

def _require_admin(user: dict) -> None:
    if user.get("role") not in ("admin", "teacher"):
        raise HTTPException(403, "Teachers and admins only")


@api_router.get("/ai/knowledge/growth/status")
async def knowledge_growth_status(user: dict = Depends(get_current_user)):
    """Summary of the continuous knowledge-growth pipeline."""
    total = await db.ai_knowledge.count_documents(
        {"source": "gc_knowledge_growth"})
    verified = await db.ai_knowledge.count_documents(
        {"source": "gc_knowledge_growth", "verification_status": "verified"})
    recent = await db.kg_runs.find({}, {"_id": 0}).sort(
        "started_at", -1).limit(5).to_list(5)
    kb_total = await db.ai_knowledge.count_documents({})
    return {"ingested_total": total, "verified_total": verified,
            "kb_total": kb_total, "recent_runs": recent,
            "content_version": gc_kg.KG_CONTENT_VERSION,
            "schedule_hours": int(os.environ.get("KG_INTERVAL_HOURS", "6"))}


@api_router.post("/ai/knowledge/growth/run")
async def knowledge_growth_run(user: dict = Depends(get_current_user)):
    """Trigger one bounded knowledge-growth pass (teachers/admins).

    Non-blocking relative to other jobs: run_once has an internal lock, so a
    second call while one is running returns {skipped: true}.
    """
    _require_admin(user)
    summary = await gc_kg.run_once(db)
    return summary


@api_router.get("/ai/knowledge/entries")
async def knowledge_entries(status: Optional[str] = None, limit: int = 30,
                            user: dict = Depends(get_current_user)):
    """Browse stored knowledge with provenance (teachers/admins)."""
    _require_admin(user)
    limit = max(1, min(limit, 100))
    q: Dict = {}
    if status:
        q["verification_status"] = status
    rows = await db.ai_knowledge.find(q, {
        "_id": 0, "entry_id": 1, "question": 1, "subject": 1, "topic": 1,
        "level": 1, "source_url": 1, "source_title": 1, "verification_status": 1,
        "quality_score": 1, "content_version": 1, "created_at": 1,
        "retrieved_at": 1, "hits": 1,
    }).sort("created_at", -1).limit(limit).to_list(limit)
    return {"entries": rows}


# ============================================================
# Phase 4: controlled training - manual trigger + runs/checkpoints
# ============================================================

@api_router.get("/ai/training/status")
async def training_status(user: dict = Depends(get_current_user)):
    """What the training pipeline can do right now (honest reporting)."""
    return {
        "backend": gc_train.TR_BACKEND,
        "supports_fine_tune": gc_train.TrainingBackend.supports_fine_tune(),
        "description": gc_train.TrainingBackend.description(),
        "min_examples": gc_train.TR_MIN_EXAMPLES,
        "separation": ("knowledge ingestion updates MongoDB retrieval instantly; "
                       "weight training is a separate manual job"),
    }


@api_router.post("/ai/training/run")
async def training_run(user: dict = Depends(get_current_user)):
    """Start a controlled training run (teachers/admins, never in-request).

    If the dataset is too small or the runtime cannot fine-tune, the run
    reports exactly that - it never claims weights were updated.
    """
    _require_admin(user)
    return await gc_train.run_training(db, requested_by=user.get("full_name", "admin"))


@api_router.get("/ai/training/runs")
async def training_runs(limit: int = 20, user: dict = Depends(get_current_user)):
    _require_admin(user)
    return {"runs": await gc_train.list_runs(db, limit=max(1, min(limit, 50)))}


@api_router.get("/ai/training/checkpoints")
async def training_checkpoints(user: dict = Depends(get_current_user)):
    _require_admin(user)
    return {"checkpoints": await gc_train.list_checkpoints(db)}


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