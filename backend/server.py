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
    role: str = "home_cook"
    password_hash: str
    preferences: Preferences = Preferences()
    is_premium: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PairingItem(BaseModel):
    name: str
    category: str = ""
    why: str = ""
    tip: str = ""


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
    role: Optional[str] = None
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
        "role": u.role,
        "preferences": u.preferences.model_dump(),
        "is_premium": u.is_premium,
    }


# ---------------------------------------------------------------- AI engine

SCHEMA_HINT = """Respond with ONLY valid minified JSON, no markdown fences, matching:
{"headline":"short editorial title","summary":"1-2 sentence overview","pairings":[{"name":"...","category":"ingredient|dish|beverage|sauce|side","why":"1-2 sentences on why it works flavour-wise","tip":"one short serving tip"}],"mini_recipe_title":"...","mini_recipe_steps":["step 1","step 2","step 3","step 4"]}
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
    if body.role in ("home_cook", "chef"):
        updates["role"] = body.role
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
    await db.pairings.create_index([("user_id", 1), ("created_at", -1)])
    logger.info("Pairly API ready. PayPal configured: %s", PAYPAL_CONFIGURED)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
