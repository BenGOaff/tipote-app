-- Fix: ensure content-videos bucket has correct file_size_limit and allowed_mime_types.
-- The original migration used ON CONFLICT DO NOTHING, so if the bucket existed
-- with different limits, they were never updated.

UPDATE storage.buckets
SET
  file_size_limit = 524288000, -- 500MB
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'image/gif']
WHERE id = 'content-videos';
