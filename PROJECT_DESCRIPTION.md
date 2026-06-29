# TrustLens AI — Project Description

**Tagline:** See. Verify. Solve. — An AI-powered hyperlocal civic issue resolution platform where an autonomous Gemini agent runs the entire loop from a citizen's photo to a verified, paid-for fix.

**Live App (Google Cloud Run):** https://community-hero-ai-858911105056.asia-south1.run.app
**GitHub Repository:** https://github.com/Omgupta78/community-hero-ai
**Track:** Vibe2Ship — Problem Statement 2: Community Hero (Hyperlocal Problem Solver)

> This document is shared as "Anyone with the link → Viewer" and will remain available throughout the evaluation period.

---

## 1. Problem Statement Selected

**Problem Statement 2 — Community Hero: Hyperlocal Problem Solver.**

Everyday civic problems — potholes, water leaks, broken streetlights, illegal dumping, graffiti — are reported through fragmented, opaque channels. Three pain points stand out:

- **Citizens** never learn whether anyone acted on their report. There is no transparency and no feedback loop.
- **Municipal staff** are flooded with unstructured, duplicated, and unprioritized complaints, with no automated way to triage, cost, or route them.
- **Resolution and accountability** are missing — there is rarely proof that a problem was actually fixed before it is marked "done," and the same spots get patched again and again.

The result is low civic trust, slow resolution, and wasted public money.

## 2. Solution Overview

TrustLens AI closes the full civic loop — **report → AI triage → community verification → assignment → fix → AI + citizen verification → payment → prevention** — with transparency at every step.

A citizen snaps a photo. The moment the image is added, an **autonomous Gemini agent** triages it: it reads the photo, writes the description, classifies the category, scores severity and priority, detects duplicates, routes the issue to the correct department, and drafts a field plan — auto-filling the form so the citizen just reviews and submits.

The community verifies reports through a proof-of-presence trust model. Municipal officials manage the backlog from a Command Center where Gemini compares contractor quotations and recommends the best value before locking payment in escrow. A contractor fixes the issue and uploads an "after" photo; Gemini compares before/after to verify the repair; the citizen confirms it, rates the contractor, and the escrow releases automatically. A dedicated **Prevention & Foresight** layer then forecasts hotspots, detects emerging cross-issue clusters, flags repeat-offender locations, and optimizes spending against a budget — so the city acts before the next wave of complaints.

Every AI call has a deterministic fallback and rotates across multiple API keys, so the product never breaks even when a model is rate-limited or offline.

## 3. Key Features

- **Autonomous Triage Agent** — a multi-step agent that *acts*, not just answers: perceive → reason → de-duplicate → prioritize → auto-route & assign → draft plan, with a visible, persisted reasoning/action trace on every issue.
- **Snap-to-report with auto AI triage** — adding a photo instantly runs Gemini Vision to fill category, severity, description, department, and priority — no forms, no category hunting. Short video clips are analyzed directly (frame-extraction fallback for longer clips).
- **Full report-to-paid-fix loop with a Contractor/Responder role** — contractors browse a bounty-ranked jobs board, claim jobs, and submit proof-of-fix that Gemini verifies (before/after comparison).
- **Citizen "Confirm Fix" + escrow release + contractor rating** — the reporter is notified when a fix is submitted, compares before/after, confirms it, leaves a star rating and a review, and triggers automatic escrow payout. They can also reopen the issue if it isn't actually fixed.
- **Contractor Earnings & Ratings** — contractors see their wallet/payment history alongside the ratings and written reviews from the citizens they served (who rated them, the stars, and their note).
- **Municipal Command Center** — role-based dashboards with a live issue table including per-issue daily-loss costing, contractor RADAR matching, Gemini quotation comparison, an Agent Log of live AI steps with a tamper-evident hash trail, and an Escalation view sorted by financial impact and SLA.
- **Fix-It-Right — Prevention & Foresight (AI Insights):**
  - *AI Official's Daily Brief* — Gemini-written morning brief from live stats (open issues, red alerts, SLA breaches, total daily ₹ cost).
  - *Cross-issue emergent detection* — clusters correlated issues by area and flags emerging risks (e.g., possible water contamination) with a confidence score and recommended action.
  - *Budget-aware impact optimizer* — given a ward budget, greedily funds the issues that maximize citizens helped + ₹/day loss stopped per rupee ("fund these, defer those").
  - *Repeat-Offender Callout* — surfaces spots fixed multiple times and makes the financial case for a permanent fix.
  - *Preparedness pre-dispatch* — pre-positions crews ahead of forecast hazards (rain/heatwave) before any citizen reports.
  - *Civic memory* — searchable archive of past issues with verified/triaged status.
