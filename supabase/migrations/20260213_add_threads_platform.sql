-- =============================================================
-- Migration: Ajouter 'threads' a la contrainte platform de social_connections
-- et retirer 'instagram' des plateformes supportees.
-- =============================================================

-- 1. Supprimer l'ancienne contrainte CHECK
ALTER TABLE social_connections DROP CONSTRAINT IF EXISTS social_connections_platform_check;

-- 2. Ajouter la nouvelle contrainte avec 'threads'
ALTER TABLE social_connections ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads'));

-- 3. Optionnel : supprimer les anciennes connexions Instagram (si existantes)
-- DELETE FROM social_connections WHERE platform = 'instagram';
