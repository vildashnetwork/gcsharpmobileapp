"""Tests for the GCSharp AI-platform upgrade (Phases 1-8).

Run from backend/:  python -m pytest tests/test_gcsharp_upgrades.py -v

These tests are intentionally OFFLINE:
  * model adapter tests use a local mock OpenAI-compatible server (no external
    API is ever contacted),
  * feed/knowledge/training tests exercise pure logic + validation,
  * route tests import the FastAPI app and assert wiring (no server or
    MongoDB connection is required for import).
"""

import importlib
import hashlib
import io
import json
import os
import sys
import threading
import types
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ------------------------------------------------------------
# Mock OpenAI-compatible model server (localhost only)
# ------------------------------------------------------------

class _MockHandler(BaseHTTPRequestHandler):
    """Minimal /v1/chat/completions server for adapter tests."""

    behavior = {"mode": "ok", "payload": None}

    def do_POST(self):  # noqa: N802 (stdlib API)
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        mode = _MockHandler.behavior["mode"]
        if mode == "ok":
            forced = _MockHandler.behavior.get("payload")
            if forced is None:
                messages = body.get("messages", [])
                user_msg = next((m.get("content", "") for m in messages
                                 if m.get("role") == "user"), "hi")
                forced = {"scenes": [{"heading": "Step 1",
                                      "board": ["line from mock model"],
                                      "narration": f"Mock lesson for: {user_msg[:60]}"}]}
            resp = {"choices": [{"message": {"content": json.dumps(forced)}}]}
            raw = json.dumps(resp).encode()
            self.send_response(200)
        elif mode == "bad_json":
            raw = json.dumps({"choices": [{"message": {"content": "not json at all"}}]}).encode()
            self.send_response(200)
        elif mode == "http500":
            raw = b"boom"
            self.send_response(500)
        else:
            raw = b""
            self.send_response(503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *args):  # silence test output
        pass


@pytest.fixture(scope="module")
def mock_model_server():
    server = HTTPServer(("127.0.0.1", 0), _MockHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}/v1"
    server.shutdown()


def _fresh_gc_model(monkeypatch, url: str = "", path: str = "", extra_env=None):
    """Reload gc_model with fresh env so config is picked up."""
    defaults = {
        "GC_MODEL_REPO_ID": "",
        "GC_MODEL_FILE": "",
        "GC_MODEL_REVISION": "main",
        "GC_MODEL_SHA256": "",
        "GC_MODEL_CACHE_DIR": "",
        "GC_MODEL_DOWNLOAD_TIMEOUT": "600",
        "GC_MODEL_NAME": "gcsharp",
        "GC_MODEL_API_KEY": "",
        "GC_MODEL_MAX_TOKENS": "2048",
        "GC_MODEL_TEMPERATURE": "0.2",
        "GC_MODEL_CTX": "4096",
        "GC_MODEL_N_THREADS": "4",
    }
    for name, value in defaults.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("GC_MODEL_URL", url)
    monkeypatch.setenv("GC_MODEL_PATH", path)
    monkeypatch.setenv("GC_MODEL_TIMEOUT", "10")
    for name, value in (extra_env or {}).items():
        monkeypatch.setenv(name, value)
    import gc_model
    importlib.reload(gc_model)
    return gc_model


# ------------------------------------------------------------
# Phase 2: GCSharp model adapter
# ------------------------------------------------------------

