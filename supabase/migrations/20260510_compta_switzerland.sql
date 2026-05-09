-- Module Compta — phase 1n : portage Suisse
--
-- Tipote ouvre l'onglet Compta aux users suisses, avec 3 statuts en
-- plus des 6 français :
--   • independant_ch (Indépendant / raison individuelle / Einzelfirma)
--   • sarl_ch (Sàrl)
--   • sa_ch (SA)
--
-- Le statut `particulier` reste universel (revenus accessoires).
--
-- TVA suisse :
--   - Seuil unique d'assujettissement : CHF 100'000 / an de CA mondial
--   - Taux : 8,1 % (normal), 2,6 % (réduit), 3,8 % (hébergement)
--   - Périodicité défaut : trimestrielle (T1→31 mai, T2→31 août,
--     T3→30 nov, T4→28 fév N+1). Possible aussi mensuelle, semestrielle
--     ou annuelle sur demande.
--   - Méthode : effective (TVA déductible classique) ou TDFN (Taux de
--     la Dette Fiscale Nette — déductible forfaitaire selon branche)
--
-- Cotisations sociales : AVS/AI/APG (10,6% pour indépendant), acomptes
-- trimestriels (mois 3-6-9-12). Caisse AVS dépend du canton.
--
-- Impôts :
--   - Indépendants : revenu intégré dans la déclaration d'impôt
--     personnelle cantonale + fédérale (1 seule déclaration)
--   - Sàrl/SA : IBO (impôt sur le bénéfice) fédéral 8,5% + cantonal/communal
--     (variable, ~12-21% effectif). Comptes annuels obligatoires.
--   - Date de dépôt déclaration impôt : variable selon canton, mars-juin
--     pour la majorité ; on prend 31 mars comme date prudente.
--
-- IMPORTANT : les particularités cantonales (taux exact, périodicité
-- AVS, allocations familiales) ne sont PAS modélisées ici. L'user
-- indique son canton à titre informatif (et pour de futures évolutions)
-- mais le calendrier reste fédéral / commun à tous les cantons.

ALTER TABLE public.business_profiles
  -- Canton suisse (26 valeurs) — informatif uniquement à ce stade
  ADD COLUMN IF NOT EXISTS ch_canton TEXT,
  -- Assujetti à la TVA (CA > 100'000 CHF/an mondial). Si false,
  -- pas de déclaration TVA à afficher dans le calendrier.
  ADD COLUMN IF NOT EXISTS ch_vat_assujetti BOOLEAN NOT NULL DEFAULT FALSE,
  -- Périodicité de décompte TVA. Défaut trimestrielle (cas standard).
  -- 'mensuelle' / 'trimestrielle' / 'semestrielle' / 'annuelle'
  ADD COLUMN IF NOT EXISTS ch_vat_periodicity TEXT,
  -- Méthode de décompte. 'effective' (standard) ou 'tdfn' (Taux de
  -- la Dette Fiscale Nette — déductible forfaitaire). Influence le
  -- calcul de TVA à payer mais pas les dates butoir.
  ADD COLUMN IF NOT EXISTS ch_vat_method TEXT,
  -- Date de début d'activité indépendante (utile pour anticiper le
  -- premier décompte AVS / TVA et calculer les acomptes).
  ADD COLUMN IF NOT EXISTS ch_started_at DATE;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_ch_vat_periodicity_check
    CHECK (
      ch_vat_periodicity IS NULL
      OR ch_vat_periodicity IN ('mensuelle', 'trimestrielle', 'semestrielle', 'annuelle')
    ),
  ADD CONSTRAINT business_profiles_ch_vat_method_check
    CHECK (
      ch_vat_method IS NULL
      OR ch_vat_method IN ('effective', 'tdfn')
    ),
  ADD CONSTRAINT business_profiles_ch_canton_check
    CHECK (
      ch_canton IS NULL
      OR ch_canton IN (
        'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE',
        'NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH'
      )
    );

COMMENT ON COLUMN public.business_profiles.ch_canton IS
  'Canton suisse (26 codes ISO 3166-2). Informatif à ce stade — les particularités cantonales (taux IBO exact, AVS, allocations familiales) ne sont pas modélisées par Tipote.';
COMMENT ON COLUMN public.business_profiles.ch_vat_assujetti IS
  'Assujetti TVA suisse (CA mondial > 100''000 CHF/an). En dessous du seuil, pas d''obligation. Configurable par l''user dans ComptaConfigForm.';
COMMENT ON COLUMN public.business_profiles.ch_vat_periodicity IS
  'Périodicité du décompte TVA suisse : mensuelle / trimestrielle (défaut) / semestrielle / annuelle. Détermine les dates butoir (T1→31 mai, T2→31 août, T3→30 nov, T4→28 fév pour le trimestriel).';
COMMENT ON COLUMN public.business_profiles.ch_vat_method IS
  'Méthode de décompte TVA suisse : effective (TVA déductible classique) ou tdfn (Taux de la Dette Fiscale Nette — forfaitaire selon branche). Pas d''impact sur les dates, juste sur le calcul de TVA à payer.';

-- Pas d'ENUM en base pour accounting_status — la validation côté zod
-- (api/profile/route.ts) accepte maintenant 9 valeurs :
--   particulier / auto_entrepreneur / sasu / sas / sarl / eurl
--   / independant_ch / sarl_ch / sa_ch
COMMENT ON COLUMN public.business_profiles.accounting_status IS
  'Statut compta. Valeurs France : particulier / auto_entrepreneur / sasu / sas / sarl / eurl. Valeurs Suisse : independant_ch / sarl_ch / sa_ch. NULL = non configuré. Validation côté zod (api/profile/route.ts).';
