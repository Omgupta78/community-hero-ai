# 🦸 Community Hero AI

> **Hyperlocal civic problem solver** — citizens report local issues with a photo, an
> **autonomous AI agent** triages and routes them in seconds, the community verifies, and
> municipal staff resolve them. Built for **Vibe2Ship · Problem Statement 2: Community Hero**.

Powered by **Google Gemini**, **Firebase Auth**, and deployable to **Google Cloud Run**.

---

## ✨ Highlights

- 🤖 **Autonomous Triage Agent** — a multi-step agent that *acts*: perceive → reason →
  de-duplicate → prioritize → auto-route & assign → plan, with a visible reasoning trace.
- 🧠 **5 real Gemini integrations** — photo/text triage, agent reasoning, resolution planning,
  predictive insights, and a grounded chatbot.
- 🔐 **Two auth systems** — Firebase (Google + email) for citizens; PBKDF2 + sessions for staff.
- 🗺️ **Live map, verification, gamification, role-based dashboards** — full report→resolution loop.
- ♻️ **Resilient** — every AI call has a deterministic fallback, so demos never break.

## 🚀 Quick start (local)

```bash
npm start          # installs, builds, sets up the DB, and runs at http://localhost:5173
```
(or double-click `start.bat` on Windows). For real Gemini, put your key in `.dev.vars`
(see `.dev.vars.example`). Full guide: **HACKATHON_SETUP.md**.

Demo staff logins: `admin@city.gov / Admin@123`, `roads@city.gov / Roads@123`.

## ☁️ Deploy to Google Cloud Run

```bash
gcloud run deploy community-hero-ai --source . --region asia-south1 \
  --allow-unauthenticated --max-instances 1 \
  --set-env-vars "GEMINI_API_KEY=...,FIREBASE_PROJECT_ID=community-hero-eeb4a"
```
Full steps (incl. Secret Manager + Firebase domains): **DEPLOY_GOOGLE_CLOUD.md**.

## 🧠 The Agent (agentic depth)

When a report is created, `src/lib/agent.ts` runs an autonomous plan and mutates real state —
detecting duplicates, setting priority, assigning the right department, and drafting a plan.
Each step's thought + action is stored in `agent_actions` and rendered as a trace on the issue page.

## 🏗️ Architecture

```
Browser (TailwindCSS · Leaflet · Chart.js · Firebase JS SDK)
   │  axios + Firebase ID token
   ▼
Hono app (TypeScript, server-side JSX)         ← src/index.tsx, src/routes/api.ts
   ├─ AI: Gemini triage / agent / plan / predict / chat   ← src/lib/gemini.ts, src/lib/agent.ts
   ├─ Citizen auth: Firebase RS256 verify (edge-native)    ← src/lib/firebase.ts
   ├─ Staff auth: PBKDF2 + session cookies                 ← src/lib/auth.ts
   └─ Data: one portable SQLite adapter
        ├─ Cloudflare D1            (local dev / Cloudflare Pages)
        └─ node:sqlite              (Google Cloud Run)      ← src/db/sqlite.ts, src/server.node.ts
```

The same app code runs on **Cloudflare Pages** and **Google Cloud Run** — only the database
binding differs, behind a shared interface.

## 📡 Key API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/issues` | Create report → runs the autonomous triage agent |
| GET | `/api/issues/:id/agent` | The agent's reasoning/action trace |
| GET | `/api/issues/:id/plan` | Gemini resolution plan |
| POST | `/api/analyze` | Gemini photo/text triage |
| GET | `/api/predict` | Gemini predictive insights |
| POST | `/api/chat` | Hero Assistant chatbot |
| POST | `/api/auth/login` · `/api/issues/:id/assign` · `/status` | Staff auth & workflow |

## 🛠️ Tech stack

Hono · TypeScript · SQLite (D1 / node:sqlite) · Google Gemini · Firebase Auth ·
TailwindCSS · Leaflet · Chart.js · Docker · Google Cloud Run.

## 📄 Docs in this repo
- `HACKATHON_SETUP.md` — full local setup, AI features, demo script
- `DEPLOY_GOOGLE_CLOUD.md` — Cloud Run deployment
- `PROJECT_DESCRIPTION.md` — submission write-up
