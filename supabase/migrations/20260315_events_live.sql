-- Migration: Transform webinars into "événements live" (webinars + challenges)
-- Adds event_type, end_date (for challenges), offer_id, and program fields

-- Type d'événement : webinar ou challenge
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'webinar';

-- Add CHECK constraint separately (IF NOT EXISTS not supported for constraints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webinars_event_type_check'
  ) THEN
    ALTER TABLE webinars ADD CONSTRAINT webinars_event_type_check
      CHECK (event_type IN ('webinar', 'challenge'));
  END IF;
END$$;

-- Date de fin pour les challenges (du ... au ...)
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

-- Lien vers une offre existante (UUID libre, pas de FK car structure flexible)
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS offer_id UUID;

-- Programme du challenge (texte libre)
ALTER TABLE webinars ADD COLUMN IF NOT EXISTS program TEXT;

-- Index pour filtrer par type d'événement
CREATE INDEX IF NOT EXISTS idx_webinars_event_type ON webinars(user_id, project_id, event_type);
