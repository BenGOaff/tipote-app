-- Module Compta — phase 1p : portage Belgique
--
-- 4 nouveaux statuts pour les users belges :
--   • independant_principal_be     — Indépendant à titre principal
--                                    (cotisations sociales pleines)
--   • independant_complementaire_be — Indépendant à titre complémentaire
--                                    (à côté d'un emploi salarié,
--                                    cotisations réduites)
--   • srl_be — Société à Responsabilité Limitée (ex-SPRL, réforme 2019)
--   • sa_be  — Société Anonyme
--
-- Le statut `particulier` reste universel.
--
-- TVA belge :
--   - Taux : 21% (normal), 12% (intermédiaire), 6% (réduit)
--   - Seuil franchise (régime de la franchise des petites entreprises,
--     art. 56bis CTVA) : EUR 25'000 / an
--   - Périodicité : trimestrielle (CA < 2,5 M€, défaut) ou mensuelle
--     (CA > 2,5 M€)
--   - Date butoir : 20 du mois suivant (mensuel) ou 20 du mois suivant
--     le trimestre (trimestriel)
--   - Soumission : portail Intervat (intervat.fgov.be)
--   - Listing client annuel : déclaration des clients assujettis BE
--     avant le 30/31 mars de N+1
--   - Listing intra UE (état 723) : trimestriel pour les ventes UE
--
-- IPP (Impôt des Personnes Physiques) :
--   - Déclaration annuelle via Tax-on-web (MyMinfin)
--   - Date butoir papier : 30 juin
--   - Date butoir Tax-on-web : 15 juillet (variable selon convention)
--   - Versements anticipés (VA) trimestriels : 10/04, 10/07, 10/10, 20/12
--
-- ISoc (Impôt des Sociétés) :
--   - Taux : 25% (normal), 20% (PME pour la 1re tranche jusqu'à 100k€)
--   - Déclaration via Biztax — date butoir ~7 mois après clôture
--     (= ~30 septembre pour exercice civil clôturé 31/12)
--   - Versements anticipés trimestriels : mêmes dates que IPP
--   - Comptes annuels à déposer à la BNB (Banque Nationale) dans les
--     7 mois après l'AG (qui doit avoir lieu dans les 6 mois post-clôture)
--
-- Cotisations sociales (INASTI / RSVZ) :
--   - Indépendants : 20,5% du revenu net (taux principal)
--   - Acomptes trimestriels : 20/03, 20/06, 20/09, 20/12 (selon caisse)
--   - Cotisation minimum même si revenu nul
--   - Indépendants complémentaires : taux réduit
--
-- Pas d'équivalent FEC obligatoire en Belgique (les contrôles fiscaux
-- s'appuient sur la comptabilité tenue selon le PCMN — Plan Comptable
-- Minimum Normalisé). On n'a donc pas à produire d'export comptable
-- standard.

ALTER TABLE public.business_profiles
  -- Région : 'wallonie' / 'flandre' / 'bruxelles'. Influence quelques
  -- aspects (TVA déductible sur véhicules, primes régionales, etc.) mais
  -- pas le calendrier fédéral lui-même.
  ADD COLUMN IF NOT EXISTS be_region TEXT,
  -- Numéro d'entreprise BCE (Banque-Carrefour des Entreprises). Format
  -- 10 chiffres (BE0XXXXXXXXX). Stocké sans préfixe BE / sans points.
  ADD COLUMN IF NOT EXISTS be_company_number TEXT,
  -- Régime de franchise TVA (CA < 25 000 €/an) — art. 56bis CTVA.
  -- Si TRUE, l'user ne facture pas la TVA et n'a pas de déclaration
  -- TVA à déposer.
  ADD COLUMN IF NOT EXISTS be_vat_franchise BOOLEAN NOT NULL DEFAULT FALSE,
  -- Périodicité TVA : 'trimestrielle' (par défaut, CA < 2,5 M€) ou
  -- 'mensuelle' (CA > 2,5 M€).
  ADD COLUMN IF NOT EXISTS be_vat_periodicity TEXT,
  -- L'user fait-il des ventes intra-UE ? Si oui, listing trimestriel
  -- (état 723) à déposer en plus.
  ADD COLUMN IF NOT EXISTS be_intra_eu_listing BOOLEAN NOT NULL DEFAULT FALSE,
  -- Date de début d'activité (déclarée auprès de la BCE).
  ADD COLUMN IF NOT EXISTS be_started_at DATE;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_be_region_check
    CHECK (
      be_region IS NULL
      OR be_region IN ('wallonie', 'flandre', 'bruxelles')
    ),
  ADD CONSTRAINT business_profiles_be_vat_periodicity_check
    CHECK (
      be_vat_periodicity IS NULL
      OR be_vat_periodicity IN ('mensuelle', 'trimestrielle')
    ),
  -- BCE = exactement 10 chiffres. On accepte aussi NULL pour les users
  -- qui débutent leur configuration.
  ADD CONSTRAINT business_profiles_be_company_number_check
    CHECK (
      be_company_number IS NULL
      OR be_company_number ~ '^[0-9]{10}$'
    );

COMMENT ON COLUMN public.business_profiles.be_region IS
  'Région belge : wallonie / flandre / bruxelles. Affecte certaines règles régionales (primes, TVA véhicules) mais pas le calendrier fédéral.';
COMMENT ON COLUMN public.business_profiles.be_company_number IS
  'Numéro d''entreprise BCE (10 chiffres, format BE0XXXXXXXXX). Stocké sans préfixe ni points.';
COMMENT ON COLUMN public.business_profiles.be_vat_franchise IS
  'Régime de franchise TVA (art. 56bis CTVA) — exonération si CA < 25 000 €/an. Si false, déclarations TVA à déposer.';
COMMENT ON COLUMN public.business_profiles.be_vat_periodicity IS
  'Périodicité TVA : trimestrielle (CA < 2,5 M€, défaut) ou mensuelle (CA > 2,5 M€). Date butoir = 20 du mois suivant la période.';
COMMENT ON COLUMN public.business_profiles.be_intra_eu_listing IS
  'L''user fait des ventes intra-UE → listing trimestriel (état 723) à déposer sur Intervat.';

COMMENT ON COLUMN public.business_profiles.accounting_status IS
  'Statut compta. Valeurs France : particulier / auto_entrepreneur / sasu / sas / sarl / eurl. Valeurs Suisse : independant_ch / sarl_ch / sa_ch. Valeurs Portugal : trabalhador_independente_pt / eni_pt / lda_unipessoal_pt / lda_pt / sa_pt. Valeurs Belgique : independant_principal_be / independant_complementaire_be / srl_be / sa_be. NULL = non configuré.';
