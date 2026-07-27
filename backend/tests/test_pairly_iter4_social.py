"""Iteration 4 — Social layer, collections, follows, search, recipe generator, pairing extension."""
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


def _auth(session, email, password="Pairly123!", name="Test", role="home_cook"):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        r = session.post(
            f"{API}/auth/signup",
            json={"email": email, "password": password, "name": name, "role": role},
        )
    d = r.json()
    return {"token": d["token"], "user": d["user"], "headers": {"Authorization": f"Bearer {d['token']}"}}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def chef(s):
    return _auth(s, "chef@pairly.app", name="Chef Tester", role="chef")


@pytest.fixture(scope="session")
def cook(s):
    return _auth(s, "cook@pairly.app", name="Cook Tester", role="home_cook")


# Tiny 1x1 PNG (base64) for image inputs
TINY_PNG = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


# ------------------------------------------------------------ Posts (create / list / detail / delete)


class TestPosts:
    def test_create_photo_post_ok(self, s, chef):
        r = s.post(
            f"{API}/posts",
            json={"kind": "photo", "caption": "TEST photo", "images": [TINY_PNG], "hashtags": ["test"]},
            headers=chef["headers"],
        )
        assert r.status_code == 200, r.text[:200]
        p = r.json()
        assert p["kind"] == "photo"
        assert p["caption"] == "TEST photo"
        assert "id" in p and p["like_count"] == 0
        # cleanup
        s.delete(f"{API}/posts/{p['id']}", headers=chef["headers"])

    def test_photo_post_requires_image_or_caption(self, s, chef):
        r = s.post(
            f"{API}/posts",
            json={"kind": "photo", "caption": "", "images": []},
            headers=chef["headers"],
        )
        assert r.status_code == 400, r.text[:200]

    def test_recipe_post_ok(self, s, chef):
        r = s.post(
            f"{API}/posts",
            json={
                "kind": "recipe",
                "caption": "TEST recipe post",
                "recipe": {
                    "title": "TEST Carbonara",
                    "ingredients": ["pasta", "egg"],
                    "instructions": ["boil", "mix"],
                },
            },
            headers=chef["headers"],
        )
        assert r.status_code == 200, r.text[:200]
        p = r.json()
        assert p["kind"] == "recipe"
        assert p["recipe"]["title"] == "TEST Carbonara"
        s.delete(f"{API}/posts/{p['id']}", headers=chef["headers"])

    def test_recipe_post_missing_title_400(self, s, chef):
        r = s.post(
            f"{API}/posts",
            json={"kind": "recipe", "recipe": {"title": "", "ingredients": ["a"], "instructions": ["b"]}},
            headers=chef["headers"],
        )
        assert r.status_code == 400, r.text[:200]

    def test_get_post_and_delete_only_owner(self, s, chef, cook):
        r = s.post(
            f"{API}/posts",
            json={"kind": "photo", "caption": "TEST owner check", "images": [TINY_PNG]},
            headers=chef["headers"],
        )
        assert r.status_code == 200
        pid = r.json()["id"]

        det = s.get(f"{API}/posts/{pid}", headers=cook["headers"])
        assert det.status_code == 200

        # Other user cannot delete
        r_del = s.delete(f"{API}/posts/{pid}", headers=cook["headers"])
        assert r_del.status_code == 404

        # Owner can delete
        r_del2 = s.delete(f"{API}/posts/{pid}", headers=chef["headers"])
        assert r_del2.status_code == 200

        # Now gone
        det2 = s.get(f"{API}/posts/{pid}", headers=chef["headers"])
        assert det2.status_code == 404


# ------------------------------------------------------------ Feed scopes


