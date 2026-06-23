-- 20260622b_backfill_all_project_ids.sql
--
-- INCIDENT (22 juin 2026) : des users crees AVANT le multiprofil avaient
-- des donnees avec project_id NULL. Des qu'un projet par defaut existe,
-- les ecrans filtrent par projet et MASQUENT ces donnees (leads, quiz...).
-- Rien n'est perdu, mais c'est invisible.
--
-- Les backfills precedents (20260218, 20260310) etaient PARTIELS :
--   - 20260218 ne creait un projet que pour les users avec business_profiles
--   - 20260310 ne backfillait que 10 tables (leads + toutes les tables
--     creees apres mars 2026 etaient oubliees)
--
-- Cette migration est EXHAUSTIVE et IDEMPOTENTE :
--   0) garantit exactement un projet is_default par user qui a des projets
--   1) cree un projet par defaut pour tout user qui possede des donnees
--      mais aucun projet
--   2) backfille project_id sur TOUTE table publique ayant a la fois
--      user_id et project_id (detection dynamique : aucune table ne peut
--      plus etre oubliee), depuis le projet par defaut du proprietaire.

DO $$
DECLARE
  t RECORD;
BEGIN
  -- 0) Un seul is_default par user : si des projets existent sans defaut,
  --    on promeut le plus ancien.
  UPDATE projects p
  SET is_default = true
  WHERE p.id = (
    SELECT p2.id FROM projects p2
    WHERE p2.user_id = p.user_id
    ORDER BY p2.created_at ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM projects p3
    WHERE p3.user_id = p.user_id AND p3.is_default = true
  );

  -- 1) Projet par defaut pour les users qui ont des donnees mais 0 projet.
  --    (legacy d'avant le multiprofil, sans business_profiles)
  INSERT INTO projects (user_id, name, is_default, created_at, updated_at)
  SELECT DISTINCT u.user_id, 'Mon Projet', true, now(), now()
  FROM (
    SELECT user_id FROM quizzes
    UNION SELECT user_id FROM leads
    UNION SELECT user_id FROM hosted_pages
    UNION SELECT user_id FROM business_profiles
    UNION SELECT user_id FROM content_item
  ) u
  LEFT JOIN projects p ON p.user_id = u.user_id
  WHERE u.user_id IS NOT NULL AND p.id IS NULL;

  -- 2) Backfill dynamique : toute table public avec user_id + project_id.
  FOR t IN
    SELECT c1.table_name
    FROM information_schema.columns c1
    JOIN information_schema.columns c2
      ON c1.table_schema = c2.table_schema
     AND c1.table_name = c2.table_name
    WHERE c1.table_schema = 'public'
      AND c1.column_name = 'project_id'
      AND c2.column_name = 'user_id'
  LOOP
    EXECUTE format(
      'UPDATE public.%I t
         SET project_id = p.id
        FROM public.projects p
       WHERE t.project_id IS NULL
         AND p.user_id = t.user_id
         AND p.is_default = true',
      t.table_name
    );
  END LOOP;
END $$;
