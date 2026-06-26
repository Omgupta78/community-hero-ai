# 🎬 Community Hero AI — Demo Script (90 seconds)

A tight, rubric-aligned walkthrough. Each beat maps to a scoring criterion.
Practice once so it flows. Have the app open and signed in before you start.

> **Before you start:** fresh Gemini key in `.dev.vars` / Cloud Run env, signed into a
> citizen account, and a second tab on `/admin` logged in as `admin@city.gov`.

---

## Opening line (10s) — Problem & Impact (20%)
> "Communities report potholes, leaks and broken lights through scattered, opaque channels —
> nothing gets prioritized or tracked. **Community Hero AI** turns any citizen report into
> prioritized, accountable civic action using an autonomous AI agent. Let me show you."

## Beat 1 — Report with AI (20s) — Google Tech (15%) + Innovation (20%)
1. Open **Report**, attach a **photo or short video** of an issue.
2. Tap **Analyze with AI**.
> "Google **Gemini** analyzes the actual photo or video — it categorizes the issue, scores
> severity, picks the department, and computes a priority score."
3. Tap **Submit**.
> "On submit, an **autonomous agent** takes over."

## Beat 2 — The Autonomous Agent (25s) — Agentic Depth (20%) ⭐
1. Land on the issue page → scroll to **Autonomous Triage Agent** trace.
> "The agent ran a multi-step plan on its own: it **perceived** nearby reports and department
> load, **reasoned** with Gemini, **checked for duplicates**, **set priority**, **auto-routed
> and assigned** it to the right department, and **drafted a field resolution plan** — crew,
> equipment, time, cost. Every step is transparent."
2. Switch to the **/admin** tab → point at **Autonomous Agent Activity** feed + the
   "auto-triaged" counter.
> "Operators watch the agent working across the whole city in real time."

## Beat 3 — Trust & Integrity (15s) — Innovation (20%) + Impact (20%)
1. On an issue, show **"on-site vs remote"** verification counts.
> "Verification is **proof-of-presence** — confirming an issue while physically near it counts
> as trusted and double-weighted; remote clicks count less. You can't verify your own report,
> and duplicate reports earn almost no points — so the data can't be gamed."

## Beat 4 — Live ops + insight (15s) — Product & Design (10%) + Completeness (5%)
1. **Map** → live severity-colored markers. Quick pan.
2. **Impact** → Gemini **predictive insights** (emerging hotspots) + live charts.
3. **Leaderboard** → Hero tiers.
> "Citizens are gamified into Community Heroes; the city gets predictive insight on where
> problems will rise next."

## Closing line (5s) — Technical (10%) + Google Tech (15%)
> "It's a real edge-native app — Hono on **Google Cloud Run**, **Firebase** auth, a **D1/SQLite**
> database, and **five** Gemini integrations. Live, deployed, and fully working. Thank you."

---

## Backup answers for judge Q&A
- **"Is the AI real or mocked?"** → "100% real Gemini 2.5 Flash via the API. There's a
  deterministic fallback so a rate-limit never breaks a demo — but the live calls are real;
  responses are tagged `gemini` vs `heuristic` in the UI."
- **"What's actually agentic about it?"** → "It's not a single prompt. The agent executes a
  sequenced plan and *mutates system state* — it assigns issues, links duplicates, sets
  priority — and logs its reasoning. It acts, not just answers."
- **"How do you prevent fake reports / vote farming?"** → "Proof-of-presence verification with
  trust weighting, no self-verification, weighted promotion thresholds, and integrity-gated
  points where the agent's duplicate detection cuts rewards for spam."
- **"How does it scale / where's the data?"** → "Edge-native: Cloud Run autoscaling, a portable
  SQLite/D1 layer behind one interface. For production we'd move media to object storage and
  the DB to Cloud SQL — the data layer is already abstracted for it."
- **"Why is the score 0 / data resets?"** → "The demo instance uses an ephemeral DB that
  re-seeds on cold start; that's a deploy choice, not a limitation — persistence is one config
  change."

## Golden rules
- Lead with the **agent** — it's your strongest, rarest differentiator.
- Say the words **"autonomous," "Gemini," "Google Cloud Run," "proof-of-presence."**
- If Gemini is slow/rate-limited, stay calm: "the fallback kept it instant — the live key
  shows full Gemini output." Never apologize for it; it's a resilience feature.
- End on "live, deployed, fully working."