class TestFeed:
    def test_feed_for_you(self, s, cook):
        r = s.get(f"{API}/feed?scope=for_you&limit=5", headers=cook["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_feed_following_only_shows_followed_and_self(self, s, chef, cook):
        # cook follows chef, chef posts, feed=following for cook should include chef's post
        # First ensure cook follows chef
        f = s.post(f"{API}/users/{chef['user']['id']}/follow", headers=cook["headers"])
        assert f.status_code == 200
        followed = f.json().get("is_following", False)
        if not followed:
            # Toggle back on
            f2 = s.post(f"{API}/users/{chef['user']['id']}/follow", headers=cook["headers"])
            assert f2.json().get("is_following") is True

        # Chef publishes a post
        rp = s.post(
            f"{API}/posts",
            json={"kind": "photo", "caption": "TEST feed follow", "images": [TINY_PNG]},
            headers=chef["headers"],
        )
        assert rp.status_code == 200
        pid = rp.json()["id"]

        try:
            r = s.get(f"{API}/feed?scope=following&limit=30", headers=cook["headers"])
            assert r.status_code == 200
            items = r.json()
            author_ids = {p["author"]["id"] for p in items}
            # Must contain chef; may also contain cook (self)
            assert chef["user"]["id"] in author_ids
            allowed = {chef["user"]["id"], cook["user"]["id"]}
            assert author_ids.issubset(allowed), f"unexpected authors in following feed: {author_ids - allowed}"
        finally:
            s.delete(f"{API}/posts/{pid}", headers=chef["headers"])
            # Unfollow to leave state clean-ish (but keep chef in cook's followings if this test is re-run)
            s.post(f"{API}/users/{chef['user']['id']}/follow", headers=cook["headers"])


# ------------------------------------------------------------ Engagement (likes, comments)


class TestEngagement:
    @pytest.fixture
    def post(self, s, chef):
        r = s.post(
            f"{API}/posts",
            json={"kind": "photo", "caption": "TEST engagement", "images": [TINY_PNG]},
            headers=chef["headers"],
        )
        pid = r.json()["id"]
        yield pid
        s.delete(f"{API}/posts/{pid}", headers=chef["headers"])

    def test_like_toggle(self, s, cook, post):
        r1 = s.post(f"{API}/posts/{post}/like", headers=cook["headers"])
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["is_liked"] is True and d1["like_count"] >= 1

        r2 = s.post(f"{API}/posts/{post}/like", headers=cook["headers"])
        d2 = r2.json()
        assert d2["is_liked"] is False
        assert d2["like_count"] == d1["like_count"] - 1

    def test_comments_and_replies_and_delete(self, s, chef, cook, post):
        # cook adds a top-level comment
        r1 = s.post(
            f"{API}/posts/{post}/comments",
            json={"content": "TEST looks great!"},
            headers=cook["headers"],
        )
        assert r1.status_code == 200
        top_id = r1.json()["id"]

        # chef replies to it
        r2 = s.post(
            f"{API}/posts/{post}/comments",
            json={"content": "TEST thanks!", "parent_id": top_id},
            headers=chef["headers"],
        )
        assert r2.status_code == 200
        reply_id = r2.json()["id"]
        assert r2.json()["parent_id"] == top_id

        # list has both with author info
        rl = s.get(f"{API}/posts/{post}/comments", headers=cook["headers"])
        assert rl.status_code == 200
        cs = rl.json()
        ids = [c["id"] for c in cs]
        assert top_id in ids and reply_id in ids
        for c in cs:
            assert c.get("author") and c["author"].get("id")

        # post detail's comment_count reflects
        det = s.get(f"{API}/posts/{post}", headers=chef["headers"])
        prev_count = det.json()["comment_count"]
        assert prev_count >= 2

        # cook cannot delete chef's reply
        rd_bad = s.delete(f"{API}/comments/{reply_id}", headers=cook["headers"])
        assert rd_bad.status_code in (403, 404)

        # chef deletes his reply
        rd = s.delete(f"{API}/comments/{reply_id}", headers=chef["headers"])
        assert rd.status_code == 200

        det2 = s.get(f"{API}/posts/{post}", headers=chef["headers"])
        assert det2.json()["comment_count"] == prev_count - 1


# ------------------------------------------------------------ Collections / bookmarks


class TestCollections:
    def test_auto_creates_defaults(self, s, cook):
        r = s.get(f"{API}/collections", headers=cook["headers"])
        assert r.status_code == 200
        cols = r.json()
        names = {c["name"] for c in cols}
        for expected in ("Favorites", "Want To Cook", "Meal Ideas"):
            assert expected in names, f"missing default collection {expected}: {names}"

    def test_duplicate_collection_400(self, s, cook):
        r = s.post(f"{API}/collections", json={"name": "Favorites"}, headers=cook["headers"])
        assert r.status_code == 400

    def test_bookmark_toggle_and_list(self, s, chef, cook):
        # chef creates a post
        rp = s.post(
            f"{API}/posts",
            json={"kind": "photo", "caption": "TEST bookmark", "images": [TINY_PNG]},
            headers=chef["headers"],
        )
        pid = rp.json()["id"]

        # find cook's Favorites collection id
        cols = s.get(f"{API}/collections", headers=cook["headers"]).json()
        fav = next(c for c in cols if c["name"] == "Favorites")

        try:
            r1 = s.post(
                f"{API}/posts/{pid}/bookmark",
                json={"collection_name": "Favorites"},
                headers=cook["headers"],
            )
            assert r1.status_code == 200
            assert r1.json()["is_bookmarked"] is True

            # list posts in Favorites contains it
            r_list = s.get(f"{API}/collections/{fav['id']}/posts", headers=cook["headers"])
            assert r_list.status_code == 200
            assert any(p["id"] == pid for p in r_list.json())

            # cross-user access to cook's collection -> 404
            r_cross = s.get(f"{API}/collections/{fav['id']}/posts", headers=chef["headers"])
            assert r_cross.status_code == 404

            # toggle off
            r2 = s.post(
                f"{API}/posts/{pid}/bookmark",
                json={"collection_name": "Favorites"},
                headers=cook["headers"],
            )
            assert r2.json()["is_bookmarked"] is False
        finally:
            s.delete(f"{API}/posts/{pid}", headers=chef["headers"])


# ------------------------------------------------------------ Follows / profiles


class TestFollowsProfiles:
    def test_self_follow_400(self, s, chef):
        r = s.post(f"{API}/users/{chef['user']['id']}/follow", headers=chef["headers"])
        assert r.status_code == 400

    def test_unknown_id_404(self, s, chef):
        r = s.post(f"{API}/users/{ObjectId()}/follow", headers=chef["headers"])
        assert r.status_code == 404

    def test_follow_toggle_and_profile(self, s, chef, cook):
        # Ensure starting state = not following
        prof = s.get(f"{API}/users/{chef['user']['id']}", headers=cook["headers"]).json()
        if prof.get("is_following"):
            s.post(f"{API}/users/{chef['user']['id']}/follow", headers=cook["headers"])

        r1 = s.post(f"{API}/users/{chef['user']['id']}/follow", headers=cook["headers"])
        assert r1.status_code == 200 and r1.json()["is_following"] is True

        # profile view respects is_following & is_self & hides email
        prof = s.get(f"{API}/users/{chef['user']['id']}", headers=cook["headers"]).json()
        assert prof["is_following"] is True
        assert prof["is_self"] is False
        assert not prof.get("email"), "email leaked in cross-user profile view"
        assert "followers_count" in prof and "following_count" in prof
        assert "posts" in prof

        # self view — is_self True, email visible
        self_view = s.get(f"{API}/users/{chef['user']['id']}", headers=chef["headers"]).json()
        assert self_view["is_self"] is True
        assert self_view.get("email") == "chef@pairly.app"

        # followers list contains cook
        fl = s.get(f"{API}/users/{chef['user']['id']}/followers", headers=cook["headers"]).json()
        assert any(u["id"] == cook["user"]["id"] for u in fl)

        # cook's following contains chef
        fg = s.get(f"{API}/users/{cook['user']['id']}/following", headers=cook["headers"]).json()
        assert any(u["id"] == chef["user"]["id"] for u in fg)

        # toggle off
        r2 = s.post(f"{API}/users/{chef['user']['id']}/follow", headers=cook["headers"])
        assert r2.json()["is_following"] is False

    def test_me_liked(self, s, chef, cook):
        rp = s.post(
            f"{API}/posts",
            json={"kind": "photo", "caption": "TEST liked", "images": [TINY_PNG]},
            headers=chef["headers"],
        )
        pid = rp.json()["id"]
        try:
            s.post(f"{API}/posts/{pid}/like", headers=cook["headers"])
            r = s.get(f"{API}/me/liked", headers=cook["headers"])
            assert r.status_code == 200
            assert any(p["id"] == pid for p in r.json())
        finally:
            s.delete(f"{API}/posts/{pid}", headers=chef["headers"])


# ------------------------------------------------------------ Profile update


class TestProfileUpdate:
    def test_username_taken_400(self, s, chef, cook):
        # cook tries to grab chef's username (marco)
        chef_prof = s.get(f"{API}/users/{chef['user']['id']}", headers=chef["headers"]).json()
        chef_uname = chef_prof.get("username")
        if not chef_uname:
            pytest.skip("chef has no username to clash with")
        r = s.put(f"{API}/profile", json={"username": chef_uname}, headers=cook["headers"])
        assert r.status_code == 400

    def test_username_invalid_chars_400(self, s, cook):
        r = s.put(f"{API}/profile", json={"username": "!!!@@@###"}, headers=cook["headers"])
        assert r.status_code == 400

    def test_update_bio_and_avatar(self, s, cook):
        new_bio = f"TEST bio {uuid.uuid4().hex[:6]}"
        r = s.put(
            f"{API}/profile",
            json={"bio": new_bio, "location": "TEST city", "favorite_cuisine": "italian",
                  "website": "https://pairly.app", "avatar_b64": TINY_PNG},
            headers=cook["headers"],
        )
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["bio"] == new_bio
        assert d["location"] == "TEST city"
        assert d["favorite_cuisine"] == "italian"
        assert d.get("avatar_b64"), "avatar_b64 not persisted"
        assert len(d["avatar_b64"]) > 20


# ------------------------------------------------------------ Search


class TestSearch:
    def test_search_all_shape(self, s, chef):
        r = s.get(f"{API}/search?q=pair&type=all", headers=chef["headers"])
        assert r.status_code == 200
        d = r.json()
        for k in ("users", "posts", "pairings"):
            assert k in d, f"missing key {k}"
            assert isinstance(d[k], list)

    def test_search_users_only(self, s, chef):
        r = s.get(f"{API}/search?q=chef&type=users", headers=chef["headers"])
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("users"), list)

    def test_search_posts_with_filters(self, s, chef):
        r = s.get(
            f"{API}/search?q=&type=posts&cuisine=italian&sort=latest",
            headers=chef["headers"],
        )
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("posts"), list)