- **Predictive Insights** — Gemini forecasts rising categories and emerging hotspots with a preventive recommendation.
- **Hero Assistant chatbot** — a multi-turn Gemini assistant grounded in live platform stats, available on every page.
- **Community verification & integrity-gated gamification** — a proof-of-presence trust model weights on-site confirmations higher; reputation tiers, a live leaderboard, and duplicate-aware scoring prevent point farming. Users cannot verify their own reports.
- **Role switching** — a single Switch Role menu moves between Citizen, Contractor/Responder, and Municipal Official, plus a guided tour of the full loop.
- **Resilient, demo-proof AI** — a 6-model fallback chain plus rotation across multiple Google accounts' API keys, response caching, and a deterministic heuristic fallback, so live AI never runs dry or breaks mid-demo.
- **Mobile-first, accessible UI** — responsive citizen app with safe-area handling and a polished design system; desktop staff portals; consistent warm-sage + teal theme.

## 4. Technologies Used

- **Hono** (TypeScript) web framework with server-side JSX rendering
- **SQLite** as the data layer through one portable adapter — Cloudflare D1 in development, Node's built-in `node:sqlite` in production — so identical app logic runs on both Cloudflare and Google Cloud
- **TailwindCSS** (UI), **Leaflet** (maps), **Chart.js** (analytics), **Axios** (API client)
- **Web Crypto API** — PBKDF2 password hashing and edge-native Firebase RS256 token verification (no `firebase-admin` dependency)
- **Docker** + **tsx** on **Node 24** for the containerized production runtime
- Real-time experience via efficient client polling

## 5. Google Technologies Utilized

- **Google Gemini (`gemini-3.1-flash-lite` primary, via the Generative Language REST API)** — powers every AI capability: photo/video + text triage, the autonomous agent's reasoning, resolution planning, the official's daily brief, predictive insights, fix verification, contractor recommendations, and the chatbot. A multi-model fallback chain (`gemini-3.1-flash-lite → gemini-3-flash-preview → gemini-3.5-flash → gemini-2.5-flash → flash-lite → pro`) plus multi-key account rotation and a deterministic heuristic fallback keep AI responsive and quota-safe.
- **Firebase Authentication** — citizen sign-in with Google and Email/Password. ID tokens are verified server-side by validating the RS256 JWT against Google's public JWKs.
- **Google Cloud Run** — the production deployment: a containerized, autoscaling service on a public HTTPS URL.
- **Google Cloud Build** — builds the container image from the included Dockerfile for continuous deployment from GitHub.
- **Google Cloud Storage** — a mounted volume provides persistent storage for the application database, so data survives restarts and deploys.

---

### Appendix — Agentic depth (how the AI acts, not just answers)

On every new report, the agent autonomously executes a plan and mutates real system state:

1. **Perceive** — gather nearby open issues and the target department's current workload.
2. **Reason** — a structured Gemini pass decides duplicate / priority / routing (called only when there are candidates to dedupe, to conserve quota).
3. **De-duplicate** — link genuine repeat reports instead of creating redundant work.
4. **Prioritize** — set a computed priority score.
5. **Route** — auto-assign the issue to the matching department authority.
6. **Plan** — draft a field resolution plan (steps, crew, equipment, estimated time/cost, safety).

Every thought and action is persisted and shown to users as a transparent agent trace, and the Command Center includes a live agent-activity feed plus the Prevention & Foresight layer, so reviewers can watch the AI both *resolve* today's issues and *prevent* tomorrow's.
