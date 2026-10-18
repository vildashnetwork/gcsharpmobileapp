"""
GCSharp Learning Feed (Phase 1).

A dedicated feed where students post educational questions, text, images and
short videos, and receive AI-generated explanations with clickable citations.

Design notes:
  * Reuses the existing auth (get_current_user), MongoDB `db`, the WebSocket
    `manager`/`emit_event` for real-time updates, and `create_notification`
    for pushes - no competing subsystems.
  * All content is validated; uploads are size/type restricted and stored on
    disk under /api/feed/media. Endpoints enforce authorization and per-user
    rate limits to deter abuse.
  * AI explanations come from the GCSharp personal model (Phase 2) with real
    source citations; there is no external-LLM fallback.

Collections: feed_posts, feed_comments, feed_likes, feed_saves.
"""

from __future__ import annotations

import logging
import os
import re
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, Field

logger = logging.getLogger("gc_feed")

# ------------------------------------------------------------
# Validation limits
# ------------------------------------------------------------

MAX_POSTS_PER_USER_PER_HOUR = 20
MAX_COMMENTS_PER_USER_PER_HOUR = 60
MAX_TEXT_LEN = 4000
MAX_TITLE_LEN = 160
MAX_IMAGE_BYTES = 8 * 1024 * 1024           # 8 MB for images
MAX_VIDEO_BYTES = 25 * 1024 * 1024          # 25 MB for short videos
MAX_MEDIA_PER_POST = 4

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".3gp"}
ALLOWED_IMAGE_MIME_PREFIX = "image/"
ALLOWED_VIDEO_MIME_PREFIX = "video/"
GENERIC_UPLOAD_MIMES = {"", "application/octet-stream", "binary/octet-stream"}
VIDEO_MIME_EXTENSIONS = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/3gpp": ".3gp",
}

VALID_QUESTION_TYPES = {"question", "concept", "past_paper", "discussion", "note"}
VALID_EXAM_LEVELS = {"GCE O Level", "GCE A Level", "HND", "Concours", "General"}


class FeedPostIn(BaseModel):
    title: str = Field(default="", max_length=MAX_TITLE_LEN)
    body: str = Field(default="", max_length=MAX_TEXT_LEN)
    subject: str = Field(default="General", max_length=80)
    topic: str = Field(default="", max_length=120)
    exam_level: str = Field(default="General", max_length=40)
    question_type: str = Field(default="question", max_length=30)


class FeedPostUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=MAX_TITLE_LEN)
    body: Optional[str] = Field(default=None, max_length=MAX_TEXT_LEN)
    subject: Optional[str] = Field(default=None, max_length=80)
    topic: Optional[str] = Field(default=None, max_length=120)
    exam_level: Optional[str] = Field(default=None, max_length=40)
    question_type: Optional[str] = Field(default=None, max_length=30)


class FeedCommentIn(BaseModel):
    body: str = Field(..., max_length=MAX_TEXT_LEN)
    parent_comment_id: Optional[str] = None


def _clean_text(s: Optional[str], limit: int) -> str:
    """Normalise user text: strip control chars, collapse whitespace, cap."""
    if not s:
        return ""
    s = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(s))
    s = re.sub(r"\s{3,}", " \n", s)
    return s.strip()[:limit]


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"



# ------------------------------------------------------------
# In-memory rate limiter (per user, sliding window). Bounded so it cannot
# grow without limit; entries are pruned opportunistically.
# ------------------------------------------------------------

_rate_hits: Dict[str, List[float]] = {}
_RATE_MAX_KEYS = 20000


def _rate_limit(key: str, limit: int, window_seconds: int = 3600) -> bool:
    """Return True if the action is allowed, False if the limit is exceeded."""
    now = time.time()
    cutoff = now - window_seconds
    hits = _rate_hits.get(key)
    if hits is None:
        if len(_rate_hits) >= _RATE_MAX_KEYS:
            for k in list(_rate_hits):
                if not _rate_hits[k] or _rate_hits[k][-1] < cutoff:
                    _rate_hits.pop(k, None)
            if len(_rate_hits) >= _RATE_MAX_KEYS:
                _rate_hits.clear()
        hits = []
        _rate_hits[key] = hits
    while hits and hits[0] < cutoff:
        hits.pop(0)
    if len(hits) >= limit:
        return False
    hits.append(now)
    return True