class TestGCModelAdapter:
    def test_unconfigured_raises_strict_error(self, monkeypatch):
        gm = _fresh_gc_model(monkeypatch, url="", path="")
        model = gm.get_gc_model()
        assert model.configured is False
        with pytest.raises(gm.GCModelUnavailableError) as exc:
            import asyncio
            asyncio.run(model.generate("hello"))
        msg = str(exc.value)
        assert "GC_MODEL_URL" in msg or "GC_MODEL_PATH" in msg
        assert "OpenRouter" not in msg and "Gemini" not in msg

    def test_status_reports_unconfigured(self, monkeypatch):
        gm = _fresh_gc_model(monkeypatch, url="", path="")
        st = gm.get_gc_model().status()
        assert st["configured"] is False
        assert st["healthy"] is False
        assert st["supports_fine_tune"] is False

    def test_http_generation_roundtrip(self, mock_model_server, monkeypatch):
        gm = _fresh_gc_model(monkeypatch, url=mock_model_server)
        model = gm.get_gc_model()
        assert model.configured is True
        import asyncio
        out = asyncio.run(model.generate("Explain Ohm's law", max_tokens=128))
        assert isinstance(out, str) and out.strip()
        assert model.status()["generations"] >= 1
        assert model.status()["healthy"] is True

    def test_generate_json_returns_scenes(self, mock_model_server, monkeypatch):
        gm = _fresh_gc_model(monkeypatch, url=mock_model_server)
        model = gm.get_gc_model()
        import asyncio
        data = asyncio.run(model.generate_json(
            "Build a lesson about quadratics", "scenes", max_tokens=256))
        assert "scenes" in data
        scene = data["scenes"][0]
        assert {"heading", "board", "narration"} <= set(scene)

    def test_generate_json_bad_output_is_clear_error(self, mock_model_server, monkeypatch):
        gm = _fresh_gc_model(monkeypatch, url=mock_model_server)
        _MockHandler.behavior["mode"] = "bad_json"
        try:
            model = gm.get_gc_model()
            import asyncio
            with pytest.raises(gm.GCModelUnavailableError) as exc:
                asyncio.run(model.generate_json("x", "scenes"))
            assert "JSON" in str(exc.value) or "json" in str(exc.value)
        finally:
            _MockHandler.behavior["mode"] = "ok"

    def test_http_error_maps_to_retryable_error(self, mock_model_server, monkeypatch):
        gm = _fresh_gc_model(monkeypatch, url=mock_model_server)
        _MockHandler.behavior["mode"] = "http500"
        try:
            model = gm.get_gc_model()
            import asyncio
            with pytest.raises(gm.GCModelUnavailableError) as exc:
                asyncio.run(model.generate("hello"))
            assert "HTTP 500" in str(exc.value)
        finally:
            _MockHandler.behavior["mode"] = "ok"

    def test_url_variants_normalize_to_chat_completions(self, monkeypatch):
        gm = _fresh_gc_model(monkeypatch, url="http://localhost:11434/v1")
        assert gm.GCSharpModel._chat_url().endswith("/v1/chat/completions")
        gm2 = _fresh_gc_model(monkeypatch, url="http://localhost:8080/")
        assert gm2.GCSharpModel._chat_url().endswith("/v1/chat/completions")
        gm3 = _fresh_gc_model(monkeypatch, url="http://x/v1/chat/completions")
        assert gm3.GCSharpModel._chat_url() == "http://x/v1/chat/completions"

    def test_missing_gguf_path_is_actionable(self, monkeypatch):
        gm = _fresh_gc_model(monkeypatch, path="C:/nonexistent/model.gguf")
        model = gm.get_gc_model()
        assert model.configured is True
        import asyncio
        with pytest.raises(gm.GCModelUnavailableError) as exc:
            asyncio.run(model.generate("hi"))
        assert "does not exist" in str(exc.value) or "gguf" in str(exc.value).lower()

    def test_gguf_generation_uses_local_chat_completion(self, monkeypatch, tmp_path):
        model_path = tmp_path / "model.gguf"
        model_path.write_bytes(b"fake gguf")
        calls = {}

        class FakeLlama:
            def __init__(self, **kwargs):
                calls["init"] = kwargs

            def create_chat_completion(self, **kwargs):
                calls["completion"] = kwargs
                return {"choices": [{"message": {"content": "Local model answer"}}]}

        fake_module = types.ModuleType("llama_cpp")
        setattr(fake_module, "Llama", FakeLlama)
        monkeypatch.setitem(sys.modules, "llama_cpp", fake_module)

        gm = _fresh_gc_model(monkeypatch, path=str(model_path))
        model = gm.get_gc_model()
        import asyncio
        answer = asyncio.run(model.generate("Explain current"))

        assert answer == "Local model answer"
        assert calls["init"]["model_path"] == str(model_path)
        assert calls["completion"]["messages"][-1]["content"] == "Explain current"
        assert model.status()["healthy"] is True

    def test_gguf_without_optional_runtime_is_actionable(self, monkeypatch, tmp_path):
        model_path = tmp_path / "model.gguf"
        model_path.write_bytes(b"fake gguf")
        monkeypatch.setitem(sys.modules, "llama_cpp", None)

        gm = _fresh_gc_model(monkeypatch, path=str(model_path))
        model = gm.get_gc_model()
        import asyncio
        with pytest.raises(gm.GCModelUnavailableError) as exc:
            asyncio.run(model.generate("Test missing runtime"))

        assert "requirements-llm.txt" in str(exc.value)

    def test_gguf_cached_checksum_mismatch_is_rejected(self, monkeypatch, tmp_path):
        model_path = tmp_path / "model.gguf"
        model_path.write_bytes(b"not the expected model")
        env = {"GC_MODEL_SHA256": "0" * 64}
        gm = _fresh_gc_model(monkeypatch, path=str(model_path), extra_env=env)
        model = gm.get_gc_model()

        import asyncio
        with pytest.raises(gm.GCModelUnavailableError) as exc:
            asyncio.run(model.generate("Test checksum"))

        assert "does not match GC_MODEL_SHA256" in str(exc.value)

    def test_gguf_download_is_pinned_verified_and_cached(
        self, monkeypatch, tmp_path
    ):
        payload = b"small test model"
        env = {
            "GC_MODEL_REPO_ID": "example/gc-model",
            "GC_MODEL_FILE": "model.gguf",
            "GC_MODEL_REVISION": "abc123",
            "GC_MODEL_SHA256": hashlib.sha256(payload).hexdigest(),
            "GC_MODEL_CACHE_DIR": str(tmp_path),
        }
        calls = {}

        def fake_urlopen(request, timeout):
            calls["url"] = request.full_url
            calls["timeout"] = timeout
            return io.BytesIO(payload)

        monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

        class FakeLlama:
            def __init__(self, **kwargs):
                calls["model_path"] = kwargs["model_path"]

            def create_chat_completion(self, **kwargs):
                return {"choices": [{"message": {"content": "Downloaded model"}}]}

        fake_module = types.ModuleType("llama_cpp")
        setattr(fake_module, "Llama", FakeLlama)
        monkeypatch.setitem(sys.modules, "llama_cpp", fake_module)

        gm = _fresh_gc_model(monkeypatch, extra_env=env)
        model = gm.get_gc_model()
        import asyncio
        answer = asyncio.run(model.generate("Test download"))

        expected_path = tmp_path / "example--gc-model" / "model.gguf"
        assert answer == "Downloaded model"
        assert calls["url"] == (
            "https://huggingface.co/example/gc-model/resolve/abc123/"
            "model.gguf?download=true"
        )
        assert expected_path.read_bytes() == payload
        assert calls["model_path"] == str(expected_path)


