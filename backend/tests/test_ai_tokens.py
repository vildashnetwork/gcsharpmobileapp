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
        return {
            key: self.user[key]
            for key in ("ai_tokens_remaining", "ai_tokens_used")
            if key in self.user
        }


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
