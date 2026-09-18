"""
GC AI ENGINE - Self-learning NLP/ML tutor engine.

Gives GC AI:
  1. A local NLP pipeline (tokenize -> stopwords -> stemming ->
     keyword extraction -> TF-IDF vectors -> cosine similarity).
  2. A persistent Knowledge Base (MongoDB `ai_knowledge`) where every
     learned answer is stored and retrieved by TF-IDF cosine similarity.
  3. Google web search (Google CSE API + keyless DuckDuckGo fallback)
     to learn what it does not know yet.
  4. A multi-provider LLM layer (Google Gemini + OpenRouter chain) so
     GC AI never fully depends on OpenRouter.
  5. A learning loop:
        question -> local solver -> knowledge base
          -> web research + LLM synthesis -> STORE in KB
     so every question makes GC AI smarter; once learned, a question
     is answered instantly with zero external calls.
"""

import os
import re
import json
import math
import logging
import unicodedata
from collections import Counter
from datetime import datetime
from typing import Optional, List, Dict, Tuple

import httpx

logger = logging.getLogger("gc_ai_engine")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
GOOGLE_SEARCH_API_KEY = os.environ.get("GOOGLE_SEARCH_API_KEY", "")
GOOGLE_SEARCH_CX = os.environ.get("GOOGLE_SEARCH_CX", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

OPENROUTER_BASE = "https://openrouter.ai/api/v1"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
DUCKDUCKGO_URL = "https://html.duckduckgo.com/html/"

FALLBACK_SYSTEM = (
    "You are GC AI, an expert academic tutor for Cameroon students preparing for "
    "GCE O Level, A Level, HND and Concours exams. Reply in PLAIN TEXT (no markdown "
    "symbols, no LaTeX - use Unicode math like x², √, π, ×, ÷). Explain step by step, "
    "clearly and encouragingly, and end with a line 'Final answer: <result>'."
)

OPENROUTER_CHAIN = [
    "openai/gpt-oss-20b:free",
    "google/gemma-3n-e4b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "deepseek/deepseek-chat-v3-0324:free",
]

# ------------------------------------------------------------
# 1. NLP PIPELINE (pure Python)
# ------------------------------------------------------------

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "then", "than", "so", "of",
    "at", "by", "for", "with", "about", "into", "to", "from", "in", "on",
    "is", "are", "was", "were", "be", "been", "being", "am", "do", "does",
    "did", "can", "could", "should", "would", "will", "shall", "may",
    "might", "must", "have", "has", "had", "i", "you", "he", "she", "it",
    "we", "they", "me", "him", "her", "us", "them", "my", "your", "his",
    "its", "our", "their", "this", "that", "these", "those", "what",
    "which", "who", "whom", "whose", "when", "where", "why", "how", "not",
    "no", "yes", "please", "u", "ur", "pls", "plz", "tell", "give",
    "explain", "describe", "define", "question", "answer", "help",
}


NUMBER_WORDS = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
    "1st": "first", "2nd": "second", "3rd": "third", "4th": "fourth",
    "5th": "fifth", "6th": "sixth", "7th": "seventh", "8th": "eighth",
    "9th": "ninth", "10th": "tenth",
}


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"\s+", " ", text.lower()).strip()
    # Map digits/ordinals to words so "2nd law" matches "second law"
    words = text.split(" ")
    return " ".join(NUMBER_WORDS.get(w, w) for w in words)


def tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9]+", normalize_text(text))


def simple_stem(word: str) -> str:
    """Lightweight suffix stripper (Porter-lite)."""
    for suf in ("ational", "ization", "iveness", "fulness", "ousness",
                "ations", "ising", "izing", "ation", "ements",
                "ement", "ments", "ment", "ities", "ity", "ness", "ings",
                "ing", "edly", "ies", "ied", "ers", "er", "est", "ed", "es",
                "ly", "s"):
        if word.endswith(suf) and len(word) - len(suf) >= 4:
            stem = word[: -len(suf)]
            if suf == "ies":
                stem += "y"
            elif suf == "s" and word.endswith("ss"):
                return word
            # Avoid mangling words whose stem ends in a stray vowel ("is" endings
            # like photosynthesis -> photosynthesi): keep the original instead.
            if stem.endswith(("i", "o", "u")) and suf not in ("ies",):
                return word
            return stem
    return word