# ------------------------------------------------------------
# Phase 1: learning-feed validation helpers
# ------------------------------------------------------------

class TestFeedValidation:
    def test_clean_text_strips_control_chars_and_caps(self):
        import gc_feed
        out = gc_feed._clean_text("hello\x00\x07 world", 100)
        assert out == "hello world"
        assert gc_feed._clean_text(None, 10) == ""
        long = gc_feed._clean_text("x" * 50, 10)
        assert len(long) == 10

    def test_classify_upload_accepts_valid_pairs(self):
        import gc_feed
        assert gc_feed.classify_upload("image/jpeg", "photo.jpg") == "image"
        assert gc_feed.classify_upload("image/png", "shot.png") == "image"
        assert gc_feed.classify_upload("video/mp4", "clip.mp4") == "video"
        assert gc_feed.classify_upload("video/quicktime", "clip.mov") == "video"
        assert gc_feed.classify_upload("application/octet-stream", "clip.mp4") == "video"
        assert gc_feed.classify_upload("", "clip.3gp") == "video"
        assert gc_feed.classify_upload("video/mp4", "clip") == "video"

    def test_classify_upload_rejects_mismatches(self):
        import gc_feed
        # Extension/MIME disagreement is rejected (renamed exe trick).
        assert gc_feed.classify_upload("image/jpeg", "evil.exe") is None
        assert gc_feed.classify_upload("application/pdf", "doc.pdf") is None
        assert gc_feed.classify_upload("text/html", "page.jpg") is None
        assert gc_feed.classify_upload("application/pdf", "clip.mp4") is None

    def test_feed_media_must_be_from_gcsharp_cloudinary(self):
        import gc_feed
        image = gc_feed.FeedMediaIn(
            type="image",
            url=f"https://res.cloudinary.com/{gc_feed.CLOUDINARY_CLOUD_NAME}/image/upload/v1/photo.jpg",
            name="photo.jpg",
        )
        assert gc_feed._validated_cloudinary_media([image])[0]["type"] == "image"

        with pytest.raises(gc_feed.HTTPException) as error:
            gc_feed._validated_cloudinary_media([
                gc_feed.FeedMediaIn(
                    type="video", url="https://example.com/video.mp4", name="video.mp4")
            ])
        assert error.value.status_code == 422

    def test_feed_post_models_accept_media_and_patch_omission_preserves_it(self):
        import gc_feed
        media = {
            "type": "image",
            "url": (
                f"https://res.cloudinary.com/{gc_feed.CLOUDINARY_CLOUD_NAME}"
                "/image/upload/v1/photo.jpg"
            ),
            "name": "photo.jpg",
        }

        create_payload = gc_feed.FeedPostIn(body="Question", media=[media])
        assert create_payload.model_dump()["media"] == [media]

        edit_without_media = gc_feed.FeedPostUpdate(body="Edited question")
        assert "media" not in edit_without_media.model_dump(exclude_unset=True)

        edit_with_media = gc_feed.FeedPostUpdate(media=[media])
        assert edit_with_media.model_dump(exclude_unset=True)["media"] == [media]

    def test_magic_bytes_match_declared_types(self):
        import gc_feed
        assert gc_feed._magic_ok("image", b"\xff\xd8\xff\xe0rest") is True      # JPEG
        assert gc_feed._magic_ok("image", b"\x89PNG\r\n\x1a\nxx") is True       # PNG
        assert gc_feed._magic_ok("image", b"GIF89a..") is True                  # GIF
        assert gc_feed._magic_ok("image", b"RIFF....WEBP") is True              # WEBP
        assert gc_feed._magic_ok("video", b"\x00\x00\x00\x18ftypisom") is True  # MP4
        assert gc_feed._magic_ok("video", b"\x1a\x45\xdf\xa3") is True          # WebM
        # PE executable / plain text must never pass.
        assert gc_feed._magic_ok("image", b"MZ\x90\x00") is False
        assert gc_feed._magic_ok("video", b"just some text") is False

    def test_rate_limit_blocks_after_budget(self):
        import gc_feed
        key = "unittest_rate_1"
        gc_feed._rate_hits.pop(key, None)
        allowed = [gc_feed._rate_limit(key, 3, window_seconds=3600)
                   for _ in range(5)]
        assert allowed == [True, True, True, False, False]
        gc_feed._rate_hits.pop(key, None)

    def test_safe_upload_name_is_traversal_safe(self):
        import gc_feed
        name = gc_feed._safe_upload_name("../../etc/passwd", ".jpg")
        assert "/" not in name and ".." not in name
        assert name.endswith(".jpg")
        assert len(name) > 10  # includes unique suffix


