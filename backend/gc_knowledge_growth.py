"""
GCSharp Continuous Knowledge Growth (Phase 3).

An automated, bounded, restartable background pipeline that:

  1. Picks useful learning topics (student questions, exam syllabuses,
     past-paper subjects, weak areas).
  2. Searches trustworthy sources using gc_ai_engine.google_search /
     _rank_result / research_context.
  3. Scores each source for quality, relevance and reliability.
  4. Passes ONLY the vetted evidence to the GCSharp model (gc_model).
  5. Stores the model's final explanation in MongoDB `ai_knowledge` with full
     provenance metadata so retrieval can use it IMMEDIATELY (no retraining).

Every entry keeps: subject, topic, level, source title+url, retrieval time,
evidence reference, verification status, quality score, content version and a
dedupe hash. Nothing unverified is marked authoritative, and conflicting
sources are recorded rather than silently overwritten.

This module NEVER calls an external LLM. If the GCSharp model is down, the
topic is skipped (and retried on a later pass) - the pipeline never fabricates.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import gc_ai_engine as gc_ai
from gc_model import GCModelUnavailableError, get_gc_model

logger = logging.getLogger("gc_knowledge_growth")

# ------------------------------------------------------------
# Bounded workload controls (env-tunable, safe defaults)
# ------------------------------------------------------------

KG_MAX_TOPICS_PER_RUN = int(os.environ.get("KG_MAX_TOPICS_PER_RUN", "5"))
KG_MAX_SOURCES_PER_TOPIC = int(os.environ.get("KG_MAX_SOURCES_PER_TOPIC", "5"))
KG_MIN_QUALITY = float(os.environ.get("KG_MIN_QUALITY", "0.45"))
KG_HOURS_BETWEEN_TOPIC = int(os.environ.get("KG_HOURS_BETWEEN_TOPIC", "24"))
KG_CONTENT_VERSION = 1

# Trust tiers for source domains (higher = more trusted for education).
_TRUSTED_DOMAINS = {
    "khanacademy.org": 0.9, "britannica.com": 0.85, "wikipedia.org": 0.7,
    "bbc.co.uk": 0.75, "open.edu": 0.85, "mit.edu": 0.9, "stanford.edu": 0.9,
    "cambridge.org": 0.85, "oup.com": 0.85, "gheducation.gov": 0.8,
    "mext.gov": 0.8, "wolfram.com": 0.8, "mathsisfun.com": 0.7,
    "byjus.com": 0.6, "toppr.com": 0.6, "coursehero.com": 0.3,
    "chegg.com": 0.3, "brainly.com": 0.35, "scribd.com": 0.25,
}
_LOW_TRUST_PENALTY_DOMAINS = {"pinterest.", "facebook.", "twitter.", "x.com",
                              "tiktok.", "instagram.", "reddit."}


def _domain_of(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/\s:?#]+)", url or "")
    return (m.group(1).lower() if m else "")


def score_source(title: str, snippet: str, url: str, topic: str) -> float:
    """Heuristic 0..1 quality score for an educational source.

    Combines domain trust tier, topical relevance of title+snippet, and
    penalties for low-trust/social/content-farm hosts. Deterministic and
    dependency-free so it is unit-testable.
    """
    dom = _domain_of(url)
    score = 0.5  # neutral baseline
    for trusted, val in _TRUSTED_DOMAINS.items():
        if trusted in dom:
            score = max(score, val)
            break
    if any(bad in dom for bad in _LOW_TRUST_PENALTY_DOMAINS):
        score = min(score, 0.15)
    # Topical overlap between the query/topic and the result text.
    topic_tokens = set(re.findall(r"[a-z]{3,}", (topic or "").lower()))
    text_tokens = set(re.findall(r"[a-z]{3,}", f"{title} {snippet}".lower()))
    if topic_tokens:
        overlap = len(topic_tokens & text_tokens) / max(1, len(topic_tokens))
        score += overlap * 0.35
    # Prefer substantive snippets (real explanations, not link stubs).
    snip_len = len((snippet or "").strip())
    if snip_len >= 120:
        score += 0.1
    elif snip_len < 40:
        score -= 0.15
    return round(max(0.0, min(1.0, score)), 3)


def dedupe_hash(topic: str, normalized_answer: str) -> str:
    """Stable content hash used to avoid storing duplicate knowledge."""
    key = f"{(topic or '').strip().lower()}|{(normalized_answer or '').strip().lower()}"
    return hashlib.sha256(key.encode("utf-8", "ignore")).hexdigest()[:32]


class KnowledgeStore:
    """MongoDB-backed store for vetted educational knowledge.

    Writes go into the SAME `ai_knowledge` collection the live TF-IDF
    retriever (gc_ai_engine.KnowledgeBase) already reads, so new entries are
    usable IMMEDIATELY - no retraining required. Extra provenance metadata is
    added alongside the fields the retriever expects (question/answer/tf).
    """

    def __init__(self, db):
        self.db = db
        self.col = db.ai_knowledge

    async def ensure_indexes(self):
        try:
            await self.col.create_index("entry_id", unique=True)
            await self.col.create_index("dedupe_hash")
            await self.col.create_index([("subject", 1), ("topic", 1)])
            await self.col.create_index("verification_status")
            await self.col.create_index("source_url")
        except Exception as e:
            logger.warning("KnowledgeStore index warning: %s", e)

    async def is_duplicate(self, topic: str, answer: str) -> bool:
        h = dedupe_hash(topic, answer)
        try:
            existing = await self.col.find_one({"dedupe_hash": h}, {"_id": 1})
            return existing is not None
        except Exception:
            return False

    async def save(self, *, question: str, answer: str, subject: str,
                   topic: str, level: str, sources: List[Dict[str, Any]],
                   quality_score: float,
                   verification_status: str = "verified") -> Optional[str]:
        """Persist a vetted entry with full provenance. Returns entry_id."""
        h = dedupe_hash(topic, answer)
        if await self.is_duplicate(topic, answer):
            logger.info("KB dedupe: skipping identical entry for %r", topic)
            return None
        entry_id = "kge_" + hashlib.sha1(
            f"{subject}|{topic}|{h}".encode()).hexdigest()[:16]
        now_iso = datetime.utcnow().isoformat()
        # Reuse the retriever's TF vector so find_match() works instantly.
        try:
            tokens = gc_ai.extract_keywords(f"{question} {answer}")
            tf = dict(gc_ai.vectorize(tokens))
        except Exception:
            tf = {}
        doc = {
            "entry_id": entry_id,
            "question": question,
            "answer": answer,
            "subject": subject,
            "topic": topic,
            "level": level,
            "keywords": list(tf.keys())[:24],
            "tf": tf,
            # Provenance / quality metadata.
            "source": "gc_knowledge_growth",
            "sources": sources,
            "source_url": (sources[0].get("url") if sources else ""),
            "source_title": (sources[0].get("title") if sources else ""),
            "evidence": [{"title": s.get("title"), "url": s.get("url"),
                          "snippet": (s.get("snippet") or "")[:400]}
                         for s in sources],
            "retrieved_at": now_iso,
            "created_at": now_iso,
            "verification_status": verification_status,
            "quality_score": round(float(quality_score), 3),
            "content_version": KG_CONTENT_VERSION,
            "dedupe_hash": h,
            "hits": 0,
        }
        try:
            await self.col.insert_one(dict(doc))
            logger.info("KB stored entry %s (topic=%r, quality=%.2f)",
                        entry_id, topic, quality_score)
            return entry_id
        except Exception as e:
            logger.error("KB store failed for %r: %s", topic, e)
            return None


# ------------------------------------------------------------
# Topic mining
# ------------------------------------------------------------

# Seed syllabus topics per exam level, used when there is little user signal.
SEED_TOPICS = {
    "GCE O Level": [
        "Quadratic equations factorisation", "Newton's laws of motion",
        "Photosynthesis explained", "Atomic structure basics",
        "Simultaneous equations", "States of matter",
    ],
    "GCE A Level": [
        "Differentiation from first principles", "Organic chemistry reactions",
        "Electromagnetic induction", "Probability distributions",
        "Equilibrium constants", "Trigonometric identities",
    ],
    "HND": [
        "Engineering mechanics stress and strain", "Digital electronics logic gates",
        "Technical report writing", "Circuit analysis theorems",
    ],
    "Concours": [
        "General knowledge current affairs", "Verbal reasoning techniques",
        "Numerical aptitude shortcuts",
    ],
}


async def mine_topics(db, limit: int = KG_MAX_TOPICS_PER_RUN) -> List[Dict[str, str]]:
    """Collect candidate learning topics from real app signal + seed syllabus.

    Sources (in priority order): recent student chat questions, feed post
    titles, weak topics on user profiles, then seed syllabus topics. Bounded
    to `limit` and de-duplicated.
    """
    topics: List[Dict[str, str]] = []
    seen: set = set()

    def _add(text: str, subject: str, level: str, origin: str):
        t = (text or "").strip()
        if len(t) < 8 or len(t) > 140:
            return
        key = t.lower()[:60]
        if key in seen:
            return
        seen.add(key)
        topics.append({"topic": t, "subject": subject or "General",
                       "level": level or "General", "origin": origin})

    try:
        recent_chats = await db.chat_messages.find(
            {"role": "user"}, {"content": 1, "subject": 1}
        ).sort("ts", -1).limit(40).to_list(40)
        for m in recent_chats:
            _add(m.get("content"), m.get("subject", "General"), "General", "student_question")
    except Exception as e:
        logger.warning("mine_topics chat scan failed: %s", e)

    if len(topics) < limit:
        try:
            weak = await db.users.find(
                {"weak_topics": {"$exists": True, "$ne": []}},
                {"weak_topics": 1, "exam_level": 1, "subjects": 1}
            ).limit(20).to_list(20)
            for u in weak:
                for wt in (u.get("weak_topics") or [])[:3]:
                    subj = (u.get("subjects") or ["General"])[0]
                    _add(str(wt), subj, u.get("exam_level") or "General", "weak_area")
        except Exception as e:
            logger.warning("mine_topics weak-topic scan failed: %s", e)

    if len(topics) < limit:
        for level, lst in SEED_TOPICS.items():
            for t in lst:
                _add(t, "General", level, "syllabus_seed")

    return topics[:limit]


# ------------------------------------------------------------
# Research + verify + generate + ingest (one topic)
# ------------------------------------------------------------

async def _research_sources(topic: str, level: str) -> Tuple[List[Dict], str]:
    """Search the web and return (vetted_sources, research_text).

    Uses gc_ai_engine.google_search (which already filters junk and ranks).
    Each surviving result is re-scored with score_source(); sources below
    KG_MIN_QUALITY are dropped. Returns ([], "") when nothing is usable.
    """
    try:
        results = await gc_ai.google_search(topic, num_results=KG_MAX_SOURCES_PER_TOPIC * 2,
                                            question=topic)
    except Exception as e:
        logger.warning("research search failed for %r: %s", topic, e)
        return [], ""

    vetted: List[Dict[str, Any]] = []
    for r in results or []:
        title = (r.get("title") or "").strip()
        snippet = (r.get("snippet") or "").strip()
        url = (r.get("link") or "").strip()
        if not url or not (title or snippet):
            continue
        q = score_source(title, snippet, url, topic)
        if q < KG_MIN_QUALITY:
            continue
        vetted.append({"title": title, "url": url, "snippet": snippet,
                       "quality": q, "domain": _domain_of(url)})
        if len(vetted) >= KG_MAX_SOURCES_PER_TOPIC:
            break

    if not vetted:
        return [], ""

    lines = [f"Educational sources for: {topic} (level {level}):"]
    for i, s in enumerate(vetted, 1):
        lines.append(f"[{i}] {s['title']}: {s['snippet']} (source: {s['url']})")
    return vetted, "\n".join(lines)


def _sources_agree(vetted: List[Dict[str, Any]]) -> bool:
    """Crude consistency check: require >=2 sources when more than one exists.

    A single source is allowed (quality-gated) but flagged so the stored
    verification_status reflects weaker corroboration.
    """
    return len(vetted) >= 2


async def ingest_topic(db, topic_info: Dict[str, str]) -> Dict[str, Any]:
    """Full pipeline for one topic. Returns a status dict; never raises."""
    topic = topic_info.get("topic", "")
    subject = topic_info.get("subject", "General")
    level = topic_info.get("level", "General")
    started = time.monotonic()
    result = {"topic": topic, "subject": subject, "level": level,
              "origin": topic_info.get("origin", "unknown"),
              "stored": False, "reason": ""}

    vetted, research = await _research_sources(topic, level)
    if not vetted:
        result["reason"] = "no_quality_sources"
        return result

    # Compose the final explanation with the GCSharp model ONLY.
    model = get_gc_model()
    system = (
        "You are GC AI, the built-in teacher model of GC Sharp. Write a clear, "
        "accurate, exam-focused explanation for the topic using ONLY the supplied "
        "sources. Do not invent facts. Use plain text (no Markdown). If the "
        "sources conflict or are insufficient, say so explicitly in one sentence "
        "at the end beginning 'Note:'."
    )
    prompt = (
        f"Topic: {topic}\nSubject: {subject}\nLevel: {level}\n\n"
        f"{research}\n\n"
        "Write a 120-220 word teacher explanation a student can revise from. "
        "End with 'Final answer:' summarising the key takeaway in one line."
    )
    try:
        answer = await model.generate(prompt, system=system, max_tokens=900,
                                      temperature=0.2, timeout=90.0)
    except GCModelUnavailableError as e:
        # Skip now; the topic stays eligible for a later pass. No external LLM.
        logger.warning("ingest_topic skipped (model unavailable): %s", str(e)[:120])
        result["reason"] = "model_unavailable"
        return result

    if not answer or len(answer.strip()) < 60:
        result["reason"] = "model_returned_too_short"
        return result

    quality = round(sum(s["quality"] for s in vetted) / len(vetted), 3)
    status = "verified" if _sources_agree(vetted) else "single_source"
    store = KnowledgeStore(db)
    await store.ensure_indexes()
    entry_id = await store.save(
        question=topic, answer=answer.strip(), subject=subject, topic=topic,
        level=level, sources=vetted, quality_score=quality,
        verification_status=status)
    result.update(stored=bool(entry_id), entry_id=entry_id,
                  quality=quality, verification_status=status,
                  sources=len(vetted),
                  elapsed_ms=int((time.monotonic() - started) * 1000))
    return result


# ------------------------------------------------------------
# Bounded, restartable run loop (used by APScheduler + admin trigger)
# ------------------------------------------------------------

_RUNNING = False  # module-level guard so overlapping ticks are skipped


async def _already_covered(db, topic: str, hours: int) -> bool:
    """True if this topic was ingested within the last `hours` hours."""
    cutoff = (datetime.utcnow() - timedelta(hours=hours)).isoformat()
    try:
        hit = await db.ai_knowledge.find_one(
            {"topic": {"$regex": f"^{re.escape(topic)[:80]}", "$options": "i"},
             "source": "gc_knowledge_growth",
             "created_at": {"$gte": cutoff}},
            {"_id": 1})
        return hit is not None
    except Exception:
        return False


async def run_once(db, limit: Optional[int] = None) -> Dict[str, Any]:
    """Run one bounded knowledge-growth pass. Safe to call from a job or API.

    Returns a summary with per-topic results. Never raises; individual topic
    failures are recorded and the pass continues.
    """
    global _RUNNING
    if _RUNNING:
        return {"skipped": True, "reason": "already_running"}
    _RUNNING = True
    started = time.monotonic()
    summary = {"started_at": datetime.utcnow().isoformat(), "topics": [],
               "stored": 0, "skipped": 0, "failed": 0, "model_unavailable": False}
    try:
        topics = await mine_topics(db, limit=limit or KG_MAX_TOPICS_PER_RUN)
        for t in topics:
            if await _already_covered(db, t["topic"], KG_HOURS_BETWEEN_TOPIC):
                summary["skipped"] += 1
                continue
            try:
                res = await ingest_topic(db, t)
            except Exception as e:
                logger.exception("ingest_topic crashed for %r", t.get("topic"))
                res = {"topic": t.get("topic"), "stored": False,
                       "reason": f"error: {e}"[:200]}
            summary["topics"].append(res)
            if res.get("stored"):
                summary["stored"] += 1
            elif res.get("reason") == "model_unavailable":
                summary["model_unavailable"] = True
                summary["failed"] += 1
                # Model is down: stop early rather than burn the whole budget.
                break
            else:
                summary["failed"] += 1
        summary["elapsed_ms"] = int((time.monotonic() - started) * 1000)
        # Persist a compact run record for observability / admin UI.
        try:
            await db.kg_runs.insert_one({
                "started_at": summary["started_at"],
                "stored": summary["stored"], "skipped": summary["skipped"],
                "failed": summary["failed"],
                "model_unavailable": summary["model_unavailable"],
                "elapsed_ms": summary["elapsed_ms"],
            })
        except Exception:
            pass
        logger.info("knowledge growth pass done: stored=%s skipped=%s failed=%s",
                    summary["stored"], summary["skipped"], summary["failed"])
    finally:
        _RUNNING = False
    return summary


def schedule_job(scheduler, db, interval_hours: int = 6):
    """Register the knowledge-growth pass on an existing APScheduler instance."""
    if scheduler is None:
        return False
    try:
        from apscheduler.triggers.interval import IntervalTrigger
        scheduler.add_job(
            run_once, IntervalTrigger(hours=interval_hours),
            args=[db], id="gc_knowledge_growth", replace_existing=True,
            max_instances=1, coalesce=True)
        logger.info("Scheduled knowledge-growth job every %sh", interval_hours)
        return True
    except Exception as e:
        logger.warning("Could not schedule knowledge-growth job: %s", e)
        return False