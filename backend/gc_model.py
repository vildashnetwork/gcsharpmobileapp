"""
GCSharp Model Adapter - the ONLY runtime generator for GC Sharp educational
content (tutor answers, highlight explanations, PDF-to-video and text-to-video
scripts, teacher narration, KB-grounded explanations).

Two real self-hosting backends are supported:

  * OpenAI-compatible HTTP server (GC_MODEL_URL). Works with llama.cpp
    server, vLLM, Ollama (/v1), LM Studio, LocalAI - anything speaking
    POST {GC_MODEL_URL}/chat/completions.
  * Local GGUF weights (GC_MODEL_PATH) via llama-cpp-python, loaded
    in-process; blocking inference runs in a worker thread.

STRICT RUNTIME RULE: this module NEVER falls back to OpenRouter, Gemini,
Pollinations or any other external LLM. If the GCSharp model is not
configured or fails, every entry point raises GCModelUnavailableError with an
actionable message. The API layer turns that into a clear HTTP 503 the app
shows with a Retry button. Nothing here fabricates output.

See backend/DEPLOY_GCSHARP_MODEL.md for exact startup commands.
"""

from __future__ import annotations

import asyncio
import hashlib
import importlib
import json
import logging
import os
import re
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, NoReturn, Optional

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger("gc_model")

# ------------------------------------------------------------
# Configuration (secrets stay on the backend)
# ------------------------------------------------------------

GC_MODEL_URL = os.environ.get("GC_MODEL_URL", "").strip()
GC_MODEL_PATH = os.environ.get("GC_MODEL_PATH", "").strip()
GC_MODEL_REPO_ID = os.environ.get("GC_MODEL_REPO_ID", "").strip()
GC_MODEL_FILE = os.environ.get("GC_MODEL_FILE", "").strip()
GC_MODEL_REVISION = os.environ.get("GC_MODEL_REVISION", "main").strip()
GC_MODEL_SHA256 = os.environ.get("GC_MODEL_SHA256", "").strip().lower()
GC_MODEL_CACHE_DIR = Path(
    os.environ.get("GC_MODEL_CACHE_DIR")
    or str(Path(tempfile.gettempdir()) / "gcsharp-models")
)
GC_MODEL_DOWNLOAD_TIMEOUT = float(os.environ.get("GC_MODEL_DOWNLOAD_TIMEOUT", "600"))
GC_MODEL_NAME = os.environ.get("GC_MODEL_NAME", "gcsharp").strip()
GC_MODEL_API_KEY = os.environ.get("GC_MODEL_API_KEY", "").strip()
GC_MODEL_TIMEOUT = float(os.environ.get("GC_MODEL_TIMEOUT", "120"))
GC_MODEL_MAX_TOKENS = int(os.environ.get("GC_MODEL_MAX_TOKENS", "2048"))
GC_MODEL_TEMPERATURE = float(os.environ.get("GC_MODEL_TEMPERATURE", "0.2"))
GC_MODEL_CTX = int(os.environ.get("GC_MODEL_CTX", "4096"))
GC_MODEL_N_THREADS = int(os.environ.get("GC_MODEL_N_THREADS", "4"))

GC_TEACHER_SYSTEM = (
    "You are GC AI, the built-in teacher model of the GC Sharp learning "
    "platform for Cameroon students preparing for GCE O Level, A Level, HND "
    "and Concours exams. Explain step by step, clearly and encouragingly, at "
    "the student's level. Use PLAIN TEXT only (no Markdown symbols, no LaTeX; "
    "use Unicode math like x squared, root, pi, times, divide). When a "
    "question is multiple-choice or has a single result, finish with a line "
    "exactly in the form 'Final answer: <result>'."
)


class GCModelUnavailableError(RuntimeError):
    """Raised when the GCSharp model cannot serve a request.

    Never catch this and substitute another provider - the product rule is
    that GC Sharp's own model, and only that model, generates educational
    content at runtime.
    """

    def __init__(self, message: str, *, configured: bool = False):
        super().__init__(message)
        self.configured = configured