# ------------------------------------------------------------
# Phase 3: knowledge growth (source scoring, dedupe)
# ------------------------------------------------------------

class TestKnowledgeGrowth:
    def test_trusted_domain_scores_high(self):
        import gc_knowledge_growth as kg
        q = kg.score_source(
            "Khan Academy: Quadratic equations",
            "Learn to solve quadratic equations by factorisation with worked "
            "examples and practice questions for students.",
            "https://www.khanacademy.org/math/algebra", "quadratic equations")
        assert q >= 0.6

    def test_low_trust_domain_scores_low(self):
        import gc_knowledge_growth as kg
        q = kg.score_source("Pin", "nice pic",
                            "https://pinterest.com/x", "quadratic equations")
        assert q <= 0.3

    def test_dedupe_hash_is_stable_and_discriminative(self):
        import gc_knowledge_growth as kg
        assert kg.dedupe_hash("Topic", "Answer") == kg.dedupe_hash("topic", " answer")
        assert kg.dedupe_hash("a", "x") != kg.dedupe_hash("a", "y")

    def test_seed_topics_cover_exam_levels(self):
        import gc_knowledge_growth as kg
        assert {"GCE O Level", "GCE A Level"} <= set(kg.SEED_TOPICS)

    def test_subdomains_are_not_counted_as_independent_evidence(self):
        import gc_knowledge_growth as kg
        assert kg._sources_agree([
            {"url": "https://math.khanacademy.org/algebra"},
            {"url": "https://www.khanacademy.org/geometry"},
        ]) is False
        assert kg._sources_agree([
            {"url": "https://www.khanacademy.org/algebra"},
            {"url": "https://www.bbc.co.uk/bitesize/geometry"},
        ]) is True


