-- 0009_command_center.sql — Municipal AI Command Center
-- Adds contractor profiles, quotations, escrow-style job assignments,
-- department/ward budgets, and a small weather cache. Additive only:
-- existing tables and the canonical issues.status set are untouched.

-- ── Contractor profiles (1:1 with users where role='contractor') ──────────
CREATE TABLE IF NOT EXISTS contractors (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id),
  company        TEXT,
  skills         TEXT,                            -- CSV: "Pothole,Water Leak"
  rating         REAL    NOT NULL DEFAULT 4.0,    -- 0.0 - 5.0
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  availability   TEXT    NOT NULL DEFAULT 'available', -- available | busy | offline
  active_tasks   INTEGER NOT NULL DEFAULT 0,
  lat            REAL,
  lng            REAL,
  base_address   TEXT,
  photo_url      TEXT,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contractors_avail ON contractors(availability);

-- ── Quotations (multiple per issue, one per contractor) ───────────────────
CREATE TABLE IF NOT EXISTS quotations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id        INTEGER NOT NULL REFERENCES issues(id),
  contractor_id   INTEGER NOT NULL REFERENCES users(id),
  est_cost        INTEGER NOT NULL,                -- INR
  est_days        REAL    NOT NULL,                -- completion time in days
  past_rating     REAL    NOT NULL DEFAULT 4.0,
  ai_value_score  REAL,                            -- 0-100, computed by scoreQuotations()
  ai_reason       TEXT,
  recommended     INTEGER NOT NULL DEFAULT 0,      -- 1 = Gemini's best pick
  status          TEXT    NOT NULL DEFAULT 'submitted', -- submitted | accepted | rejected
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(issue_id, contractor_id)
);
CREATE INDEX IF NOT EXISTS idx_quotations_issue ON quotations(issue_id);

-- ── Job assignments — the escrow-backed lifecycle the Command Center drives ─
CREATE TABLE IF NOT EXISTS job_assignments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id        INTEGER NOT NULL REFERENCES issues(id),
  contractor_id   INTEGER REFERENCES users(id),
  quotation_id    INTEGER REFERENCES quotations(id),
  assigned_by     INTEGER REFERENCES users(id),    -- the admin who assigned
  escrow_amount   INTEGER NOT NULL DEFAULT 0,      -- locked on assign
  escrow_status   TEXT    NOT NULL DEFAULT 'locked', -- locked | released | refunded
  state           TEXT    NOT NULL DEFAULT 'JobAssigned',
                  -- JobAssigned | InProgress | Verifying | CitizenConfirm | Resolved | Cancelled
  citizen_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobassign_issue ON job_assignments(issue_id);
CREATE INDEX IF NOT EXISTS idx_jobassign_contractor ON job_assignments(contractor_id);

-- ── Budgets — per department/ward (figures are SEEDED/SIMULATED for demo) ──
CREATE TABLE IF NOT EXISTS budgets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  department    TEXT NOT NULL,
  fiscal_year   TEXT NOT NULL DEFAULT '2024-25',
  allocated     INTEGER NOT NULL DEFAULT 0,        -- INR
  spent         INTEGER NOT NULL DEFAULT 0,        -- INR (sum of released escrow)
  committed     INTEGER NOT NULL DEFAULT 0,        -- INR (locked escrow not yet released)
  UNIQUE(department, fiscal_year)
);

-- ── Weather cache (optional external API; stub-friendly) ───────────────────
CREATE TABLE IF NOT EXISTS weather_cache (
  city        TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,                       -- JSON blob
  fetched_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
