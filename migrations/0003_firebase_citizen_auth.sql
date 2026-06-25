-- Firebase citizen authentication
-- Citizens now sign in with Firebase (Google / email-password). We link the
-- Firebase UID to a row in `users` so reports & scores belong to a real person.

ALTER TABLE users ADD COLUMN firebase_uid TEXT;   -- Firebase Auth UID (citizens)
ALTER TABLE users ADD COLUMN photo_url TEXT;       -- profile photo from the provider

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
