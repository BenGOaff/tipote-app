-- Adeline (1er juin 2026) : "l'étape du remerciement du sondage n'est
-- pas éditable en wysiwyg ce n'est pas l'attendu, TOUT doit être
-- éditable partout dans le sondage comme dans le quiz."
--
-- Jusqu'ici la page de remerciement (mode=survey) affichait deux strings
-- i18n figées (`surveyThanksHeading` + `surveyThanksBody`). Désormais
-- chaque sondage peut surcharger ces 2 textes en rich-text (WYSIWYG
-- inline, comme tout le reste).
--
-- Default NULL → visiteur voit la string i18n par défaut (compat
-- stricte des sondages existants — pas de migration de données, pas
-- de cast). Si la colonne est set, le visiteur voit le HTML rich-text
-- sanitizé.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS survey_thanks_heading TEXT,
  ADD COLUMN IF NOT EXISTS survey_thanks_body TEXT;

COMMENT ON COLUMN public.quizzes.survey_thanks_heading IS
  'Override rich-text HTML pour le titre de la page de remerciement du sondage. NULL = string i18n par défaut (surveyThanksHeading). Mode=survey uniquement.';
COMMENT ON COLUMN public.quizzes.survey_thanks_body IS
  'Override rich-text HTML pour le sous-titre de la page de remerciement du sondage. NULL = string i18n par défaut (surveyThanksBody). Mode=survey uniquement.';

NOTIFY pgrst, 'reload schema';
