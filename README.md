# Community Hero AI

AI-powered civic issue reporting platform. Citizens report local problems (potholes, water
leaks, broken streetlights, illegal dumping, graffiti) with a photo; Google **Gemini** analyzes
the report, categorizes it, scores its severity/priority and routes it to the right department.
The community verifies reports, and a municipal admin dashboard manages the resolution pipeline —
all backed by a **real Cloudflare D1 database** with **live polling** (not a demo/mock).

## Project Overview
- **Name**: Community Hero AI
- **Goal**: Turn citizen reports into prioritized, trackable civic action using real AI triage.
- **Key features**:
  - Real photo capture + **Gemini Vision** image/text analysis (category, severity, summary, department, priority score)
  - Real persistence in Cloudflare **D1** (issues, users, verifications, official update timeline)
  - **Real-time** dashboards via polling (home 5s, map 7s, admin 6s, verify 8s, detail 8s)
  - Interactive **Leaflet** community map with severity-colored live markers + geolocation
  - Community **verification voting** (auto-promotes a report to "Verified" after 3 confirms)
  - Gamification: community score points for reporting (+10) and verifying (+5)
  - Admin **AI priority queue**, issue queue table, status workflow modal, live Chart.js analytics
  - **Gemini-generated** weekly impact insight (with deterministic fallback)
  - **🔐 Password-protected staff portal** (PBKDF2 hashing + D1 session cookies)
  - **Role-based access**: `admin` (super-admin) vs `authority` (department)
  - **Issue assignment to authorities** — admin routes each issue to a department;
    that department logs in and sees **only the issues assigned to it**

## 🔐 Staff Authentication & Roles

The `/admin` and `/authority` portals are now **locked behind a login** (`/login`).
Citizen pages remain public.

| Role | What they can do |
|------|------------------|
| **admin** (City Operations) | Full admin console: triage AI priority queue, change any status, **assign issues to the right department authority** |
| **authority** (department) | Sees **only the issues assigned to their department**, can advance their status (Assigned → In Progress → Resolved) |

### Demo accounts (seeded)
| Email | Password | Role | Department |
|-------|----------|------|------------|
| `admin@city.gov` | `Admin@123` | admin | — |
| `roads@city.gov` | `Roads@123` | authority | Road Maintenance |
| `sanitation@city.gov` | `Sanitation@123` | authority | Sanitation |
| `electrical@city.gov` | `Electric@123` | authority | Electrical |
| `water@city.gov` | `Water@123` | authority | Water Works |
| `parks@city.gov` | `Parks@123` | authority | Parks & Recreation |

> Passwords are stored as PBKDF2-SHA256 hashes (`salt:hash`, 100k iterations) using the Web Crypto API — never in plaintext. Sessions are random 256-bit tokens stored in D1 with a 12-hour expiry, delivered as an `HttpOnly` cookie.

## Functional Entry URIs

### Pages (server-rendered)
| Path | Description |
|------|-------------|
| `/` | Home dashboard — live stats + recent issues |
| `/report` | Report a new issue (photo, GPS, AI analysis, submit) |
| `/map` | Live Leaflet map with filters (all / mine / needs verification) |
| `/verify` | Community verification feed (confirm / reject) |
| `/impact` | Citizen impact dashboard (AI insight + charts) |
| `/profile` | User profile, community score, my reports |
| `/issue/:id` | Issue detail with AI analysis + official timeline (+ assigned authority) |
| `/login` | **Staff sign-in** (admin & authorities) |
| `/admin` | Municipal operations console — **requires `admin` login** |
| `/authority` | Department dashboard — **requires `authority` login**, shows only its assigned issues |

