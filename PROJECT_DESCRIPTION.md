# Community Hero AI — Project Description

> Copy this into a Google Doc, set sharing to **"Anyone with the link → Viewer"**, and
> submit that link on BlockseBlock. (Add 3–4 screenshots and your live URL at the top.)

**Live App (Google Cloud Run):** `https://<your-service>.a.run.app`
**GitHub Repository:** `https://github.com/<you>/community-hero-ai`

---

## Problem Statement Selected
**Problem Statement 2 — Community Hero: Hyperlocal Problem Solver.**

Communities face everyday issues — potholes, water leaks, broken streetlights, illegal
dumping, graffiti — but reporting them is fragmented, hard to track, and opaque. Citizens
rarely know if anyone acted on their report, and municipal staff are flooded with
unstructured, duplicated, unprioritized complaints.

## Solution Overview
Community Hero AI is an end-to-end civic platform where citizens report a local problem with
a photo, and an **autonomous AI agent** triages it in seconds: it analyzes the photo and
text with Google **Gemini**, scores severity and priority, detects duplicate reports,
routes the issue to the correct municipal department, and drafts a field resolution plan —
all visible to the citizen as a transparent, real-time timeline.

The community verifies reports (auto-promoting genuine ones), municipal staff resolve them
through role-based dashboards, and an impact dashboard shows live analytics plus Gemini-
generated **predictive insights** about emerging hotspots. A Gemini-powered chatbot guides
users throughout. The result is a transparent, accountable, AI-driven loop from report to
resolution.

## Key Features
- **Image & video reporting** — capture or upload a photo *or* a short video clip. For video,
  the app extracts a representative frame for Gemini Vision analysis and plays the clip back
  on the issue page.
- **Autonomous Triage Agent** — a multi-step agent (perceive → reason → de-duplicate →
  prioritize → auto-route & assign → plan) that acts on each new report and logs a visible
  reasoning/action trace.
- **AI photo + text triage** — Gemini Vision categorizes the issue, scores severity (1–5),
  assigns a department, and computes a priority score.
- **AI Resolution Plan** — on-demand Gemini-generated municipal action plan (steps, crew,
  equipment, estimated time/cost, safety precautions).
- **Hero Assistant chatbot** — multi-turn Gemini assistant grounded in live platform stats,
  available on every page.
- **Predictive Insights** — Gemini forecasts rising issue categories and emerging hotspots
  with a preventive recommendation.
- **Community verification & gamification** — citizens confirm reports; reporting earns
  community points. Verification uses a **proof-of-presence trust model**: confirming an
  issue while physically near it ("on-site") is worth more and counts double toward
  promotion, while remote reviews count less — so a report is only auto-promoted to
  "Verified" once it reaches enough *trusted* confirmations. You can't verify your own report.
- **Reputation tiers & live leaderboard** — community score maps to Hero tiers (Newcomer →
  Bronze → Silver → Gold → Platinum Hero) shown with a progress bar on each profile, plus a
  ranked community leaderboard. **Integrity-gated points**: reports the agent flags as
  duplicates earn far less, so points can't be farmed with spam or repeat reports.
- **Live interactive map** — Leaflet with severity-colored, auto-refreshing markers + GPS.
- **Role-based municipal dashboards** — a super-admin assigns issues; department authorities
  see only their assigned queue and advance status; citizens see official updates instantly.
- **Two authentication systems** — Firebase (Google + email/password) for citizens; secure
  PBKDF2 + session-cookie login for staff, with role-based access control.
- **Resilient by design** — every AI call has a deterministic fallback, so the product never
  breaks even if the AI is rate-limited or offline.

## Technologies Used
- **Hono** (TypeScript) web framework with server-side JSX rendering
- **SQLite** (Cloudflare D1 in dev / Node `node:sqlite` in production) via a single portable
  data-access adapter
- **TailwindCSS**, **Leaflet** (maps), **Chart.js** (analytics), **Axios**
- **Web Crypto API** for PBKDF2 password hashing and Firebase RS256 token verification
- **Docker** + **tsx**/Node 24 runtime
- Real-time experience via efficient client polling

## Google Technologies Utilized
- **Google Gemini (`gemini-2.5-flash`)** — powers all five AI capabilities: photo/text
  triage, the autonomous triage agent's reasoning, resolution planning, predictive insights,
  and the chatbot (via the Generative Language REST API).
- **Firebase Authentication** — citizen sign-in (Google + Email/Password). ID tokens are
  verified server-side by validating the RS256 JWT against Google's public JWKs (edge-native,
  no `firebase-admin`).
- **Google Cloud Run** — the production deployment target (containerized, autoscaling,
  public HTTPS URL), built via **Google Cloud Build** from the included Dockerfile.

## Agentic Depth (how the AI acts, not just answers)
On every report the agent autonomously executes a plan and mutates real system state:
1. **Perceive** — gathers nearby open issues + the target department's current workload.
2. **Reason** — one structured Gemini pass decides duplicate / priority / routing.
3. **De-duplicate** — links genuine repeat reports instead of creating redundant work.
4. **Prioritize** — sets a computed priority score.
5. **Route** — auto-assigns the issue to the matching department authority.
6. **Plan** — drafts a field resolution plan.
Every thought and action is persisted and shown to users as a transparent agent trace.
