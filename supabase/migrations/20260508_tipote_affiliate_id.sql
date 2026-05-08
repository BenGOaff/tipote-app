-- Tipote affiliate ID — pour tracker les commissions sur les
-- redirections popquiz → tiquiz. Le footer du player public
-- pointe vers https://www.tipote.fr/part-tiquiz?sa=<id>.
--
-- Stocké sur business_profiles à côté de la clé SIO (même UX :
-- "tu connectes ton compte Systeme.io pour automatiser ET tu
-- ajoutes ton ID affilié pour toucher des commissions"). Si
-- un user multi-projets pose le même ID partout, c'est OK ;
-- s'il met des IDs différents par projet, on respecte aussi.

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS tipote_affiliate_id TEXT;

COMMENT ON COLUMN public.business_profiles.tipote_affiliate_id IS
  'Identifiant affilié Tipote (Systeme.io). Format : sa<32 hex>. Utilisé pour le footer "Cette vidéo vous est proposée via Tiquiz" sur les popquiz publics.';
