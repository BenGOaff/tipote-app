-- =============================================================
-- Fix: replace UNIQUE(user_id) with UNIQUE(user_id, project_id)
-- on business_profiles to support multi-project
-- =============================================================
-- The old constraint "business_profiles_user_id_key" prevents creating
-- a second business_profiles row for a different project.
-- Drop it and add a composite unique constraint instead.

ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_user_id_key;

-- Add composite unique: one profile per user per project
-- Use COALESCE to handle NULL project_id (legacy rows)
ALTER TABLE business_profiles
  ADD CONSTRAINT business_profiles_user_project_unique
  UNIQUE (user_id, project_id);
