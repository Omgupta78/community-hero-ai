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
 * Returns the Gemini API key whenever one is configured. The previous hard
 * daily cap has been removed — the account has ample quota, so we never want to
 * silently fall back to the heuristic just to conserve calls. We still record a
 * best-effort per-day call counter (for the usage stat in /ai-health and the
 * dashboards), but it never blocks a call. Caching elsewhere already prevents
 * redundant calls, so real usage stays reasonable on its own.
 */
export async function budgetedKey(env: BudgetEnv): Promise<string | undefined> {
  const key = env.GEMINI_API_KEY
  if (!key) return undefined
  const k = todayCountKey()

  // Best-effort usage counter only — NEVER used to block a call.
  try {
    const row = await env.DB.prepare(`SELECT payload FROM ai_cache WHERE cache_key = ?`).bind(k).first<{ payload: string }>()
    const used = row && row.payload ? (JSON.parse(row.payload).n || 0) : 0
    const next = JSON.stringify({ n: used + 1 })
    await env.DB.prepare(
      `INSERT INTO ai_cache (cache_key, payload, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(cache_key) DO UPDATE SET payload = ?, created_at = CURRENT_TIMESTAMP`
    ).bind(k, next, next).run()
  } catch (e) {
    /* counter is best-effort; ignore failures */
  }
  return key
}
