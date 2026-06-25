# Hackathon Setup — Community Hero AI (Windows)

This guide takes the app from "runs with fake AI" to **real Firebase login + real
Gemini AI**, then to a live public URL on Cloudflare. Commands are PowerShell-ready.

---

## ⚡ Fastest start — one command (does everything)

```powershell
npm start
```

This single command (via `scripts/start.mjs`) automatically:
1. installs dependencies if missing,
2. builds the app,
3. creates + migrates + seeds the local D1 database if it doesn't exist,
4. starts the dev server at **http://localhost:5173**.

It's safe to re-run — it skips steps that are already done. You can also just
**double-click `start.bat`** in the project folder, or run `./start.ps1`.

> To wipe and reseed the local database: `npm run db:reset`

---

## 🤖 AI features (all real Gemini, all with graceful fallback)

| Feature | Where | Endpoint |
|---------|-------|----------|
| **Autonomous Triage Agent** (perceive→reason→dedupe→prioritize→route→plan) | Runs on every new report; trace shown on issue page | auto + `GET /api/issues/:id/agent` |
| Photo + text triage (category, severity, dept, priority) | Report page | `POST /api/analyze` |
| AI Resolution Plan (steps, crew, equipment, time, cost, safety) | Any issue page | `GET /api/issues/:id/plan` |
| **Predictive Insights** (emerging hotspots, rising categories) | Impact page | `GET /api/predict` |
| Hero Assistant chatbot (multi-turn, grounded in live stats) | Floating bubble, every page | `POST /api/chat` |
| Weekly community insight | Impact page | `GET /api/insight` |

### 🧠 Agentic depth (the rubric's 20%)
When a citizen submits a report, an autonomous agent runs a **multi-step plan** and
*acts* on the system — it perceives context (nearby open issues + department load),
reasons with Gemini about duplicates/priority/routing, **de-duplicates** repeat reports,
sets a priority score, **auto-assigns** the issue to the correct department authority, and
drafts a resolution plan. Every step (thought + action) is logged and shown as a visible
"agent trace" on the issue page. See `src/lib/agent.ts`.

---

## 0. Manual setup (if you prefer step-by-step)

```powershell
npm install
npm run build
npm run db:setup     # creates the local D1 DB, runs migrations, seeds demo data
npm run dev          # http://localhost:5173
```

Demo staff logins (seeded):

| Email | Password | Role |
|-------|----------|------|
| admin@city.gov | Admin@123 | admin |
| roads@city.gov | Roads@123 | authority (Road Maintenance) |
| water@city.gov | Water@123 | authority (Water Works) |

> Useful resets: `npm run db:reset` wipes the local DB and re-seeds it.

---

## 1. Turn on REAL Gemini AI 🤖

1. Get a free API key: https://aistudio.google.com/apikey
2. Open `.dev.vars` (already created for you) and paste the key:
   ```
   GEMINI_API_KEY=AIza....your_real_key
   ```
3. Restart `npm run dev`.

**How to verify it's live:** report an issue at `/report`, or call the API:
```powershell
$body = '{"description":"Sparking exposed wire on a fallen streetlight pole"}'
(Invoke-WebRequest -Uri "http://localhost:5173/api/analyze" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing).Content
```
When the key works, the JSON shows `"source":"gemini"` (instead of `"heuristic"`)
and the title/summary read like real AI. Photos are also analyzed by Gemini Vision.

If the key is missing or rate-limited, the app silently falls back to the
deterministic heuristic so a demo never breaks. That's a feature — mention it to judges.

---

## 2. Turn on REAL Firebase citizen login 🔐

You can either **reuse the bundled project** or **use your own** (recommended for a hackathon
you "own"). To use your own:

### a) Create the project
1. https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Get started**.
3. **Sign-in method** tab → enable **Google** and **Email/Password**.
4. **Settings → Authorized domains** → add:
   - `localhost`
   - your future `*.pages.dev` domain (after step 3 below)

### b) Get the web config
Project settings (⚙️) → **Your apps → Web app (</>)** → register → copy the `firebaseConfig`.

### c) Wire it into the app (two places must match)
1. **Client** — `public/static/firebase-config.js`: replace the whole `window.FIREBASE_CONFIG`
   object with your copied config.
2. **Server** — set the project id so the backend can verify ID tokens:
   - Local: in `.dev.vars` set `FIREBASE_PROJECT_ID=your-project-id`
   - Production: `npx wrangler pages secret put FIREBASE_PROJECT_ID --project-name community-hero-ai`

   (The `projectId` value in step 1 and `FIREBASE_PROJECT_ID` must be identical.)

3. Restart `npm run dev`, open `/profile`, sign in with Google or email. Your reports,
   score, and verifications now belong to your real account. Anonymous visitors still
   work (they fall back to the seeded demo citizen).

> The Firebase web apiKey is **not** a secret — it only identifies your project to
> Google's public auth endpoints. It's safe to commit.

---

## 3. Deploy to a live public URL ☁️ (Cloudflare Pages + D1)

```powershell
# Login once
npx wrangler login

# Create the production D1 database, then paste the printed database_id
# into wrangler.jsonc (replace "local-placeholder-id").
npx wrangler d1 create community-hero-ai-production

# Apply schema + seed to the REMOTE database
npm run db:migrate:prod
npx wrangler d1 execute community-hero-ai-production --remote --file=./seed.sql

# Push your secrets to production
npx wrangler pages secret put GEMINI_API_KEY --project-name community-hero-ai
npx wrangler pages secret put FIREBASE_PROJECT_ID --project-name community-hero-ai

# Build + deploy
npm run deploy
```

After deploy, add the printed `*.pages.dev` domain to Firebase **Authorized domains**
(step 2a-4) so Google sign-in works in production.

---

## Demo script for judges (90 seconds)
1. **/report** — snap a photo of a pothole → "Analyze with AI" → real Gemini category +
   severity + department + priority score → Submit (+10 pts).
2. **Open the issue** → tap **"Generate AI Action Plan"** → Gemini drafts a live municipal
   plan (steps, crew, equipment, time, cost, safety).
3. **Hero Assistant** — tap the chat bubble (bottom-right) → ask "How do I verify a report?"
   or "How many issues are open?" → grounded, conversational Gemini answers.
4. **/map** — live Leaflet markers, severity-colored, auto-refreshing.
5. **/verify** — confirm a neighbor's report (+5 pts). 3 confirms auto-promotes to *Verified*.
6. **/login as admin** — AI priority queue, assign the pothole to *Road Maintenance*.
7. **/login as roads@city.gov** — the authority sees only its assigned issue, advances it
   to *In Progress* → citizens see the official update on the issue timeline instantly.
8. **/impact** — Gemini-written weekly summary + live Chart.js analytics.

## Talking points
- Real edge stack: Hono + Cloudflare Pages + **D1 SQLite at the edge**, no mock data.
- **Four real Gemini integrations**: photo triage, resolution planner, weekly insight, and a
  live chatbot grounded in the platform's real-time stats.
- Every AI call has a deterministic fallback, so the demo is rate-limit-proof.
- Firebase ID tokens verified **on the Workers runtime by hand** (RS256 against Google JWKs) —
  no `firebase-admin`, fully edge-native.
- Two real auth systems: Firebase for citizens, PBKDF2 + D1 sessions for staff, with RBAC.
