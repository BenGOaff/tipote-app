-- ════════════════════════════════════════════
-- TIPOTE — Popquiz module (port from Tiquiz)
-- ════════════════════════════════════════════
--
-- Mirror du module popquiz de Tiquiz, adapté au modèle multi-projet
-- de Tipote :
--   • popquizzes.project_id (FK projects, ON DELETE SET NULL)
--   • Toutes les requêtes côté API filtrent par (user_id, project_id)
--     via getActiveProjectId — un user qui switch de projet ne voit
--     que les popquizzes du projet actif.
--
-- Bundle complet en une seule migration : 5 tables + bucket + RLS +
-- triggers + presets + size limit + RPC log_popquiz_event.

-- ───────────────────────────────────────────
-- 1. popquiz_videos (asset par user)
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popquiz_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('youtube','vimeo','url','upload')),
  external_url TEXT,
  external_id TEXT,
  storage_path TEXT,
  hls_path TEXT,
  thumbnail_url TEXT,
  thumbnail_path TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','transcoding','ready','failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_popquiz_videos_user
  ON popquiz_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_popquiz_videos_status
  ON popquiz_videos(status) WHERE status <> 'ready';

-- ───────────────────────────────────────────
-- 2. popquiz_themes (presets partagés + custom user)
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popquiz_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_popquiz_themes_user
  ON popquiz_themes(user_id);

