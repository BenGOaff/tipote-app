-- Ajoute la colonne content_locale à business_profiles
-- Langue dans laquelle le contenu IA est généré (fr, en, es, it, ar, pt, de, nl, etc.)
ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS content_locale TEXT DEFAULT 'fr';
