-- Proof-of-presence, trust-weighted community verification.
-- Each verification now records whether the voter was physically near the issue
-- (on-site) and how far away they were, so we can weight trust and prevent
-- meaningless "random click" point farming.

ALTER TABLE verifications ADD COLUMN on_site INTEGER NOT NULL DEFAULT 0;  -- 1 = verified near the issue
ALTER TABLE verifications ADD COLUMN distance_m REAL;                      -- metres from the issue (null = unknown)