@dataclass
class GCModelStatus:
    configured: bool
    backend: Optional[str] = None          # "http" | "gguf" | None
    endpoint: Optional[str] = None
    healthy: bool = False
    detail: str = ""
    latency_ms: Optional[int] = None
    generations: int = 0
    last_error: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "configured": self.configured,
            "backend": self.backend,
            "endpoint": self.endpoint,
            "healthy": self.healthy,
            "detail": self.detail,
            "latency_ms": self.latency_ms,
            "generations": self.generations,
            "last_error": self.last_error,
            "supports_fine_tune": bool(self.backend == "gguf"),
        }



class GCSharpModel:
    """Reusable adapter over your personal GCSharp model."""

    def __init__(self):
        self._llm: Any = None
        self._gguf_lock = threading.Lock()
        gguf_configured = bool(
            GC_MODEL_PATH or (GC_MODEL_REPO_ID and GC_MODEL_FILE)
        )
        self._status = GCModelStatus(
            configured=bool(GC_MODEL_URL or gguf_configured),
            backend=("http" if GC_MODEL_URL else ("gguf" if gguf_configured else None)),
            endpoint=GC_MODEL_URL or GC_MODEL_PATH or (
                f"{GC_MODEL_REPO_ID}/{GC_MODEL_FILE}@{GC_MODEL_REVISION}"
                if gguf_configured else None
            ),
        )

    @property
    def configured(self) -> bool:
        return bool(
            GC_MODEL_URL
            or GC_MODEL_PATH
            or (GC_MODEL_REPO_ID and GC_MODEL_FILE)
        )

    def status(self) -> Dict[str, Any]:
        return self._status.as_dict()

    def unavailable_reason(self) -> str:
        if GC_MODEL_URL:
            return (
                f"GCSharp model unreachable at {GC_MODEL_URL}. Check that your "
                "self-hosted server is running and GC_MODEL_URL is correct, then retry."
            )
        if GC_MODEL_PATH:
            return (
                f"GCSharp model weights at {GC_MODEL_PATH} could not be loaded. "
                "Verify GC_MODEL_PATH points at a valid .gguf file and install "
                "the optional backend/requirements-llm.txt dependencies, then retry."
            )
        if GC_MODEL_REPO_ID and GC_MODEL_FILE:
            return (
                f"GCSharp GGUF model {GC_MODEL_REPO_ID}/{GC_MODEL_FILE} could not "
                "be loaded. Check the repository, revision, checksum, available "
                "disk/RAM, and the optional backend/requirements-llm.txt dependency."
            )
        return (
            "GCSharp model is not configured. Set GC_MODEL_URL (self-hosted "
            "OpenAI-compatible server), GC_MODEL_PATH (local GGUF weights), or "
            "GC_MODEL_REPO_ID plus GC_MODEL_FILE in backend/.env and restart the "
            "server. See backend/DEPLOY_GCSHARP_MODEL.md."
        )

    def _raise_unavailable(self, detail: Optional[str] = None) -> NoReturn:
        msg = detail or self.unavailable_reason()
        self._status.last_error = msg
        raise GCModelUnavailableError(msg, configured=self.configured)

    # ---------------- local GGUF loading ---------------------------

    def _gguf_path(self) -> Optional[Path]:
        if GC_MODEL_PATH:
            return Path(GC_MODEL_PATH).expanduser()
        if GC_MODEL_REPO_ID and GC_MODEL_FILE:
            repo_dir = GC_MODEL_REPO_ID.replace("/", "--")
            return GC_MODEL_CACHE_DIR / repo_dir / Path(GC_MODEL_FILE).name
        return None

    def _download_gguf(self, model_path: Path) -> None:
        quoted_repo = urllib.parse.quote(GC_MODEL_REPO_ID, safe="/")
        quoted_file = urllib.parse.quote(GC_MODEL_FILE, safe="/")
        quoted_revision = urllib.parse.quote(GC_MODEL_REVISION, safe="")
        url = (
            f"https://huggingface.co/{quoted_repo}/resolve/"
            f"{quoted_revision}/{quoted_file}?download=true"
        )
        partial_path = model_path.with_name(model_path.name + ".download")
        digest = hashlib.sha256()
        model_path.parent.mkdir(parents=True, exist_ok=True)
        logger.info(
            "Downloading GCSharp GGUF model %s/%s at revision %s",
            GC_MODEL_REPO_ID, GC_MODEL_FILE, GC_MODEL_REVISION,
        )

        try:
            request = urllib.request.Request(
                url, headers={"User-Agent": "GCSharp/1.0 model-loader"}
            )
            with urllib.request.urlopen(
                request, timeout=GC_MODEL_DOWNLOAD_TIMEOUT
            ) as response, partial_path.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
                    digest.update(chunk)
            if GC_MODEL_SHA256 and digest.hexdigest() != GC_MODEL_SHA256:
                raise ValueError(
                    "downloaded GGUF SHA-256 does not match GC_MODEL_SHA256"
                )
            os.replace(partial_path, model_path)
        except (OSError, urllib.error.URLError, ValueError) as exc:
            try:
                partial_path.unlink(missing_ok=True)
            except OSError:
                logger.warning("Could not remove incomplete GGUF download %s", partial_path)
            self._raise_unavailable(
                f"Could not download GCSharp GGUF model from Hugging Face: {exc}. "
                "Check GC_MODEL_REPO_ID, GC_MODEL_FILE, GC_MODEL_REVISION, "
                "GC_MODEL_SHA256, network access, and available disk space."
            )

    def _verify_cached_gguf(self, model_path: Path) -> None:
        digest = hashlib.sha256()
        try:
            with model_path.open("rb") as model_file:
                while chunk := model_file.read(1024 * 1024):
                    digest.update(chunk)
        except OSError as exc:
            self._raise_unavailable(
                f"Could not verify cached GCSharp GGUF model at {model_path}: {exc}."
            )
        if digest.hexdigest() != GC_MODEL_SHA256:
            self._raise_unavailable(
                f"Cached GCSharp GGUF model at {model_path} does not match "
                "GC_MODEL_SHA256. Remove the invalid cache file and retry."
            )

    def _ensure_gguf(self) -> Any:
        if self._llm is not None:
            return self._llm

        with self._gguf_lock:
            if self._llm is not None:
                return self._llm

            model_path = self._gguf_path()
            if model_path is None:
                self._raise_unavailable()
            if GC_MODEL_PATH and not model_path.is_file():
                self._raise_unavailable(
                    f"GCSharp GGUF model file does not exist: {model_path}. "
                    "Check GC_MODEL_PATH."
                )
            if model_path.is_file() and GC_MODEL_SHA256:
                self._verify_cached_gguf(model_path)

            try:
                llama_cpp = importlib.import_module("llama_cpp")
            except ImportError:
                self._raise_unavailable(
                    "The local GGUF backend requires llama-cpp-python. Install "
                    "the optional backend/requirements-llm.txt dependencies and "
                    "restart the server."
                )

            llama = getattr(llama_cpp, "Llama", None)
            if llama is None:
                self._raise_unavailable(
                    "The installed llama-cpp-python package does not expose "
                    "llama_cpp.Llama. Reinstall backend/requirements-llm.txt "
                    "and restart the server."
                )

            if not model_path.is_file():
                self._download_gguf(model_path)

            try:
                self._llm = llama(
                    model_path=str(model_path),
                    n_ctx=GC_MODEL_CTX,
                    n_threads=GC_MODEL_N_THREADS,
                    verbose=False,
                )
            except Exception as exc:
                self._raise_unavailable(
                    f"Could not load GCSharp GGUF model at {model_path}: {exc}. "
                    "The Render service may not have enough memory; try a smaller "
                    "model/context or a service with more RAM."
                )
            return self._llm

    # ---------------- HTTP backend ----------------------------------

    @staticmethod
    def _chat_url() -> str:
        base = GC_MODEL_URL.rstrip("/")
        if base.endswith("/chat/completions"):
            return base
        if base.endswith("/v1"):
            return base + "/chat/completions"
        return base + "/v1/chat/completions"

    async def _generate_http(self, messages: List[Dict[str, str]],
                             max_tokens: int, temperature: float,
                             timeout: float) -> str:
        headers = {"Content-Type": "application/json"}
        if GC_MODEL_API_KEY:
            headers["Authorization"] = f"Bearer {GC_MODEL_API_KEY}"
        payload = {
            "model": GC_MODEL_NAME,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=timeout) as hc:
                resp = await hc.post(self._chat_url(), headers=headers, json=payload)
        except httpx.TimeoutException:
            self._raise_unavailable(
                f"GCSharp model timed out after {timeout:.0f}s. The model may be "
                "loading or overloaded - retry, or raise GC_MODEL_TIMEOUT."
            )
        except httpx.HTTPError as e:
            self._raise_unavailable(
                f"Could not reach GCSharp model at {GC_MODEL_URL}: {e}. "
                "Check that the server is running, then retry."
            )

        if resp.status_code == 404:
            bare = GC_MODEL_URL.rstrip("/")
            if not bare.endswith("/chat/completions"):
                try:
                    async with httpx.AsyncClient(timeout=timeout) as hc2:
                        resp = await hc2.post(bare + "/chat/completions",
                                              headers=headers, json=payload)
                except httpx.HTTPError:
                    pass
        if resp.status_code != 200:
            self._raise_unavailable(
                f"GCSharp model server returned HTTP {resp.status_code}: "
                f"{resp.text[:200]}. Fix the model server, then retry."
            )
        try:
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
        except Exception:
            self._raise_unavailable(
                "GCSharp model returned an unreadable response (not OpenAI chat "
                "format). Confirm GC_MODEL_URL points at an OpenAI-compatible "
                "/v1 endpoint."
            )
        if not isinstance(content, str) or not content.strip():
            self._raise_unavailable("GCSharp model returned an empty response. Retry.")
        return content

    # ---------------- GGUF backend ----------------------------------

    def _generate_gguf_blocking(self, messages: List[Dict[str, str]],
                                max_tokens: int, temperature: float) -> str:
        llm = self._ensure_gguf()
        out = llm.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=["</s>", "<|im_end|>"],
        )
        try:
            text = out["choices"][0]["message"]["content"]
        except Exception:
            self._raise_unavailable("GCSharp GGUF model returned no text. Retry.")
        if not isinstance(text, str) or not text.strip():
            self._raise_unavailable("GCSharp GGUF model returned an empty response. Retry.")
        return text

    # ---------------- public API ------------------------------------

    async def generate(self, prompt: str, *, system: Optional[str] = None,
                       max_tokens: Optional[int] = None,
                       temperature: Optional[float] = None,
                       timeout: Optional[float] = None) -> str:
        """Run one generation on the GCSharp model.

        Raises GCModelUnavailableError when the model is not configured or a
        request fails. NEVER falls back to any other provider.
        """
        if not self.configured:
            self._raise_unavailable()

        sys_text = (system or GC_TEACHER_SYSTEM).strip()
        messages = [
            {"role": "system", "content": sys_text},
            {"role": "user", "content": prompt},
        ]
        mt = max(1, int(max_tokens or GC_MODEL_MAX_TOKENS))
        temp = GC_MODEL_TEMPERATURE if temperature is None else float(temperature)
        to = float(timeout or GC_MODEL_TIMEOUT)

        started = time.monotonic()
        try:
            if self._status.backend == "gguf":
                text = await asyncio.to_thread(
                    self._generate_gguf_blocking, messages, mt, temp)
            else:
                text = await self._generate_http(messages, mt, temp, to)
        except GCModelUnavailableError:
            raise
        except Exception as e:
            self._raise_unavailable(f"GCSharp model inference failed: {e}")

        self._status.generations += 1
        self._status.healthy = True
        self._status.detail = "serving"
        self._status.latency_ms = int((time.monotonic() - started) * 1000)
        self._status.last_error = None
        return text

    async def generate_json(self, prompt: str, required_key: str, *,
                            system: Optional[str] = None,
                            max_tokens: Optional[int] = None,
                            temperature: float = 0.2,
                            timeout: Optional[float] = None,
                            retries: int = 1) -> Dict[str, Any]:
        """Generate and parse a JSON object that must contain `required_key`."""
        sys = (system or GC_TEACHER_SYSTEM) + (
            " Reply with a single valid JSON object only - no Markdown code "
            "fences, no commentary, nothing before or after the JSON."
        )
        last_err = "unparseable"
        for attempt in range(max(1, retries + 1)):
            p = prompt if attempt == 0 else (
                prompt + "\n\nIMPORTANT: Your previous reply was not valid JSON "
                "with the required key. Reply with ONLY the JSON object."
            )
            raw = await self.generate(p, system=sys, max_tokens=max_tokens,
                                      temperature=temperature, timeout=timeout)
            parsed = _extract_json(raw)
            if isinstance(parsed, dict) and parsed.get(required_key):
                return parsed
            last_err = "missing required key" if isinstance(parsed, dict) else "unparseable"
        self._raise_unavailable(
            f"GCSharp model did not return usable JSON (needed key "
            f"'{required_key}', got {last_err}). Retry, or increase "
            f"GC_MODEL_MAX_TOKENS (currently {GC_MODEL_MAX_TOKENS})."
        )
        raise  # pragma: no cover

    async def healthcheck(self, timeout: float = 6.0) -> Dict[str, Any]:
        """Cheap liveness probe used by /ai/model/status."""
        if not self.configured:
            self._status.healthy = False
            self._status.detail = "not_configured"
            return self.status()
        started = time.monotonic()
        try:
            if self._status.backend == "gguf":
                await asyncio.to_thread(self._generate_gguf_blocking,
                                        [{"role": "user", "content": "Reply with OK"}],
                                        8, 0.0)
            else:
                await self._generate_http(
                    [{"role": "user", "content": "Reply with OK"}], 8, 0.0, timeout)
            self._status.healthy = True
            self._status.detail = "serving"
            self._status.latency_ms = int((time.monotonic() - started) * 1000)
        except GCModelUnavailableError as e:
            self._status.healthy = False
            self._status.detail = str(e)[:300]
        except Exception as e:
            self._status.healthy = False
            self._status.detail = f"healthcheck error: {e}"[:300]
        return self.status()


# ------------------------------------------------------------
# JSON extraction (self-contained so this module never imports the server)
# ------------------------------------------------------------

def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    t = text.strip()
    try:
        return json.loads(t)
    except Exception:
        pass
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", t, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1))
        except Exception:
            pass
    start = t.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(t)):
            ch = t[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(t[start:i + 1])
                    except Exception:
                        break
    return None


# ------------------------------------------------------------
# Singleton accessor
# ------------------------------------------------------------

_singleton: Optional[GCSharpModel] = None


def get_gc_model() -> GCSharpModel:
    global _singleton
    if _singleton is None:
        _singleton = GCSharpModel()
        if _singleton.configured:
            st = _singleton.status()
            logger.info("GCSharp model adapter ready (backend=%s, endpoint=%s)",
                        st["backend"], st["endpoint"])
        else:
            logger.warning(
                "GCSharp model NOT configured - generation features will return "
                "HTTP 503 until GC_MODEL_URL or GC_MODEL_PATH is set.")
    return _singleton
