ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS address_form TEXT DEFAULT 'tu';
-- Forme d'adresse préférée : 'tu' (tutoiement) ou 'vous' (vouvoiement)