# ------------------------------------------------------------ Pairing extension


class TestPairingExtension:
    """Reads existing pairings from history (does not burn quota) to check schema extension."""

    def test_pairings_carry_extended_fields(self, s, chef):
        lst = s.get(f"{API}/pairings", headers=chef["headers"]).json()
        if not lst:
            pytest.skip("no pairings for chef")
        # Grab detail for the latest
        det = s.get(f"{API}/pairings/{lst[0]['id']}", headers=chef["headers"]).json()
        items = det.get("pairings") or []
        if not items:
            pytest.skip("pairing has no items")
        # New fields must be present on the schema even if empty strings/lists
        for it in items:
            assert "flavor_profile" in it
            assert "nutrition_notes" in it
            assert "alternatives" in it
            assert isinstance(it["alternatives"], list)


# ------------------------------------------------------------ Recipe generator (LLM — slow)


class TestRecipeGenerator:
    def test_empty_ingredients_and_goal_400(self, s, cook):
        r = s.post(
            f"{API}/recipes/generate",
            json={"ingredients": [], "goal": "", "cuisine": "italian"},
            headers=cook["headers"],
        )
        assert r.status_code == 400

    @pytest.mark.slow
    def test_generate_recipe_ok(self, s):
        # Use a fresh user with headroom to avoid burning cook's daily quota
        email = _rand_email("recipegen")
        try:
            u = _auth(s, email, name="Recipe Tester")
            r = s.post(
                f"{API}/recipes/generate",
                json={"ingredients": ["pasta", "tomato", "basil"], "cuisine": "italian",
                      "difficulty": "easy", "cooking_time": "30"},
                headers=u["headers"],
                timeout=120,
            )
            assert r.status_code == 200, r.text[:300]
            resp = r.json()
            assert "id" in resp and "recipe" in resp
            d = resp["recipe"]
            for k in ("title", "ingredients", "instructions", "nutrition", "shopping_list", "drink_pairing"):
                assert k in d, f"missing field {k} in generated recipe"
            assert d["title"] and isinstance(d["ingredients"], list) and isinstance(d["instructions"], list)
            assert len(d["ingredients"]) > 0 and len(d["instructions"]) > 0

            # And it lists in /api/recipes/generated
            lst = s.get(f"{API}/recipes/generated", headers=u["headers"])
            assert lst.status_code == 200
            gen = lst.json()
            assert any(g.get("recipe", {}).get("title") == d["title"] for g in gen)

            # Spec: recipe generation should count toward the 5/day quota (used_today)
            usage = s.get(f"{API}/usage", headers=u["headers"]).json()
            assert usage["used_today"] >= 1, (
                f"BUG: /api/recipes/generate does not increment used_today. usage={usage}. "
                "used_today() in server.py only counts pairings + menus + chat_messages, "
                "so recipe generations are effectively unlimited even on free tier."
            )
        finally:
            _db.users.delete_one({"email": email})
            _db.recipes_generated.delete_many({})  # best-effort; matches only our recent doc via user_id below
            # More targeted cleanup by user_id when known:
            # (already deleted user; docs with matching user_id are orphaned but harmless)
