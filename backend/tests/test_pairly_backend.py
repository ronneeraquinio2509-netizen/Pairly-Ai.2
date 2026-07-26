"""Pairly AI backend regression tests."""
import os
import time
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://taste-blend-2.preview.emergentagent.com"
API = f"{BASE_URL}/api"

# Mongo direct for cheap setup of the daily-limit scenario (avoids 6 real LLM calls)
_mongo = MongoClient(os.environ["MONGO_URL"])
_db = _mongo[os.environ["DB_NAME"]]

# ------------ shared fixtures ------------

def _rand_email(prefix="test"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@pairly.app"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def chef(s):
    """Signup or login chef seed user."""
    email = "chef@pairly.app"
    r = s.post(f"{API}/auth/login", json={"email": email, "password": "Pairly123!"})
    if r.status_code == 200:
        d = r.json()
    else:
        r = s.post(f"{API}/auth/signup", json={"email": email, "password": "Pairly123!", "name": "Chef Tester", "role": "chef"})
        assert r.status_code == 200, r.text
        d = r.json()
    return {"token": d["token"], "user": d["user"], "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="session")
def home_cook(s):
    email = "cook@pairly.app"
    r = s.post(f"{API}/auth/login", json={"email": email, "password": "Pairly123!"})
    if r.status_code == 200:
        d = r.json()
    else:
        r = s.post(f"{API}/auth/signup", json={"email": email, "password": "Pairly123!", "name": "Home Cook", "role": "home_cook"})
        assert r.status_code == 200, r.text
        d = r.json()
    return {"token": d["token"], "user": d["user"], "headers": {"Authorization": f"Bearer {d['token']}"}}


# ------------ Auth ------------

class TestAuth:
    def test_signup_and_me(self, s):
        email = _rand_email("signup")
        r = s.post(f"{API}/auth/signup", json={"email": email, "password": "Pairly123!", "name": "Signup U", "role": "home_cook"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and body["user"]["email"] == email.lower()
        assert body["user"]["role"] == "home_cook"
        me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
        assert me.status_code == 200
        assert me.json()["email"] == email.lower()
        # cleanup
        _db.users.delete_one({"_id": ObjectId(body["user"]["id"])})

    def test_signup_chef_role(self, s):
        email = _rand_email("chef")
        r = s.post(f"{API}/auth/signup", json={"email": email, "password": "Pairly123!", "name": "Chef", "role": "chef"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "chef"
        _db.users.delete_one({"_id": ObjectId(r.json()["user"]["id"])})

    def test_signup_duplicate_returns_400(self, s, chef):
        r = s.post(f"{API}/auth/signup", json={"email": "chef@pairly.app", "password": "Pairly123!", "name": "Dup", "role": "chef"})
        assert r.status_code == 400

    def test_login_bad_password_401(self, s, chef):
        r = s.post(f"{API}/auth/login", json={"email": "chef@pairly.app", "password": "wrongwrong"})
        assert r.status_code == 401

    def test_login_unknown_user_401(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "noone_TEST@pairly.app", "password": "Pairly123!"})
        assert r.status_code == 401

    def test_missing_bearer_returns_401(self, s):
        assert s.get(f"{API}/auth/me").status_code == 401
        assert s.get(f"{API}/usage").status_code == 401
        assert s.get(f"{API}/pairings").status_code == 401


# ------------ Profile ------------

class TestProfile:
    def test_update_profile(self, s, home_cook):
        payload = {
            "name": "Updated Name",
            "role": "chef",
            "preferences": {"diet": "vegetarian", "cuisines": ["Italian", "Japanese"], "spice": "hot", "avoid": "peanuts"},
        }
        r = s.put(f"{API}/profile", json=payload, headers=home_cook["headers"])
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["name"] == "Updated Name"
        assert j["role"] == "chef"
        assert j["preferences"]["diet"] == "vegetarian"
        assert "Italian" in j["preferences"]["cuisines"]
        # revert
        s.put(f"{API}/profile", json={"name": "Home Cook", "role": "home_cook", "preferences": {"diet": "none", "cuisines": [], "spice": "medium", "avoid": ""}}, headers=home_cook["headers"])


# ------------ Usage ------------

class TestUsage:
    def test_usage_shape(self, s, chef):
        r = s.get(f"{API}/usage", headers=chef["headers"])
        assert r.status_code == 200
        j = r.json()
        assert "used_today" in j and "limit" in j and "is_premium" in j
        assert j["limit"] == 5


# ------------ Pairings ------------

class TestPairings:
    pairing_id = None

    def test_create_pairing_ingredient(self, s, chef):
        r = s.post(
            f"{API}/pairings",
            json={"query": "roasted eggplant", "category": "ingredient", "context": "want a light summer dinner"},
            headers=chef["headers"],
            timeout=90,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["headline"] and j["summary"]
        assert isinstance(j["pairings"], list) and len(j["pairings"]) >= 3
        first = j["pairings"][0]
        assert first["name"] and first["why"]
        assert j["mini_recipe_title"]
        assert isinstance(j["mini_recipe_steps"], list) and len(j["mini_recipe_steps"]) >= 3
        assert j["id"]
        TestPairings.pairing_id = j["id"]

    def test_create_pairing_dish(self, s, chef):
        r = s.post(f"{API}/pairings", json={"query": "carbonara", "category": "dish"}, headers=chef["headers"], timeout=90)
        assert r.status_code == 200
        assert r.json()["category"] == "dish"

    def test_create_pairing_beverage(self, s, chef):
        r = s.post(f"{API}/pairings", json={"query": "cold brew coffee", "category": "beverage"}, headers=chef["headers"], timeout=90)
        assert r.status_code == 200
        assert r.json()["category"] == "beverage"

    def test_list_and_get(self, s, chef):
        r = s.get(f"{API}/pairings", headers=chef["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1
        pid = TestPairings.pairing_id
        r2 = s.get(f"{API}/pairings/{pid}", headers=chef["headers"])
        assert r2.status_code == 200
        assert r2.json()["id"] == pid

    def test_favorite_toggle_and_filter(self, s, chef):
        pid = TestPairings.pairing_id
        r = s.post(f"{API}/pairings/{pid}/favorite", headers=chef["headers"])
        assert r.status_code == 200 and r.json()["is_favorite"] is True
        f = s.get(f"{API}/pairings?favorites_only=true", headers=chef["headers"])
        assert f.status_code == 200
        assert any(p["id"] == pid for p in f.json())
        # toggle off
        r2 = s.post(f"{API}/pairings/{pid}/favorite", headers=chef["headers"])
        assert r2.json()["is_favorite"] is False

    def test_auth_isolation_get_other_user_pairing_returns_404(self, s, chef, home_cook):
        pid = TestPairings.pairing_id
        r = s.get(f"{API}/pairings/{pid}", headers=home_cook["headers"])
        assert r.status_code == 404

    def test_delete_pairing(self, s, chef):
        pid = TestPairings.pairing_id
        r = s.delete(f"{API}/pairings/{pid}", headers=chef["headers"])
        assert r.status_code == 200
        r2 = s.get(f"{API}/pairings/{pid}", headers=chef["headers"])
        assert r2.status_code == 404


# ------------ Free daily limit (simulated via DB seeding) ------------

class TestDailyLimit:
    def test_limit_enforced_after_5(self, s):
        """Create isolated user, seed 5 pairings for today, verify 6th call returns 402."""
        email = _rand_email("limit")
        r = s.post(f"{API}/auth/signup", json={"email": email, "password": "Pairly123!", "name": "Limit U", "role": "home_cook"})
        assert r.status_code == 200
        d = r.json()
        uid = d["user"]["id"]
        headers = {"Authorization": f"Bearer {d['token']}"}
        # Seed 5 pairing docs for today
        from datetime import datetime, timezone
        today_iso = datetime.now(timezone.utc).isoformat()
        _db.pairings.insert_many([
            {"user_id": uid, "query": f"seed{i}", "category": "ingredient", "created_at": today_iso, "pairings": [], "mini_recipe_steps": [], "is_favorite": False}
            for i in range(5)
        ])
        u = s.get(f"{API}/usage", headers=headers).json()
        assert u["used_today"] == 5 and u["remaining"] == 0
        r6 = s.post(f"{API}/pairings", json={"query": "should fail", "category": "ingredient"}, headers=headers, timeout=30)
        assert r6.status_code == 402, r6.text
        # cleanup
        _db.pairings.delete_many({"user_id": uid})
        _db.users.delete_one({"_id": ObjectId(uid)})


# ------------ Menus (chef) ------------

class TestMenus:
    menu_id = None

    def test_create_menu(self, s, chef):
        r = s.post(
            f"{API}/menus",
            json={"occasion": "spring tasting", "items": ["asparagus", "scallops", "strawberry"], "notes": "acid forward"},
            headers=chef["headers"],
            timeout=90,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["title"] and isinstance(j["courses"], list) and 4 <= len(j["courses"]) <= 5
        assert j["courses"][0]["dish"]
        assert j["wine_notes"]
        TestMenus.menu_id = j["id"]

    def test_list_menus_and_delete(self, s, chef):
        r = s.get(f"{API}/menus", headers=chef["headers"])
        assert r.status_code == 200 and len(r.json()) >= 1
        mid = TestMenus.menu_id
        d = s.delete(f"{API}/menus/{mid}", headers=chef["headers"])
        assert d.status_code == 200

    def test_menu_requires_items(self, s, chef):
        r = s.post(f"{API}/menus", json={"occasion": "x", "items": []}, headers=chef["headers"])
        assert r.status_code == 400


# ------------ PayPal (mock) ------------

class TestPayPalMocked:
    def test_order_and_capture_grants_premium(self, s):
        # fresh user
        email = _rand_email("pay")
        r = s.post(f"{API}/auth/signup", json={"email": email, "password": "Pairly123!", "name": "Pay U", "role": "home_cook"})
        headers = {"Authorization": f"Bearer {r.json()['token']}"}
        uid = r.json()["user"]["id"]

        order = s.post(f"{API}/paypal/order", headers=headers)
        assert order.status_code == 200
        oj = order.json()
        assert oj.get("mocked") is True and oj.get("order_id", "").startswith("MOCK-")

        cap = s.post(f"{API}/paypal/capture", json={"order_id": oj["order_id"]}, headers=headers)
        assert cap.status_code == 200
        assert cap.json() == {"is_premium": True, "mocked": True}

        # Verify usage now reports premium and no remaining limit
        u = s.get(f"{API}/usage", headers=headers).json()
        assert u["is_premium"] is True
        assert u["remaining"] is None

        # cleanup
        _db.users.delete_one({"_id": ObjectId(uid)})
        _db.payments.delete_many({"user_id": uid})
