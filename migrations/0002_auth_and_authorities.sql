-- Auth + Authority (department) assignment

-- Password + department for staff accounts.
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN department TEXT;      -- only for role = 'authority'

-- Sessions for cookie-based login (admins + authorities).
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Which authority (user) an issue is assigned to.
ALTER TABLE issues ADD COLUMN assigned_to INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_issues_assigned ON issues(assigned_to);
