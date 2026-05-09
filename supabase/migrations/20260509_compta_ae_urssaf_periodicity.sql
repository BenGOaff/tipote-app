-- Module Compta — phase 1i : périodicité de déclaration URSSAF AE
--
-- Pour calculer le calendrier fiscal d'un auto-entrepreneur, on a
-- besoin de savoir s'il déclare son CA tous les mois (mensuelle)
-- ou tous les trimestres (trimestrielle, défaut le plus courant).
--
-- Ce choix est posé à l'inscription URSSAF puis modifiable une fois
-- par an. Tipote ne déclare pas pour l'user — on stocke juste la
-- périodicité pour afficher les bonnes échéances dans le calendrier.

ALTER TABLE public.business_profiles
  -- 'mensuelle' | 'trimestrielle' (défaut)
  ADD COLUMN IF NOT EXISTS ae_urssaf_periodicity TEXT;

ALTER TABLE public.business_profiles
  ADD CONSTRAINT business_profiles_ae_urssaf_periodicity_check
    CHECK (
      ae_urssaf_periodicity IS NULL
      OR ae_urssaf_periodicity IN ('mensuelle', 'trimestrielle')
    );

COMMENT ON COLUMN public.business_profiles.ae_urssaf_periodicity IS
  'Auto-entrepreneur : périodicité de déclaration URSSAF (mensuelle ou trimestrielle). Détermine les dates butoir affichées dans le calendrier fiscal Compta.';