# ------------------------------------------------------------
# Phase 4: controlled training (validation + honest capability report)
# ------------------------------------------------------------

class TestTrainingPipeline:
    def test_validate_dataset_flags_short_and_long(self):
        import gc_training as t
        good = {"instruction": "Explain Newton's first law of motion clearly",
                "response": "Newton's first law says an object stays at rest "
                            "or in uniform motion unless a net force acts on it."}
        bad_short = {"instruction": "hi", "response": "short"}
        bad_long = {"instruction": "Explain something long",
                    "response": "y" * 9000}
        report = t.validate_dataset([good, bad_short, bad_long])
        assert report["valid"] == 1
        assert report["invalid"] == 2
        assert report["ready"] is False
        assert "reason" in report

    def test_training_never_claims_finetune_without_trainer(self):
        import gc_training as t
        # Default backend is prepare_only -> honest "cannot fine-tune" report.
        assert t.TrainingBackend.supports_fine_tune() is False
        assert "no model weights are updated" in t.TrainingBackend.description()

    def test_lexical_overlap_bounds(self):
        import gc_training as t
        assert t._lexical_overlap("same words here", "same words here") == 1.0
        assert t._lexical_overlap("alpha beta", "gamma delta") == 0.0


# ------------------------------------------------------------
# Phase 1/2: citations parsing + engine GC-model wiring
# ------------------------------------------------------------

class TestCitationsAndEngine:
    def test_parse_research_citations_extracts_real_urls(self):
        import gc_ai_engine as gc_ai
        research = (
            "Web research results (verified facts to base your explanation on):\n"
            "[1] Khan Academy: Quadratics intro (source: https://www.khanacademy.org/q)\n"
            "[2] BBC Bitesize: Algebra (source: https://www.bbc.co.uk/bitesize/a)\n"
        )
        cites = gc_ai.parse_research_citations(research)
        assert len(cites) == 2
        assert cites[0]["url"] == "https://www.khanacademy.org/q"
        assert "Khan" in cites[0]["title"]

    def test_parse_research_citations_never_fabricates_urls(self):
        import gc_ai_engine as gc_ai
        assert gc_ai.parse_research_citations("") == []
        assert gc_ai.parse_research_citations("no sources here at all") == []

    def test_knowledge_citations_use_only_saved_http_sources(self):
        import gc_ai_engine as gc_ai
        cites = gc_ai._knowledge_citations({"sources": [
            {"title": "OpenStax", "url": "https://openstax.org/books/physics"},
            {"title": "Duplicate", "url": "https://openstax.org/books/physics"},
            {"title": "Unsafe", "url": "javascript:alert(1)"},
        ]})
        assert cites == [{
            "title": "OpenStax",
            "url": "https://openstax.org/books/physics",
        }]

    def test_answer_question_without_model_flags_unavailable(self, monkeypatch):
        """GC-model path must flag unavailability, not use an external LLM."""
        import asyncio
        _fresh_gc_model(monkeypatch, url="", path="")
        import gc_ai_engine as gc_ai
        from types import SimpleNamespace

        class _AsyncFind:
            async def create_index(self, *a, **k):
                return None

            async def find(self, *a, **k):
                return self

            async def to_list(self, n):
                return []

            async def find_one(self, *a, **k):
                return None

        fake_db = SimpleNamespace(ai_knowledge=_AsyncFind())
        outcome = asyncio.run(gc_ai.answer_question(
            fake_db, "Why is the sky blue Rayleigh scattering?",
            allow_web_learning=False, use_gc_model=True))
        # No model configured -> strict unavailable signal (not a fake answer).
        assert outcome["source"] == "gc_model_unavailable"
        assert outcome["answer"] == ""
        assert outcome.get("error")
        # Must not have silently used an external provider.
        assert outcome["source"] not in ("openrouter", "google-gemini",
                                         "pollinations", "none")


