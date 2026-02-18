-- Migration: auto-create default projects for beta users
-- who have business_profiles but no entry in the projects table.
-- This fixes the "Aucun projet actif" error for early adopters.

DO $$
DECLARE
  rec RECORD;
  new_project_id UUID;
BEGIN
  -- Find all users who have a business_profiles row but no project
  FOR rec IN
    SELECT DISTINCT bp.user_id
    FROM business_profiles bp
    LEFT JOIN projects p ON p.user_id = bp.user_id
    WHERE p.id IS NULL
  LOOP
    -- Create a default project for this user
    INSERT INTO projects (user_id, name, is_default, created_at, updated_at)
    VALUES (rec.user_id, 'Mon Projet', true, now(), now())
    RETURNING id INTO new_project_id;

    -- Link all business_profiles rows for this user that have no project_id
    UPDATE business_profiles
    SET project_id = new_project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

  END LOOP;
END;
$$;
