import asyncio
import base64
import io
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, List, Optional

import bcrypt
import jwt
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image
from pydantic import BaseModel, BeforeValidator, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("pairly")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30
FREE_DAILY_LIMIT = int(os.environ.get("FREE_DAILY_LIMIT", "5"))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
PAYPAL_SECRET = os.environ.get("PAYPAL_SECRET", "")
PAYPAL_BASE = os.environ.get("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com")
PREMIUM_PRICE = os.environ.get("PREMIUM_PRICE", "9.99")

app = FastAPI(title="Pairly")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------- Mongo base


def _to_str(v: Any) -> Any:
    return str(v) if isinstance(v, ObjectId) else v


PyObjectId = Annotated[str, BeforeValidator(_to_str)]


class BaseDocument(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        data.pop("_id", None)
        return data

    @classmethod
    def from_mongo(cls, doc: Optional[dict]):
        if not doc:
            return None
        return cls.model_validate(doc)


# ---------------------------------------------------------------- Models


class Preferences(BaseModel):
    diet: str = "none"
    cuisines: List[str] = []
    spice: str = "medium"
    avoid: str = ""


class UserDoc(BaseDocument):
    email: str
    name: str
    username: str = ""
    role: str = "home_cook"
    password_hash: str
    bio: str = ""
    location: str = ""
    favorite_cuisine: str = ""
    website: str = ""
    avatar_b64: Optional[str] = None
    cover_b64: Optional[str] = None
    preferences: Preferences = Preferences()
    is_premium: bool = False
    is_creator: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PairingItem(BaseModel):
    name: str
    category: str = ""
    why: str = ""
    tip: str = ""
    flavor_profile: str = ""
    nutrition_notes: str = ""
    alternatives: List[str] = []


class PairingDoc(BaseDocument):
    user_id: PyObjectId
    query: str
    category: str
    context: str = ""
    role: str = "home_cook"
    headline: str = ""
    summary: str = ""
    pairings: List[PairingItem] = []
    mini_recipe_title: str = ""
    mini_recipe_steps: List[str] = []
    image_b64: Optional[str] = None
    is_favorite: bool = False
    model_used: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatMessageDoc(BaseDocument):
    user_id: PyObjectId
    role: str
    content: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MenuCourse(BaseModel):
    course: str
    dish: str
    pairing: str = ""
    notes: str = ""


class MenuDoc(BaseDocument):
    user_id: PyObjectId
    title: str
    occasion: str = ""
    items: List[str] = []
    courses: List[MenuCourse] = []
    wine_notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ------------------------------------------------- Social / recipe models


class Nutrition(BaseModel):
    calories: str = ""
    protein: str = ""
    carbs: str = ""
    fat: str = ""


class RecipeData(BaseModel):
    title: str = ""
    description: str = ""
    cuisine: str = ""
    difficulty: str = "Beginner"
    prep_time_min: int = 0
    cook_time_min: int = 0
    servings: int = 2
    ingredients: List[str] = []
    instructions: List[str] = []
    nutrition: Nutrition = Nutrition()
    tags: List[str] = []
    diet: str = ""
    shopping_list: List[str] = []
    drink_pairing: str = ""
    dessert_pairing: str = ""
    ingredient_alternatives: List[str] = []


class PostDoc(BaseDocument):
    user_id: PyObjectId
    kind: str = "photo"  # photo | recipe | pairing
    caption: str = ""
    hashtags: List[str] = []
    images: List[str] = []  # compressed base64 JPEG
    recipe: Optional[RecipeData] = None
    pairing_id: Optional[PyObjectId] = None
    like_count: int = 0
    comment_count: int = 0
    bookmark_count: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CommentDoc(BaseDocument):
    post_id: PyObjectId
    user_id: PyObjectId
    parent_id: Optional[PyObjectId] = None
    content: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CollectionDoc(BaseDocument):
    user_id: PyObjectId
    name: str
    post_ids: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class NotificationDoc(BaseDocument):
    user_id: PyObjectId
    actor_id: PyObjectId
    actor_name: str = ""
    kind: str = "like"  # like | comment | follow | bookmark
    post_id: Optional[PyObjectId] = None
    message: str = ""
    read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------------------------------------------------------------- Requests


class SignupReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: str = "home_cook"


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class ProfileReq(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    favorite_cuisine: Optional[str] = None
    website: Optional[str] = None
    avatar_b64: Optional[str] = None
    cover_b64: Optional[str] = None
    preferences: Optional[Preferences] = None


class PairingReq(BaseModel):
    query: str = Field(min_length=1)
    category: str = "ingredient"
    context: str = ""


class MenuReq(BaseModel):
    occasion: str = ""
    items: List[str] = []
    notes: str = ""


class CaptureReq(BaseModel):
    order_id: str


class ChatReq(BaseModel):
    message: str = Field(min_length=1)


class PostReq(BaseModel):
    kind: str = "photo"
    caption: str = ""
    hashtags: List[str] = []
    images: List[str] = []
    recipe: Optional[RecipeData] = None
    pairing_id: Optional[str] = None


class CommentReq(BaseModel):
    content: str = Field(min_length=1)
    parent_id: Optional[str] = None


class BookmarkReq(BaseModel):
    collection_name: str = "Favorites"


class CollectionReq(BaseModel):
    name: str = Field(min_length=1)


class RecipeGenReq(BaseModel):
    ingredients: List[str] = []
    cuisine: str = ""
    diet: str = ""
    budget: str = ""
    cooking_time: str = ""
    difficulty: str = ""
    calories: str = ""
    goal: str = ""


# ---------------------------------------------------------------- Auth utils


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UserDoc:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    doc = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return UserDoc.from_mongo(doc)


def public_user(u: UserDoc) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "username": u.username,
        "role": u.role,
        "bio": u.bio,
        "location": u.location,
        "favorite_cuisine": u.favorite_cuisine,
        "website": u.website,
        "avatar_b64": u.avatar_b64,
        "cover_b64": u.cover_b64,
        "preferences": u.preferences.model_dump(),
        "is_premium": u.is_premium,
        "is_creator": u.is_creator,
    }


async def unique_username(base: str) -> str:
    slug = re.sub(r"[^a-z0-9_]", "", base.lower().split("@")[0])[:18] or "cook"
    candidate = slug
    n = 1
    while await db.users.find_one({"username": candidate}):
        n += 1
        candidate = f"{slug}{n}"
    return candidate


# ---------------------------------------------------------------- AI engine

SCHEMA_HINT = """Respond with ONLY valid minified JSON, no markdown fences, matching:
{"headline":"short editorial title","summary":"1-2 sentence overview","pairings":[{"name":"...","category":"ingredient|dish|beverage|sauce|side","why":"1-2 sentences on why it works flavour-wise","tip":"one short serving tip","flavor_profile":"3-6 words on the flavour profile e.g. bright, herbaceous, tannic","nutrition_notes":"one short line on the nutritional angle","alternatives":["2-3 swap options"]}],"mini_recipe_title":"...","mini_recipe_steps":["step 1","step 2","step 3","step 4"]}
Return exactly 5 pairings and 3-5 recipe steps."""


def build_system_message(role: str, prefs: Preferences) -> str:
    if role == "chef":
        tone = (
            "You are Pairly, a culinary R&D consultant advising a professional chef. "
            "Use precise technical language (acidity, fat, Maillard, umami, texture contrast), "
            "reference modern plating and menu logic, and suggest non-obvious combinations."
        )
    else:
        tone = (
            "You are Pairly, a warm and practical kitchen companion for a home cook. "
            "Use plain, encouraging language, common supermarket ingredients and simple techniques."
        )
    p = f"Diet: {prefs.diet}. Preferred cuisines: {', '.join(prefs.cuisines) or 'any'}. Spice level: {prefs.spice}. Avoid: {prefs.avoid or 'nothing'}."
    return f"{tone}\nRespect these user preferences strictly: {p}\n{SCHEMA_HINT}"


def extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no json in response")
    return json.loads(text[start : end + 1])


async def run_llm(system_message: str, prompt: str, session_id: str) -> tuple[dict, str]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    attempts = [("anthropic", "claude-sonnet-4-6"), ("openai", "gpt-5.5")]
    last_err: Optional[Exception] = None
    for provider, model in attempts:
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"{session_id}-{provider}",
                system_message=system_message,
            ).with_model(provider, model)
            raw = await chat.send_message(UserMessage(text=prompt))
            return extract_json(raw if isinstance(raw, str) else str(raw)), model
        except Exception as e:  # noqa: BLE001 - fall back to next model
            last_err = e
            logger.warning("LLM %s/%s failed: %s", provider, model, e)
    raise HTTPException(status_code=503, detail=f"AI service unavailable: {last_err}")


