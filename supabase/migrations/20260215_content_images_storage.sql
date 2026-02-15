-- Migration: Supabase Storage bucket for user-uploaded content images
-- Strategy: Supabase Storage with per-user folder isolation
-- Path pattern: {user_id}/{content_id}/{filename}
-- Max file size: 10MB (enforced in API route)
-- Accepted formats: PNG, JPG/JPEG, GIF (enforced in API route)
-- Scalability: Supabase Storage uses S3-compatible object storage under the hood
-- Future: Same bucket will be used for AI-generated images

-- 1. Create the storage bucket (public for social media API access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-images',
  'content-images',
  true,
  10485760, -- 10MB
  ARRAY['image/png', 'image/jpeg', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies for the content-images bucket
-- Users can upload images to their own folder
CREATE POLICY "Users can upload their own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view their own images
CREATE POLICY "Users can view their own images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access (needed for social media APIs to fetch images)
CREATE POLICY "Public read access for content images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'content-images');

-- Users can delete their own images
CREATE POLICY "Users can delete their own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own images
CREATE POLICY "Users can update their own images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
