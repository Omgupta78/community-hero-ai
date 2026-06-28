# TrustLens AI — Project Description

**Tagline:** See. Verify. Solve. — An AI-powered hyperlocal civic issue resolution platform where an autonomous Gemini agent runs the entire loop from report to verified, paid-for fix.

**Live App (Google Cloud Run):** https://community-hero-ai-858911105056.asia-south1.run.app
**GitHub Repository:** https://github.com/Omgupta78/community-hero-ai
**Hackathon / Track:** Vibe2Ship — Problem Statement 2: Community Hero (Hyperlocal Problem Solver)

> Submission note: this document is shared as "Anyone with the link → Viewer" and will remain available throughout the evaluation period.

---

## 1. Problem Statement Selected

**Problem Statement 2 — Community Hero: Hyperlocal Problem Solver.**

Everyday civic problems — potholes, water leaks, broken streetlights, illegal dumping, graffiti — are reported through fragmented, opaque channels. Three pain points stand out:

- **Citizens** never learn whether anyone acted on their report. There is no transparency and no feedback loop.
- **Municipal staff** are flooded with unstructured, duplicated, and unprioritized complaints, with no automated way to triage or route them.
- **Resolution and accountability** are missing — there is rarely proof that a problem was actually fixed before it is marked "done."

The result is low civic trust, slow resolution, and wasted public money.

## 2. Solution Overview

TrustLens AI is an end-to-end civic platform that closes the full loop — **report → AI triage → community verification → assignment → fix → AI + citizen verification → payment** — with transparency at every step.

A citizen reports a problem with a single photo (or short video). An **autonomous Gemini agent** triages it in seconds: it reads the image and text, classifies the category, scores severity and priority, detects duplicates, routes the issue to the correct municipal department, and drafts a field resolution plan — all shown to the citizen as a live, transparent timeline.

The community verifies reports using a proof-of-presence trust model. Municipal officials manage the backlog from a command center, where Gemini compares contractor quotations and recommends the best value before locking payment in escrow. A contractor fixes the issue and uploads an "after" photo; Gemini compares before/after to verify the repair, the citizen confirms it, and the escrow is released automatically. Predictive AI then forecasts emerging hotspots so the city can act before the next wave of complaints.

Every AI call has a deterministic fallback, so the product never breaks even when the model is rate-limited or offline.

## 3. Key Features

- **Autonomous Triage Agent** — a multi-step agent that *acts*, not just answers: perceive → reason → de-duplicate → prioritize → auto-route & assign → draft plan, with a visible, persisted reasoning/action trace on every issue.
- **AI photo & video triage** — Gemini Vision categorizes the issue, scores severity (1–5), assigns a department, and computes a priority score. Short video clips are analyzed directly (with automatic fallback to an extracted frame).
- **Full report-to-paid-fix loop with a Contractor/Responder role** — contractors browse a bounty-ranked jobs board, claim a job, and submit proof-of-fix. Gemini verifies the before/after photos.
- **Citizen "Confirm Fix" + escrow release** — the reporter is notified when a fix is submitted, compares before/after side by side, confirms the repair, thanks the contractor, and triggers automatic escrow payout. They can also reopen the issue if it isn't actually fixed.
- **Municipal Command Center** — role-based dashboards for commissioners and department authorities: live issue table with daily-loss costing, contractor RADAR matching, Gemini quotation comparison, an Agent Log of live AI steps, and an Escalation view sorted by financial impact and SLA.
- **Predictive Insights** — Gemini forecasts rising categories and emerging hotspots with a preventive recommendation (e.g., pre-assigning crews before complaints spike).
- **Community verification & integrity-gated gamification** — a proof-of-presence trust model weights on-site confirmations higher; reputation tiers, a live leaderboard, and duplicate-aware scoring prevent point farming. Users cannot verify their own reports.
- **Hero Assistant chatbot** — a multi-turn Gemini assistant grounded in live platform stats, available on every page.
- **Live interactive map** — Leaflet with severity-colored, auto-refreshing markers and GPS capture.
- **Two authentication systems** — Firebase (Google + email/password) for citizens; secure PBKDF2 + session-cookie login with role-based access control for staff.
- **Mobile-first, accessible UI** — responsive citizen app with safe-area handling, plus desktop staff portals, all on a consistent warm-sage + teal design system.

## 4. Technologies Used

- **Hono** (TypeScript) web framework with server-side JSX rendering
- **SQLite** as the data layer through one portable adapter — Cloudflare D1 in development, Node's built-in `node:sqlite` in production — so identical app logic runs on both Cloudflare and Google Cloud
- **TailwindCSS** (UI), **Leaflet** (maps), **Chart.js** (analytics), **Axios** (API client)
- **Web Crypto API** — PBKDF2 password hashing and edge-native Firebase RS256 token verification (no `firebase-admin` dependency)
- **Docker** + **tsx** on **Node 24** for the containerized production runtime
- Real-time experience via efficient client polling

## 5. Google Technologies Utilized

- **Google Gemini (`gemini-2.5-flash` family, via the Generative Language REST API)** — powers all five AI capabilities: photo/video + text triage, the autonomous triage agent's reasoning, resolution planning, predictive insights, and the grounded chatbot. A model-fallback chain (`gemini-2.5-flash` → `flash-lite` → `pro`) with retry/back-off keeps AI responsive under load, backed by a deterministic heuristic fallback.
- **Firebase Authentication** — citizen sign-in with Google and Email/Password. ID tokens are verified server-side by validating the RS256 JWT against Google's public JWKs.
- **Google Cloud Run** — the production deployment: a containerized, autoscaling service on a public HTTPS URL.
- **Google Cloud Build** — builds the container image from the included Dockerfile for continuous deployment from GitHub.
- **Google Cloud Storage** — a mounted volume provides persistent storage for the application database.

---

### Appendix — Agentic depth (how the AI acts, not just answers)

On every new report, the agent autonomously executes a plan and mutates real system state:

1. **Perceive** — gather nearby open issues and the target department's current workload.
2. **Reason** — one structured Gemini pass decides duplicate / priority / routing.
3. **De-duplicate** — link genuine repeat reports instead of creating redundant work.
4. **Prioritize** — set a computed priority score.
5. **Route** — auto-assign the issue to the matching department authority.
6. **Plan** — draft a field resolution plan (steps, crew, equipment, estimated time/cost, safety).

Every thought and action is persisted and shown to users as a transparent agent trace, and the Command Center includes a live agent-activity feed so reviewers can watch the agent working across the city.
