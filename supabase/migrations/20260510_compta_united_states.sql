-- Module Compta — phase 1s : portage États-Unis (50 états + DC)
--
-- 5 statuts US :
--   • sole_proprietorship_us : aucune entité juridique séparée, revenus
--                              déclarés sur Schedule C du 1040 personnel.
--                              Self-employment tax 15.3 % sur le net.
--   • single_member_llc_us   : LLC à 1 membre. Par défaut "disregarded
--                              entity" (= Schedule C). Peut élire d'être
--                              taxée comme S-Corp ou C-Corp via Form 8832
--                              ou Form 2553 (S-election).
--   • multi_member_llc_us    : LLC à 2+ membres. Par défaut "partnership"
--                              (Form 1065 + K-1 distribués aux associés).
--                              Peut aussi élire S-Corp / C-Corp.
--   • c_corp_us              : C Corporation. Form 1120 fédéral. Double
--                              imposition (corp + dividendes). Flat 21 %
--                              fédéral depuis TCJA 2017.
--   • s_corp_us              : S Corporation. Form 1120-S + K-1.
--                              Pass-through, pas d'impôt fédéral au niveau
--                              de la corp (sauf BIG tax exceptions).
--
-- Spécificités modélisées :
--   - 50 états + DC (codes USPS XX, ISO 3166-2 US-XX)
--   - 9 états sans state income tax sur les revenus salariaux/business :
--     AK, FL, NV, SD, TN, TX, WY (et NH/WA partiellement — NH sur intérêts
--     et dividendes seulement, WA sur capital gains > 250k$).
--   - Sales tax : 45 états l'appliquent (NH, OR, MT, AK, DE n'en ont pas).
--     ~10 000 juridictions locales distinctes (county, city, district).
--     Tipote modélise juste la liste d'états où l'user est inscrit
--     (us_sales_tax_states JSONB). La périodicité (mens/trim/annuelle)
--     est assignée par chaque state department of revenue.
--   - LLC : champ us_llc_tax_classification permet d'enregistrer
--     l'élection (disregarded/partnership/s_corp/c_corp) — change le
--     calendrier fiscal et les forms à produire.
--   - EIN (Employer Identification Number) : XX-XXXXXXX (9 chiffres),
--     obligatoire pour LLC multi-membre, C-Corp, S-Corp, et toute entité
--     avec employés. Sole prop sans employés peut utiliser son SSN.
--
-- Forms et échéances couverts :
--   - 1040 (individual) : 15 avril (extension Form 4868 → 15 octobre)
--   - 1120 (C-Corp)     : 15 avril si calendar year (extension → 15 oct)
--   - 1120-S (S-Corp)   : 15 mars si calendar year (extension → 15 sept)
--   - 1065 (Partnership): 15 mars si calendar year (extension → 15 sept)
--   - 1040-ES estimated taxes : Q1 15/04, Q2 15/06, Q3 15/09, Q4 15/01 N+1
--                               (obligatoire si tax due > 1 000 $/an)
--   - 1099-NEC (paid contractors > 600 $) : 31 janvier
--   - State income tax  : généralement aligné sur le 15 avril fédéral
--                          (sauf 9 états sans income tax)
--   - Sales tax         : mensuelle/trimestrielle/annuelle selon assignation
--                          de l'état, généralement due le 20 du mois suivant

ALTER TABLE public.business_profiles
  -- État (codes USPS / ISO 3166-2 US-XX, 50 + DC)
  ADD COLUMN IF NOT EXISTS us_state TEXT,
  -- EIN (Employer Identification Number) au format XX-XXXXXXX
  ADD COLUMN IF NOT EXISTS us_ein TEXT,
  -- Élection fiscale pour les LLC :
  -- 'disregarded' (single-member par défaut, → Schedule C)
  -- 'partnership' (multi-member par défaut, → 1065)
  -- 's_corp'      (élection via Form 2553)
  -- 'c_corp'      (élection via Form 8832)
  -- NULL pour les non-LLC (sole prop / C-Corp / S-Corp où c'est implicite).
  ADD COLUMN IF NOT EXISTS us_llc_tax_classification TEXT,
  -- Liste d'états où l'user est inscrit pour collecter la sales tax.
  -- Format : ["CA", "NY", "TX"] (codes USPS). Vide [] = aucun (ou
  -- entreprise dans un état sans sales tax comme NH/OR/MT/AK/DE).
  ADD COLUMN IF NOT EXISTS us_sales_tax_states JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Exercice fiscal : calendar year (jan-dec) par défaut. Très rare
  -- d'avoir un fiscal year différent pour les solos / petites LLC
  -- (les C-Corp peuvent en choisir un, S-Corp et partnerships sont
  -- contraintes sauf élection 444).
  ADD COLUMN IF NOT EXISTS us_fiscal_year_calendar BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS us_fiscal_year_start_month INTEGER,
  ADD COLUMN IF NOT EXISTS us_started_at DATE;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_us_state_check
    CHECK (
      us_state IS NULL
      OR us_state IN (
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
        'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
        'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
        'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
        'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
        'DC'
      )
    ),
  ADD CONSTRAINT business_profiles_us_llc_tax_classification_check
    CHECK (
      us_llc_tax_classification IS NULL
      OR us_llc_tax_classification IN ('disregarded', 'partnership', 's_corp', 'c_corp')
    ),
  ADD CONSTRAINT business_profiles_us_fiscal_year_start_month_check
    CHECK (
      us_fiscal_year_start_month IS NULL
      OR (us_fiscal_year_start_month >= 1 AND us_fiscal_year_start_month <= 12)
    );

COMMENT ON COLUMN public.business_profiles.us_state IS
  'État américain (codes USPS / ISO 3166-2 US-XX). 50 états + DC. 9 états sans income tax sur business : AK, FL, NV, NH, SD, TN, TX, WA (capital gains seulement), WY. 5 états sans sales tax : NH, OR, MT, AK, DE.';
COMMENT ON COLUMN public.business_profiles.us_ein IS
  'Employer Identification Number IRS au format XX-XXXXXXX (9 chiffres). Obligatoire pour LLC multi-membre, C-Corp, S-Corp, et toute entité avec employés. Sole prop sans employés peut utiliser son SSN.';
COMMENT ON COLUMN public.business_profiles.us_llc_tax_classification IS
  'Élection fiscale d''une LLC : disregarded (single-member défaut, Schedule C), partnership (multi-member défaut, Form 1065), s_corp (Form 2553), c_corp (Form 8832). NULL pour les non-LLC.';
COMMENT ON COLUMN public.business_profiles.us_sales_tax_states IS
  'Array JSON des codes USPS d''états où l''user est inscrit pour collecter la sales tax. La périodicité (mens/trim/annuelle) est assignée par chaque state department of revenue selon le volume. Tipote affiche un rappel mensuel par défaut pour chaque état.';

COMMENT ON COLUMN public.business_profiles.accounting_status IS
  'Statut compta. France : particulier / auto_entrepreneur / sasu / sas / sarl / eurl. Suisse : independant_ch / sarl_ch / sa_ch. Portugal : trabalhador_independente_pt / eni_pt / lda_unipessoal_pt / lda_pt / sa_pt. Belgique : independant_principal_be / independant_complementaire_be / srl_be / sa_be. Espagne : autonomo_es / slu_es / sl_es / sa_es. Canada : travailleur_autonome_ca / entreprise_individuelle_ca / inc_provincial_ca / inc_federal_ca. États-Unis : sole_proprietorship_us / single_member_llc_us / multi_member_llc_us / c_corp_us / s_corp_us. NULL = non configuré.';
