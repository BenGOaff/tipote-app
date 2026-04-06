-- =============================================================
-- Fix: replace UNIQUE(user_id) with UNIQUE(user_id, project_id)
-- on business_profiles to support multi-project
-- + add sio_api_key_name for named SIO keys
-- =============================================================

-- Drop ALL possible unique constraints on user_id alone
-- (PostgreSQL may name them differently depending on how the table was created)
DO $$
BEGIN
  -- Try dropping by constraint name
  ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_user_id_key;
  ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_user_id_unique;
  ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_pkey_user_id;

  -- Also drop any unique INDEX on user_id alone (not a named constraint)
  DROP INDEX IF EXISTS business_profiles_user_id_key;
  DROP INDEX IF EXISTS business_profiles_user_id_idx;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Some constraints did not exist, continuing...';
END $$;

-- Add composite unique: one profile per user per project
-- IF NOT EXISTS prevents error if already applied
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_profiles_user_project_unique'
  ) THEN
    ALTER TABLE business_profiles
      ADD CONSTRAINT business_profiles_user_project_unique
      UNIQUE (user_id, project_id);
  END IF;
END $$;

-- Add column for naming the SIO API key (e.g. "Mon projet", "Affiliation", "Client 1")
ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS sio_api_key_name TEXT;
