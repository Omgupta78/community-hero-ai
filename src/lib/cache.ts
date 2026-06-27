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

  // 3. Best-effort store (ignore failures, e.g. table missing).
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
 * Returns the Gemini API key ONLY if we're under the daily budget; otherwise
 * undefined (→ heuristic fallback). Increments the day's counter when it hands
 * out the key. Default cap 180/day (safely under the 200/day free tier of
 * gemini-2.0-flash); override with the GEMINI_DAILY_CAP env var.
 */
export async function budgetedKey(env: BudgetEnv): Promise<string | undefined> {
  const key = env.GEMINI_API_KEY
  if (!key) return undefined
  const cap = Number(env.GEMINI_DAILY_CAP) || 180
  const k = todayCountKey()

  let used = 0
  try {
    const row = await env.DB.prepare(`SELECT payload FROM ai_cache WHERE cache_key = ?`).bind(k).first<{ payload: string }>()
    if (row && row.payload) used = JSON.parse(row.payload).n || 0
  } catch (e) {
    // ai_cache table not migrated yet → don't enforce a cap (never break).
    return key
  }
  if (used >= cap) return undefined

  const next = JSON.stringify({ n: used + 1 })
  try {
    await env.DB.prepare(
      `INSERT INTO ai_cache (cache_key, payload, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(cache_key) DO UPDATE SET payload = ?, created_at = CURRENT_TIMESTAMP`
    ).bind(k, next, next).run()
  } catch (e) {}
  return key
}
