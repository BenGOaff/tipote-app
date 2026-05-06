-- ════════════════════════════════════════════
-- TIPOTE — Popquiz: bump video bucket size limit to 5 GB
-- ════════════════════════════════════════════
--
-- Béné 2026-05-04 (mirror Tiquiz 033) : passe de 2 GB à 5 GB pour
-- couvrir les screencasts 1080p de 2-3 heures. Le message d'erreur
-- UI nettoyé en parallèle dans VideoUploader.tsx ("La taille
-- maximale acceptée est 5 Go", plus aucune mention de Supabase).
--
-- Idempotente : UPDATE sur la row existante.

UPDATE storage.buckets
SET file_size_limit = 5368709120 -- 5 GB
WHERE id = 'popquiz-videos';