def classify_upload(content_type: str, filename: str) -> Optional[str]:
    """Return 'image' | 'video' | None based on MIME + extension.

    Specific MIME types must match the extension. Generic mobile picker MIME
    values can use the allowlisted extension; upload magic bytes are checked
    separately before the file is stored.
    """
    ct = (content_type or "").lower()
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in ALLOWED_IMAGE_EXT:
        if ct in GENERIC_UPLOAD_MIMES or ct.startswith(ALLOWED_IMAGE_MIME_PREFIX):
            return "image"
    if ext in ALLOWED_VIDEO_EXT:
        if ct in GENERIC_UPLOAD_MIMES or ct.startswith(ALLOWED_VIDEO_MIME_PREFIX):
            return "video"
    if not ext and ct in VIDEO_MIME_EXTENSIONS:
        return "video"
    return None


def _magic_ok(kind: str, head: bytes) -> bool:
    """Lightweight magic-byte check so real files match their claimed type."""
    if not head:
        return False
    if kind == "image":
        return (head[:3] == b"\xff\xd8\xff"
                or head[:8] == b"\x89PNG\r\n\x1a\n"
                or head[:6] in (b"GIF87a", b"GIF89a")
                or (head[:4] == b"RIFF" and head[8:12] == b"WEBP"))
    if kind == "video":
        return head[4:8] == b"ftyp" or head[:4] == b"\x1a\x45\xdf\xa3"
    return False


def _safe_upload_name(original: str, ext: str) -> str:
    """Build a collision-resistant, traversal-safe filename."""
    base = re.sub(r"[^A-Za-z0-9_-]", "", (original or "media"))[:40] or "media"
    return f"{base}_{uuid.uuid4().hex[:12]}{ext}"


async def _author_public(db, user_id: str) -> Dict[str, Any]:
    """Fetch a compact, safe author profile for feed rendering."""
    u = await db.users.find_one({"user_id": user_id},
                                {"_id": 0, "user_id": 1, "full_name": 1,
                                 "profile_photo": 1, "role": 1, "level": 1})
    if not u:
        return {"user_id": user_id, "full_name": "Student", "profile_photo": None}
    return {
        "user_id": u.get("user_id", user_id),
        "full_name": u.get("full_name") or "Student",
        "profile_photo": u.get("profile_photo"),
        "role": u.get("role", "student"),
        "level": u.get("level", 1),
    }


async def _viewer_flags(db, post_id: str, user_id: str) -> Dict[str, bool]:
    like = await db.feed_likes.find_one({"post_id": post_id, "user_id": user_id})
    save = await db.feed_saves.find_one({"post_id": post_id, "user_id": user_id})
    return {"liked": like is not None, "saved": save is not None}


async def list_comments(db, post_id: str, viewer_id: str) -> List[Dict[str, Any]]:
    """Top-level comments with their replies, oldest-first."""
    cur = db.feed_comments.find({"post_id": post_id}).sort("created_at", 1)
    rows = await cur.to_list(500)
    by_parent: Dict[str, List[Dict]] = {}
    tops: List[Dict] = []
    for c in rows:
        parent = c.get("parent_comment_id")
        if parent:
            by_parent.setdefault(parent, []).append(c)
        else:
            tops.append(c)

    async def shape(c: Dict[str, Any]) -> Dict[str, Any]:
        cid = c.get("comment_id", "")
        author = c.get("author") or await _author_public(db, c.get("author_id", ""))
        replies = [await shape(r) for r in by_parent.get(cid, [])]
        return {
            "comment_id": cid,
            "body": c.get("body", ""),
            "author": author,
            "parent_comment_id": c.get("parent_comment_id"),
            "created_at": c.get("created_at", ""),
            "is_author": c.get("author_id") == viewer_id,
            "replies": replies,
        }

    return [await shape(c) for c in tops]


