# Pairly AI — Product Requirements (living doc)

## Original problem statement
Mobile app (Expo/React Native + FastAPI + MongoDB) for home cooks and chefs to discover smart food pairings
with AI-assisted recommendations, explanations and mini recipes. V1 scope: auth, role selection, AI pairing
search with category filters, recipe context input, saved favorites, search history, WhatsApp sharing,
free daily limit with PayPal premium unlock, chef menu-building tool.

## User choices (locked)
- Auth: JWT email/password
- AI: Claude Sonnet 4.6 primary, GPT-5.5 fallback (Emergent Universal Key)
- Monetisation: 5 free AI requests/day + PayPal one-time Pro unlock ($9.99)
- AI output depth: pairings + why-it-works + serving tip + mini recipe
- Chef mode: different AI tone **and** menu builder / batch pairing tool

## Architecture
- Backend `/app/backend/server.py` — FastAPI, all routes under `/api`, motor + MongoDB,
  bcrypt password hashing, PyJWT (30-day tokens), `emergentintegrations.LlmChat` for AI,
  `BaseDocument`/`PyObjectId` pattern for Mongo serialisation.
- Collections: `users`, `pairings`, `menus`, `payments`.
- Frontend `/app/frontend` — expo-router file routes, `src/theme.ts` (editorial warm palette),
  `src/api.ts` (typed client), `src/auth-context.tsx`, `src/components/{ui,toast}.tsx`,
  `src/share.ts` (WhatsApp deep link + share-sheet fallback).
- Routes: `(auth)/index`, `(tabs)/{index,saved,menus,profile}`, `pairing/[id]`, `paywall` (modal).

## User personas
1. **Home cook** — wants fast, friendly pairing help mid-cook; plain language, supermarket ingredients.
2. **Chef** — wants technical reasoning (acid/fat/umami), non-obvious combinations, coursed menu generation.

## Core requirements (static)
- Account required; role chosen at signup, changeable in profile.
- Every AI result stored so history and favorites work offline of the LLM.
- Free tier hard-capped daily; 402 drives the paywall.
- All screens have loading / empty / error states; sticky CTAs; safe-area aware.

## Implemented (2026-06)- JWT signup/login/me, role selection, profile preferences (diet, spice, cuisines, avoid).
- AI pairing engine with category filters + recipe context; Claude → GPT fallback; structured JSON.
- Pairing detail: expandable pairing cards (why + tip), mini recipe card, favorite toggle, WhatsApp share.
- Search history on Pair tab; Saved tab with category filter chips + pull-to-refresh.
- Chef menu builder: hero-ingredient tags, occasion, constraints → coursed menu with beverage pairings + share.
- Usage metering (5/day), paywall screen, PayPal order/capture endpoints (**MOCK mode until keys provided**).
- Tested: 20 backend pytest cases pass; frontend e2e flow verified (`/app/test_reports/iteration_1.json`).
- Branded shareable **pairing card image** — off-screen card (`src/components/pairing-share-card.tsx`)
  captured with `react-native-view-shot` and shared via `expo-sharing` from the pairing detail screen
  (web shows an info toast; native only). Verified in `/app/test_reports/iteration_2.json`.
- **Food photography**: AI-generated hero photo per pairing (Gemini Nano Banana
  `gemini-3.1-flash-image-preview`, JPEG-compressed base64, cached on the doc, `POST /api/pairings/{id}/image`);
  editorial fallback photos as thumbnails in Recent searches and Saved cards.
- **Ask Pairly chat tab** — streaming SSE chat (Claude Sonnet 4.6, GPT-5.5 fallback) with persisted history,
  starter prompts, clear conversation; chat messages count toward the daily AI quota.
- Renamed the product from "Pairly AI" to **Pairly** across app.json, UI, share text and API.
  All verified in `/app/test_reports/iteration_3.json`.

## Uploaded master spec (Pairly – Master Emergent Prompt v1.0)
The user uploaded a full spec turning Pairly into an AI food discovery + social network
(feed, posts, follows, comments, collections, search, recipe generator, roles, moderation, analytics).
Delivery is phased. Stack stays FastAPI + MongoDB (spec's Supabase/Postgres/NativeWind is substituted).

### Slice 1 — delivered (2026-06, iterations 4-5)
- Social: photo + recipe posts (photos as compressed base64), ranked feed (For you / Following),
  likes, comments + replies, follow/unfollow, in-app activity notifications.
- AI Recipe Generator: ingredients/cuisine/diet/budget/time/difficulty/calories/goal →
  full recipe + nutrition + shopping list + drink/dessert pairing, publishable to the feed.
- Collections: Favorites / Want To Cook / Meal Ideas auto-created + custom collections, post bookmarking.
- Global search: users / posts / recipes / my pairings with cuisine, difficulty, diet and time filters
  and latest / most liked / most saved / trending sorting.
- Expanded profiles: username, bio, location, favourite cuisine, website, avatar + cover photos, counts.
- Extended pairing output: flavor_profile, nutrition_notes, alternatives per pairing.
- Navigation restructured to Home / Search / Create / AI hub / Profile.
- All AI endpoints (pairings, menus, chat, recipe generation) count toward the 5/day free quota.

### Slice 2 — next
- Google / Apple sign-in (Emergent-managed Google auth), password reset, onboarding + splash screens.
- Video uploads + object storage (needs the user's AWS keys).
- Roles & moderation (guest / creator / moderator / admin), reporting, admin analytics.
- Dark mode (user asked for later).

## Backlog- **P0** Real PayPal credentials (sandbox → live) + webhook verification for capture.
- **P1** Refine-result action (ask AI to adjust an existing pairing); voice input while cooking.
- **P1** Ingredient photo upload + vision recognition.
- **P2** Personalised recommendations from history; pantry-based suggestions; community-shared pairings; multi-language.
- **P2** Analytics + basic admin visibility.

## Next tasks
1. Collect PayPal client ID/secret and switch checkout out of mock mode.
2. Add "refine this pairing" follow-up prompt on the detail screen.
3. Consider streaming the AI response for perceived speed.
