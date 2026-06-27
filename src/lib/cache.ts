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
