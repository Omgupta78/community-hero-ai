-- 0012_citizen_confirmed.sql — close the loop with the citizen who reported.
-- After a fix is marked Resolved, the original reporter can confirm "it's really
-- fixed" (sets this flag) or reopen with a fresh photo if it is still broken.
ALTER TABLE issues ADD COLUMN citizen_confirmed INTEGER NOT NULL DEFAULT 0;
