-- Community Hero AI - Initial schema

-- Users (citizens + admins)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'citizen',         -- citizen | admin
  score INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Civic issues / reports
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  severity INTEGER NOT NULL DEFAULT 3,          -- 1 (low) .. 5 (critical)
  status TEXT NOT NULL DEFAULT 'Reported',      -- Reported | Verified | Assigned | In Progress | Resolved
  department TEXT,
  priority_score REAL NOT NULL DEFAULT 0,       -- AI-computed ranking
  address TEXT,
  lat REAL,
  lng REAL,
  photo_data TEXT,                              -- base64 thumbnail or url
  ai_summary TEXT,                              -- gemini analysis text
  ai_source TEXT DEFAULT 'heuristic',           -- gemini | heuristic
  anonymous INTEGER NOT NULL DEFAULT 0,
  verify_count INTEGER NOT NULL DEFAULT 0,
  reporter_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id)
);

-- Community verifications (one per user per issue)
CREATE TABLE IF NOT EXISTS verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote TEXT NOT NULL DEFAULT 'confirm',         -- confirm | reject
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(issue_id, user_id),
  FOREIGN KEY (issue_id) REFERENCES issues(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Official status updates / timeline
CREATE TABLE IF NOT EXISTS issue_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  department TEXT,
  message TEXT,
  author TEXT DEFAULT 'System',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES issues(id)
);

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
CREATE INDEX IF NOT EXISTS idx_issues_reporter ON issues(reporter_id);
CREATE INDEX IF NOT EXISTS idx_updates_issue ON issue_updates(issue_id);
CREATE INDEX IF NOT EXISTS idx_verif_issue ON verifications(issue_id);
