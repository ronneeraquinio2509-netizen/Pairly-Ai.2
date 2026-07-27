"""Iteration 5 — Re-test of the recipe-generator quota bug fix + light regression.

Focus (per review_request):
  * POST /api/recipes/generate must count toward the daily AI cap.
  * When any mix of pairings/menus/chat/recipes reaches 5 for a free user,
    BOTH /api/recipes/generate AND /api/pairings must return 402.
  * Premium users remain unlimited.
  * Regression: GET /api/usage shape, POST /api/pairings still 200, GET /api/feed hydrated.
"""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

_mongo = MongoClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]


def _rand_email(prefix="q"):
    return f"TEST_iter5_{prefix}_{uuid.uuid4().hex[:8]}@pairly.app"


def _signup(session, prefix="q", role="home_cook"):
    email = _rand_email(prefix)
    r = session.post(
        f"{API}/auth/signup",
        json={"email": email, "password": "Pairly123!", "name": "Quota Tester", "role": role},
    )
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    return {
        "email": email,
        "id": d["user"]["id"],
        "headers": {"Authorization": f"Bearer {d['token']}"},
    }


def _seed_chat_messages(user_id: str, count: int) -> None:
    """Cheaply exhaust quota by inserting fake chat_messages docs for today.

    used_today() counts db.chat_messages where role='user' AND created_at starts with today's date.
    """
    today_iso = datetime.now(timezone.utc).isoformat()
    _db.chat_messages.insert_many([
        {
            "user_id": user_id,
            "role": "user",
            "content": f"TEST_iter5_msg_{i}",
            "created_at": today_iso,
        }
        for i in range(count)
    ])


def _cleanup(user_id: str, email: str) -> None:
    _db.chat_messages.delete_many({"user_id": user_id})
    _db.pairings.delete_many({"user_id": user_id})
    _db.menus.delete_many({"user_id": user_id})
    _db.ai_recipes.delete_many({"user_id": user_id})
    try:
        _db.users.delete_one({"_id": ObjectId(user_id)})
    except Exception:
        _db.users.delete_one({"email": email})


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# ------------------------------------------------------------------------------
# Regression: /api/usage shape + /api/pairings still works + /api/feed hydrated
# ------------------------------------------------------------------------------

class TestRegression:
    def test_usage_shape(self, s):
        u = _signup(s, "usage")
        try:
            r = s.get(f"{API}/usage", headers=u["headers"])
            assert r.status_code == 200, r.text[:300]
            body = r.json()
            for k in ("used_today", "limit", "remaining", "is_premium"):
                assert k in body, f"missing {k} in /api/usage: {body}"
            assert isinstance(body["used_today"], int)
            assert isinstance(body["limit"], int) and body["limit"] > 0
            assert isinstance(body["remaining"], int)
            assert body["is_premium"] is False
            assert body["used_today"] == 0
            assert body["remaining"] == body["limit"]
        finally:
            _cleanup(u["id"], u["email"])

    def test_pairings_still_works(self, s):
        u = _signup(s, "pair")
        try:
            r = s.post(
                f"{API}/pairings",
                json={"query": "TEST_iter5_carbonara", "category": "dish"},
                headers=u["headers"],
                timeout=90,
            )
            assert r.status_code == 200, r.text[:300]
            body = r.json()
            assert "id" in body and "pairings" in body
            assert isinstance(body["pairings"], list) and len(body["pairings"]) > 0
            # Sanity check the new iter4 extended fields are present on each pairing item
            for it in body["pairings"]:
                for f in ("flavor_profile", "nutrition_notes", "alternatives"):
                    assert f in it, f"missing field {f} in pairing item: {list(it.keys())}"
                assert isinstance(it["alternatives"], list)
            # And used_today ticked up by 1
            usage = s.get(f"{API}/usage", headers=u["headers"]).json()
            assert usage["used_today"] == 1, usage
        finally:
            _cleanup(u["id"], u["email"])

    def test_feed_hydrated(self, s):
        u = _signup(s, "feed")
        try:
            r = s.get(f"{API}/feed?scope=for_you", headers=u["headers"])
            assert r.status_code == 200, r.text[:300]
            body = r.json()
            # /feed returns a list of posts (possibly empty on a clean DB, but chef has posts)
            assert isinstance(body, list)
            if body:
                p = body[0]
                # hydrated posts should include author card + engagement counts
                assert "id" in p
                assert "author" in p and isinstance(p["author"], dict)
                for k in ("name", "role"):
                    assert k in p["author"], f"post author missing {k}: {p['author']}"
                for k in ("like_count", "comment_count"):
                    assert k in p, f"post missing {k}: {list(p.keys())}"
        finally:
            _cleanup(u["id"], u["email"])


# ------------------------------------------------------------------------------
# Quota aggregation: db.ai_recipes must now count toward used_today
# ------------------------------------------------------------------------------

