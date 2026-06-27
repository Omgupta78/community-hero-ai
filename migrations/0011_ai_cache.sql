-- 0011_ai_cache.sql — cache Gemini outputs to conserve the daily free quota.
-- Repeated dashboard loads reuse cached AI text instead of burning a new call.
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key   TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
