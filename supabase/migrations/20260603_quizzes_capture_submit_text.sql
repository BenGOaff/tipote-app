-- Adeline (30 mai 2026) : "le bouton d'accès aux résultats n'est pas
-- éditable : on doit pouvoir éditer TOUS les textes en wysisyg". Jusqu'ici
-- le bouton submit du formulaire email (= "Voir mes résultats" /
-- "Accéder aux résultats") était une chaîne en dur (i18n côté visiteur).
-- Désormais, chaque quiz peut surcharger ce texte avec du rich-text
-- (RichTextEdit).
--
-- Default NULL → visiteur voit la string i18n par défaut (comportement
-- des quiz existants strictement préservé — pas de migration de données
-- requise, pas de cast). Si la colonne est set, le visiteur voit le
-- HTML rich-text (sanitizé via sanitizeRichText comme les autres champs).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS capture_submit_text TEXT;

COMMENT ON COLUMN public.quizzes.capture_submit_text IS
  'Override rich-text (HTML) pour le bouton submit du formulaire email — "Voir mes résultats" par défaut. NULL = string i18n par défaut. Édité en WYSIWYG dans le preview du quiz.';

NOTIFY pgrst, 'reload schema';
