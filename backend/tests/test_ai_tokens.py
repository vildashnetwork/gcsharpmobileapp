import asyncio
import importlib
import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


class FakeUsers:
    def __init__(self, user):
        self.user = user

    async def update_one(self, query, update):
        if (
            "email" in query
            and query.get("offline_manual_grant_id") == {
                "$ne": update["$set"]["offline_manual_grant_id"]
            }
        ):
            if (
                self.user.get("email") != query["email"]
                or self.user.get("offline_manual_grant_id")
                == update["$set"]["offline_manual_grant_id"]
            ):
                return SimpleNamespace(modified_count=0)
            self.user.update(update["$set"])
            return SimpleNamespace(modified_count=1)
        if query.get("offline_trial_expires_at") == {"$exists": False}:
            if "offline_trial_expires_at" in self.user:
                return SimpleNamespace(modified_count=0)
            self.user.update(update["$set"])
            return SimpleNamespace(modified_count=1)
        if "ai_tokens_remaining" in query:
            condition = query["ai_tokens_remaining"]
            if condition == {"$exists": False}:
                if "ai_tokens_remaining" in self.user:
                    return SimpleNamespace(modified_count=0)
                self.user.update(update["$set"])
                return SimpleNamespace(modified_count=1)
            if condition == {"$gt": 0}:
                if self.user.get("ai_tokens_remaining", 0) <= 0:
                    return SimpleNamespace(modified_count=0)
                for key, amount in update["$inc"].items():
                    self.user[key] = self.user.get(key, 0) + amount
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def find_one(self, query, projection):
        if self.user.get("user_id") != query.get("user_id"):
            return None
        if projection:
            return {
                key: self.user[key]
                for key in projection
                if key != "_id" and key in self.user
            }
        return dict(self.user)


class FakeOfflineDownloads:
    def __init__(self):
        self.record = None

    async def update_one(self, query, update, upsert=False):
        if "$setOnInsert" in update:
            if self.record is None and upsert:
                self.record = {**query, **update["$setOnInsert"]}
            return SimpleNamespace(modified_count=0)

        if self.record is None:
            return SimpleNamespace(modified_count=0)
        paper_id = update["$addToSet"]["paper_ids"]
        if (
            paper_id not in self.record["paper_ids"]
            and len(self.record["paper_ids"]) < 10
        ):
            self.record["paper_ids"].append(paper_id)
            return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    async def find_one(self, query, projection):
        if not self.record or any(
            self.record.get(key) != value for key, value in query.items()
        ):
            return None
        return {"paper_ids": list(self.record["paper_ids"])}


class FakeDrafts:
    def __init__(self):
        self.records = {}

    async def update_one(self, query, update, upsert=False):
        key = (query["user_id"], query["paper_id"])
        if key not in self.records and upsert:
            self.records[key] = dict(update["$setOnInsert"])
            return SimpleNamespace(upserted_id="created")
        return SimpleNamespace(upserted_id=None)

    async def find_one(self, query):
        return self.records.get((query["user_id"], query["paper_id"]))


@pytest.fixture
def server_module(monkeypatch):
    module = importlib.import_module("server_sqlite_full_corrected")
    users = FakeUsers({"user_id": "test-user"})
    monkeypatch.setattr(module, "db", SimpleNamespace(users=users))
    return module, users


def test_legacy_account_receives_one_initial_grant(server_module):
    module, users = server_module

    first = asyncio.run(module._ensure_ai_token_balance("test-user"))
    second = asyncio.run(module._ensure_ai_token_balance("test-user"))

    assert first == {"remaining": 100, "used": 0}
    assert second == first
    assert users.user["ai_tokens_remaining"] == 100


def test_token_is_consumed_atomically_and_empty_balance_is_rejected(server_module):
    module, users = server_module
    users.user.update({"ai_tokens_remaining": 1, "ai_tokens_used": 0})

    remaining = asyncio.run(module._consume_ai_token("test-user"))

    assert remaining == 0
    assert users.user["ai_tokens_remaining"] == 0
    assert users.user["ai_tokens_used"] == 1

    with pytest.raises(HTTPException) as error:
        asyncio.run(module._consume_ai_token("test-user"))
    assert error.value.status_code == 402
    assert "AI tokens exhausted" in error.value.detail


