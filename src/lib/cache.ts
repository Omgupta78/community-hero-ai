// AI response cache — conserves the Gemini daily free quota by reusing recent
// outputs instead of calling the model on every dashboard load.
//
// Fully resilient: if the ai_cache table doesn't exist yet (migration 0011 not
// applied) or any DB op fails, it transparently falls back to calling the
// producer directly — so it can never break a request.

export async function aiCache<T>(
  db: D1Database,
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>
): Promise<T> {
  // 1. Try a fresh cached value.
  try {
    const row = await db
      .prepare(`SELECT payload, created_at FROM ai_cache WHERE cache_key = ?`)
      .bind(key)
      .first<{ payload: string; created_at: string }>()
    if (row && row.payload) {
      const ageMs = Date.now() - new Date(row.created_at.replace(' ', 'T') + 'Z').getTime()
      if (ageMs < ttlSeconds * 1000) return JSON.parse(row.payload) as T
    }
  } catch (e) {
    /* table missing or parse error → fall through to producer */
  }

  // 2. Produce a fresh value (this is where the Gemini call happens).
  const fresh = await producer()

  // 3. Best-effort store — but NEVER cache a heuristic/fallback result. Otherwise
  // a single transient Gemini failure (e.g. a brief 429) would "lock in" the
  // non-AI answer for the whole TTL. Skipping it means the next request retries
  // Gemini and the cache self-heals as soon as the model is reachable again.
  const isHeuristic = fresh && typeof fresh === 'object' && (fresh as any).source === 'heuristic'
  if (!isHeuristic) {
    try {
      await db
        .prepare(
          `INSERT INTO ai_cache (cache_key, payload, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = CURRENT_TIMESTAMP`
        )
        .bind(key, JSON.stringify(fresh))
        .run()
    } catch (e) {
      /* ignore */
    }
  }
  return fresh
}

// ---------------------------------------------------------------------------
// Daily Gemini call budget — a hard cap so the free quota can NEVER be drained.
// Every real Gemini call goes through budgetedKey(): it returns the API key
// only while today's call count is under the cap, otherwise returns undefined
// (which makes every gemini.ts function transparently use its heuristic
// fallback). Cached calls never reach this, so they don't count.
// ---------------------------------------------------------------------------

type BudgetEnv = { DB: D1Database; GEMINI_API_KEY?: string; GEMINI_DAILY_CAP?: string }

function todayCountKey(): string {
  return 'gemini_calls:' + new Date().toISOString().slice(0, 10)
}

/** Read how many Gemini calls have been made today (best-effort). */
export async function geminiUsageToday(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare(`SELECT payload FROM ai_cache WHERE cache_key = ?`).bind(todayCountKey()).first<{ payload: string }>()
    if (row && row.payload) return JSON.parse(row.payload).n || 0
  } catch (e) {}
  return 0
}

/**
 * Returns the Gemini API key, optionally subject to a daily budget.
 *
 * - `force: true`  → ALWAYS return the key (used by the citizen **report form**
 *   so AI triage is never throttled or stale — it's the demo-critical path).
 * - default        → enforce a daily cap so background features (dashboards,
 *   predictions, insights, chatbot grounding) can't drain quota. When the cap
 *   is hit it returns undefined → those callers transparently use the heuristic.
 *
 * The per-day counter is always maintained for the usage stat. Override the cap
 * with GEMINI_DAILY_CAP (default 1000).
 */
export async function budgetedKey(env: BudgetEnv, opts?: { force?: boolean }): Promise<string | undefined> {
  const key = env.GEMINI_API_KEY
  if (!key) return undefined
  const force = opts?.force === true
  const cap = Number(env.GEMINI_DAILY_CAP) || 1000
  const k = todayCountKey()

  let used = 0
  try {
    const row = await env.DB.prepare(`SELECT payload FROM ai_cache WHERE cache_key = ?`).bind(k).first<{ payload: string }>()
    if (row && row.payload) used = JSON.parse(row.payload).n || 0
  } catch (e) {
    // ai_cache table not migrated yet → don't enforce a cap (never break).
    return key
  }

  // Enforce the cap ONLY for non-forced (background) callers.
  if (!force && used >= cap) return undefined

  const next = JSON.stringify({ n: used + 1 })
  try {
    await env.DB.prepare(
      `INSERT INTO ai_cache (cache_key, payload, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(cache_key) DO UPDATE SET payload = ?, created_at = CURRENT_TIMESTAMP`
    ).bind(k, next, next).run()
  } catch (e) {}
  return key
}
