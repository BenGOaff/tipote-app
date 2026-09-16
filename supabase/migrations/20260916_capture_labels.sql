-- ═══════════════════════════════════════════════════════════════
-- TIPOTE - Libellés et placeholders éditables du formulaire de capture
-- (Béné, 16 septembre 2026 : "TOUT doit être éditable")
-- ═══════════════════════════════════════════════════════════════
--
-- `quizzes.capture_labels` : ce que la créatrice a écrit pour chaque
-- champ du formulaire de capture, {cle: {label, placeholder}}. La clé
-- est `first_name`, `last_name`, `email`, `phone`, `country`, ou l'id
-- `cf_...` d'un champ personnalisé. `label` est du HTML riche (borné
-- ici par lib/quiz/champsCapture.ts, sanitisé au rendu comme
-- capture_heading) ; `placeholder` est du texte nu.
--
-- Le contrôle de FORME vit dans lib/quiz/champsCapture.ts, pas ici :
-- ajouter un réglage à un champ ne doit pas demander une migration.
--
-- Aucun quiz existant ne bouge : le défaut est un objet vide, et un
-- objet vide veut dire "les libellés d'avant, dans la langue du quiz".

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS capture_labels JSONB NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
