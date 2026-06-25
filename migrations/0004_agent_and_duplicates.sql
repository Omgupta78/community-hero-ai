-- Agentic triage: visible reasoning/action trace + duplicate linking

-- Link a report to an earlier one the agent judged it a duplicate of.
ALTER TABLE issues ADD COLUMN duplicate_of INTEGER REFERENCES issues(id);

-- Whether the autonomous triage agent has processed an issue.
ALTER TABLE issues ADD COLUMN agent_processed INTEGER NOT NULL DEFAULT 0;

-- Step-by-step trace of what the AI agent reasoned and did.
CREATE TABLE IF NOT EXISTS agent_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL,
  step INTEGER NOT NULL,          -- ordinal of the step
  tool TEXT NOT NULL,             -- which capability ran (analyze, dedupe, prioritize, route, plan)
  thought TEXT,                   -- the agent's reasoning for this step
  action TEXT,                    -- what it decided to do
  result TEXT,                    -- outcome
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES issues(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_issue ON agent_actions(issue_id);
CREATE INDEX IF NOT EXISTS idx_issues_duplicate ON issues(duplicate_of);
