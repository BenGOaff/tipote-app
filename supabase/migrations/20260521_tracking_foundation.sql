-- Tracking foundation (Adeline, 19 mai 2026 : "les statistiques ne
-- sont ni fiables ni cohérentes — il faut un bon système de tracking
-- qui reflète les vrais visiteurs, les vrais chiffres").
--
-- Tipote n'a PAS de table `quiz_events` au préalable (contrairement à
-- Tiquiz qui l'avait depuis 2026-04). On la crée dans cette migration
-- avec le schéma final (session_id inclus dès le départ).
--
-- Stratégie :
--   - 1 seul chemin : tout passe par INSERT dans `quiz_events`.
--   - Trigger automatique qui bumpe le compteur sur insert → les
--     compteurs ne peuvent plus dériver du log.
--   - Déduplication par cookie session : avant insert, /track vérifie
--     qu'on n'a pas déjà la même paire (quiz, event, session) sur 24h.
--   - Bot filtering + owner exclusion : côté /track route.

-- ─── 1) S'assurer que shares_count existe sur quizzes ────────────
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS shares_count INTEGER NOT NULL DEFAULT 0;

-- ─── 2) Créer la table quiz_events ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.quiz_events (
  id BIGSERIAL PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'start', 'complete', 'share', 'question_view')),
  meta JSONB,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.quiz_events IS
  'Log time-series des événements visiteur (view/start/complete/share). Source de vérité pour les compteurs sur `quizzes` qui sont auto-bumpés par trg_quiz_events_bump_counter.';

COMMENT ON COLUMN public.quiz_events.session_id IS
  'Cookie session id (random UUID) du visiteur. NULL pour les events sans session (ex. share server-side). Utilisé par /track pour dédupliquer (quiz_id, event_type, session_id) sur fenêtre 24h.';

CREATE INDEX IF NOT EXISTS idx_quiz_events_quiz_created
  ON public.quiz_events (quiz_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_events_type_created
  ON public.quiz_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_events_quiz_type_created
  ON public.quiz_events (quiz_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_events_dedup
  ON public.quiz_events (quiz_id, event_type, session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

-- RLS : table write-mostly via supabaseAdmin. Pas de policy par
-- défaut → l'accès end-user direct est interdit (ce qu'on veut).
ALTER TABLE public.quiz_events ENABLE ROW LEVEL SECURITY;

-- ─── 3) RPC log_quiz_event ──────────────────────────────────────
CREATE OR REPLACE FUNCTION log_quiz_event(
  quiz_id_input UUID,
  event_type_input TEXT,
  meta_input JSONB DEFAULT NULL,
  session_id_input TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.quiz_events (quiz_id, event_type, meta, session_id)
  VALUES (quiz_id_input, event_type_input, meta_input, session_id_input);
END;
$$;

-- ─── 4) Trigger qui bumpe les compteurs sur INSERT ───────────────
CREATE OR REPLACE FUNCTION bump_quiz_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'view' THEN
    UPDATE public.quizzes SET views_count = COALESCE(views_count, 0) + 1
      WHERE id = NEW.quiz_id;
  ELSIF NEW.event_type = 'start' THEN
    UPDATE public.quizzes SET starts_count = COALESCE(starts_count, 0) + 1
      WHERE id = NEW.quiz_id;
  ELSIF NEW.event_type = 'complete' THEN
    UPDATE public.quizzes SET completions_count = COALESCE(completions_count, 0) + 1
      WHERE id = NEW.quiz_id;
  ELSIF NEW.event_type = 'share' THEN
    UPDATE public.quizzes SET shares_count = COALESCE(shares_count, 0) + 1
      WHERE id = NEW.quiz_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quiz_events_bump_counter ON public.quiz_events;
CREATE TRIGGER trg_quiz_events_bump_counter
  AFTER INSERT ON public.quiz_events
  FOR EACH ROW EXECUTE FUNCTION bump_quiz_counter();

-- ─── 5) Pas de backfill ──────────────────────────────────────────
-- Les compteurs historiques restent figés. Reset à 0 serait
-- catastrophique pour la confiance des créateurs.

-- ─── 6) Notifier PostgREST ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';
