-- AI authenticity verification: Gemini judges whether a report looks genuine,
-- needs more evidence, or is a possible fake — improving accountability.
ALTER TABLE issues ADD COLUMN authenticity TEXT NOT NULL DEFAULT 'genuine';   -- genuine | needs_evidence | suspect
ALTER TABLE issues ADD COLUMN authenticity_reason TEXT;
