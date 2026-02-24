-- Migration: Supabase Storage bucket for user-uploaded content videos (TikTok, etc.)
-- Strategy: Supabase Storage with per-user folder isolation
-- Path pattern: {user_id}/{content_id}/{filename}
-- Max file size: 500MB (TikTok supports up to 4GB but we limit to 500MB)
-- Accepted formats: MP4, WebM, MOV
-- Public read: needed for TikTok PULL_FROM_URL and other social media APIs

-- 1. Create the storage bucket (public for social media API access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-videos',
  'content-videos',
  true,
  524288000, -- 500MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies for the content-videos bucket
-- Users can upload videos to their own folder
CREATE POLICY "Users can upload their own videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'content-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view their own videos
CREATE POLICY "Users can view their own videos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'content-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read access (needed for social media APIs to fetch videos via PULL_FROM_URL)
CREATE POLICY "Public read access for content videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'content-videos');

-- Users can delete their own videos
CREATE POLICY "Users can delete their own videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'content-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own videos
CREATE POLICY "Users can update their own videos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'content-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
