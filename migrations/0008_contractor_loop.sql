-- Contractor / Responder loop: claim a job, prove the fix with an "after" photo,
-- Gemini verifies before/after, contractor gets paid the bounty. Closes the full
-- civic loop: report -> triage -> assign -> fix -> AI-verified -> paid.

ALTER TABLE issues ADD COLUMN bounty INTEGER NOT NULL DEFAULT 0;         -- reward (INR) for a verified fix
ALTER TABLE issues ADD COLUMN contractor_id INTEGER REFERENCES users(id); -- responder who claimed the job
ALTER TABLE issues ADD COLUMN after_photo TEXT;                          -- proof-of-fix image (base64)
ALTER TABLE issues ADD COLUMN fix_verified INTEGER NOT NULL DEFAULT 0;   -- 1 = Gemini confirmed the fix
ALTER TABLE issues ADD COLUMN fix_reason TEXT;                           -- Gemini before/after verdict

ALTER TABLE users ADD COLUMN earnings INTEGER NOT NULL DEFAULT 0;        -- contractor total paid out

CREATE INDEX IF NOT EXISTS idx_issues_contractor ON issues(contractor_id);
