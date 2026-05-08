-- Plus jamais le cas "user actif depuis des mois mais coincé sur l'onboarding".
--
-- Régressions historiques sur ce flag :
--   2026-04-30 — Monique : un fallback "any project completed" sautait
--                l'onboarding du 2e projet. Fix : check par projet actif.
--   2026-05-08 — Flo : 70 contenus + niche + 3 offres mais flag jamais
--                flippé → bloquée à l'onboarding malgré une activité
--                continue sur Tipote.
--
-- Cause racine : onboarding_completed est un flag booléen écrit par le
-- bouton "Terminer l'onboarding". Si l'user quitte avant ce bouton (ou
-- si une migration crée la row sans le flag), il reste à false même
-- quand le contenu réel (niche + offres) est saisi par d'autres flows
-- (settings, coach, copywriting, etc.).
--
-- Garde-fou : un trigger BEFORE UPDATE qui flippe le flag à true dès
-- que la row a niche non-vide + au moins une offre. C'est cohérent
-- avec ce que fait le bouton final ; aucun autre code n'a besoin de
-- savoir, ça se met à jour seul.
--
-- Backfill : on flippe aussi toutes les rows existantes qui matchent
-- le critère mais ont un flag à false/NULL. Idempotent.

-- 1. Backfill rétroactif
UPDATE business_profiles
SET onboarding_completed = true
WHERE onboarding_completed IS DISTINCT FROM true
  AND niche IS NOT NULL
  AND length(trim(niche)) > 0
  AND offers IS NOT NULL
  AND jsonb_array_length(offers) > 0;

-- 2. Trigger function : flip the flag automatically when content
--    crosses the "looks onboarded" threshold. We do this in BEFORE
--    UPDATE so the flag is correct in the same SQL statement (no
--    extra round-trip needed).
CREATE OR REPLACE FUNCTION auto_complete_onboarding_when_filled()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If the row already says completed, no work to do.
  IF NEW.onboarding_completed IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Heuristic mirrored from app/app/page.tsx:
  --   niche non-empty AND offers array has at least one entry
  IF NEW.niche IS NOT NULL
     AND length(trim(NEW.niche)) > 0
     AND NEW.offers IS NOT NULL
     AND jsonb_typeof(NEW.offers) = 'array'
     AND jsonb_array_length(NEW.offers) > 0
  THEN
    NEW.onboarding_completed := true;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Wire the trigger on UPDATE and INSERT. Both events matter :
--    UPDATE catches users editing their settings ; INSERT catches
--    seeded rows from migrations or admin imports.
DROP TRIGGER IF EXISTS trg_business_profiles_auto_onboarded ON business_profiles;
CREATE TRIGGER trg_business_profiles_auto_onboarded
  BEFORE INSERT OR UPDATE OF niche, offers, onboarding_completed
  ON business_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_onboarding_when_filled();

COMMENT ON FUNCTION auto_complete_onboarding_when_filled IS
  'Auto-flip business_profiles.onboarding_completed=true when the row reaches the "looks onboarded" threshold (niche + at least one offer). Prevents the regression where active users stay flagged as onboarding-incomplete.';