### API (Hono + D1)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Staff login `{email, password}` → sets session cookie |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/me` | Current logged-in staff member (401 if none) |
| GET | `/api/authorities` | **(admin)** list department authorities (for assignment) |
| POST | `/api/analyze` | Run Gemini analysis on `{description, category?, imageBase64?, mimeType?}` |
| GET | `/api/issues?status=&category=&mine=&verify=&assigned=me&unassigned=&limit=` | List issues (`assigned=me` = authority's own queue) |
| GET | `/api/issues/:id` | Single issue + update timeline + assignee |
| POST | `/api/issues` | Create issue (auto-analyzes if `ai` not provided) |
| POST | `/api/issues/:id/verify` | Community verification `{vote: confirm|reject}` |
| PATCH | `/api/issues/:id/status` | **(admin/authority)** status update `{status, department?, message?}` |
| PATCH | `/api/issues/:id/assign` | **(admin)** assign to authority `{authority_id, message?}` |
| GET | `/api/stats` | Aggregate dashboard stats + category/status breakdowns |
| GET | `/api/insight` | Gemini weekly community insight |
| GET | `/api/me` | Current citizen profile + report count |

## Data Architecture
- **Storage**: Cloudflare **D1** (SQLite at the edge). Local dev uses an automatic local SQLite mirror.
- **Tables**:
  - `users` — citizens + staff. Staff have `role` (`admin`/`authority`), `department`, and `password_hash`
  - `issues` — report content, AI fields, geo, `status`, `verify_count`, **`assigned_to`** (authority user id)
  - `verifications` — one vote per user per issue (unique constraint)
  - `issue_updates` — official status-change timeline (author = the staff member)
  - `sessions` — login session tokens (`token`, `user_id`, `expires_at`)
- **AI**: Google Gemini (`gemini-2.5-flash`) via REST `fetch` (`src/lib/gemini.ts`). When `GEMINI_API_KEY`
  is not set, a deterministic keyword/severity **heuristic fallback** keeps the app fully functional
  (responses are tagged `source: "gemini"` or `"heuristic"` and shown in the UI).

## User Guide
1. **Report** an issue: open `/report`, take/upload a photo, add a description, tap **Analyze with AI**
   → review the AI's category/severity/department → **Submit Report** (earns +10 points).
2. **Verify** reports from neighbors at `/verify` or on any issue detail page (earns +5 points).
   After 3 confirmations a report is auto-promoted to **Verified** and bumped up the priority queue.
3. **Track** progress on `/map` (live markers) and on each `/issue/:id` timeline.
4. **Admins** use `/admin` to triage the AI priority queue and update statuses/departments; citizens
   see those official updates instantly on the issue timeline.

## Enabling Real Gemini AI
The app works out of the box with the smart fallback. To enable live Gemini analysis:
- **Local dev**: put your key in `.dev.vars` → `GEMINI_API_KEY=your_key_here`, then restart.
- **Production**: `npx wrangler pages secret put GEMINI_API_KEY --project-name community-hero-ai`
- Get a key at https://aistudio.google.com/apikey

## Development
```bash
npm install
npm run build
npm run db:migrate:local   # apply migrations to local D1
npm run db:seed            # load demo data
pm2 start ecosystem.config.cjs   # serves on http://localhost:3000
```

## Deployment
- **Platform**: Cloudflare Pages (+ D1)
- **Status**: ✅ Running locally in sandbox with **live Gemini AI enabled** / ⚠️ Not yet deployed to production
- **Tech Stack**: Hono + TypeScript (JSX SSR) + Cloudflare D1 + TailwindCSS (CDN) + Leaflet + Chart.js + Gemini (`gemini-2.5-flash`)
- **Sandbox URL**: https://3000-i2746obs5fb86efxebhdc-82b888ba.sandbox.novita.ai (try `/login`)
- **Last Updated**: 2026-06-24 (added password-protected admin + authority assignment)

### Production deploy (after configuring Cloudflare)
```bash
npx wrangler d1 create community-hero-ai-production   # copy database_id into wrangler.jsonc
npm run db:migrate:prod
npm run deploy
```

## 👤 Citizen Authentication (Firebase) — NEW

Citizens now sign in with **Firebase Authentication** (Google + Email/Password) on the
`/profile` page. This replaces the old fixed demo user for signed-in citizens.

- **Client**: `public/static/firebase-config.js` (project config) + `public/static/firebase-auth.js`
  (Firebase JS SDK v10, loaded as an ES module). It exposes `window.CHAuth` and an axios
  interceptor that automatically attaches the Firebase **ID token** (`Authorization: Bearer …`)
  to every `/api` request.
- **Server**: `src/lib/firebase.ts` verifies the Firebase ID token **on the Cloudflare Workers
  runtime** (no `firebase-admin`) — it validates the RS256 JWT signature against Google's public
  JWKs (cached per-isolate) plus the standard `iss`/`aud`/`exp`/`iat` claims, then
  finds-or-creates the matching citizen in D1 (`getOrCreateCitizen`).
- **Graceful fallback**: anonymous visitors (no token) still use the seeded demo citizen `id=1`,
  so the app remains fully usable without signing in.
- All citizen endpoints (`/api/me`, `/api/issues?mine`, `POST /api/issues`,
  `POST /api/issues/:id/verify`, `/api/stats`) now resolve the real signed-in citizen from the token.
- `users` table gained `firebase_uid` (unique) and `photo_url` columns (migration `0003`).

> The Firebase **web API key is not a secret** — it only identifies the project to Google's
> public auth endpoints; access is governed by Firebase Auth + security rules.

### Firebase console setup (one-time)
For Google sign-in / email-password to work in the browser you must, in the
[Firebase console](https://console.firebase.google.com/project/community-hero-64e49):
1. **Authentication → Sign-in method**: enable **Google** and **Email/Password**.
2. **Authentication → Settings → Authorized domains**: add your dev sandbox domain and your
   production `*.pages.dev` (and any custom) domain so the sign-in popup is allowed.

## Not Yet Implemented / Next Steps
- Admin UI to create/manage authority accounts & reset passwords (currently seeded).
- WebSocket/SSE push instead of polling for true server-push real-time (needs Durable Objects).
- Image storage in R2 (photos are currently stored as base64 data URLs in D1).
- Push/email notifications when an issue's status changes.
- Map clustering and address reverse-geocoding.