-- ───────────────────────────────────────────
-- 3. popquizzes — scoped par (user_id, project_id) côté Tipote
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popquizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Multi-projet Tipote : un popquiz appartient à un projet précis.
  -- ON DELETE SET NULL pour que la suppression d'un projet ne perde
  -- pas les popquizzes (l'user pourra les rattacher ailleurs).
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  video_id UUID NOT NULL REFERENCES popquiz_videos(id) ON DELETE RESTRICT,
  theme_id UUID REFERENCES popquiz_themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT,
  locale TEXT NOT NULL DEFAULT 'fr',
  is_published BOOLEAN NOT NULL DEFAULT false,
  views_count INTEGER NOT NULL DEFAULT 0,
  starts_count INTEGER NOT NULL DEFAULT 0,
  completions_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_popquizzes_user
  ON popquizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_popquizzes_project
  ON popquizzes(project_id);
CREATE INDEX IF NOT EXISTS idx_popquizzes_video
  ON popquizzes(video_id);
CREATE INDEX IF NOT EXISTS idx_popquizzes_published
  ON popquizzes(is_published) WHERE is_published = true;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_popquizzes_slug
  ON popquizzes(LOWER(slug)) WHERE slug IS NOT NULL;

-- ───────────────────────────────────────────
-- 4. popquiz_cues
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popquiz_cues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  popquiz_id UUID NOT NULL REFERENCES popquizzes(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
  timestamp_ms INTEGER NOT NULL CHECK (timestamp_ms >= 0),
  behavior TEXT NOT NULL DEFAULT 'block'
    CHECK (behavior IN ('block','optional')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(popquiz_id, timestamp_ms)
);

CREATE INDEX IF NOT EXISTS idx_popquiz_cues_popquiz_ts
  ON popquiz_cues(popquiz_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_popquiz_cues_quiz
  ON popquiz_cues(quiz_id);

-- ───────────────────────────────────────────
-- 5. popquiz_sessions (analytics par viewer)
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popquiz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  popquiz_id UUID NOT NULL REFERENCES popquizzes(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id TEXT,
  locale TEXT,
  user_agent TEXT,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_popquiz_sessions_popquiz_started
  ON popquiz_sessions(popquiz_id, started_at DESC);

-- ───────────────────────────────────────────
-- RLS — modèle owner-only + public read sur publié
-- ───────────────────────────────────────────
ALTER TABLE popquiz_videos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE popquiz_themes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE popquizzes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE popquiz_cues     ENABLE ROW LEVEL SECURITY;
ALTER TABLE popquiz_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own popquiz videos" ON popquiz_videos;
CREATE POLICY "Users manage own popquiz videos" ON popquiz_videos FOR ALL
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own popquiz themes" ON popquiz_themes;
CREATE POLICY "Users manage own popquiz themes" ON popquiz_themes FOR ALL
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone reads shared or preset themes" ON popquiz_themes;
CREATE POLICY "Anyone reads shared or preset themes" ON popquiz_themes FOR SELECT
  USING (is_shared = true OR is_preset = true);

DROP POLICY IF EXISTS "Users manage own popquizzes" ON popquizzes;
CREATE POLICY "Users manage own popquizzes" ON popquizzes FOR ALL
  USING (user_id IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Public reads published popquizzes" ON popquizzes;
CREATE POLICY "Public reads published popquizzes" ON popquizzes FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "Users manage cues of own popquizzes" ON popquiz_cues;
CREATE POLICY "Users manage cues of own popquizzes" ON popquiz_cues FOR ALL
  USING (popquiz_id IN (SELECT id FROM popquizzes WHERE user_id = auth.uid()))
  WITH CHECK (popquiz_id IN (SELECT id FROM popquizzes WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Public reads cues of published popquizzes" ON popquiz_cues;
CREATE POLICY "Public reads cues of published popquizzes" ON popquiz_cues FOR SELECT
  USING (popquiz_id IN (SELECT id FROM popquizzes WHERE is_published = true));

DROP POLICY IF EXISTS "Owner reads sessions of own popquizzes" ON popquiz_sessions;
CREATE POLICY "Owner reads sessions of own popquizzes" ON popquiz_sessions FOR SELECT
  USING (popquiz_id IN (SELECT id FROM popquizzes WHERE user_id = auth.uid()));

-- ───────────────────────────────────────────
-- Storage : bucket popquiz-videos avec size limit + mime types
-- ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'popquiz-videos',
  'popquiz-videos',
  false,
  2147483648, -- 2 GB
  ARRAY['video/mp4','video/webm','video/quicktime','video/x-matroska','video/ogg','image/jpeg','image/png']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "popquiz-videos: user manage own raw" ON storage.objects;
CREATE POLICY "popquiz-videos: user manage own raw"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'popquiz-videos'
    AND (storage.foldername(name))[1] = 'raw'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'popquiz-videos'
    AND (storage.foldername(name))[1] = 'raw'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ───────────────────────────────────────────
-- Triggers updated_at
-- ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION popquiz_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS popquiz_videos_touch ON popquiz_videos;
CREATE TRIGGER popquiz_videos_touch BEFORE UPDATE ON popquiz_videos
  FOR EACH ROW EXECUTE FUNCTION popquiz_touch_updated_at();

DROP TRIGGER IF EXISTS popquiz_themes_touch ON popquiz_themes;
CREATE TRIGGER popquiz_themes_touch BEFORE UPDATE ON popquiz_themes
  FOR EACH ROW EXECUTE FUNCTION popquiz_touch_updated_at();

DROP TRIGGER IF EXISTS popquizzes_touch ON popquizzes;
CREATE TRIGGER popquizzes_touch BEFORE UPDATE ON popquizzes
  FOR EACH ROW EXECUTE FUNCTION popquiz_touch_updated_at();

-- ───────────────────────────────────────────
-- RPC log_popquiz_event — bumps les counters
-- ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_popquiz_event(
  popquiz_id_input UUID,
  event_type_input TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF event_type_input = 'view' THEN
    UPDATE popquizzes
      SET views_count = views_count + 1
      WHERE id = popquiz_id_input;
  ELSIF event_type_input = 'start' THEN
    UPDATE popquizzes
      SET starts_count = starts_count + 1
      WHERE id = popquiz_id_input;
  ELSIF event_type_input = 'complete' THEN
    UPDATE popquizzes
      SET completions_count = completions_count + 1
      WHERE id = popquiz_id_input;
  END IF;
END;
$$;

-- ───────────────────────────────────────────
-- Seed presets
-- ───────────────────────────────────────────
INSERT INTO popquiz_themes (user_id, name, config, is_preset, is_shared)
SELECT NULL, name, config::jsonb, true, true
FROM (VALUES
  ('Minimal',  '{"accent":"#5D6CDB","bg":"rgba(15,18,30,0.55)","radius":"12px","controls-height":"48px"}'),
  ('Glass',    '{"accent":"#20BBE6","bg":"rgba(255,255,255,0.10)","radius":"16px","controls-height":"52px","backdrop":"blur(18px)"}'),
  ('Bold',     '{"accent":"#FF3D71","bg":"rgba(0,0,0,0.75)","radius":"4px","controls-height":"56px"}'),
  ('Dark Pro', '{"accent":"#A78BFA","bg":"rgba(10,12,20,0.85)","radius":"10px","controls-height":"50px"}')
) AS presets(name, config)
WHERE NOT EXISTS (
  SELECT 1 FROM popquiz_themes WHERE is_preset = true AND name = presets.name
);
