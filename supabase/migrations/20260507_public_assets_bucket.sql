-- Bucket "public-assets" — créé manuellement à l'origine via Supabase
-- Studio mais jamais committé. JB regression 2026-05-07 : aucun upload
-- ne marchait (logos de quiz, images bonus) → tous les bonus_image_url
-- sont restés à NULL parce que `storage.from("public-assets").upload()`
-- échouait silencieusement sur un bucket inexistant.
--
-- Ce qu'on stocke ici :
--   logos/<userId>/logo.<ext>                       (logo de marque / branding)
--   bonus/<userId>/<quizId>-<ts>.<ext>              (visuel du bonus de partage)
--
-- Public = true : les <img src> sur la page publique du quiz n'ont pas
-- besoin de signed URL (on n'a rien de sensible ici, c'est de
-- l'asset visuel destiné à être affiché à des leads anonymes).
--
-- 10 Mio max : assez pour des logos et illustrations bonus, pas trop
-- pour limiter les abus. La compression côté browser/CDN gère les
-- gros fichiers.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-assets',
  'public-assets',
  true,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies : users authentifiés peuvent insert/update/delete leurs
-- fichiers, tout le monde peut lire (lecture publique).
DO $$
BEGIN
  -- Anyone can SELECT (the bucket is public anyway, this also lets
  -- the API enumerate when needed).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'public_assets_read'
  ) THEN
    CREATE POLICY "public_assets_read"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'public-assets');
  END IF;

  -- Authenticated users can upload anywhere in the bucket. Path
  -- discipline (logos/<uid>/, bonus/<uid>/) is enforced by the client
  -- code; we keep the storage policy simple to avoid cross-policy
  -- bugs on UPSERT (which Supabase represents as DELETE+INSERT and
  -- often denies under tighter ownership rules).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'public_assets_authenticated_insert'
  ) THEN
    CREATE POLICY "public_assets_authenticated_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'public-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'public_assets_authenticated_update'
  ) THEN
    CREATE POLICY "public_assets_authenticated_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'public-assets')
      WITH CHECK (bucket_id = 'public-assets');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'public_assets_authenticated_delete'
  ) THEN
    CREATE POLICY "public_assets_authenticated_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'public-assets');
  END IF;
END $$;
