-- 20260827_quiz_lead_affilie.sql (Tipote, jumeau de Tiquiz)
--
-- L'AFFILIÉ QUI A AMENÉ LE LEAD (demande Maurice, 27 août 2026).
--
-- Maurice met un quiz à disposition de ses affiliés. Il le DUPLIQUAIT
-- une fois par affilié, uniquement pour savoir qui lui amenait quel
-- contact : des statistiques éparpillées, et une correction à reporter
-- autant de fois qu'il a de partenaires.
--
-- Un seul quiz suffit dès que le lead porte sa provenance.
--
-- Trois colonnes et pas une, parce que les trois répondent à trois
-- questions différentes et qu'aucune ne se déduit des autres :
--   affiliate_sa    l'identifiant Systeme.io de l'affilié du vendeur ;
--   affiliate_ref   notre code public ;
--   affiliate_canal ce que l'affilié a écrit lui même (?c=youtube),
--                   la seule chose que le referrer ne peut PAS voir.

ALTER TABLE public.quiz_leads
  ADD COLUMN IF NOT EXISTS affiliate_sa TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_ref TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_canal TEXT;

CREATE INDEX IF NOT EXISTS quiz_leads_affiliate_idx
  ON public.quiz_leads (quiz_id, affiliate_ref, affiliate_sa);

NOTIFY pgrst, 'reload schema';
