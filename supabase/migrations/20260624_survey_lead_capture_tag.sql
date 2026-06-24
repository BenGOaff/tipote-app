-- ════════════════════════════════════════════════════════════════
-- TIPOTE — tag de lead pour les sondages (mode=survey)
-- ════════════════════════════════════════════════════════════════
--
-- Parite avec Tiquiz (migration 20260616_survey_lead_capture_tag.sql).
-- Les quiz taggent leurs leads via le tag du RESULTAT (quiz_results.
-- sio_tag_name). Les sondages n'ont pas de resultat : il leur faut un
-- tag de capture au niveau du sondage. On ajoute la colonne
-- quizzes.sio_capture_tag, appliquee a chaque lead capture sur un
-- sondage (cf. app/api/quiz/[quizId]/public/route.ts).
--
-- Idempotent : ADD COLUMN IF NOT EXISTS. Si la colonne existe deja en
-- prod, ce script ne change rien (a part le commentaire).

alter table public.quizzes
  add column if not exists sio_capture_tag text;

comment on column public.quizzes.sio_capture_tag is
  'Tag Systeme.io applique a chaque lead capture sur un SONDAGE (mode=survey). NULL = pas de tag. Les quiz utilisent les tags par resultat, pas celui-ci.';

notify pgrst, 'reload schema';
