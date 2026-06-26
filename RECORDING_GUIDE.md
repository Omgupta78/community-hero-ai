# 🎥 Full Demo Video — Recording Storyboard (sign-in → final response)

A complete, shot-by-shot guide to record a ~3-minute walkthrough covering **every**
feature. Follow it scene by scene; you can pause recording between scenes and stitch, or
do it in one take once you've rehearsed.

---

## Tools (free)
- **Screen recorder:** Windows **Xbox Game Bar** (press `Win + G` → record), or **OBS Studio**
  (free, best quality), or **Loom** (browser, easy).
- **Resolution:** record the browser maximized at 1080p. Use a phone-width window
  (~420px) only if you want the mobile look; otherwise desktop is fine and easier to read.
- **Audio:** narrate live with your mic, or record silent and add captions.

## Pre-recording setup (do this first)
1. Fresh **Gemini key** in `.dev.vars` (so responses show `Gemini`, not fallback) and restart.
2. Run the app: `npm run dev` → open `http://localhost:5173`.
3. Reset to clean demo data so everything looks pristine: `npm run db:reset`.
4. Have a sample **photo** (a pothole/streetlight image) and a short **video clip** ready on
   your machine to upload.
5. Open two browser profiles/windows:
   - **Window A** — normal (citizen).
   - **Window B** — for staff `/login`.
6. Close other tabs; hide bookmarks bar for a clean frame.

---

## SCENE 1 — Intro & Home (0:00–0:20)
- **Show:** the Home dashboard (`/`).
- **Do:** slowly scroll: hero "Community Impact", stat cards, Quick Actions, Recent Issues.
- **Say:** "This is Community Hero AI — citizens report local civic issues, an autonomous AI
  agent triages them, the community verifies, and the city resolves them. Everything here is
  live data, real-time."

## SCENE 2 — Citizen sign-in (0:20–0:35)
- **Show:** click **Profile** (bottom nav) → the sign-in screen.
- **Do:** click **Continue with Google** → pick your account → land on the signed-in profile.
- **Say:** "Citizens sign in with Firebase — Google or email. Now I'm a real user with a
  Community Score, a Hero tier, and my own reports."
- **Point at:** the **tier badge + progress bar** and **community rank**.

## SCENE 3 — Report an issue with AI (0:35–1:05)
- **Show:** tap **Report** (center nav button).
- **Do:**
  1. Click the upload box → choose your **photo** (or **video** to show video reporting).
     - If video: pause on the note "Gemini will analyze the actual clip."
  2. Type a description, e.g. "Deep pothole on Main Street, dangerous for bikes."
  3. Click **Analyze with AI** → wait for the result card.
- **Say:** "I add a photo or a short video and tap Analyze. Google Gemini looks at the actual
  media — it picks the category, severity, the right department, and a priority score."
- **Point at:** the `Gemini Live` badge on the AI result.
- **Do:** click **Submit Report** → it redirects to the issue page.

## SCENE 4 — The Autonomous Agent ⭐ (1:05–1:40)  [your strongest moment — go slow]
- **Show:** the issue detail page that just loaded.
- **Do:** scroll to the **Autonomous Triage Agent** trace and read the steps.
- **Say:** "The moment I submitted, an autonomous agent took over and ran a multi-step plan by
  itself: it perceived nearby reports and department workload, reasoned with Gemini, checked
  for duplicates, set the priority, **auto-assigned it to the right department**, and drafted a
  resolution plan. Every step of its thinking is shown — it acts, it doesn't just answer."
- **Do:** click **Generate AI Action Plan** → show the steps/crew/time/cost/safety.

## SCENE 5 — Trust-based verification (1:40–2:00)
- **Show:** scroll to the verification area on the issue (on-site / remote counts).
- **Say:** "Verification is proof-of-presence. Confirming an issue while you're physically near
  it counts as trusted and is double-weighted; remote reviews count less. You can't verify your
  own report, and duplicate reports earn almost no points — so the data can't be gamed."
- **Do (optional):** open `/verify`, confirm a different issue → show the "+points" toast.

## SCENE 6 — Map + Chatbot (2:00–2:20)
- **Show:** tap **Map** → live severity-colored markers; click a marker popup.
- **Say:** "A live community map with severity colors and geolocation."
- **Do:** click the floating **chat bubble** (bottom-right) → ask "How do I report a pothole?"
  → show Gemini's reply.
- **Say:** "And a Gemini chatbot, grounded in live platform stats, guides citizens anywhere."

## SCENE 7 — Impact & Leaderboard (2:20–2:40)
- **Show:** tap **Impact** → AI weekly summary, **Predictive Insights** (emerging hotspot),
  the category/status charts.
- **Say:** "An impact dashboard with Gemini predictive insights — where problems will rise
  next — plus live analytics."
- **Do:** tap **Leaderboard** → show Hero tiers and ranks.
- **Say:** "Citizens are gamified into Community Heroes."

## SCENE 8 — Staff side: admin + authority (2:40–3:05)
- **Show (Window B):** go to `/login` → sign in as `admin@city.gov` / `Admin@123`.
- **Do:**
  1. Show the **Autonomous Agent Activity** feed + "auto-triaged" counter.
  2. Show the **AI Priority Queue** and **Issue Queue** table.
  3. Click **Manage** on an issue → **assign to a department** → Save.
- **Say:** "Admins get an AI priority queue and watch the agent working city-wide. They route
  any issue to a department."
- **Do:** log out → log in as `roads@city.gov` / `Roads@123`.
- **Say:** "The department authority sees only its assigned issues and advances the status —
  and citizens see that official update on the issue timeline instantly."
- **Do:** advance an issue to **In Progress** → (optionally) flip back to the citizen issue
  page to show the new timeline entry. **This is the "final response" — the full loop closed.**

## CLOSING (3:05–3:15)
- **Show:** the issue timeline with the official update, or the Home dashboard.
- **Say:** "From a citizen's photo to an AI-triaged, auto-routed, community-verified, resolved
  issue — Community Hero AI. Built on Google Gemini, Firebase, and deployed on Google Cloud Run.
  Thank you."

---

## Editing / polish tips
- Add simple **text captions** for each scene name (e.g., "AI Triage Agent") — helps judges
  follow without sound.
- Keep mouse movement slow and deliberate; pause ~2s on each AI result so it's readable.
- Trim dead time while Gemini thinks (or speed those clips up 1.5×).
- Export 1080p MP4. Aim for **under 3 minutes**.
- Put the **agent scene front-loaded** if you must cut for time — it's the differentiator.

## One-take order cheat-sheet
Home → Profile/Sign-in → Report (photo/video) → Analyze → Submit → **Agent trace** →
Action Plan → Verification → Map → Chatbot → Impact/Predict → Leaderboard →
Admin (agent feed + assign) → Authority (advance status) → Timeline (final response) → Close.
