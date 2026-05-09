-- Module Compta — phase 1r : portage Canada (toutes provinces + territoires)
--
-- 4 statuts CA (génériques, la province discrimine via ca_province) :
--   • travailleur_autonome_ca   : sole proprietor non immatriculé
--                                 (équivalent QC : pas inscrit au REQ)
--   • entreprise_individuelle_ca : sole proprietor immatriculé
--                                 (équivalent QC : inscrit au REQ)
--   • inc_provincial_ca         : société par actions provinciale
--                                 (loi de la province dans ca_province)
--   • inc_federal_ca            : société par actions fédérale (CBCA),
--                                 toujours inscrite à Corporations Canada
--
-- Spécificités modélisées :
--   - 13 provinces/territoires (10 provinces + YT + NT + NU)
--   - Système TPS (5%, ARC) commun, déclinaisons provinciales :
--       * QC          : TVQ 9.975% (Revenu Québec gère TPS+TVQ ensemble via FPZ-500)
--       * ON, NB, NL, NS, PE : TVH (HST) 13% (ON) ou 15% (NB/NL/NS/PE) — taxe harmonisée
--       * BC          : PST 7%
--       * SK          : PST 6%
--       * MB          : RST 7%
--       * AB, NT, NU, YT : pas de taxe provinciale, juste TPS 5%
--   - Petit fournisseur : CA < 30 000 $/4 trimestres → pas obligé de s'inscrire TPS
--     (mais on PEUT s'inscrire volontairement pour récupérer les CTI/RTI)
--   - Périodicité TPS/TVH selon CA :
--       * mensuelle   si CA > 6 000 000 $
--       * trimestrielle si CA entre 1 500 000 $ et 6 000 000 $
--       * annuelle    si CA < 1 500 000 $ (avec 4 acomptes trimestriels)
--   - Impôt particulier : T1 (fédéral, ARC) + déclaration provinciale
--     (TP-1 au QC via Revenu Québec ; ailleurs ARC gère les deux)
--     Date limite : 30 avril (15 juin si revenus de travail autonome,
--     mais paiement dû au 30 avril dans tous les cas)
--   - Impôt société : T2 (fédéral) + CO-17 (QC) ou T2 seul ailleurs
--     Échéance : 6 mois après fin d'exercice (paiement dû à 2 ou 3 mois)
--   - Acomptes provisionnels trimestriels (15/03, 15/06, 15/09, 15/12)
--   - RRQ (Régime de rentes du Québec) au QC, RPC (Régime de pensions
--     du Canada) ailleurs — perçus avec l'impôt
--   - RQAP (Régime québécois d'assurance parentale) — QC uniquement
--   - CNESST (santé/sécurité au travail) au QC pour les sociétés
--     avec employés ; équivalents WSIB (ON), WCB (autres provinces)

ALTER TABLE public.business_profiles
  -- Province ou territoire (codes ISO 3166-2 CA-XX)
  ADD COLUMN IF NOT EXISTS ca_province TEXT,
  -- NEQ (10 chiffres, QC) ou Business Number ARC (9 chiffres, format
  -- 123456789RT0001 avec suffixes par compte). On stocke en texte libre
  -- car formats divergents selon province et selon le compte (RT TPS,
  -- RC IS, RP paie, etc.). Le BN racine (9 chiffres) suffit en MVP.
  ADD COLUMN IF NOT EXISTS ca_business_number TEXT,
  -- Inscrit ou non à la TPS (et à la taxe provinciale qui s'applique)
  ADD COLUMN IF NOT EXISTS ca_gst_registered BOOLEAN NOT NULL DEFAULT FALSE,
  -- Périodicité de déclaration TPS/TVH/TVQ
  -- 'mensuelle' | 'trimestrielle' | 'annuelle'
  ADD COLUMN IF NOT EXISTS ca_gst_periodicity TEXT,
  -- Petit fournisseur (CA < 30 000 $ sur 4 trimestres) → exonération
  -- d'inscription TPS. Sert à expliciter dans l'UI pourquoi on ne
  -- propose pas la déclaration TPS quand l'user a coché ça.
  ADD COLUMN IF NOT EXISTS ca_petit_fournisseur BOOLEAN NOT NULL DEFAULT TRUE,
  -- Exercice comptable d'une société (T2/CO-17)
  ADD COLUMN IF NOT EXISTS ca_fiscal_year_calendar BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ca_fiscal_year_start_month INTEGER,
  ADD COLUMN IF NOT EXISTS ca_started_at DATE;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_ca_province_check
    CHECK (
      ca_province IS NULL
      OR ca_province IN (
        'QC','ON','BC','AB','MB','SK','NS','NB','NL','PE',
        'YT','NT','NU'
      )
    ),
  ADD CONSTRAINT business_profiles_ca_gst_periodicity_check
    CHECK (
      ca_gst_periodicity IS NULL
      OR ca_gst_periodicity IN ('mensuelle', 'trimestrielle', 'annuelle')
    ),
  ADD CONSTRAINT business_profiles_ca_fiscal_year_start_month_check
    CHECK (
      ca_fiscal_year_start_month IS NULL
      OR (ca_fiscal_year_start_month >= 1 AND ca_fiscal_year_start_month <= 12)
    );

COMMENT ON COLUMN public.business_profiles.ca_province IS
  'Province ou territoire canadien (codes ISO 3166-2 CA). 10 provinces (QC,ON,BC,AB,MB,SK,NS,NB,NL,PE) + 3 territoires (YT,NT,NU). QC = TVQ via Revenu Québec. ON/NB/NL/NS/PE = TVH harmonisée. BC/SK/MB = PST/RST séparée. AB + territoires = TPS seule.';
COMMENT ON COLUMN public.business_profiles.ca_business_number IS
  'Business Number ARC (9 chiffres, racine du BN — les comptes RT/RC/RP/etc. s''ajoutent en suffixe) ou NEQ Québec (10 chiffres) pour les entreprises immatriculées au REQ. Texte libre car les formats divergent.';
COMMENT ON COLUMN public.business_profiles.ca_gst_registered IS
  'Inscrit à la TPS (et à la TVQ/TVH/PST applicable selon la province). Si false + CA < 30k$ sur 4 trimestres → petit fournisseur, pas d''obligation. Inscription volontaire possible pour récupérer les CTI/RTI.';
COMMENT ON COLUMN public.business_profiles.ca_gst_periodicity IS
  'Périodicité de déclaration TPS/TVH/TVQ. mensuelle (CA > 6M$), trimestrielle (1,5–6M$) ou annuelle (< 1,5M$, avec 4 acomptes trimestriels). NULL si non inscrit (petit fournisseur).';
COMMENT ON COLUMN public.business_profiles.ca_petit_fournisseur IS
  'CA < 30 000 $ sur 4 trimestres consécutifs → exonération d''inscription TPS. Sert à expliciter le statut dans l''UI. Mis à TRUE par défaut au démarrage.';

COMMENT ON COLUMN public.business_profiles.accounting_status IS
  'Statut compta. France : particulier / auto_entrepreneur / sasu / sas / sarl / eurl. Suisse : independant_ch / sarl_ch / sa_ch. Portugal : trabalhador_independente_pt / eni_pt / lda_unipessoal_pt / lda_pt / sa_pt. Belgique : independant_principal_be / independant_complementaire_be / srl_be / sa_be. Espagne : autonomo_es / slu_es / sl_es / sa_es. Canada : travailleur_autonome_ca / entreprise_individuelle_ca / inc_provincial_ca / inc_federal_ca. NULL = non configuré.';
