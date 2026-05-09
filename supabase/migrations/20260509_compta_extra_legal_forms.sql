-- Module Compta — phase 1m : EURL / SARL / SAS
--
-- Ajoute 3 statuts juridiques en plus de particulier / AE / SASU :
--   • EURL (Entreprise Unipersonnelle à Responsabilité Limitée)
--     → SARL à associé unique. Régime fiscal IR par défaut, IS sur option.
--     → Si IS : obligations identiques à SASU (TVA, IS, bilan, DSN/TNS, CFE).
--     → Si IR : déclaration 2031 (BIC) ou 2035 (BNC), pas de DSN, URSSAF TNS.
--   • SARL (Société à Responsabilité Limitée)
--     → 2-100 associés. Toujours à l'IS sauf option SARL de famille.
--     → Différence avec SASU : DSN seulement si gérant minoritaire (assimilé
--       salarié) ; gérant majoritaire = TNS, donc URSSAF séparée.
--   • SAS (Société par Actions Simplifiée)
--     → Multi-associés. Toujours à l'IS. Président toujours assimilé salarié,
--       donc DSN si rémunéré.
--
-- Implémentation : on garde la sémantique des colonnes `sasu_*` existantes
-- (siren, fiscal_year_calendar, fiscal_year_start_month, vat_regime,
-- vat_intra_enabled, dirigeant_remunere) et on les utilise pour TOUTES les
-- sociétés à l'IS (= sasu, sas, sarl, eurl-IS). Documentation mise à jour
-- en commentaire de colonne. Évite une duplication massive du schéma.
--
-- Champs spécifiques ajoutés ici :
--   • eurl_is_election : true = EURL a opté pour l'IS, false = IR (défaut)
--   • sarl_gerant_majoritaire : impact sur DSN (pas de DSN si majoritaire TNS)

-- Pas d'ENUM en base — la validation se fait côté zod (route.ts) pour ne
-- pas avoir à dropper / recréer un type Postgres à chaque ajout. On
-- documente juste les valeurs autorisées en commentaire.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS eurl_is_election BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sarl_gerant_majoritaire BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.business_profiles.eurl_is_election IS
  'EURL : true = a opté pour l''IS (obligations comme SASU). false = IR par défaut (déclaration 2031/2035, pas de DSN, URSSAF TNS).';

COMMENT ON COLUMN public.business_profiles.sarl_gerant_majoritaire IS
  'SARL : true = gérant majoritaire (TNS, pas de DSN), false = minoritaire ou égalitaire (assimilé salarié, DSN obligatoire si rémunéré).';

COMMENT ON COLUMN public.business_profiles.accounting_status IS
  'Statut compta : particulier / auto_entrepreneur / sasu / sas / sarl / eurl. NULL = non configuré. Validation côté zod (api/profile/route.ts).';

-- Sémantique élargie des colonnes sasu_* : utilisées pour toute société
-- à l'IS (sasu, sas, sarl, eurl avec eurl_is_election=true).
COMMENT ON COLUMN public.business_profiles.sasu_siren IS
  'SIREN à 9 chiffres de la société. S''applique aux SASU, SAS, SARL et EURL.';
COMMENT ON COLUMN public.business_profiles.sasu_vat_regime IS
  'Régime TVA de la société (toutes formes à l''IS) : reel_mensuel / reel_trimestriel / simplifie.';
COMMENT ON COLUMN public.business_profiles.sasu_dirigeant_remunere IS
  'Dirigeant rémunéré (SASU/SAS/SARL minoritaire). Détermine la DSN. Pour SARL gérant majoritaire, voir sarl_gerant_majoritaire qui inverse la logique.';
