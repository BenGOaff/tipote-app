-- Module Compta — phase 1q : portage Espagne
--
-- 4 statuts ES :
--   • autonomo_es : Trabajador autónomo (RETA)
--   • slu_es     : Sociedad Limitada Unipersonal (≈ EURL)
--   • sl_es      : Sociedad Limitada (≈ SARL)
--   • sa_es      : Sociedad Anónima
--
-- Spécificités modélisées :
--   - 17 Comunidades Autónomas + 2 Ciudades Autónomas (Ceuta, Melilla)
--   - Régimen Foral (País Vasco + Navarra) : système fiscal indépendant
--   - Canarias : IGIC au lieu d'IVA
--   - Ceuta + Melilla : IPSI au lieu d'IVA
--   - IVA : Modelo 303 (trimestriel/mensuel) + Modelo 390 (annuel) + Modelo 349 (intra-UE)
--   - IRPF : Modelo 130 (estimación directa) ou 131 (módulos), trimestriel
--     + Modelo 100 (déclaration annuelle, avril-juin)
--   - IS : Modelo 200 (annuel, 1-25 juillet) + Modelo 202 (acomptes 20/04, 20/10, 20/12)
--   - RETA : cotisaciones mensuelles via TGSS (réforme 2023, basée sur revenus réels)

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS es_community TEXT,
  -- NIF/CIF entreprise : 1 lettre + 8 chiffres (A=SA, B=SL, etc.)
  -- Ou DNI/NIE pour persona física (8 chiffres + 1 lettre)
  ADD COLUMN IF NOT EXISTS es_company_number TEXT,
  -- 'general' | 'simplificado' | 'recargo_equivalencia' | 'exencion'
  ADD COLUMN IF NOT EXISTS es_iva_regime TEXT,
  -- 'mensual' (CA > 6M€ ou REDEME) | 'trimestral' (défaut)
  ADD COLUMN IF NOT EXISTS es_iva_periodicity TEXT,
  -- Inscrit au REDEME (registro de devolución mensual) → mensuel
  ADD COLUMN IF NOT EXISTS es_redeme BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'directa' (estimación directa, défaut) | 'objetiva' (módulos)
  ADD COLUMN IF NOT EXISTS es_irpf_method TEXT,
  ADD COLUMN IF NOT EXISTS es_started_at DATE;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_es_community_check
    CHECK (
      es_community IS NULL
      OR es_community IN (
        'AN','AR','AS','IB','CN','CB','CL','CM','CT','VC',
        'EX','GA','MD','MC','NC','PV','RI','CE','ML'
      )
    ),
  ADD CONSTRAINT business_profiles_es_iva_regime_check
    CHECK (
      es_iva_regime IS NULL
      OR es_iva_regime IN ('general', 'simplificado', 'recargo_equivalencia', 'exencion')
    ),
  ADD CONSTRAINT business_profiles_es_iva_periodicity_check
    CHECK (
      es_iva_periodicity IS NULL
      OR es_iva_periodicity IN ('mensual', 'trimestral')
    ),
  ADD CONSTRAINT business_profiles_es_irpf_method_check
    CHECK (
      es_irpf_method IS NULL
      OR es_irpf_method IN ('directa', 'objetiva')
    );

COMMENT ON COLUMN public.business_profiles.es_community IS
  'Comunidad Autónoma espagnole (17 + 2 ciudades autónomas). Codes ISO 3166-2 ES. PV+NC = Régimen Foral (système fiscal indépendant via Hacienda Foral). CN = Canarias (IGIC au lieu d''IVA). CE+ML = Ceuta/Melilla (IPSI).';
COMMENT ON COLUMN public.business_profiles.es_company_number IS
  'NIF/CIF (entreprise : 1 lettre + 8 chiffres, A=SA, B=SL, etc.) ou NIF persona física (DNI/NIE).';
COMMENT ON COLUMN public.business_profiles.es_iva_regime IS
  'Régime IVA : general (défaut) / simplificado (forfait certaines activités) / recargo_equivalencia (commerce détail) / exencion (activités exonérées).';
COMMENT ON COLUMN public.business_profiles.es_iva_periodicity IS
  'Périodicité Modelo 303 : trimestral (défaut) ou mensual (CA > 6M€ ou inscrit au REDEME).';
COMMENT ON COLUMN public.business_profiles.es_redeme IS
  'Inscrit au REDEME (Registro de Devolución Mensual) → déclarations IVA mensuelles obligatoires.';
COMMENT ON COLUMN public.business_profiles.es_irpf_method IS
  'Méthode IRPF pour autónomos : directa (estimación directa, comptabilité réelle, défaut) ou objetiva (módulos, forfait par secteur d''activité).';

COMMENT ON COLUMN public.business_profiles.accounting_status IS
  'Statut compta. France : particulier / auto_entrepreneur / sasu / sas / sarl / eurl. Suisse : independant_ch / sarl_ch / sa_ch. Portugal : trabalhador_independente_pt / eni_pt / lda_unipessoal_pt / lda_pt / sa_pt. Belgique : independant_principal_be / independant_complementaire_be / srl_be / sa_be. Espagne : autonomo_es / slu_es / sl_es / sa_es. NULL = non configuré.';
