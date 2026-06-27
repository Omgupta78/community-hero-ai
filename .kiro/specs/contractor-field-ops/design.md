# Design Document: Contractor "Field Ops" Panel

## Why this doc

The user asked for a contractor panel that matches/exceeds **Nidaan**'s contractor experience
("Win jobs, prove the fix, get paid"). Nidaan's live app is a JS SPA whose contractor panel sits
behind login, so its exact screens can't be crawled. This doc therefore specifies a **best-in-class
civic responder panel** built from: (a) the public Nidaan value proposition + the full civic loop,
(b) field-service app conventions (Urban Company / Porter / Dunzo-style job ops), and (c) the
existing TrustLens AI backend so everything is actually wired and working.

The panel is the **`/contractor` portal**, rendered with a scoped **emerald "Field Ops" theme**
(`.ctr-scope`) so it is unmistakably distinct from the blue Municipal Command Center (`.cc-scope`).

---

## Goals

1. A complete, multi-section responder app — not a single list — so it reads as a real product.
2. Surface the **municipal connection**: escrow-backed jobs assigned by the City, with a clear
   lifecycle and instant payout on AI verification.
3. Let contractors **find and win work**: an open job board + quotation bidding.
4. Make the field workflow obvious: **Accept → Navigate → Do the work → Prove the fix → Get paid.**
5. Be visibly premium and clean (glass cards, emerald accent, micro-animations, skeletons).

---

## Information architecture (left/clean tab nav)

A lightweight view-router (one section visible at a time), driven by a top tab bar:

| Tab | Purpose | Backend |
|-----|---------|---------|
| **Dashboard** | KPIs, active jobs at a glance, earnings, availability | `/jobs`, `/contractor/assignments` |
| **My Jobs** | Every job assigned to or claimed by me, with a status tracker + actions | `/contractor/assignments`, `/jobs` |
| **Job Board** | Open jobs to claim + submit a quotation (bid) | `/jobs`, `POST /issues/:id/quotations` |
| **Map** | Leaflet map of my jobs + open jobs, with "Navigate" links | `/jobs`, `/contractor/assignments` |
| **Earnings** | Wallet: total earned + paid-job history | `/jobs`, `/contractor/assignments` |
| **Profile** | Company, skills, base location, service radius, rating, availability | `GET/POST /contractor/profile` |

---

## The job lifecycle (the core UX)

Every job card shows a horizontal **status tracker** so the contractor always knows the next step:

```
Assigned ──► Accepted ──► In Progress ──► Proof submitted ──► AI Verified ✓ Paid
 (City)      (responder)   (on site)       (after photo)       (Gemini + escrow released)
```

- **Assigned (escrow):** the Municipal Command Center assigned this job and locked ₹X in escrow.
- **Accept:** contractor accepts (`POST /issues/:id/accept` → `job_assignments.state = 'InProgress'`).
  Declining is allowed before acceptance (frees the job; optional for the demo).
- **Navigate:** opens OpenStreetMap directions to the issue's lat/lng (no Google Maps billing).
- **Prove the fix:** upload an "after" photo → `POST /issues/:id/proof` → Gemini before/after verdict.
- **Paid:** on a verified fix, the escrow (or open-board bounty) is released to `users.earnings`
  instantly and the department budget's `spent` is updated. Card flips to "Paid ₹X".

`issues.status` stays canonical (`Reported→…→Resolved`); the richer responder sub-states live on
`job_assignments.state` and are derived for display.

---

## New / changed backend (additive, minimal)

All under `src/routes/api.ts`, `requireRole('contractor')` unless noted.

```ts
// Accept an assigned escrow job (moves it to active work).
POST /api/issues/:id/accept
//   guard: issue.contractor_id === me; sets job_assignments.state='InProgress',
//   issues.status='In Progress'; writes an issue_updates row. Idempotent.

// Contractor profile (Field Ops "Profile" tab).
GET  /api/contractor/profile   → { company, skills[], rating, jobs_completed, availability,
                                    active_tasks, base_address, lat, lng, service_radius_km, earnings }
POST /api/contractor/profile   → upsert company, skills (CSV), base_address, lat, lng, service_radius_km
```

Reused as-is: `/jobs`, `/contractor/assignments`, `/contractor/availability`,
`/issues/:id` (+timeline), `/issues/:id/plan` (Gemini action plan), `/issues/:id/claim`,
`/issues/:id/proof` (escrow-aware), `POST /issues/:id/quotations` (submit a bid).

No new tables. `contractors` already has company/skills/rating/jobs_completed/availability/
active_tasks/lat/lng/base_address; add a `service_radius_km` column via migration `0010`
(default 10) — additive only.

---

## Frontend

- **SSR shell** (`/contractor` in `src/index.tsx`): top bar (brand "Field Ops", availability,
  earnings, switch-role) + tab nav + one `.ctr-view` container per tab + proof modal + job-detail
  drawer + quote modal.
- **`public/static/contractor.js`**: view-router (lazy load per tab), Leaflet map, job cards with
  the status tracker, accept/navigate/prove/claim/quote actions, profile editor, earnings list.
- **`.ctr-scope` CSS** in `public/static/style.css`: emerald theme, glass cards, status tracker,
  skeletons, modals, responsive.

### Status tracker component (CSS)
A 5-node horizontal stepper; completed nodes filled emerald, current node pulsing, future nodes grey.

### Map
Leaflet + OSM tiles. Pins coloured by urgency; "Navigate" opens
`https://www.openstreetmap.org/directions?...` (or `geo:` on mobile) in a new tab.

---

## What makes this better than a generic panel

- **Real money loop:** escrow locked by the City → released automatically the instant Gemini
  verifies the after-photo. Most demos stop at "mark complete"; this closes payment.
- **AI in the contractor's hands:** before/after verification + an on-demand AI resolution plan
  (steps, equipment, crew, est. time/cost) per job.
- **Two ways to win work:** direct municipal assignment *and* open-board bidding (quotation).
- **Distinct, premium identity:** emerald Field Ops vs blue Command Center — never confused again.

---

## Test plan

1. Build + `getDiagnostics` clean.
2. Login `builder@city.gov / Build@123` → `/contractor` renders the emerald panel.
3. Dashboard KPIs + assignments load; availability toggle persists.
4. Accept an assigned job → state moves to In Progress; Navigate opens OSM.
5. Prove fix (after photo) → Gemini verdict → escrow released → earnings increase, card → Paid.
6. Job Board: submit a quotation on an open issue → appears in the City's approvals.
7. Profile: edit skills + service radius → persists; reflected in RADAR ranking.
8. Verify the Municipal Command Center still sees the assignment/escrow/budget updates.
```
