-- Module Compta — phase 1o : portage Portugal
--
-- 5 nouveaux statuts pour les users portugais :
--   • trabalhador_independente_pt — Trabalhador independente / freelancer
--     (régime simplificado par défaut, contabilidade organizada sur option)
--   • eni_pt — Empresário em Nome Individual (entreprise individuelle)
--   • lda_unipessoal_pt — Sociedade Unipessoal por Quotas (≈ EURL)
--   • lda_pt — Sociedade por Quotas (≈ SARL)
--   • sa_pt — Sociedade Anónima (≈ SAS)
--
-- IVA portugais :
--   - Taux normal 23% (continente), 22% (Madeira), 16% (Açores)
--   - Taux intermédiaire 13% (continente)
--   - Taux réduit 6% (continente), 5% (Madeira), 4% (Açores)
--   - Seuil franchise (regime de isenção art. 53 CIVA) : 15'000 EUR
--   - Périodicité : trimestrielle (CA < 650k €) / mensuelle (> 650k €)
--   - Date butoir : jour 25 du 2e mois suivant la période
--
-- IRS / IRC :
--   - IRS (personne physique) : Modelo 3 entre 1er avril et 30 juin N+1
--   - IRC (personne morale) : Modelo 22, taux 21% (+ derrama municipal),
--     dépôt 31 mai N+1, acomptes (pagamento por conta) juillet/septembre/décembre
--
-- Segurança Social :
--   - Indépendants : 21,4% du revenu pertinente, paiement mensuel le 20
--   - 1ère année : exonération possible si nouvelle activité
--
-- E-fatura : comunicação mensuelle des factures émises à l'AT, jour 5
-- du mois suivant. Tipote rappelle juste l'échéance — la communication
-- elle-même se fait via le portail Finanças (e-fatura.pt).

ALTER TABLE public.business_profiles
  -- NIF portugais (Número de Identificação Fiscal, 9 chiffres)
  ADD COLUMN IF NOT EXISTS pt_nif TEXT,
  -- Région : 'continente' / 'madeira' / 'acores'. Affecte les taux IVA
  -- (Madère + Açores ont des taux réduits).
  ADD COLUMN IF NOT EXISTS pt_region TEXT,
  -- Régime IVA : 'isento' (sous le seuil 15k €) / 'normal' (assujetti)
  ADD COLUMN IF NOT EXISTS pt_iva_isento BOOLEAN NOT NULL DEFAULT FALSE,
  -- Périodicité IVA : 'mensal' / 'trimestral' (selon CA)
  ADD COLUMN IF NOT EXISTS pt_iva_periodicity TEXT,
  -- Régime fiscal pour les indépendants : 'simplificado' (forfaitaire)
  -- ou 'organizada' (contabilidade organizada, comptabilité réelle)
  ADD COLUMN IF NOT EXISTS pt_tax_regime TEXT,
  -- Date de début d'activité (déclarée auprès de Finanças)
  ADD COLUMN IF NOT EXISTS pt_started_at DATE;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_pt_region_check
    CHECK (
      pt_region IS NULL
      OR pt_region IN ('continente', 'madeira', 'acores')
    ),
  ADD CONSTRAINT business_profiles_pt_iva_periodicity_check
    CHECK (
      pt_iva_periodicity IS NULL
      OR pt_iva_periodicity IN ('mensal', 'trimestral')
    ),
  ADD CONSTRAINT business_profiles_pt_tax_regime_check
    CHECK (
      pt_tax_regime IS NULL
      OR pt_tax_regime IN ('simplificado', 'organizada')
    );

COMMENT ON COLUMN public.business_profiles.pt_nif IS
  'NIF portugais (Número de Identificação Fiscal, 9 chiffres). Obligatoire pour toute activité économique au Portugal — l''AT (Autoridade Tributária) l''utilise comme identifiant unique.';
COMMENT ON COLUMN public.business_profiles.pt_region IS
  'Région du Portugal : continente / madeira / acores. Affecte les taux IVA (Madère + Açores ont des taux réduits par rapport au continent).';
COMMENT ON COLUMN public.business_profiles.pt_iva_isento IS
  'IVA en regime de isenção (art. 53 CIVA) — exonération si CA < 15''000 EUR/an. Si false, l''user collecte la TVA et dépose des déclarations.';
COMMENT ON COLUMN public.business_profiles.pt_iva_periodicity IS
  'Périodicité du décompte IVA : mensal (CA > 650k €) ou trimestral (CA < 650k €). Date butoir : jour 25 du 2e mois suivant la période.';
COMMENT ON COLUMN public.business_profiles.pt_tax_regime IS
  'Régime fiscal indépendant : simplificado (forfaitaire, défaut) ou organizada (contabilidade organizada, comptabilité réelle).';

COMMENT ON COLUMN public.business_profiles.accounting_status IS
  'Statut compta. Valeurs France : particulier / auto_entrepreneur / sasu / sas / sarl / eurl. Valeurs Suisse : independant_ch / sarl_ch / sa_ch. Valeurs Portugal : trabalhador_independente_pt / eni_pt / lda_unipessoal_pt / lda_pt / sa_pt. NULL = non configuré.';