async def serialize_post(db, doc: Dict[str, Any], viewer_id: str,
                         include_comments: bool = False) -> Dict[str, Any]:
    """Shape a feed_posts document for the app, with author + viewer state."""
    if not doc:
        return {}
    post_id = doc.get("post_id", "")
    out = {
        "post_id": post_id,
        "title": doc.get("title", ""),
        "body": doc.get("body", ""),
        "subject": doc.get("subject", "General"),
        "topic": doc.get("topic", ""),
        "exam_level": doc.get("exam_level", "General"),
        "question_type": doc.get("question_type", "question"),
        "media": doc.get("media", []),
        "author": doc.get("author") or await _author_public(db, doc.get("author_id", "")),
        "like_count": doc.get("like_count", 0),
        "comment_count": doc.get("comment_count", 0),
        "share_count": doc.get("share_count", 0),
        "view_count": doc.get("view_count", 0),
        "ai_answer": doc.get("ai_answer"),
        "ai_citations": doc.get("ai_citations", []),
        "ai_status": doc.get("ai_status", "none"),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
    }
    if viewer_id:
        out.update(await _viewer_flags(db, post_id, viewer_id))
    else:
        out.update({"liked": False, "saved": False})
    if include_comments:
        out["comments"] = await list_comments(db, post_id, viewer_id)
    return out


async def _generate_ai_answer(db, post: Dict[str, Any],
                              emit_event=None,
                              create_notification=None) -> None:
    """Attach a GCSharp-model explanation + citations to a post (Phase 2).

    Runs the post body/question through the tutor brain (KB -> research ->
    GCSharp model). No external LLM. On model-unavailable the post is marked
    so the app can offer a Retry without fabricating an answer.
    """
    import gc_ai_engine as gc_ai

    post_id = post.get("post_id")
    query = _clean_text((post.get("title", "") + "\n" + post.get("body", "")), 2000)
    if not query:
        return
    await db.feed_posts.update_one({"post_id": post_id},
                                   {"$set": {"ai_status": "generating",
                                             "updated_at": datetime.utcnow().isoformat()}})
    if emit_event:
        await emit_event("ai_answer", {"post_id": post_id,
                                       "status": "generating"}, topic="feed")
    try:
        outcome = await gc_ai.answer_question(
            db, query, subject=post.get("subject", "General"),
            allow_web_learning=True, use_gc_model=True)
    except Exception as e:  # defensive: never break the request path
        logger.error(f"AI answer error for post {post_id}: {e}")
        await db.feed_posts.update_one(
            {"post_id": post_id},
            {"$set": {"ai_status": "error", "ai_error": str(e)[:200],
                      "updated_at": datetime.utcnow().isoformat()}})
        if emit_event:
            await emit_event("ai_answer", {"post_id": post_id,
                                           "status": "error"}, topic="feed")
        return

    if outcome.get("source") == "gc_model_unavailable":
        await db.feed_posts.update_one(
            {"post_id": post_id},
            {"$set": {"ai_status": "unavailable",
                      "ai_error": (outcome.get("error") or "")[:300],
                      "updated_at": datetime.utcnow().isoformat()}})
        if emit_event:
            await emit_event("ai_answer", {"post_id": post_id,
                                           "status": "unavailable"}, topic="feed")
        return

    answer = (outcome.get("answer") or "").strip()
    if not answer:
        logger.error("GCSharp returned an empty answer for post %s", post_id)
        await db.feed_posts.update_one(
            {"post_id": post_id},
            {"$set": {"ai_status": "error",
                      "ai_error": "GCSharp returned an empty explanation.",
                      "updated_at": datetime.utcnow().isoformat()}})
        if emit_event:
            await emit_event("ai_answer", {"post_id": post_id,
                                           "status": "error"}, topic="feed")
        return

    await db.feed_posts.update_one(
        {"post_id": post_id},
        {"$set": {"ai_answer": answer,
                  "ai_citations": outcome.get("citations", []),
                  "ai_source": outcome.get("source", ""),
                  "ai_status": "ready",
                  "updated_at": datetime.utcnow().isoformat()}})
    if emit_event:
        await emit_event("ai_answer", {"post_id": post_id,
                                       "status": "ready"}, topic="feed")
    if create_notification and post.get("author_id"):
        try:
            await create_notification(
                post["author_id"],
                "GC AI added an explanation to your learning post.",
                "ai_answer", link=f"/feed/{post_id}")
        except Exception as e:
            logger.warning("AI answer notification failed for post %s: %s",
                           post_id, e)


# ------------------------------------------------------------
# Router factory: the host server injects db, manager, emit_event,
# create_notification and the auth dependencies so we reuse them directly.
# ------------------------------------------------------------

