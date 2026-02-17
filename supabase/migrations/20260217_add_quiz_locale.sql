-- Ajoute la colonne locale aux quizzes
-- Langue dans laquelle le quiz a été généré (fr, en, es, de, pt, it)
ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'fr';