def compress_image(b64_png: str, max_width: int = 900, quality: int = 78) -> str:
    """Downscale + JPEG-encode so mobile clients aren't fetching megabyte payloads."""
    try:
        raw = base64.b64decode(b64_png)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        if img.width > max_width:
            img = img.resize((max_width, round(img.height * max_width / img.width)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:  # noqa: BLE001 - fall back to the original bytes
        logger.warning("Image compression failed: %s", e)
        return b64_png


async def generate_food_image(subject: str, category: str) -> Optional[str]:
    """Returns a base64 PNG of appetising food/drink photography, or None on failure."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    scene = {
        "beverage": "styled drink photography in appropriate glassware with garnish",
        "dish": "a plated finished dish photographed slightly from above",
        "ingredient": "a rustic still life of the ingredient with a few complementary elements",
    }.get(category, "appetising food photography")
    prompt = (
        f"Editorial food photography: {scene}, subject is {subject}. "
        "Natural window light, warm terracotta and sand tones, matte ceramic surfaces, linen, "
        "shallow depth of field, high-end cookbook aesthetic. No text, no watermarks, no people."
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"img-{abs(hash(subject)) % 10**8}",
            system_message="You generate appetising, realistic food photography.",
        )
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(
            modalities=["image", "text"]
        )
        _, imgs = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        if imgs:
            return compress_image(imgs[0]["data"])
    except Exception as e:  # noqa: BLE001 - imagery is a nice-to-have, never break the request
        logger.warning("Image generation failed for %s: %s", subject, e)
    return None


# ---------------------------------------------------------------- Usage


def today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def used_today(user_id: str) -> int:
    """Every AI request (pairing, menu, chat message) counts toward the free daily cap."""
    today = {"$regex": f"^{today_key()}"}
    counts = await asyncio.gather(
        db.pairings.count_documents({"user_id": user_id, "created_at": today}),
        db.menus.count_documents({"user_id": user_id, "created_at": today}),
        db.chat_messages.count_documents({"user_id": user_id, "role": "user", "created_at": today}),
    )
    return sum(counts)


async def ensure_quota(user: UserDoc) -> None:
    if user.is_premium:
        return
    if await used_today(user.id) >= FREE_DAILY_LIMIT:
        raise HTTPException(
            status_code=402,
            detail=f"Daily free limit of {FREE_DAILY_LIMIT} AI requests reached. Upgrade to Pairly Pro for unlimited pairings.",
        )


# ---------------------------------------------------------------- Routes


@api_router.get("/")
async def root():
    return {"message": "Pairly API"}


@api_router.post("/auth/signup")
async def signup(body: SignupReq):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = UserDoc(
        email=email,
        name=body.name.strip(),
        username=await unique_username(body.name or email),
        role=body.role if body.role in ("home_cook", "chef") else "home_cook",
        password_hash=hash_password(body.password),
    )
    res = await db.users.insert_one(user.to_mongo())
    user.id = str(res.inserted_id)
    return {"token": create_token(user.id), "user": public_user(user)}


@api_router.post("/auth/login")
async def login(body: LoginReq):
    doc = await db.users.find_one({"email": body.email.lower().strip()})
    if not doc or not verify_password(body.password, doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    user = UserDoc.from_mongo(doc)
    return {"token": create_token(user.id), "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user: UserDoc = Depends(current_user)):
    return public_user(user)


@api_router.put("/profile")
async def update_profile(body: ProfileReq, user: UserDoc = Depends(current_user)):
    updates: dict = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.username:
        slug = re.sub(r"[^a-z0-9_]", "", body.username.lower())[:18]
        if not slug:
            raise HTTPException(status_code=400, detail="Username can only use letters, numbers and _")
        clash = await db.users.find_one({"username": slug, "_id": {"$ne": ObjectId(user.id)}})
        if clash:
            raise HTTPException(status_code=400, detail="That username is already taken")
        updates["username"] = slug
    if body.role in ("home_cook", "chef"):
        updates["role"] = body.role
    for field in ("bio", "location", "favorite_cuisine", "website"):
        value = getattr(body, field)
        if value is not None:
            updates[field] = value.strip()
    if body.avatar_b64 is not None:
        updates["avatar_b64"] = compress_image(body.avatar_b64, max_width=400) if body.avatar_b64 else None
    if body.cover_b64 is not None:
        updates["cover_b64"] = compress_image(body.cover_b64, max_width=1000) if body.cover_b64 else None
    if body.preferences is not None:
        updates["preferences"] = body.preferences.model_dump()
    if updates:
        await db.users.update_one({"_id": ObjectId(user.id)}, {"$set": updates})
    doc = await db.users.find_one({"_id": ObjectId(user.id)})
    return public_user(UserDoc.from_mongo(doc))


@api_router.get("/usage")
async def usage(user: UserDoc = Depends(current_user)):
    used = await used_today(user.id)
    return {
        "used_today": used,
        "limit": FREE_DAILY_LIMIT,
        "remaining": max(0, FREE_DAILY_LIMIT - used) if not user.is_premium else None,
        "is_premium": user.is_premium,
    }


@api_router.post("/pairings")
async def create_pairing(body: PairingReq, user: UserDoc = Depends(current_user)):
    await ensure_quota(user)

    cat = body.category if body.category in ("ingredient", "dish", "beverage") else "ingredient"
    label = {"ingredient": "ingredient", "dish": "dish", "beverage": "drink"}[cat]
    prompt = (
        f'The user is working with this {label}: "{body.query.strip()}".\n'
        + (f'Additional context about what they are making: "{body.context.strip()}".\n' if body.context.strip() else "")
        + f"Suggest the 5 best {cat} pairings, each with a flavour reason and a serving tip, "
        "plus one mini recipe / serving idea that uses the best pairing."
    )
    data, model_used = await run_llm(
        build_system_message(user.role, user.preferences), prompt, f"pairing-{user.id}"
    )

    pairing = PairingDoc(
        user_id=user.id,
        query=body.query.strip(),
        category=cat,
        context=body.context.strip(),
        role=user.role,
        headline=str(data.get("headline", body.query.strip()))[:160],
        summary=str(data.get("summary", "")),
        pairings=[
            PairingItem(
                name=str(p.get("name", "")),
                category=str(p.get("category", cat)),
                why=str(p.get("why", "")),
                tip=str(p.get("tip", "")),
                flavor_profile=str(p.get("flavor_profile", "")),
                nutrition_notes=str(p.get("nutrition_notes", "")),
                alternatives=[str(a) for a in (p.get("alternatives") or [])][:3],
            )
            for p in (data.get("pairings") or [])
            if isinstance(p, dict)
        ],
        mini_recipe_title=str(data.get("mini_recipe_title", "")),
        mini_recipe_steps=[str(s) for s in (data.get("mini_recipe_steps") or [])],
        model_used=model_used,
    )
    res = await db.pairings.insert_one(pairing.to_mongo())
    pairing.id = str(res.inserted_id)
    return pairing.model_dump()


@api_router.get("/pairings")
async def list_pairings(
    favorites_only: bool = False, limit: int = 50, user: UserDoc = Depends(current_user)
):
    q: dict = {"user_id": user.id}
    if favorites_only:
        q["is_favorite"] = True
    # image_b64 is heavy — lists get a flag instead and the detail screen fetches the real image.
    docs = await db.pairings.find(q, {"image_b64": 0}).sort("created_at", -1).to_list(limit)
    return [PairingDoc.from_mongo(d).model_dump() for d in docs]


@api_router.get("/pairings/{pairing_id}")
async def get_pairing(pairing_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(pairing_id):
        raise HTTPException(status_code=404, detail="Pairing not found")
    doc = await db.pairings.find_one({"_id": ObjectId(pairing_id), "user_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Pairing not found")
    return PairingDoc.from_mongo(doc).model_dump()


@api_router.post("/pairings/{pairing_id}/image")
async def pairing_image(pairing_id: str, user: UserDoc = Depends(current_user)):
    """Generates (once) and returns the hero photo for a pairing as base64 PNG."""
    if not ObjectId.is_valid(pairing_id):
        raise HTTPException(status_code=404, detail="Pairing not found")
    doc = await db.pairings.find_one({"_id": ObjectId(pairing_id), "user_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Pairing not found")
    if doc.get("image_b64"):
        return {"image_b64": doc["image_b64"]}

    best = (doc.get("pairings") or [{}])[0].get("name", "")
    subject = f"{doc.get('query', '')} with {best}" if best else doc.get("query", "")
    image = await generate_food_image(subject, doc.get("category", "ingredient"))
    if not image:
        raise HTTPException(status_code=503, detail="Could not create the photo right now")
    await db.pairings.update_one({"_id": ObjectId(pairing_id)}, {"$set": {"image_b64": image}})
    return {"image_b64": image}


@api_router.post("/pairings/{pairing_id}/favorite")
async def toggle_favorite(pairing_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(pairing_id):
        raise HTTPException(status_code=404, detail="Pairing not found")
    doc = await db.pairings.find_one({"_id": ObjectId(pairing_id), "user_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Pairing not found")
    new_val = not doc.get("is_favorite", False)
    await db.pairings.update_one({"_id": ObjectId(pairing_id)}, {"$set": {"is_favorite": new_val}})
    return {"id": pairing_id, "is_favorite": new_val}


@api_router.delete("/pairings/{pairing_id}")
async def delete_pairing(pairing_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(pairing_id):
        raise HTTPException(status_code=404, detail="Pairing not found")
    res = await db.pairings.delete_one({"_id": ObjectId(pairing_id), "user_id": user.id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pairing not found")
    return {"deleted": True}


MENU_SCHEMA = """Respond with ONLY valid minified JSON, no markdown fences, matching:
{"title":"menu name","courses":[{"course":"Amuse / Starter / Main / Dessert","dish":"dish name","pairing":"beverage or side pairing","notes":"one line technique or plating note"}],"wine_notes":"2 sentences on the overall beverage progression"}
Return 4 to 5 courses."""


@api_router.post("/menus")
async def create_menu(body: MenuReq, user: UserDoc = Depends(current_user)):
    await ensure_quota(user)
    items = [i.strip() for i in body.items if i.strip()]
    if not items:
        raise HTTPException(status_code=400, detail="Add at least one hero ingredient")
    system = (
        "You are Pairly, a culinary R&D consultant building tasting menus for professional kitchens. "
        "Be precise about technique, seasonality, acid/fat balance and course progression.\n" + MENU_SCHEMA
    )
    prompt = (
        f"Build a coherent tasting menu for this occasion: {body.occasion or 'a modern tasting menu'}.\n"
        f"Hero ingredients available: {', '.join(items)}.\n"
        + (f"Chef notes / constraints: {body.notes}\n" if body.notes.strip() else "")
        + "Each course must have a beverage or side pairing."
    )
    data, _ = await run_llm(system, prompt, f"menu-{user.id}")
    menu = MenuDoc(
        user_id=user.id,
        title=str(data.get("title", "Tasting Menu"))[:160],
        occasion=body.occasion,
        items=items,
        courses=[
            MenuCourse(
                course=str(c.get("course", "")),
                dish=str(c.get("dish", "")),
                pairing=str(c.get("pairing", "")),
                notes=str(c.get("notes", "")),
            )
            for c in (data.get("courses") or [])
            if isinstance(c, dict)
        ],
        wine_notes=str(data.get("wine_notes", "")),
    )
    res = await db.menus.insert_one(menu.to_mongo())
    menu.id = str(res.inserted_id)
    return menu.model_dump()


@api_router.get("/menus")
async def list_menus(user: UserDoc = Depends(current_user)):
    docs = await db.menus.find({"user_id": user.id}).sort("created_at", -1).to_list(50)
    return [MenuDoc.from_mongo(d).model_dump() for d in docs]


@api_router.delete("/menus/{menu_id}")
async def delete_menu(menu_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(menu_id):
        raise HTTPException(status_code=404, detail="Menu not found")
    res = await db.menus.delete_one({"_id": ObjectId(menu_id), "user_id": user.id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Menu not found")
    return {"deleted": True}


# ---------------------------------------------------------------- Chat


CHAT_LIMIT = 40


def chat_system_message(user: UserDoc) -> str:
    prefs = user.preferences
    if user.role == "chef":
        tone = (
            "You are Pairly, a culinary R&D consultant talking to a professional chef. "
            "Be precise and technical about acidity, fat, umami, texture and menu logic. Be concise."
        )
    else:
        tone = (
            "You are Pairly, a warm and practical kitchen companion for a home cook. "
            "Give clear, encouraging, actionable advice with everyday ingredients. Be concise."
        )
    return (
        f"{tone}\nUser preferences — diet: {prefs.diet}; cuisines: {', '.join(prefs.cuisines) or 'any'}; "
        f"spice: {prefs.spice}; avoid: {prefs.avoid or 'nothing'}.\n"
        "Answer in short paragraphs or tight bullet lists. Never use markdown headings or tables. "
        "Stay on food, drink, pairing, technique and menus."
    )


@api_router.get("/chat/messages")
async def chat_history(user: UserDoc = Depends(current_user)):
    docs = await db.chat_messages.find({"user_id": user.id}).sort("created_at", 1).to_list(200)
    return [ChatMessageDoc.from_mongo(d).model_dump() for d in docs]


@api_router.delete("/chat/messages")
async def clear_chat(user: UserDoc = Depends(current_user)):
    await db.chat_messages.delete_many({"user_id": user.id})
    return {"cleared": True}


@api_router.post("/chat")
async def chat_send(body: ChatReq, user: UserDoc = Depends(current_user)):
    """Streams the assistant reply as SSE and persists both sides of the exchange."""
    await ensure_quota(user)

    history = (
        await db.chat_messages.find({"user_id": user.id}).sort("created_at", -1).to_list(CHAT_LIMIT)
    )
    history.reverse()
    user_msg = ChatMessageDoc(user_id=user.id, role="user", content=body.message.strip())
    await db.chat_messages.insert_one(user_msg.to_mongo())

    transcript = "\n".join(
        f"{'Chef' if m['role'] == 'user' else 'Pairly'}: {m['content']}" for m in history[-12:]
    )
    prompt = (
        (f"Conversation so far:\n{transcript}\n\n" if transcript else "")
        + f"New message from the user:\n{body.message.strip()}"
    )

    async def event_generator():
        from emergentintegrations.llm.chat import (
            LlmChat,
            StreamDone,
            TextDelta,
            UserMessage,
        )

        collected: List[str] = []
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"chat-{user.id}",
                system_message=chat_system_message(user),
            ).with_model("anthropic", "claude-sonnet-4-6")
            async for ev in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    collected.append(ev.content)
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:  # noqa: BLE001 - surface a readable error to the client
            logger.warning("Chat stream failed, falling back to OpenAI: %s", e)
            try:
                chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"chat-fb-{user.id}",
                    system_message=chat_system_message(user),
                ).with_model("openai", "gpt-5.5")
                text = await chat.send_message(UserMessage(text=prompt))
                collected.append(str(text))
                yield f"data: {json.dumps({'delta': str(text)})}\n\n"
            except Exception as e2:  # noqa: BLE001
                logger.error("Chat fallback failed: %s", e2)
                yield f"data: {json.dumps({'error': 'Pairly could not answer right now.'})}\n\n"

        reply = "".join(collected).strip()
        if reply:
            await db.chat_messages.insert_one(
                ChatMessageDoc(user_id=user.id, role="assistant", content=reply).to_mongo()
            )
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ---------------------------------------------------------------- Social


DEFAULT_COLLECTIONS = ["Favorites", "Want To Cook", "Meal Ideas"]


def author_card(doc: Optional[dict]) -> dict:
    if not doc:
        return {"id": "", "name": "Unknown cook", "username": "", "avatar_b64": None, "role": "home_cook"}
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "username": doc.get("username", ""),
        "avatar_b64": doc.get("avatar_b64"),
        "role": doc.get("role", "home_cook"),
    }


async def notify(recipient_id: str, actor: UserDoc, kind: str, message: str, post_id: Optional[str] = None):
    if recipient_id == actor.id:
        return
    await db.notifications.insert_one(
        NotificationDoc(
            user_id=recipient_id,
            actor_id=actor.id,
            actor_name=actor.name,
            kind=kind,
            post_id=post_id,
            message=message,
        ).to_mongo()
    )


async def hydrate_posts(docs: List[dict], viewer_id: str) -> List[dict]:
    """Attaches author, liked/bookmarked flags to raw post documents."""
    if not docs:
        return []
    author_ids = list({d["user_id"] for d in docs})
    authors = {
        str(a["_id"]): a
        for a in await db.users.find({"_id": {"$in": [ObjectId(i) for i in author_ids]}}).to_list(200)
    }
    post_ids = [str(d["_id"]) for d in docs]
    liked = {
        l["post_id"]
        for l in await db.likes.find({"user_id": viewer_id, "post_id": {"$in": post_ids}}).to_list(500)
    }
    saved: set[str] = set()
    for col in await db.collections.find({"user_id": viewer_id}).to_list(50):
        saved.update(col.get("post_ids", []))
    following = {
        f["following_id"] for f in await db.follows.find({"follower_id": viewer_id}).to_list(1000)
    }

    out = []
    for d in docs:
        post = PostDoc.from_mongo(d).model_dump()
        post["author"] = author_card(authors.get(d["user_id"]))
        post["is_liked"] = post["id"] in liked
        post["is_bookmarked"] = post["id"] in saved
        post["is_following_author"] = d["user_id"] in following
        out.append(post)
    return out


def rank_score(doc: dict, following: set) -> float:
    created = doc.get("created_at", "")
    try:
        age_h = (datetime.now(timezone.utc) - datetime.fromisoformat(created)).total_seconds() / 3600
    except ValueError:
        age_h = 72.0
    engagement = (
        doc.get("like_count", 0) * 2 + doc.get("comment_count", 0) * 3 + doc.get("bookmark_count", 0) * 2
    )
    follow_bonus = 12 if doc.get("user_id") in following else 0
    freshness = max(0.0, 24.0 - age_h) / 2
    return engagement + follow_bonus + freshness


@api_router.post("/posts")
async def create_post(body: PostReq, user: UserDoc = Depends(current_user)):
    kind = body.kind if body.kind in ("photo", "recipe", "pairing") else "photo"
    images = [compress_image(img, max_width=1080, quality=80) for img in body.images[:4]]
    if kind == "recipe" and (not body.recipe or not body.recipe.title.strip()):
        raise HTTPException(status_code=400, detail="A recipe post needs a title")
    if kind == "photo" and not images and not body.caption.strip():
        raise HTTPException(status_code=400, detail="Add a photo or a caption")

    tags = [t.strip().lstrip("#").lower() for t in body.hashtags if t.strip()][:8]
    post = PostDoc(
        user_id=user.id,
        kind=kind,
        caption=body.caption.strip(),
        hashtags=tags,
        images=images,
        recipe=body.recipe if kind == "recipe" else None,
        pairing_id=body.pairing_id if body.pairing_id and ObjectId.is_valid(body.pairing_id) else None,
    )
    res = await db.posts.insert_one(post.to_mongo())
    post.id = str(res.inserted_id)
    hydrated = await hydrate_posts([{**post.to_mongo(), "_id": res.inserted_id}], user.id)
    return hydrated[0]


@api_router.get("/feed")
async def feed(scope: str = "for_you", limit: int = 30, user: UserDoc = Depends(current_user)):
    following = {f["following_id"] for f in await db.follows.find({"follower_id": user.id}).to_list(1000)}
    query: dict = {}
    if scope == "following":
        query["user_id"] = {"$in": list(following) + [user.id]}
    docs = await db.posts.find(query).sort("created_at", -1).to_list(200)
    docs.sort(key=lambda d: rank_score(d, following), reverse=True)
    return await hydrate_posts(docs[:limit], user.id)


@api_router.get("/posts/{post_id}")
async def get_post(post_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    doc = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Post not found")
    return (await hydrate_posts([doc], user.id))[0]


@api_router.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    res = await db.posts.delete_one({"_id": ObjectId(post_id), "user_id": user.id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.likes.delete_many({"post_id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    return {"deleted": True}


@api_router.post("/posts/{post_id}/like")
async def toggle_like(post_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    doc = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Post not found")
    existing = await db.likes.find_one({"post_id": post_id, "user_id": user.id})
    if existing:
        await db.likes.delete_one({"_id": existing["_id"]})
        delta = -1
    else:
        await db.likes.insert_one(
            {
                "post_id": post_id,
                "user_id": user.id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        delta = 1
        await notify(doc["user_id"], user, "like", f"{user.name} liked your post", post_id)
    await db.posts.update_one({"_id": ObjectId(post_id)}, {"$inc": {"like_count": delta}})
    fresh = await db.posts.find_one({"_id": ObjectId(post_id)})
    return {"is_liked": delta > 0, "like_count": max(0, fresh.get("like_count", 0))}


@api_router.get("/posts/{post_id}/comments")
async def list_comments(post_id: str, user: UserDoc = Depends(current_user)):
    docs = await db.comments.find({"post_id": post_id}).sort("created_at", 1).to_list(300)
    authors = {
        str(a["_id"]): a
        for a in await db.users.find(
            {"_id": {"$in": [ObjectId(d["user_id"]) for d in docs]}}
        ).to_list(300)
    }
    out = []
    for d in docs:
        c = CommentDoc.from_mongo(d).model_dump()
        c["author"] = author_card(authors.get(d["user_id"]))
        out.append(c)
    return out


@api_router.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, body: CommentReq, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    post = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    comment = CommentDoc(
        post_id=post_id,
        user_id=user.id,
        parent_id=body.parent_id if body.parent_id and ObjectId.is_valid(body.parent_id) else None,
        content=body.content.strip(),
    )
    res = await db.comments.insert_one(comment.to_mongo())
    comment.id = str(res.inserted_id)
    await db.posts.update_one({"_id": ObjectId(post_id)}, {"$inc": {"comment_count": 1}})
    kind = "reply" if comment.parent_id else "comment"
    await notify(post["user_id"], user, kind, f"{user.name} {kind}d on your post", post_id)
    data = comment.model_dump()
    data["author"] = author_card(await db.users.find_one({"_id": ObjectId(user.id)}))
    return data


@api_router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(comment_id):
        raise HTTPException(status_code=404, detail="Comment not found")
    doc = await db.comments.find_one({"_id": ObjectId(comment_id), "user_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Comment not found")
    await db.comments.delete_one({"_id": ObjectId(comment_id)})
    await db.posts.update_one({"_id": ObjectId(doc["post_id"])}, {"$inc": {"comment_count": -1}})
    return {"deleted": True}


# ------------------------------------------------- Collections & bookmarks


async def ensure_collections(user_id: str) -> List[dict]:
    existing = await db.collections.find({"user_id": user_id}).to_list(50)
    have = {c["name"] for c in existing}
    for name in DEFAULT_COLLECTIONS:
        if name not in have:
            doc = CollectionDoc(user_id=user_id, name=name).to_mongo()
            res = await db.collections.insert_one(doc)
            existing.append({**doc, "_id": res.inserted_id})
    return existing


@api_router.get("/collections")
async def list_collections(user: UserDoc = Depends(current_user)):
    docs = await ensure_collections(user.id)
    return [
        {**CollectionDoc.from_mongo(d).model_dump(), "count": len(d.get("post_ids", []))} for d in docs
    ]


@api_router.post("/collections")
async def create_collection(body: CollectionReq, user: UserDoc = Depends(current_user)):
    name = body.name.strip()[:40]
    if await db.collections.find_one({"user_id": user.id, "name": name}):
        raise HTTPException(status_code=400, detail="You already have a collection with that name")
    doc = CollectionDoc(user_id=user.id, name=name)
    res = await db.collections.insert_one(doc.to_mongo())
    doc.id = str(res.inserted_id)
    return {**doc.model_dump(), "count": 0}


@api_router.get("/collections/{collection_id}/posts")
async def collection_posts(collection_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(collection_id):
        raise HTTPException(status_code=404, detail="Collection not found")
    col = await db.collections.find_one({"_id": ObjectId(collection_id), "user_id": user.id})
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    ids = [ObjectId(i) for i in col.get("post_ids", []) if ObjectId.is_valid(i)]
    docs = await db.posts.find({"_id": {"$in": ids}}).sort("created_at", -1).to_list(200)
    return await hydrate_posts(docs, user.id)


@api_router.post("/posts/{post_id}/bookmark")
async def toggle_bookmark(post_id: str, body: BookmarkReq, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Post not found")
    post = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    await ensure_collections(user.id)
    col = await db.collections.find_one({"user_id": user.id, "name": body.collection_name}) or (
        await db.collections.find_one({"user_id": user.id, "name": "Favorites"})
    )
    saved_ids = col.get("post_ids", [])
    if post_id in saved_ids:
        await db.collections.update_one({"_id": col["_id"]}, {"$pull": {"post_ids": post_id}})
        await db.posts.update_one({"_id": ObjectId(post_id)}, {"$inc": {"bookmark_count": -1}})
        return {"is_bookmarked": False, "collection": col["name"]}
    await db.collections.update_one({"_id": col["_id"]}, {"$addToSet": {"post_ids": post_id}})
    await db.posts.update_one({"_id": ObjectId(post_id)}, {"$inc": {"bookmark_count": 1}})
    await notify(post["user_id"], user, "bookmark", f"{user.name} saved your post", post_id)
    return {"is_bookmarked": True, "collection": col["name"]}


# ------------------------------------------------- Follows & public profiles


@api_router.post("/users/{target_id}/follow")
async def toggle_follow(target_id: str, user: UserDoc = Depends(current_user)):
    if target_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    if not ObjectId.is_valid(target_id) or not await db.users.find_one({"_id": ObjectId(target_id)}):
        raise HTTPException(status_code=404, detail="User not found")
    existing = await db.follows.find_one({"follower_id": user.id, "following_id": target_id})
    if existing:
        await db.follows.delete_one({"_id": existing["_id"]})
        return {"is_following": False}
    await db.follows.insert_one(
        {
            "follower_id": user.id,
            "following_id": target_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await notify(target_id, user, "follow", f"{user.name} started following you")
    return {"is_following": True}


@api_router.get("/users/{target_id}")
async def public_profile(target_id: str, user: UserDoc = Depends(current_user)):
    if not ObjectId.is_valid(target_id):
        raise HTTPException(status_code=404, detail="User not found")
    doc = await db.users.find_one({"_id": ObjectId(target_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    target = UserDoc.from_mongo(doc)
    posts = await db.posts.find({"user_id": target_id}).sort("created_at", -1).to_list(60)
    followers, following, is_following = await asyncio.gather(
        db.follows.count_documents({"following_id": target_id}),
        db.follows.count_documents({"follower_id": target_id}),
        db.follows.find_one({"follower_id": user.id, "following_id": target_id}),
    )
    return {
        **public_user(target),
        "email": None if target_id != user.id else target.email,
        "followers_count": followers,
        "following_count": following,
        "recipe_count": sum(1 for p in posts if p.get("kind") == "recipe"),
        "post_count": len(posts),
        "is_following": bool(is_following),
        "is_self": target_id == user.id,
        "posts": await hydrate_posts(posts, user.id),
    }


@api_router.get("/users/{target_id}/followers")
async def followers_list(target_id: str, user: UserDoc = Depends(current_user)):
    rows = await db.follows.find({"following_id": target_id}).to_list(500)
    ids = [ObjectId(r["follower_id"]) for r in rows if ObjectId.is_valid(r["follower_id"])]
    docs = await db.users.find({"_id": {"$in": ids}}).to_list(500)
    return [author_card(d) for d in docs]


@api_router.get("/users/{target_id}/following")
async def following_list(target_id: str, user: UserDoc = Depends(current_user)):
    rows = await db.follows.find({"follower_id": target_id}).to_list(500)
    ids = [ObjectId(r["following_id"]) for r in rows if ObjectId.is_valid(r["following_id"])]
    docs = await db.users.find({"_id": {"$in": ids}}).to_list(500)
    return [author_card(d) for d in docs]


@api_router.get("/me/liked")
async def my_liked_posts(user: UserDoc = Depends(current_user)):
    rows = await db.likes.find({"user_id": user.id}).sort("created_at", -1).to_list(200)
    ids = [ObjectId(r["post_id"]) for r in rows if ObjectId.is_valid(r["post_id"])]
    docs = await db.posts.find({"_id": {"$in": ids}}).to_list(200)
    return await hydrate_posts(docs, user.id)


# ------------------------------------------------- Search


@api_router.get("/search")
async def search(
    q: str = "",
    type: str = "all",
    cuisine: str = "",
    difficulty: str = "",
    diet: str = "",
    max_time: int = 0,
    max_calories: int = 0,
    sort: str = "latest",
    user: UserDoc = Depends(current_user),
):
    term = q.strip()
    rx = {"$regex": re.escape(term), "$options": "i"} if term else None

    users_out: List[dict] = []
    if type in ("all", "users") and term:
        udocs = await db.users.find(
            {"$or": [{"name": rx}, {"username": rx}, {"favorite_cuisine": rx}]}
        ).to_list(20)
        users_out = [author_card(d) for d in udocs]

    posts_out: List[dict] = []
    if type in ("all", "posts", "recipes"):
        pq: dict = {}
        conds: List[dict] = []
        if term:
            conds.append(
                {
                    "$or": [
                        {"caption": rx},
                        {"hashtags": rx},
                        {"recipe.title": rx},
                        {"recipe.description": rx},
                        {"recipe.ingredients": rx},
                        {"recipe.cuisine": rx},
                    ]
                }
            )
        if type == "recipes":
            conds.append({"kind": "recipe"})
        if cuisine:
            conds.append({"recipe.cuisine": {"$regex": re.escape(cuisine), "$options": "i"}})
        if difficulty:
            conds.append({"recipe.difficulty": difficulty})
        if diet:
            conds.append({"recipe.diet": {"$regex": re.escape(diet), "$options": "i"}})
        if conds:
            pq["$and"] = conds
        docs = await db.posts.find(pq).sort("created_at", -1).to_list(200)
        if max_time:
            docs = [
                d
                for d in docs
                if not d.get("recipe")
                or (d["recipe"].get("prep_time_min", 0) + d["recipe"].get("cook_time_min", 0)) <= max_time
            ]
        if max_calories:
            def cal(d: dict) -> int:
                try:
                    return int(re.sub(r"\D", "", str((d.get("recipe") or {}).get("nutrition", {}).get("calories", "")) ) or 0)
                except ValueError:
                    return 0

            docs = [d for d in docs if not d.get("recipe") or cal(d) == 0 or cal(d) <= max_calories]
        if sort == "likes":
            docs.sort(key=lambda d: d.get("like_count", 0), reverse=True)
        elif sort == "saves":
            docs.sort(key=lambda d: d.get("bookmark_count", 0), reverse=True)
        elif sort == "trending":
            docs.sort(key=lambda d: rank_score(d, set()), reverse=True)
        posts_out = await hydrate_posts(docs[:40], user.id)

    pairings_out: List[dict] = []
    if type in ("all", "pairings") and term:
        pdocs = (
            await db.pairings.find({"user_id": user.id, "query": rx}, {"image_b64": 0})
            .sort("created_at", -1)
            .to_list(20)
        )
        pairings_out = [PairingDoc.from_mongo(d).model_dump() for d in pdocs]

    return {"users": users_out, "posts": posts_out, "pairings": pairings_out}


# ------------------------------------------------- Notifications (in-app)


@api_router.get("/notifications")
async def list_notifications(user: UserDoc = Depends(current_user)):
    docs = await db.notifications.find({"user_id": user.id}).sort("created_at", -1).to_list(100)
    return [NotificationDoc.from_mongo(d).model_dump() for d in docs]


@api_router.post("/notifications/read")
async def mark_notifications_read(user: UserDoc = Depends(current_user)):
    await db.notifications.update_many({"user_id": user.id, "read": False}, {"$set": {"read": True}})
    return {"read": True}


# ------------------------------------------------- AI recipe generator


RECIPE_SCHEMA = """Respond with ONLY valid minified JSON, no markdown fences, matching:
{"title":"...","description":"1-2 sentences","cuisine":"...","difficulty":"Beginner|Intermediate|Advanced","prep_time_min":10,"cook_time_min":25,"servings":2,"ingredients":["200g item — note"],"instructions":["step 1","step 2"],"nutrition":{"calories":"520 kcal","protein":"32 g","carbs":"48 g","fat":"18 g"},"tags":["weeknight","one-pan"],"shopping_list":["item to buy"],"drink_pairing":"...","dessert_pairing":"...","ingredient_alternatives":["swap X for Y"]}
Return 5-12 ingredients and 4-8 instruction steps."""


@api_router.post("/recipes/generate")
async def generate_recipe(body: RecipeGenReq, user: UserDoc = Depends(current_user)):
    await ensure_quota(user)
    ingredients = [i.strip() for i in body.ingredients if i.strip()]
    if not ingredients and not body.goal.strip():
        raise HTTPException(status_code=400, detail="Add some ingredients or a goal")

    prefs = user.preferences
    tone = (
        "You are Pairly, a culinary R&D consultant writing for a professional chef."
        if user.role == "chef"
        else "You are Pairly, a friendly recipe developer writing for a home cook."
    )
    system = (
        f"{tone} Be precise about quantities and timings. Respect the user's diet: {body.diet or prefs.diet}. "
        f"Avoid: {prefs.avoid or 'nothing'}.\n{RECIPE_SCHEMA}"
    )
    prompt = "\n".join(
        filter(
            None,
            [
                f"Ingredients on hand: {', '.join(ingredients)}." if ingredients else "",
                f"Cuisine: {body.cuisine}." if body.cuisine else "",
                f"Diet: {body.diet}." if body.diet else "",
                f"Budget: {body.budget}." if body.budget else "",
                f"Total cooking time target: {body.cooking_time}." if body.cooking_time else "",
                f"Difficulty: {body.difficulty}." if body.difficulty else "",
                f"Calorie target per serving: {body.calories}." if body.calories else "",
                f"Goal: {body.goal}." if body.goal else "",
                "Create one complete recipe that uses as many of the listed ingredients as possible.",
            ],
        )
    )
    data, model_used = await run_llm(system, prompt, f"recipe-{user.id}")
    nut = data.get("nutrition") or {}
    recipe = RecipeData(
        title=str(data.get("title", "Generated recipe"))[:120],
        description=str(data.get("description", "")),
        cuisine=str(data.get("cuisine", body.cuisine)),
        difficulty=str(data.get("difficulty", body.difficulty or "Beginner")),
        prep_time_min=int(data.get("prep_time_min") or 0),
        cook_time_min=int(data.get("cook_time_min") or 0),
        servings=int(data.get("servings") or 2),
        ingredients=[str(i) for i in (data.get("ingredients") or [])],
        instructions=[str(i) for i in (data.get("instructions") or [])],
        nutrition=Nutrition(
            calories=str(nut.get("calories", "")),
            protein=str(nut.get("protein", "")),
            carbs=str(nut.get("carbs", "")),
            fat=str(nut.get("fat", "")),
        ),
        tags=[str(t) for t in (data.get("tags") or [])],
        diet=body.diet,
        shopping_list=[str(s) for s in (data.get("shopping_list") or [])],
        drink_pairing=str(data.get("drink_pairing", "")),
        dessert_pairing=str(data.get("dessert_pairing", "")),
        ingredient_alternatives=[str(a) for a in (data.get("ingredient_alternatives") or [])],
    )
    saved = {
        "user_id": user.id,
        "recipe": recipe.model_dump(),
        "inputs": body.model_dump(),
        "model_used": model_used,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.ai_recipes.insert_one(saved)
    return {"id": str(res.inserted_id), "recipe": recipe.model_dump()}


@api_router.get("/recipes/generated")
async def list_generated_recipes(user: UserDoc = Depends(current_user)):
    docs = await db.ai_recipes.find({"user_id": user.id}).sort("created_at", -1).to_list(50)
    return [
        {"id": str(d["_id"]), "recipe": d.get("recipe", {}), "created_at": d.get("created_at", "")}
        for d in docs
    ]


# ---------------------------------------------------------------- PayPal

PAYPAL_CONFIGURED = bool(PAYPAL_CLIENT_ID and PAYPAL_SECRET)


def paypal_token() -> str:
    r = requests.post(
        f"{PAYPAL_BASE}/v1/oauth2/token",
        auth=(PAYPAL_CLIENT_ID, PAYPAL_SECRET),
        data={"grant_type": "client_credentials"},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["access_token"]


@api_router.post("/paypal/order")
async def paypal_order(user: UserDoc = Depends(current_user)):
    if not PAYPAL_CONFIGURED:
        # MOCKED checkout until PayPal credentials are provided.
        return {"order_id": f"MOCK-{user.id}", "approve_url": None, "mocked": True, "price": PREMIUM_PRICE}
    try:
        token = paypal_token()
        r = requests.post(
            f"{PAYPAL_BASE}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "intent": "CAPTURE",
                "purchase_units": [
                    {
                        "reference_id": user.id,
                        "description": "Pairly Pro lifetime unlock",
                        "amount": {"currency_code": "USD", "value": PREMIUM_PRICE},
                    }
                ],
                "application_context": {
                    "brand_name": "Pairly",
                    "user_action": "PAY_NOW",
                    "return_url": "pairly://paypal-return",
                    "cancel_url": "pairly://paypal-cancel",
                },
            },
            timeout=25,
        )
        r.raise_for_status()
        data = r.json()
        approve = next((l["href"] for l in data.get("links", []) if l.get("rel") == "payer-action" or l.get("rel") == "approve"), None)
        return {"order_id": data["id"], "approve_url": approve, "mocked": False, "price": PREMIUM_PRICE}
    except requests.RequestException as e:
        logger.error("PayPal order failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not start PayPal checkout")


@api_router.post("/paypal/capture")
async def paypal_capture(body: CaptureReq, user: UserDoc = Depends(current_user)):
    if not PAYPAL_CONFIGURED:
        await db.users.update_one({"_id": ObjectId(user.id)}, {"$set": {"is_premium": True}})
        await db.payments.insert_one(
            {
                "user_id": user.id,
                "order_id": body.order_id,
                "amount": PREMIUM_PRICE,
                "status": "COMPLETED_MOCK",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        return {"is_premium": True, "mocked": True}
    try:
        token = paypal_token()
        r = requests.post(
            f"{PAYPAL_BASE}/v2/checkout/orders/{body.order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=25,
        )
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        logger.error("PayPal capture failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not confirm the PayPal payment")
    if data.get("status") != "COMPLETED":
        raise HTTPException(status_code=400, detail=f"Payment not completed (status: {data.get('status')})")
    await db.users.update_one({"_id": ObjectId(user.id)}, {"$set": {"is_premium": True}})
    await db.payments.insert_one(
        {
            "user_id": user.id,
            "order_id": body.order_id,
            "amount": PREMIUM_PRICE,
            "status": "COMPLETED",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"is_premium": True, "mocked": False}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username")
    await db.pairings.create_index([("user_id", 1), ("created_at", -1)])
    await db.posts.create_index([("created_at", -1)])
    await db.posts.create_index("user_id")
    await db.likes.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.comments.create_index([("post_id", 1), ("created_at", 1)])
    await db.follows.create_index([("follower_id", 1), ("following_id", 1)], unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    logger.info("Pairly API ready. PayPal configured: %s", PAYPAL_CONFIGURED)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