def build_feed_router(*, db, manager, emit_event, create_notification,
                      get_current_user, get_current_user_optional,
                      media_dir: str, media_base_url: str):
    router = APIRouter(prefix="/feed", tags=["learning-feed"])

    # ---------------- create post ----------------
    @router.post("/posts")
    async def create_post(payload: FeedPostIn,
                          user: dict = Depends(get_current_user)):
        uid = user["user_id"]
        if not _rate_limit(f"post:{uid}", MAX_POSTS_PER_USER_PER_HOUR):
            raise HTTPException(429, "You are posting too quickly. Try again later.")
        title = _clean_text(payload.title, MAX_TITLE_LEN)
        body = _clean_text(payload.body, MAX_TEXT_LEN)
        if not title and not body:
            raise HTTPException(400, "A post needs a title or some content.")
        qtype = payload.question_type if payload.question_type in VALID_QUESTION_TYPES else "question"
        level = payload.exam_level if payload.exam_level in VALID_EXAM_LEVELS else "General"
        now = datetime.utcnow().isoformat()
        doc = {
            "post_id": _new_id("post"),
            "author_id": uid,
            "author": await _author_public(db, uid),
            "title": title, "body": body,
            "subject": _clean_text(payload.subject, 80) or "General",
            "topic": _clean_text(payload.topic, 120),
            "exam_level": level, "question_type": qtype,
            "media": [], "like_count": 0, "comment_count": 0,
            "share_count": 0, "view_count": 0,
            "ai_answer": None, "ai_citations": [], "ai_status": "pending",
            "created_at": now, "updated_at": now,
        }
        await db.feed_posts.insert_one(dict(doc))
        try:
            await emit_event("feed:new_post",
                             {"post_id": doc["post_id"], "title": title,
                              "subject": doc["subject"]}, topic="feed")
        except Exception:
            pass
        import asyncio
        asyncio.create_task(_generate_ai_answer(db, doc, emit_event,
                                                 create_notification))
        return await serialize_post(db, doc, uid)

    # ---------------- upload media ----------------
    @router.post("/posts/{post_id}/media")
    async def upload_media(post_id: str, file: UploadFile,
                           user: dict = Depends(get_current_user)):
        uid = user["user_id"]
        if not _rate_limit(f"media:{uid}", 40):
            raise HTTPException(429, "Too many uploads. Try again later.")
        post = await db.feed_posts.find_one({"post_id": post_id})
        if not post:
            raise HTTPException(404, "Post not found")
        if post.get("author_id") != uid and user.get("role") not in ("teacher", "admin"):
            raise HTTPException(403, "You can only add media to your own post.")
        kind = classify_upload(file.content_type, file.filename or "")
        if not kind:
            raise HTTPException(
                415,
                "Unsupported type. Use JPG/PNG/WEBP/GIF images or "
                "MP4/MOV/M4V/WEBM/3GP videos.",
            )
        cap = MAX_IMAGE_BYTES if kind == "image" else MAX_VIDEO_BYTES
        if len(post.get("media", [])) >= MAX_MEDIA_PER_POST:
            raise HTTPException(409, f"A post can have at most {MAX_MEDIA_PER_POST} media files.")
        chunks = []
        total_bytes = 0
        while True:
            chunk = await file.read(min(64 * 1024, cap + 1 - total_bytes))
            if not chunk:
                break
            total_bytes += len(chunk)
            if total_bytes > cap:
                raise HTTPException(413, f"{kind.title()} too large (max {cap // (1024*1024)} MB).")
            chunks.append(chunk)
        if not total_bytes:
            raise HTTPException(400, "Empty file.")
        content = b"".join(chunks)
        if not _magic_ok(kind, content[:16]):
            raise HTTPException(415, "File content does not match its declared type.")
        ext = os.path.splitext(file.filename or "")[1].lower()
        if not ext:
            ext = VIDEO_MIME_EXTENSIONS.get((file.content_type or "").lower(), "")
        name = _safe_upload_name(file.filename, ext)
        with open(os.path.join(media_dir, name), "wb") as fh:
            fh.write(content)
        entry = {"type": kind, "url": f"{media_base_url}/{name}",
                 "name": (file.filename or name)[:80]}
        await db.feed_posts.update_one(
            {"post_id": post_id},
            {"$push": {"media": entry},
             "$set": {"updated_at": datetime.utcnow().isoformat()}})
        await emit_event("feed:media_updated",
                         {"post_id": post_id}, topic="feed")
        return entry

    # ---------------- list / search / filter ----------------
    @router.get("/posts")
    async def list_posts(cursor: Optional[str] = None, limit: int = 20,
                         subject: Optional[str] = None, topic: Optional[str] = None,
                         exam_level: Optional[str] = None,
                         question_type: Optional[str] = None, q: Optional[str] = None,
                         sort: str = "recent",
                         user: dict = Depends(get_current_user_optional)):
        limit = max(1, min(limit, 50))
        query: Dict[str, Any] = {}
        if subject:
            query["subject"] = subject
        if topic:
            query["topic"] = topic
        if exam_level:
            query["exam_level"] = exam_level
        if question_type:
            query["question_type"] = question_type
        if q:
            query["$text"] = {"$search": q}
        if cursor:
            query["created_at"] = {"$lt": cursor}
        sort_key = ([("like_count", -1), ("created_at", -1)] if sort == "top"
                    else [("created_at", -1)])
        rows = await db.feed_posts.find(query, {"_id": 0}).sort(sort_key) \
                                  .limit(limit + 1).to_list(limit + 1)
        has_more = len(rows) > limit
        rows = rows[:limit]
        viewer = user["user_id"] if user else ""
        items = [await serialize_post(db, r, viewer) for r in rows]
        next_cursor = rows[-1]["created_at"] if has_more and rows else None
        return {"items": items, "next_cursor": next_cursor, "has_more": has_more}


    # ---------------- post detail ----------------
    @router.get("/posts/{post_id}")
    async def get_post(post_id: str,
                       user: dict = Depends(get_current_user_optional)):
        doc = await db.feed_posts.find_one({"post_id": post_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Post not found")
        # Count a view (best-effort; not deduped per user to stay cheap).
        await db.feed_posts.update_one({"post_id": post_id},
                                       {"$inc": {"view_count": 1}})
        viewer = user["user_id"] if user else ""
        return await serialize_post(db, doc, viewer, include_comments=True)

    # ---------------- edit / delete own posts ----------------
    @router.patch("/posts/{post_id}")
    async def update_post(post_id: str, payload: FeedPostUpdate,
                          user: dict = Depends(get_current_user)):
        post = await db.feed_posts.find_one({"post_id": post_id})
        if not post:
            raise HTTPException(404, "Post not found")
        if post.get("author_id") != user["user_id"] and user.get("role") != "admin":
            raise HTTPException(403, "You can only edit your own post.")

        supplied = payload.dict(exclude_unset=True)
        if not supplied:
            raise HTTPException(400, "Provide at least one field to update.")
        if "question_type" in supplied and supplied["question_type"] not in VALID_QUESTION_TYPES:
            raise HTTPException(422, "Invalid question type.")
        if "exam_level" in supplied and supplied["exam_level"] not in VALID_EXAM_LEVELS:
            raise HTTPException(422, "Invalid exam level.")

        limits = {
            "title": MAX_TITLE_LEN, "body": MAX_TEXT_LEN, "subject": 80,
            "topic": 120, "exam_level": 40, "question_type": 30,
        }
        updates = {
            key: _clean_text(value, limits[key]) if value is not None else ""
            for key, value in supplied.items()
        }
        resulting_title = updates.get("title", post.get("title", ""))
        resulting_body = updates.get("body", post.get("body", ""))
        if not resulting_title and not resulting_body:
            raise HTTPException(400, "A post needs a title or some content.")

        updates["updated_at"] = datetime.utcnow().isoformat()
        content_changed = bool(
            set(supplied).intersection(
                {"title", "body", "subject", "topic", "exam_level", "question_type"}
            )
        )
        if content_changed:
            updates.update({
                "ai_answer": None,
                "ai_citations": [],
                "ai_status": "pending",
                "ai_error": None,
            })
        await db.feed_posts.update_one({"post_id": post_id}, {"$set": updates})
        updated = await db.feed_posts.find_one({"post_id": post_id}, {"_id": 0})
        if not updated:
            raise HTTPException(404, "Post not found")

        try:
            await emit_event("feed:post_updated", {"post_id": post_id}, topic="feed")
        except Exception as e:
            logger.warning("Feed post update event failed for %s: %s", post_id, e)

        if content_changed:
            import asyncio
            asyncio.create_task(_generate_ai_answer(
                db, updated, emit_event, create_notification))
        return await serialize_post(db, updated, user["user_id"])

    @router.delete("/posts/{post_id}")
    async def delete_post(post_id: str, user: dict = Depends(get_current_user)):
        post = await db.feed_posts.find_one({"post_id": post_id})
        if not post:
            raise HTTPException(404, "Post not found")
        if post.get("author_id") != user["user_id"] and user.get("role") != "admin":
            raise HTTPException(403, "You can only delete your own post.")

        await db.feed_posts.delete_one({"post_id": post_id})
        await db.feed_comments.delete_many({"post_id": post_id})
        await db.feed_likes.delete_many({"post_id": post_id})
        await db.feed_saves.delete_many({"post_id": post_id})

        media_root = os.path.realpath(media_dir)
        for item in post.get("media", []):
            filename = os.path.basename(str(item.get("url") or "").split("?", 1)[0])
            if not filename:
                continue
            path = os.path.realpath(os.path.join(media_root, filename))
            if os.path.commonpath((media_root, path)) != media_root:
                continue
            try:
                os.remove(path)
            except FileNotFoundError:
                pass
            except OSError as e:
                logger.warning("Could not remove feed media %s: %s", filename, e)

        try:
            await emit_event("feed:post_deleted", {"post_id": post_id}, topic="feed")
        except Exception as e:
            logger.warning("Feed post deletion event failed for %s: %s", post_id, e)
        return {"deleted": True, "post_id": post_id}

    # ---------------- like / save (toggles) ----------------
    async def _toggle(db_col, count_field: str, post_id: str, uid: str):
        post = await db.feed_posts.find_one({"post_id": post_id})
        if not post:
            raise HTTPException(404, "Post not found")
        existing = await db_col.find_one({"post_id": post_id, "user_id": uid})
        if existing:
            await db_col.delete_one({"_id": existing["_id"]})
            await db.feed_posts.update_one({"post_id": post_id},
                                           {"$inc": {count_field: -1}})
            active = False
        else:
            try:
                await db_col.insert_one({"post_id": post_id, "user_id": uid,
                                         "created_at": datetime.utcnow().isoformat()})
            except Exception:
                pass  # unique index race = already liked
            await db.feed_posts.update_one({"post_id": post_id},
                                           {"$inc": {count_field: 1}})
            active = True
        fresh = await db.feed_posts.find_one({"post_id": post_id}, {"_id": 0})
        return {"active": active,
                "count": fresh.get(count_field, 0) if fresh else 0}

    @router.post("/posts/{post_id}/like")
    async def toggle_like(post_id: str, user: dict = Depends(get_current_user)):
        return await _toggle(db.feed_likes, "like_count", post_id, user["user_id"])

    @router.post("/posts/{post_id}/save")
    async def toggle_save(post_id: str, user: dict = Depends(get_current_user)):
        return await _toggle(db.feed_saves, "save_count", post_id, user["user_id"])

    @router.post("/posts/{post_id}/share")
    async def share_post(post_id: str, user: dict = Depends(get_current_user)):
        if not _rate_limit(f"share:{user['user_id']}", 60):
            raise HTTPException(429, "Too many shares. Try again later.")
        post = await db.feed_posts.find_one({"post_id": post_id})
        if not post:
            raise HTTPException(404, "Post not found")
        await db.feed_posts.update_one({"post_id": post_id},
                                       {"$inc": {"share_count": 1}})
        fresh = await db.feed_posts.find_one({"post_id": post_id}, {"_id": 0})
        # Notify the author that their post was shared.
        if post.get("author_id") and post["author_id"] != user["user_id"]:
            try:
                await create_notification(
                    post["author_id"],
                    f"{user.get('full_name', 'Someone')} shared your post: "
                    f"{(post.get('title') or post.get('body') or '')[:60]}",
                    "reply", link=f"/feed/{post_id}")
            except Exception:
                pass
        return {"share_count": fresh.get("share_count", 0) if fresh else 0}

    # ---------------- comments + replies ----------------
    @router.get("/posts/{post_id}/comments")
    async def get_comments(post_id: str,
                           user: dict = Depends(get_current_user_optional)):
        post = await db.feed_posts.find_one({"post_id": post_id}, {"_id": 1})
        if not post:
            raise HTTPException(404, "Post not found")
        viewer = user["user_id"] if user else ""
        return {"comments": await list_comments(db, post_id, viewer)}

    @router.post("/posts/{post_id}/comments")
    async def add_comment(post_id: str, payload: FeedCommentIn,
                          user: dict = Depends(get_current_user)):
        uid = user["user_id"]
        if not _rate_limit(f"comment:{uid}", MAX_COMMENTS_PER_USER_PER_HOUR):
            raise HTTPException(429, "You are commenting too quickly. Try again later.")
        body = _clean_text(payload.body, MAX_TEXT_LEN)
        if not body:
            raise HTTPException(400, "Comment cannot be empty.")
        post = await db.feed_posts.find_one({"post_id": post_id})
        if not post:
            raise HTTPException(404, "Post not found")
        parent_id = None
        if payload.parent_comment_id:
            parent = await db.feed_comments.find_one(
                {"comment_id": payload.parent_comment_id})
            if not parent or parent.get("post_id") != post_id:
                raise HTTPException(404, "Parent comment not found")
            parent_id = parent["comment_id"]
        doc = {
            "comment_id": _new_id("cmt"),
            "post_id": post_id,
            "author_id": uid,
            "author": await _author_public(db, uid),
            "body": body,
            "parent_comment_id": parent_id,
            "created_at": datetime.utcnow().isoformat(),
        }
        await db.feed_comments.insert_one(dict(doc))
        await db.feed_posts.update_one({"post_id": post_id},
                                       {"$inc": {"comment_count": 1}})
        # Real-time: broadcast to feed viewers + notify post author (not self).
        try:
            await emit_event("feed:new_comment",
                             {"post_id": post_id,
                              "comment_id": doc["comment_id"],
                              "preview": body[:100]}, topic="feed")
        except Exception:
            pass
        if post.get("author_id") and post["author_id"] != uid:
            try:
                await create_notification(
                    post["author_id"],
                    f"{user.get('full_name', 'Someone')} commented: {body[:80]}",
                    "reply", link=f"/feed/{post_id}")
            except Exception:
                pass
        return {k: v for k, v in doc.items() if k != "_id"}

    @router.delete("/comments/{comment_id}")
    async def delete_comment(comment_id: str,
                             user: dict = Depends(get_current_user)):
        c = await db.feed_comments.find_one({"comment_id": comment_id})
        if not c:
            raise HTTPException(404, "Comment not found")
        if c.get("author_id") != user["user_id"] and user.get("role") not in ("teacher", "admin"):
            raise HTTPException(403, "Not allowed to delete this comment.")
        # Remove the comment and any replies to it.
        ids = [comment_id]
        replies = await db.feed_comments.find(
            {"parent_comment_id": comment_id}, {"comment_id": 1}).to_list(200)
        ids += [r["comment_id"] for r in replies]
        res = await db.feed_comments.delete_many({"comment_id": {"$in": ids}})
        await db.feed_posts.update_one({"post_id": c.get("post_id")},
                                       {"$inc": {"comment_count": -res.deleted_count}})
        return {"deleted": res.deleted_count}

    # ---------------- AI explanation retry ----------------
    @router.post("/posts/{post_id}/ai/retry")
    async def retry_ai_answer(post_id: str,
                              user: dict = Depends(get_current_user)):
        post = await db.feed_posts.find_one({"post_id": post_id})
        if not post:
            raise HTTPException(404, "Post not found")
        if post.get("ai_status") == "generating":
            return {"ai_status": "generating"}
        if not _rate_limit(f"airetry:{user['user_id']}", 10, window_seconds=600):
            raise HTTPException(429, "Too many AI retries. Try again later.")
        import asyncio
        asyncio.create_task(_generate_ai_answer(db, post, emit_event,
                                                 create_notification))
        return {"ai_status": "generating"}

    # ---------------- my saved posts ----------------
    @router.get("/saved")
    async def list_saved(user: dict = Depends(get_current_user)):
        saves = await db.feed_saves.find(
            {"user_id": user["user_id"]}).sort("created_at", -1).limit(50).to_list(50)
        items = []
        for s in saves:
            doc = await db.feed_posts.find_one({"post_id": s.get("post_id")}, {"_id": 0})
            if doc:
                items.append(await serialize_post(db, doc, user["user_id"]))
        return {"items": items}

    # ---------------- filter facets (for UI dropdowns) ----------------
    @router.get("/facets")
    async def feed_facets():
        subjects = await db.feed_posts.distinct("subject")
        topics = await db.feed_posts.distinct("topic")
        return {"subjects": sorted([s for s in subjects if s]),
                "topics": sorted([t for t in topics if t])[:60],
                "exam_levels": sorted(VALID_EXAM_LEVELS),
                "question_types": sorted(VALID_QUESTION_TYPES)}

    return router