class TestQuotaAggregatesRecipes:
    def test_seeded_ai_recipes_count_toward_used_today(self, s):
        """Directly seed 5 ai_recipes for today → /api/usage.used_today == 5, remaining == 0.

        This proves used_today() aggregates db.ai_recipes without burning a real LLM call.
        """
        u = _signup(s, "seedrec")
        try:
            today_iso = datetime.now(timezone.utc).isoformat()
            _db.ai_recipes.insert_many([
                {
                    "user_id": u["id"],
                    "created_at": today_iso,
                    "recipe": {"title": f"TEST_iter5_rec_{i}"},
                }
                for i in range(5)
            ])
            usage = s.get(f"{API}/usage", headers=u["headers"]).json()
            assert usage["used_today"] == 5, usage
            assert usage["remaining"] == 0, usage
            assert usage["is_premium"] is False
        finally:
            _cleanup(u["id"], u["email"])

    def test_recipes_generate_402_when_quota_exhausted(self, s):
        """5 chat messages today → POST /api/recipes/generate returns 402 immediately (no LLM call)."""
        u = _signup(s, "recquota")
        try:
            _seed_chat_messages(u["id"], 5)
            usage = s.get(f"{API}/usage", headers=u["headers"]).json()
            assert usage["used_today"] == 5 and usage["remaining"] == 0, usage

            r = s.post(
                f"{API}/recipes/generate",
                json={
                    "ingredients": ["pasta", "tomato"],
                    "cuisine": "italian",
                    "difficulty": "easy",
                    "cooking_time": "20",
                },
                headers=u["headers"],
                timeout=30,
            )
            assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text[:300]}"
        finally:
            _cleanup(u["id"], u["email"])

    def test_pairings_402_when_quota_exhausted(self, s):
        u = _signup(s, "pairquota")
        try:
            _seed_chat_messages(u["id"], 5)
            r = s.post(
                f"{API}/pairings",
                json={"query": "TEST_iter5_should_fail", "category": "ingredient"},
                headers=u["headers"],
                timeout=30,
            )
            assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text[:300]}"
        finally:
            _cleanup(u["id"], u["email"])

    def test_mixed_quota_exhaustion_blocks_both_endpoints(self, s):
        """Mix chat_messages + pairings + ai_recipes to reach 5, then both endpoints 402."""
        u = _signup(s, "mixquota")
        try:
            today_iso = datetime.now(timezone.utc).isoformat()
            # 2 chat + 2 pairings + 1 ai_recipe = 5
            _db.chat_messages.insert_many([
                {"user_id": u["id"], "role": "user", "content": "TEST_iter5_c", "created_at": today_iso}
                for _ in range(2)
            ])
            _db.pairings.insert_many([
                {
                    "user_id": u["id"], "query": f"TEST_iter5_seed_{i}", "category": "ingredient",
                    "created_at": today_iso, "pairings": [], "mini_recipe_steps": [], "is_favorite": False,
                }
                for i in range(2)
            ])
            _db.ai_recipes.insert_one({
                "user_id": u["id"], "created_at": today_iso, "recipe": {"title": "TEST_iter5_seed_rec"},
            })

            usage = s.get(f"{API}/usage", headers=u["headers"]).json()
            assert usage["used_today"] == 5, usage

            r1 = s.post(
                f"{API}/recipes/generate",
                json={"ingredients": ["egg"], "cuisine": "any", "difficulty": "easy", "cooking_time": "10"},
                headers=u["headers"], timeout=30,
            )
            assert r1.status_code == 402, r1.text[:300]

            r2 = s.post(
                f"{API}/pairings",
                json={"query": "TEST_iter5_should_fail_2", "category": "ingredient"},
                headers=u["headers"], timeout=30,
            )
            assert r2.status_code == 402, r2.text[:300]
        finally:
            _cleanup(u["id"], u["email"])

    def test_premium_user_bypasses_quota(self, s):
        """Even with 5 seeded requests today, is_premium=True → /api/pairings still 200."""
        u = _signup(s, "prem")
        try:
            # Flip the user to premium in DB
            _db.users.update_one({"_id": ObjectId(u["id"])}, {"$set": {"is_premium": True}})
            _seed_chat_messages(u["id"], 5)

            usage = s.get(f"{API}/usage", headers=u["headers"]).json()
            assert usage["is_premium"] is True, usage
            # Premium usage endpoint typically reports unlimited remaining; assert cap doesn't apply
            # by exercising a real endpoint:
            r = s.post(
                f"{API}/pairings",
                json={"query": "TEST_iter5_premium_ok", "category": "ingredient"},
                headers=u["headers"],
                timeout=90,
            )
            assert r.status_code == 200, f"premium user got {r.status_code}: {r.text[:300]}"
        finally:
            _cleanup(u["id"], u["email"])


# ------------------------------------------------------------------------------
# End-to-end recipe generator (uses real LLM — slow). Confirms used_today ticks up by 1.
# ------------------------------------------------------------------------------

class TestRecipeGeneratorIncrementsUsage:
    @pytest.mark.slow
    def test_generate_recipe_increments_used_today(self, s):
        u = _signup(s, "recgen")
        try:
            before = s.get(f"{API}/usage", headers=u["headers"]).json()
            assert before["used_today"] == 0

            r = s.post(
                f"{API}/recipes/generate",
                json={
                    "ingredients": ["pasta", "tomato", "basil"],
                    "cuisine": "italian",
                    "difficulty": "easy",
                    "cooking_time": "30",
                },
                headers=u["headers"],
                timeout=120,
            )
            assert r.status_code == 200, r.text[:300]

            after = s.get(f"{API}/usage", headers=u["headers"]).json()
            assert after["used_today"] == before["used_today"] + 1, (
                f"used_today did not increment after /recipes/generate. before={before} after={after}"
            )
            assert after["remaining"] == after["limit"] - after["used_today"]
        finally:
            _cleanup(u["id"], u["email"])
