-- Contenus affiliés gérés par l'admin (Béné) — autonomie totale sans toucher
-- au code. Table générique : `kind` distingue article / email / post / visual,
-- `meta` (jsonb) porte les champs spécifiques (ex. post : networks, hook…).
-- On démarre par les ARTICLES ; emails/posts/visuels migreront ici ensuite.
--
-- Accès : service role uniquement (API admin gatée par isAdminEmail + lecture
-- serveur des contenus publiés). RLS activé, aucune policy publique.

CREATE TABLE IF NOT EXISTS public.affiliate_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('article', 'email', 'post', 'visual')),
  locale text NOT NULL DEFAULT 'fr',
  title text,
  body text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_contents_kind_locale
  ON public.affiliate_contents (kind, locale, published, sort_order);

ALTER TABLE public.affiliate_contents ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
