-- 0010_contractor_service_radius.sql — Field Ops panel
-- Adds a service radius to contractor profiles (used by the Profile tab + RADAR).
-- Additive only.
ALTER TABLE contractors ADD COLUMN service_radius_km INTEGER NOT NULL DEFAULT 10;