def test_legacy_offline_trial_is_granted_once_and_paid_expiry_extends_it(server_module):
    module, users = server_module
    first = asyncio.run(module._ensure_offline_access("test-user"))
    first_expiry = users.user["offline_trial_expires_at"]
    second = asyncio.run(module._ensure_offline_access("test-user"))

    assert first["active"] is True
    assert first["access_type"] == "trial"
    assert first["remaining_days"] == 7
    assert second["trial_expires_at"] == first_expiry

    from datetime import datetime, timedelta, timezone

    paid_until = datetime.now(timezone.utc) + timedelta(days=30)
    users.user["offline_access_until"] = paid_until.isoformat()
    paid = asyncio.run(module._ensure_offline_access("test-user"))

    assert paid["active"] is True
    assert paid["access_type"] == "subscription"
    assert paid["expires_at"] == paid_until.isoformat()


def test_expired_offline_trial_stays_expired(server_module):
    module, users = server_module
    users.user.update({
        "offline_trial_started_at": "2000-01-01T00:00:00+00:00",
        "offline_trial_expires_at": "2000-01-08T00:00:00+00:00",
    })

    status = asyncio.run(module._ensure_offline_access("test-user"))

    assert status["active"] is False
    assert status["access_type"] == "expired"
    assert users.user["offline_trial_expires_at"] == "2000-01-08T00:00:00+00:00"


def test_requested_email_receives_idempotent_seven_day_manual_grant(server_module):
    module, users = server_module
    users.user["email"] = module.OFFLINE_MANUAL_GRANT_EMAIL
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    original_trial_expiry = "2000-01-08T00:00:00+00:00"
    users.user.update({
        "offline_trial_started_at": "2000-01-01T00:00:00+00:00",
        "offline_trial_expires_at": original_trial_expiry,
    })

    granted = asyncio.run(module._grant_offline_trial_once(
        module.OFFLINE_MANUAL_GRANT_EMAIL,
        module.OFFLINE_MANUAL_GRANT_ID,
        now,
    ))
    repeated = asyncio.run(module._grant_offline_trial_once(
        module.OFFLINE_MANUAL_GRANT_EMAIL,
        module.OFFLINE_MANUAL_GRANT_ID,
        now + timedelta(days=30),
    ))
    status = asyncio.run(module._ensure_offline_access("test-user"))

    expected_expiry = now + timedelta(days=7)
    assert granted is True
    assert repeated is False
    assert users.user["offline_manual_grant_id"] == module.OFFLINE_MANUAL_GRANT_ID
    assert users.user["offline_manual_grant_started_at"] == now.isoformat()
    assert users.user["offline_manual_grant_expires_at"] == expected_expiry.isoformat()
    assert users.user["offline_trial_expires_at"] == original_trial_expiry
    assert status["active"] is True
    assert status["access_type"] == "trial"
    assert status["expires_at"] == expected_expiry.isoformat()


def test_requested_email_grant_does_not_create_a_missing_account(server_module):
    module, users = server_module
    existing_email = "another-account@example.com"
    users.user["email"] = existing_email

    granted = asyncio.run(module._grant_offline_trial_once(
        module.OFFLINE_MANUAL_GRANT_EMAIL,
        module.OFFLINE_MANUAL_GRANT_ID,
    ))

    assert granted is False
    assert users.user["email"] == existing_email
    assert "offline_manual_grant_id" not in users.user


def test_downloaded_paper_draft_is_added_idempotently(server_module, monkeypatch):
    module, _users = server_module
    drafts = FakeDrafts()

    class FakePapers:
        async def find_one(self, query, projection):
            return {"paper_id": query["paper_id"]}

    monkeypatch.setattr(
        module, "db",
        SimpleNamespace(papers=FakePapers(), drafts=drafts),
    )
    request = module.DraftRequest(paper_id="paper-1")

    first = asyncio.run(module.save_downloaded_paper_draft(
        request, {"user_id": "test-user"}))
    second = asyncio.run(module.save_downloaded_paper_draft(
        request, {"user_id": "test-user"}))

    assert first == {"saved": True}
    assert second == {"saved": True}
    assert len(drafts.records) == 1
    assert drafts.records[("test-user", "paper-1")]["saved_from_download"] is True


def test_offline_download_limit_counts_unique_papers_and_rejects_the_eleventh(server_module, monkeypatch):
    module, _users = server_module
    downloads = FakeOfflineDownloads()
    monkeypatch.setattr(module, "db", SimpleNamespace(offline_paper_downloads=downloads))

    for index in range(10):
        usage = asyncio.run(
            module._record_offline_paper_download("test-user", f"paper-{index}"))

    assert usage == {"downloaded_today": 10, "remaining_today": 0, "daily_limit": 10}

    repeated = asyncio.run(
        module._record_offline_paper_download("test-user", "paper-0"))
    assert repeated["remaining_today"] == 0

    with pytest.raises(HTTPException) as error:
        asyncio.run(module._record_offline_paper_download("test-user", "paper-10"))
    assert error.value.status_code == 429


