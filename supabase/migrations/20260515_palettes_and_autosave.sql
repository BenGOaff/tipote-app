-- ═══════════════════════════════════════════
-- TIPOTE — Palettes utilisateurs + auto-save brouillons
-- ═══════════════════════════════════════════
-- Mirror exact de la migration Tiquiz, adapté au schéma Tipote
-- (business_profiles au lieu de profiles).
--
-- 1) saved_palettes : palettes de couleurs nommées (charte de marque
--    centralisée — réutilisables sur quiz / sondage / popquiz).
--
-- 2) draft_state / draft_updated_at : autosave des éditeurs.
--    Snapshot opaque, push debouncé, nettoyé après save explicite.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS saved_palettes JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.business_profiles.saved_palettes IS
  'Palettes de couleurs sauvegardées par l''user : tableau de {id, name, colors[]}. Limites soft côté API : 10 palettes max, 5 couleurs max par palette.';

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS draft_state JSONB,
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.quizzes.draft_state IS
  'Snapshot opaque (JSON) du dernier autosave de l''éditeur. NULL = pas de draft en attente.';
COMMENT ON COLUMN public.quizzes.draft_updated_at IS
  'Horodatage du dernier autosave. Comparé à updated_at pour décider si on propose une restauration.';

ALTER TABLE public.popquizzes
  ADD COLUMN IF NOT EXISTS draft_state JSONB,
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.popquizzes.draft_state IS
  'Snapshot opaque (JSON) du dernier autosave de l''éditeur popquiz. NULL = pas de draft.';
COMMENT ON COLUMN public.popquizzes.draft_updated_at IS
  'Horodatage du dernier autosave popquiz.';
