-- ════════════════════════════════════════════
-- TIPOTE — Popquiz: bump video bucket size limit to 20 GB
-- ════════════════════════════════════════════
--
-- Béné 2026-05-04 : passe de 5 GB à 20 GB pour couvrir les formats
-- lourds (4K, séries de modules de cours en 1080p de plusieurs
-- heures). UI alignée à 20 Go.
--
-- ⚠ Pré-requis Supabase : projet au moins en Pro pour autoriser
-- les fichiers > 5 GB via TUS resumable. Vérifier le plan Supabase
-- prod avant d'annoncer la limite aux users.
--
-- Idempotente.

UPDATE storage.buckets
SET file_size_limit = 21474836480 -- 20 GB
WHERE id = 'popquiz-videos';
