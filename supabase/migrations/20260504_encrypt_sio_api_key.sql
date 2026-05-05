-- ════════════════════════════════════════════
-- TIPOTE — SIO API key encryption at rest
-- ════════════════════════════════════════════
--
-- Avant ce commit, la clé Systeme.io de chaque user était stockée
-- en CLAIR dans business_profiles.sio_user_api_key. Un dump DB ou
-- un accès admin (service-role) révélait toutes les clés des users.
-- Béné a remonté le souci 2026-05-04 (« ma clé API n'est pas
-- cryptée sur Tipote ! »).
--
-- Ce commit pose la colonne ciphertext. La pipeline
-- d'encryption/decryption (lib/piiCrypto, AES-256-GCM par-user-DEK,
-- déjà utilisée pour les leads PII) sert à écrire/lire dans cette
-- colonne. Voir lib/sio/resolveApiKey.ts pour le helper.
--
-- Stratégie de migration :
--   1) Add column sio_user_api_key_enc (cette migration)
--   2) Le code lit `_enc` en priorité, retombe sur le plaintext si
--      `_enc` est null (compat avec les rows existantes).
--   3) PATCH /api/profile écrit le nouveau ciphertext et met
--      sio_user_api_key à NULL → migration progressive au gré des
--      sauvegardes de profil.
--   4) Quand toutes les rows actives ont basculé, une migration
--      ultérieure pourra DROP COLUMN sio_user_api_key. À planifier.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS sio_user_api_key_enc TEXT;

COMMENT ON COLUMN public.business_profiles.sio_user_api_key_enc IS
  'Clé API Systeme.io chiffrée AES-256-GCM via lib/piiCrypto (DEK per-user). Préférée à sio_user_api_key (plaintext, deprecated, à droper après migration complète).';
