-- Adeline (18 mai 2026) : "Erreur upload image : new row violates
-- row-level security policy" sur /quiz-options/<uid>/...png — le
-- bucket public-assets existait bien mais une vieille policy plus
-- restrictive (probablement créée à la main via Supabase Studio
-- avant les migrations versionnées) bloquait les insertions.
--
-- On reset les policies du bucket public-assets en mode permissif :
--   - SELECT : tout le monde (le bucket est public)
--   - INSERT/UPDATE/DELETE : tout authentifié, peu importe le path
-- La discipline du path (logos/<uid>/, bonus/<uid>/, quiz-options/<uid>/,
-- rich-content/<uid>/) reste enforcée côté client par les uploaders.

-- 1. Drop all policies that target public-assets — par leur nom canonique
--    ET en scannant pg_policies pour rattraper les variants historiques.
DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Drop tous les noms connus qu'on a déjà créés au fil des migrations.
  DROP POLICY IF EXISTS "public_assets_read" ON storage.objects;
  DROP POLICY IF EXISTS "public_assets_authenticated_insert" ON storage.objects;
  DROP POLICY IF EXISTS "public_assets_authenticated_update" ON storage.objects;
  DROP POLICY IF EXISTS "public_assets_authenticated_delete" ON storage.objects;
  DROP POLICY IF EXISTS "public-assets: public read" ON storage.objects;
  DROP POLICY IF EXISTS "public-assets: user upload own file" ON storage.objects;
  DROP POLICY IF EXISTS "public-assets: user update own file" ON storage.objects;
  DROP POLICY IF EXISTS "public-assets: user delete own file" ON storage.objects;
  DROP POLICY IF EXISTS "public-assets: user upload own logo" ON storage.objects;
  DROP POLICY IF EXISTS "public-assets: user update own logo" ON storage.objects;
  DROP POLICY IF EXISTS "public-assets: user delete own logo" ON storage.objects;

  -- Scan pour les policies surnuméraires (manual via Studio) ; toute
  -- policy qui mentionne 'public-assets' dans qual/with_check est
  -- drop pour repartir d'un état propre.
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND (
         coalesce(qual::text, '') ILIKE '%public-assets%'
         OR coalesce(with_check::text, '') ILIKE '%public-assets%'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- 2. Recreate the 4 policies, permissive.
CREATE POLICY "public_assets_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'public-assets');

CREATE POLICY "public_assets_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'public-assets');

CREATE POLICY "public_assets_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'public-assets')
  WITH CHECK (bucket_id = 'public-assets');

CREATE POLICY "public_assets_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'public-assets');