def test_offline_access_endpoint_includes_remaining_daily_downloads(server_module, monkeypatch):
    module, users = server_module
    downloads = FakeOfflineDownloads()
    monkeypatch.setattr(
        module, "db",
        SimpleNamespace(users=users, offline_paper_downloads=downloads),
    )
    asyncio.run(module._record_offline_paper_download("test-user", "paper-1"))

    access = asyncio.run(module.get_offline_access({"user_id": "test-user"}))

    assert access["active"] is True
    assert access["download_limit_per_day"] == 10
    assert access["downloaded_today"] == 1
    assert access["downloads_remaining_today"] == 9


def test_offline_download_endpoint_rejects_expired_access(server_module, monkeypatch):
    module, users = server_module
    users.user.update({
        "offline_trial_started_at": "2000-01-01T00:00:00+00:00",
        "offline_trial_expires_at": "2000-01-08T00:00:00+00:00",
    })
    downloads = FakeOfflineDownloads()

    class FakePapers:
        async def find_one(self, *args, **kwargs):
            raise AssertionError("Expired access must be rejected before paper lookup.")

    monkeypatch.setattr(
        module, "db",
        SimpleNamespace(users=users, papers=FakePapers(),
                        offline_paper_downloads=downloads),
    )

    with pytest.raises(HTTPException) as error:
        asyncio.run(module.authorize_offline_paper_download(
            "paper-1", {"user_id": "test-user"}))

    assert error.value.status_code == 402
    assert "offline access expired" in error.value.detail.lower()
    assert downloads.record is None


def test_paper_question_answer_uses_authenticated_token_meter(server_module, monkeypatch):
    module, users = server_module
    charged = []

    class FakePapers:
        async def find_one(self, query, projection):
            return None

    async def consume(user_id):
        charged.append(user_id)

    async def generate(prompt, **kwargs):
        assert "Question:\n\nWhy?" in prompt
        return "## Solution\nWorked answer", "test"

    monkeypatch.setattr(
        module, "db", SimpleNamespace(users=users, papers=FakePapers()))
    monkeypatch.setattr(module, "_consume_ai_token", consume)
    monkeypatch.setattr(module, "_generate_ai_text", generate)

    result = asyncio.run(module.ask_about_paper(
        module.AskRequest(paper_id="paper-1", question="Why?"),
        user={"user_id": "test-user"},
    ))

    assert result == {"answer": "## Solution\nWorked answer"}
    assert charged == ["test-user"]


def test_video_json_generation_uses_gcsharp_model(server_module, monkeypatch):
    module, _users = server_module
    import gc_model

    calls = []

    class FakeGCModel:
        async def generate_json(self, prompt, required_key, **kwargs):
            calls.append((prompt, required_key, kwargs))
            return {"scenes": [{"heading": "Worked solution"}]}

    monkeypatch.setattr(gc_model, "get_gc_model", lambda: FakeGCModel())

    result, provider = asyncio.run(module._generate_gc_video_json(
        "Create a video script", "scenes", system="Teacher instructions"))

    assert provider == "gcsharp"
    assert result["scenes"][0]["heading"] == "Worked solution"
    assert calls[0][0:2] == ("Create a video script", "scenes")
    assert calls[0][2]["system"] == "Teacher instructions"


def test_video_json_generation_preserves_model_setup_error(server_module, monkeypatch):
    module, _users = server_module
    import gc_model

    class UnavailableGCModel:
        async def generate_json(self, *args, **kwargs):
            raise gc_model.GCModelUnavailableError(
                "GCSharp model is not configured. Set GC_MODEL_URL.",
                configured=False,
            )

    monkeypatch.setattr(gc_model, "get_gc_model", lambda: UnavailableGCModel())

    with pytest.raises(HTTPException) as error:
        asyncio.run(module._generate_gc_video_json("prompt", "scenes"))

    assert error.value.status_code == 503
    assert "GCSharp video model unavailable" in error.value.detail
    assert "Set GC_MODEL_URL" in error.value.detail


def test_model_status_reports_gcsharp_video_model_configuration(server_module, monkeypatch):
    module, _users = server_module
    import gc_model

    class FakeGCModel:
        def status(self):
            return {
                "configured": False,
                "backend": None,
                "healthy": False,
                "latency_ms": None,
            }

    monkeypatch.setattr(
        module.gc_ai, "provider_status",
        lambda: {"gemini_configured": True, "openrouter_configured": False})
    monkeypatch.setattr(gc_model, "get_gc_model", lambda: FakeGCModel())

    status = asyncio.run(module.gc_model_status())

    assert status["configured"] is True
    assert status["video_model"]["configured"] is False
    assert status["video_available"] is False
    assert "GC_MODEL_URL" in status["video_unavailable_reason"]