# ------------------------------------------------------------
# Phase 7/8: app wiring - every new route exists and is registered
# ------------------------------------------------------------

class TestAppWiring:
    REQUIRED_PATHS = [
        # Phase 1 - learning feed
        "/api/feed/posts",
        "/api/feed/posts/{post_id}",
        "/api/feed/posts/{post_id}/like",
        "/api/feed/posts/{post_id}/save",
        "/api/feed/posts/{post_id}/share",
        "/api/feed/posts/{post_id}/comments",
        "/api/feed/posts/{post_id}/media",
        "/api/feed/posts/{post_id}/ai/retry",
        "/api/feed/saved",
        "/api/feed/facets",
        # Phase 2 - model + video generation
        "/api/ai/model/status",
        "/api/ai/video/from-text",
        "/api/ai/video/from-pdf",
        "/api/papers/{paper_id}/video",
        "/api/papers/{paper_id}/video/highlight",
        "/api/papers/{paper_id}/qa",
        "/api/ai/explain",
        "/api/ai/chat",
        "/api/ai/solution",
        # Phase 3/4 - knowledge growth + training
        "/api/ai/knowledge/growth/status",
        "/api/ai/knowledge/growth/run",
        "/api/ai/knowledge/entries",
        "/api/ai/training/status",
        "/api/ai/training/run",
        "/api/ai/training/runs",
        "/api/ai/training/checkpoints",
        # Phase 5/6 - realtime + notifications
        "/api/ws/learning",
        "/api/realtime/events",
        "/api/notifications/unread-count",
        "/api/notifications",
        "/api/notifications/register-push-token",
    ]

    @pytest.fixture(scope="class")
    def app_paths(self):
        import server_sqlite_full_corrected as s
        return [getattr(r, "path", "") for r in s.app.routes]

    def test_all_required_routes_exist(self, app_paths):
        missing = [p for p in self.REQUIRED_PATHS if p not in app_paths]
        assert not missing, f"Missing routes: {missing}"

    def test_feed_routes_are_under_api_prefix(self, app_paths):
        feed = [p for p in app_paths if p.startswith("/api/feed/")]
        assert len(feed) >= 9

    def test_feed_posts_support_edit_and_delete(self):
        import server_sqlite_full_corrected as s
        methods = set()
        for route in s.app.routes:
            if getattr(route, "path", "") == "/api/feed/posts/{post_id}":
                methods.update(getattr(route, "methods", set()))
        assert {"GET", "PATCH", "DELETE"}.issubset(methods)

    def test_push_token_endpoint_rejects_non_expo_tokens(self):
        from pydantic import ValidationError
        from server_sqlite_full_corrected import PushTokenRequest
        assert PushTokenRequest(token="ExpoPushToken[valid-Token_123]").token
        with pytest.raises(ValidationError):
            PushTokenRequest(token="not-a-push-token")

    def test_no_external_llm_generation_helpers_are_reachable(self):
        """_ask_ai_for_json must be hard-blocked (Phase 2 strict rule)."""
        import asyncio
        import server_sqlite_full_corrected as s
        with pytest.raises(Exception) as exc:
            asyncio.run(s._ask_ai_for_json(None, "prompt", "scenes"))
        assert "External LLM generation is disabled" in str(exc.value)