def extract_keywords(text: str, max_keywords: int = 12) -> List[str]:
    keywords: List[str] = []
    for tok in tokenize(text):
        if tok in STOPWORDS or len(tok) < 2:
            continue
        st = simple_stem(tok)
        if st and st not in STOPWORDS and st not in keywords:
            keywords.append(st)
        if len(keywords) >= max_keywords:
            break
    return keywords


def vectorize(tokens: List[str]) -> Counter:
    return Counter(tokens)


def cosine_similarity(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    dot = sum(a[t] * b[t] for t in common)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def build_query(question: str) -> str:
    kws = extract_keywords(question)
    return " ".join(kws) if kws else normalize_text(question)[:80]


# ------------------------------------------------------------
# 2. KNOWLEDGE BASE (MongoDB, TF-IDF cosine matching)
# ------------------------------------------------------------

def uuid_hex() -> str:
    import uuid as _uuid
    return _uuid.uuid4().hex[:12]


class KnowledgeBase:
    """Persistent learning memory for GC AI (TF-IDF cosine retrieval)."""

    SIMILARITY_THRESHOLD = 0.55

    def __init__(self, db):
        self.db = db
        self.col = db.ai_knowledge
        self._cache: List[Dict] = []
        self._cache_loaded = False

    async def ensure_index(self):
        try:
            await self.col.create_index("entry_id", unique=True)
            await self.col.create_index("keywords")
        except Exception:
            pass

    async def _load_all(self) -> List[Dict]:
        if not self._cache_loaded:
            try:
                self._cache = await self.col.find({}, {"_id": 0}).to_list(5000)
            except Exception as e:
                logger.warning(f"KB load failed: {e}")
                self._cache = []
            self._cache_loaded = True
        return self._cache

    def invalidate_cache(self):
        self._cache = []
        self._cache_loaded = False

    async def find_match(self, question: str) -> Optional[Dict]:
        """Most similar known question via TF-IDF cosine similarity."""
        entries = await self._load_all()
        if not entries:
            return None
        q_vec = vectorize(extract_keywords(question))
        if not q_vec:
            return None

        n_docs = len(entries)
        df: Counter = Counter()
        for e in entries:
            for term in set(e.get("tf", {})):
                df[term] += 1
        idf = {t: math.log((n_docs + 1) / (c + 1)) + 1 for t, c in df.items()}

        def tfidf(vec: Counter) -> Dict[str, float]:
            total = sum(vec.values()) or 1
            return {t: (c / total) * idf.get(t, math.log(n_docs + 1) + 1)
                    for t, c in vec.items()}

        q_tfidf = tfidf(q_vec)
        q_norm = math.sqrt(sum(v * v for v in q_tfidf.values())) or 1.0

        best, best_score = None, 0.0
        for e in entries:
            e_tfidf = tfidf(Counter(e.get("tf", {})))
            e_norm = math.sqrt(sum(v * v for v in e_tfidf.values())) or 1.0
            common = set(q_tfidf) & set(e_tfidf)
            dot = sum(q_tfidf[t] * e_tfidf[t] for t in common)
            score = dot / (q_norm * e_norm)
            if score > best_score:
                best, best_score = e, score

        if best and best_score >= self.SIMILARITY_THRESHOLD:
            try:
                await self.col.update_one(
                    {"entry_id": best.get("entry_id")},
                    {"$inc": {"hits": 1},
                     "$set": {"last_hit_at": datetime.utcnow().isoformat()}},
                )
            except Exception:
                pass
            best = dict(best)
            best["_similarity"] = round(best_score, 4)
            return best
        return None

    async def store(self, question: str, answer: str, source: str = "learned",
                    subject: str = "General") -> Optional[Dict]:
        """Persist a learned Q->A pair so GC AI grows smarter over time."""
        if not question or not answer:
            return None
        entry = {
            "entry_id": f"kb_{uuid_hex()}",
            "question": question[:500],
            "keywords": extract_keywords(question),
            "tf": dict(vectorize(extract_keywords(question))),
            "answer": answer[:20000],
            "source": source,
            "subject": subject,
            "hits": 0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        try:
            await self.col.insert_one(dict(entry))
            self._cache.append(dict(entry))
            logger.info(f"KB: stored knowledge (source={source}) for: {question[:60]}")
            return entry
        except Exception as e:
            logger.warning(f"KB store failed: {e}")
            return None

    async def stats(self) -> Dict:
        try:
            total = await self.col.count_documents({})
        except Exception:
            total = 0
        return {"total_entries": total}


# ------------------------------------------------------------
# 3. GOOGLE / WEB SEARCH
# ------------------------------------------------------------

async def google_search(query: str, num_results: int = 5) -> List[Dict]:
    """Google Custom Search JSON API when configured, else keyless DuckDuckGo."""
    results: List[Dict] = []

    if GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX:
        try:
            async with httpx.AsyncClient(timeout=12.0) as hc:
                resp = await hc.get(
                    "https://www.googleapis.com/customsearch/v1",
                    params={
                        "key": GOOGLE_SEARCH_API_KEY,
                        "cx": GOOGLE_SEARCH_CX,
                        "q": query,
                        "num": min(num_results, 10),
                    },
                )
                if resp.status_code == 200:
                    for item in resp.json().get("items", [])[:num_results]:
                        results.append({
                            "title": item.get("title", ""),
                            "snippet": item.get("snippet", ""),
                            "link": item.get("link", ""),
                        })
                    return results
                logger.warning(f"Google CSE failed: {resp.status_code}")
        except Exception as e:
            logger.warning(f"Google CSE error: {e}")

    # Keyless fallback: DuckDuckGo HTML endpoint
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        async with httpx.AsyncClient(timeout=12.0, headers=headers,
                                     follow_redirects=True) as hc:
            resp = await hc.post(DUCKDUCKGO_URL, data={"q": query, "kl": "wt-wt"})
            if resp.status_code == 200:
                import html as _html
                blocks = re.findall(
                    r'class="result__a"[^>]*>(.*?)</a>.*?'
                    r'class="result__snippet"[^>]*>(.*?)</a>',
                    resp.text, re.S)
                clean = lambda s: _html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
                for title, snippet in blocks[:num_results]:
                    results.append({"title": clean(title), "snippet": clean(snippet),
                                    "link": ""})
    except Exception as e:
        logger.warning(f"DuckDuckGo search error: {e}")

    return results


async def research_context(question: str) -> Tuple[str, bool]:
    """Search the web for context. Returns (context_text, found_anything)."""
    query = build_query(question)
    if not query:
        return "", False
    results = await google_search(query, num_results=5)
    if not results:
        return "", False
    lines = ["Web research results (verified facts to base your explanation on):"]
    for i, r in enumerate(results, 1):
        lines.append(f"[{i}] {r['title']}: {r['snippet']}")
    return "\n".join(lines), True


# ------------------------------------------------------------
# 4. MULTI-PROVIDER LLM LAYER (Gemini + OpenRouter chain)
# ------------------------------------------------------------

async def _call_openrouter(model: str, prompt: str, system: str,
                           max_tokens: int, timeout: float) -> Optional[str]:
    if not OPENROUTER_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as hc:
            resp = await hc.post(
                f"{OPENROUTER_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": os.environ.get("APP_URL", "https://gcsharp.app"),
                    "X-Title": "GCSharp",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "max_tokens": max_tokens,
                },
            )
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                return content if content and content.strip() else None
            logger.warning(f"OpenRouter {model} -> {resp.status_code}")
    except Exception as e:
        logger.warning(f"OpenRouter {model} error: {e}")
    return None


async def _call_gemini(prompt: str, system: str,
                       max_tokens: int, timeout: float) -> Optional[str]:
    """Direct Google Gemini call - fully independent of OpenRouter."""
    if not GEMINI_API_KEY:
        return None
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    try:
        async with httpx.AsyncClient(timeout=timeout) as hc:
            resp = await hc.post(
                f"{GEMINI_BASE}/models/{model}:generateContent",
                params={"key": GEMINI_API_KEY},
                json={
                    "system_instruction": {"parts": [{"text": system}]},
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2,
                                         "maxOutputTokens": max_tokens},
                },
            )
            if resp.status_code == 200:
                parts = resp.json()["candidates"][0]["content"]["parts"]
                text = "".join(p.get("text", "") for p in parts)
                return text if text.strip() else None
            logger.warning(f"Gemini -> {resp.status_code}")
    except Exception as e:
        logger.warning(f"Gemini error: {e}")
    return None


