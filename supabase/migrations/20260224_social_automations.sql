-- ============================================================================
-- Social Automations (Comment-to-DM / Comment-to-Email)
-- Table pour les automatisations de DM déclenchées par commentaire.
-- Peut déjà exister en prod — IF NOT EXISTS pour éviter les erreurs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.social_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'comment_to_dm' CHECK (type IN ('comment_to_dm', 'comment_to_email')),
  platforms TEXT[] NOT NULL DEFAULT '{"facebook"}',
  trigger_keyword TEXT NOT NULL,
  dm_message TEXT NOT NULL,
  include_email_capture BOOLEAN DEFAULT false,
  email_dm_message TEXT,
  systemeio_tag TEXT,
  target_post_url TEXT,
  comment_reply_variants TEXT[],
  enabled BOOLEAN DEFAULT true,
  stats JSONB DEFAULT '{"triggers": 0, "dms_sent": 0}',
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.social_automations IS 'Automations comment-to-DM et comment-to-email pour Facebook, Instagram, TikTok, Twitter/X, LinkedIn.';

CREATE INDEX IF NOT EXISTS idx_social_automations_user ON public.social_automations(user_id);
CREATE INDEX IF NOT EXISTS idx_social_automations_enabled ON public.social_automations(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_social_automations_project ON public.social_automations(user_id, project_id);

ALTER TABLE public.social_automations ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'social_automations' AND policyname = 'social_automations_select_own'
  ) THEN
    CREATE POLICY social_automations_select_own ON public.social_automations
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'social_automations' AND policyname = 'social_automations_insert_own'
  ) THEN
    CREATE POLICY social_automations_insert_own ON public.social_automations
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'social_automations' AND policyname = 'social_automations_update_own'
  ) THEN
    CREATE POLICY social_automations_update_own ON public.social_automations
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'social_automations' AND policyname = 'social_automations_delete_own'
  ) THEN
    CREATE POLICY social_automations_delete_own ON public.social_automations
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
