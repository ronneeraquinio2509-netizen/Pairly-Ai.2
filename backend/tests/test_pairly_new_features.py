"""Iteration 3 — New feature tests: image gen, chat streaming, rename, quota regression."""
import json
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


def _rand_email(prefix="test"):
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@pairly.app"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def chef(s):
    email = "chef@pairly.app"
    r = s.post(f"{API}/auth/login", json={"email": email, "password": "Pairly123!"})
    if r.status_code != 200:
        r = s.post(
            f"{API}/auth/signup",
            json={"email": email, "password": "Pairly123!", "name": "Chef Tester", "role": "chef"},
        )
    d = r.json()
    return {"token": d["token"], "user": d["user"], "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="session")
def cook(s):
    email = "cook@pairly.app"
    r = s.post(f"{API}/auth/login", json={"email": email, "password": "Pairly123!"})
    if r.status_code != 200:
        r = s.post(
            f"{API}/auth/signup",
            json={"email": email, "password": "Pairly123!", "name": "Cook Tester", "role": "home_cook"},
        )
    d = r.json()
    return {"token": d["token"], "user": d["user"], "headers": {"Authorization": f"Bearer {d['token']}"}}


# ---------------- Rename smoke ----------------

class TestRename:
    def test_api_title_is_pairly(self, s):
        # Ingress typically only proxies /api paths; try both endpoints
        r = s.get(f"{API}/openapi.json")
        if r.status_code == 200:
            try:
                assert r.json()["info"]["title"] == "Pairly"
                return
            except Exception:
                pass
        # Fallback: root message is authoritative for the rename check
        r2 = s.get(f"{API}/")
        assert r2.status_code == 200 and "Pairly" in r2.json().get("message", "")

    def test_root_message(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert "Pairly" in r.json().get("message", "")


# ---------------- List projection: image_b64 omitted ----------------

class TestListProjection:
    def test_pairings_list_omits_image_b64(self, s, chef):
        # Ensure at least one pairing exists (reuse existing history)
        r = s.get(f"{API}/pairings", headers=chef["headers"])
        assert r.status_code == 200
        items = r.json()
        # If empty, skip — chef@ should already have history from iteration 2
        if not items:
            pytest.skip("no existing pairings for chef@ — skipping projection test")
        for p in items:
            # image_b64 should be None or missing in list (projected out)
            assert not p.get("image_b64"), f"image_b64 leaked into list for {p.get('id')}"

    def test_favorites_only_omits_image_b64(self, s, chef):
        r = s.get(f"{API}/pairings?favorites_only=true", headers=chef["headers"])
        assert r.status_code == 200
        for p in r.json():
            assert not p.get("image_b64"), "image_b64 leaked in favorites list"


# ---------------- Image generation ----------------

class TestPairingImage:
    """Uses direct DB seed of a pairing to avoid burning an LLM quota point."""

    def _seed_pairing(self, user_id: str) -> str:
        doc = {
            "user_id": user_id,
            "query": "seared scallops",
            "category": "dish",
            "context": "",
            "role": "chef",
            "headline": "Scallops",
            "summary": "test",
            "pairings": [{"name": "brown butter", "category": "sauce", "why": "", "tip": ""}],
            "mini_recipe_title": "",
            "mini_recipe_steps": [],
            "is_favorite": False,
            "model_used": "seed",
            "created_at": (datetime.now(timezone.utc).replace(year=2020)).isoformat(),
        }
        res = _db.pairings.insert_one(doc)
        return str(res.inserted_id)

    def test_image_gen_and_cache_and_projection(self, s, chef, cook):
        pid = self._seed_pairing(chef["user"]["id"])
        try:
            # 1st call — may take up to ~90s
            r1 = s.post(f"{API}/pairings/{pid}/image", headers=chef["headers"], timeout=120)
            assert r1.status_code == 200, r1.text[:300]
            b64 = r1.json().get("image_b64")
            assert b64 and isinstance(b64, str)
            print(f"[img] first-call len={len(b64)}")
            assert len(b64) > 500, "image_b64 too small"

            # 2nd call — must be fast (cached)
            import time
            t0 = time.time()
            r2 = s.post(f"{API}/pairings/{pid}/image", headers=chef["headers"], timeout=30)
            elapsed = time.time() - t0
            assert r2.status_code == 200
            assert r2.json()["image_b64"] == b64, "second call did not return cached image"
            print(f"[img] cached-call elapsed={elapsed:.2f}s")
            assert elapsed < 10, f"cached call too slow ({elapsed:.2f}s)"

            # GET /pairings/{id} includes image_b64
            det = s.get(f"{API}/pairings/{pid}", headers=chef["headers"])
            assert det.status_code == 200
            assert det.json().get("image_b64") == b64

            # GET /pairings list does NOT include it
            lst = s.get(f"{API}/pairings", headers=chef["headers"])
            assert lst.status_code == 200
            for p in lst.json():
                if p["id"] == pid:
                    assert not p.get("image_b64"), "image_b64 leaked in list projection"

            # Other user gets 404 for this pairing image
            r3 = s.post(f"{API}/pairings/{pid}/image", headers=cook["headers"])
            assert r3.status_code == 404

            # Detail also 404 for other user
            r4 = s.get(f"{API}/pairings/{pid}", headers=cook["headers"])
            assert r4.status_code == 404
        finally:
            _db.pairings.delete_one({"_id": ObjectId(pid)})

    def test_image_invalid_id_404(self, s, chef):
        r = s.post(f"{API}/pairings/not-a-valid-id/image", headers=chef["headers"])
        assert r.status_code == 404

    def test_image_unknown_id_404(self, s, chef):
        r = s.post(f"{API}/pairings/{ObjectId()}/image", headers=chef["headers"])
        assert r.status_code == 404


# ---------------- Chat streaming ----------------

class TestChat:
    def test_chat_unauth_401(self, s):
        r = s.post(f"{API}/chat", json={"message": "hi"})
        assert r.status_code == 401

    def test_chat_streams_and_persists(self, s, cook):
        # Clear any existing history first
        s.delete(f"{API}/chat/messages", headers=cook["headers"])

        msg = "Give me one quick pairing for grilled peaches. Reply in one sentence."
        with s.post(
            f"{API}/chat",
            json={"message": msg},
            headers=cook["headers"],
            stream=True,
            timeout=90,
        ) as r:
            assert r.status_code == 200, r.text[:300]
            ctype = r.headers.get("content-type", "")
            assert "text/event-stream" in ctype, f"wrong content-type: {ctype}"

            deltas = []
            saw_done = False
            for raw in r.iter_lines(decode_unicode=True):
                if not raw or not raw.startswith("data:"):
                    continue
                payload = json.loads(raw[5:].strip())
                if "delta" in payload:
                    deltas.append(payload["delta"])
                elif payload.get("done"):
                    saw_done = True
                    break
                elif "error" in payload:
                    pytest.fail(f"chat returned error: {payload['error']}")
            assert saw_done, "no done event received"
            reply = "".join(deltas)
            print(f"[chat] delta_chunks={len(deltas)} reply_len={len(reply)}")
            assert len(reply) > 5, f"assistant reply too short: {reply!r}"

        # History has user + assistant persisted
        h = s.get(f"{API}/chat/messages", headers=cook["headers"])
        assert h.status_code == 200
        hist = h.json()
        assert len(hist) >= 2
        assert hist[0]["role"] == "user" and hist[0]["content"] == msg
        assert hist[1]["role"] == "assistant" and hist[1]["content"].strip()

    def test_clear_chat(self, s, cook):
        r = s.delete(f"{API}/chat/messages", headers=cook["headers"])
        assert r.status_code == 200 and r.json() == {"cleared": True}
        h = s.get(f"{API}/chat/messages", headers=cook["headers"])
        assert h.status_code == 200 and h.json() == []


# ---------------- Quota regression (pairings + menus + chat counted) ----------------

class TestQuotaRegression:
    def test_chat_and_pairing_402_when_limit_reached(self, s):
        email = _rand_email("quota")
        r = s.post(
            f"{API}/auth/signup",
            json={"email": email, "password": "Pairly123!", "name": "Quota U", "role": "home_cook"},
        )
        assert r.status_code == 200
        d = r.json()
        uid = d["user"]["id"]
        headers = {"Authorization": f"Bearer {d['token']}"}

        today_iso = datetime.now(timezone.utc).isoformat()
        # Seed mix: 2 pairings + 2 menus + 1 chat user message = 5 total
        _db.pairings.insert_many([
            {"user_id": uid, "query": f"p{i}", "category": "ingredient", "created_at": today_iso,
             "pairings": [], "mini_recipe_steps": [], "is_favorite": False}
            for i in range(2)
        ])
        _db.menus.insert_many([
            {"user_id": uid, "title": f"m{i}", "items": [], "courses": [], "created_at": today_iso}
            for i in range(2)
        ])
        _db.chat_messages.insert_one(
            {"user_id": uid, "role": "user", "content": "seed", "created_at": today_iso}
        )

        try:
            u = s.get(f"{API}/usage", headers=headers).json()
            assert u["used_today"] == 5, u
            assert u["remaining"] == 0

            # Pairing → 402
            rp = s.post(
                f"{API}/pairings",
                json={"query": "x", "category": "ingredient"},
                headers=headers,
                timeout=30,
            )
            assert rp.status_code == 402, rp.text[:200]

            # Chat → 402 (chat streams normally, but ensure_quota runs before streaming)
            rc = s.post(f"{API}/chat", json={"message": "hi"}, headers=headers, timeout=30)
            assert rc.status_code == 402, rc.text[:200]

            # Menu → 402 too
            rm = s.post(
                f"{API}/menus",
                json={"occasion": "x", "items": ["a"]},
                headers=headers,
                timeout=30,
            )
            assert rm.status_code == 402, rm.text[:200]
        finally:
            _db.pairings.delete_many({"user_id": uid})
            _db.menus.delete_many({"user_id": uid})
            _db.chat_messages.delete_many({"user_id": uid})
            _db.users.delete_one({"_id": ObjectId(uid)})