async def call_llm(prompt: str, system: Optional[str] = None,
                   max_tokens: int = 900, timeout: float = 30.0) -> Tuple[str, str]:
    """Try every provider until one answers. Returns (text, provider).

    Never raises and never returns an empty string - if every provider
    fails we return a graceful message so the app shows no hard error.
    """
    sys = system or FALLBACK_SYSTEM

    text = await _call_gemini(prompt, sys, max_tokens, timeout)
    if text:
        return text, "google-gemini"

    for model in OPENROUTER_CHAIN:
        text = await _call_openrouter(model, prompt, sys, max_tokens, timeout)
        if text:
            return text, f"openrouter:{model}"

    return (
        "I could not reach my learning services right now. Please try again in a "
        "moment - I am learning from every question students ask, so I may already "
        "know this one next time. Meanwhile, you can browse the Lessons and Past "
        "Questions tabs for related material.",
        "none",
    )


# ------------------------------------------------------------
# 5. LEARNING LOOP - answer a question end to end
# ------------------------------------------------------------

async def answer_question(db, question: str, subject: str = "General",
                          history_context: str = "",
                          profile_snapshot: Optional[Dict] = None,
                          allow_web_learning: bool = True,
                          use_local_solver=None) -> Dict:
    """The full GC AI brain:

    1. Local math solver (sympy) - instant, offline.
    2. Knowledge base lookup - instant, learned from before.
    3. Web research (Google/DuckDuckGo) + LLM synthesis - learns and stores.
    4. LLM direct with graceful degradation - never a hard failure.

    Returns {"answer", "source", "learned"}.
    """
    result: Dict = {"answer": "", "source": "", "learned": False}

    # --- Step 1: local symbolic math solver -------------------
    if use_local_solver:
        try:
            local = use_local_solver(question)
            if local:
                result.update(answer=local, source="local_solver")
                return result
        except Exception:
            pass

    # --- Step 2: knowledge base (what GC AI has learned) ------
    kb = KnowledgeBase(db)
    await kb.ensure_index()
    try:
        match = await kb.find_match(question)
    except Exception as e:
        logger.warning(f"KB match error: {e}")
        match = None
    if match and match.get("answer"):
        logger.info(f"GC AI answered from knowledge base "
                    f"(similarity={match.get('_similarity')})")
        result.update(answer=match["answer"], source="knowledge_base")
        return result

    # --- Step 3: web research, then LLM synthesis -------------
    research, found = "", False
    if allow_web_learning:
        try:
            research, found = await research_context(question)
        except Exception as e:
            logger.warning(f"Research error: {e}")

    profile_str = json.dumps(profile_snapshot or {}, ensure_ascii=False)
    system = FALLBACK_SYSTEM + f"\n\nStudent profile: {profile_str}. Subject focus: {subject}."
    if history_context:
        system += f"\n\n{history_context}"
    if found:
        system += (
            "\n\nYou researched the web for this question. Use the research results "
            "below as source material, verify them for correctness at the student's "
            "level, and write your own clear explanation:"
            f"\n{research}"
        )

    prompt = (history_context + "\n" if history_context else "") + \
        "Current question:\n" + question
    answer, provider = await call_llm(prompt, system=system, max_tokens=1000)
    result.update(answer=answer, source=provider)

    # --- Last resort: if every LLM is down but research succeeded,
    # answer directly from the web research so the student still gets help.
    if provider == "none" and found:
        answer = (
            "My language services are briefly unavailable, but I researched the web "
            "for you. Here is what reliable sources say about your question:\n\n"
            + research.replace(
                "Web research results (verified facts to base your explanation on):",
                "Research summary:").replace("[1] ", "• ").replace("[2] ", "• ") \
                .replace("[3] ", "• ").replace("[4] ", "• ").replace("[5] ", "• ")
            + "\n\nAsk me again shortly and I will turn this into a full step-by-step "
              "explanation tailored to your exam level."
        )
        result.update(answer=answer, source="web-research-only")
        await kb.store(question, answer, source="web-research-only", subject=subject)
        result["learned"] = True

    # --- Step 4: learn! store in the knowledge base ----------
    if found and answer and provider not in ("none", "web-research-only"):
        await kb.store(question, answer, source=f"web+{provider}", subject=subject)
        result["learned"] = True

    return result


# ------------------------------------------------------------
# 6. TITLE GENERATION (NLP-based, no LLM needed)
# ------------------------------------------------------------

def generate_title(question: str) -> str:
    """Derive a chat title from raw content words - deterministic, zero-latency."""
    toks = [t for t in tokenize(question) if t not in STOPWORDS and len(t) >= 3]
    if not toks:
        return (normalize_text(question)[:30] or "New chat").title()
    return " ".join(toks).title()[:48]

