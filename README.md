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
| `/issue/:id` | Issue detail with AI analysis + official timeline |
| `/admin` | Municipal operations console (priority queue, table, analytics) |

### API (Hono + D1)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analyze` | Run Gemini analysis on `{description, category?, imageBase64?, mimeType?}` |
| GET | `/api/issues?status=&category=&mine=&verify=&limit=` | List issues |
| GET | `/api/issues/:id` | Single issue + update timeline |
| POST | `/api/issues` | Create issue (auto-analyzes if `ai` not provided) |
| POST | `/api/issues/:id/verify` | Community verification `{vote: confirm|reject}` |
| PATCH | `/api/issues/:id/status` | Admin status update `{status, department?, message?}` |
| GET | `/api/stats` | Aggregate dashboard stats + category/status breakdowns |
| GET | `/api/insight` | Gemini weekly community insight |
| GET | `/api/me` | Current user profile + report count |

## Data Architecture
- **Storage**: Cloudflare **D1** (SQLite at the edge). Local dev uses an automatic local SQLite mirror.
- **Tables**:
  - `users` — citizens/admins, community `score`
  - `issues` — report content, AI fields (`category`, `severity`, `priority_score`, `ai_summary`, `ai_source`), geo (`lat`/`lng`), `status`, `verify_count`
  - `verifications` — one vote per user per issue (unique constraint)
  - `issue_updates` — official status-change timeline
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
- **Sandbox URL**: https://3000-ijok9ylao3b7gi3uhdwq3-5185f4aa.sandbox.novita.ai
- **Last Updated**: 2026-06-24

### Production deploy (after configuring Cloudflare)
```bash
npx wrangler d1 create community-hero-ai-production   # copy database_id into wrangler.jsonc
npm run db:migrate:prod
npm run deploy
```

## Not Yet Implemented / Next Steps
- Real authentication (currently a fixed demo user `id=1`); wire up Google OAuth.
- WebSocket/SSE push instead of polling for true server-push real-time (needs Durable Objects).
- Image storage in R2 (photos are currently stored as base64 data URLs in D1).
- Push/email notifications when an issue's status changes.
- Map clustering and address reverse-geocoding.
