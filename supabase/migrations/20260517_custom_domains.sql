-- Custom domains pour les créateurs Tipote.
--
-- Flow : l'user pose un CNAME `mydomain.com → connect.tipote.com`
-- (ou un A record vers l'IP du VPS pour les domaines apex), Caddy
-- émet un certif Let's Encrypt en On-Demand TLS à la première
-- requête HTTPS, et la middleware Next.js valide la propriété avant
-- de servir le contenu.
--
-- Sécurité :
--   * Hostname unique global (case-insensitive) → un domaine ne peut
--     être réclamé que par un seul créateur ; empêche le hijack par
--     squat. Note : ce même index empêche aussi qu'un user Tipote
--     réclame un hostname déjà détenu côté Tiquiz (DBs séparées, donc
--     pas de contrainte cross-app au niveau SQL — la collision sera
--     bloquée à l'étape Caddy `ask` qui interroge les 2 apps).
--   * RLS user-bound côté create/update/delete + lecture publique
--     limitée aux rows `verified` (la middleware en a besoin pour
--     router, et la donnée exposée — hostname + user_id — est de
--     toute façon publique via DNS).
--   * Le endpoint Caddy /ask tourne sous service-role et bypass RLS.
--
-- Multi-projets : chaque projet a SES propres custom domains, isolés
-- comme s'il s'agissait de comptes séparés. project_id est NOT NULL
-- et les requêtes filtrent toujours par (user_id, project_id). Le
-- routing catch-all résout hostname → (user_id, project_id) puis
-- cherche le contenu publié dans CE projet uniquement — un domaine
-- du projet A ne sert jamais le quiz du projet B.
--
-- Status machine :
--   pending_dns  → ajout initial, DNS pas encore détecté
--   verified     → DNS résout vers notre IP, Caddy peut émettre le cert
--   failed       → la vérification DNS a échoué explicitement (mauvais
--                  enregistrement, NXDOMAIN, etc.) ; l'user peut
--                  re-vérifier après correction.

CREATE TABLE IF NOT EXISTS public.custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_dns'
    CHECK (status IN ('pending_dns', 'verified', 'failed')),
  dns_target TEXT NOT NULL DEFAULT 'connect.tipote.com',
  error_message TEXT,
  last_checked_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  ssl_issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS custom_domains_hostname_unique
  ON public.custom_domains (lower(hostname));

CREATE INDEX IF NOT EXISTS custom_domains_user_id_idx
  ON public.custom_domains (user_id);

CREATE INDEX IF NOT EXISTS custom_domains_project_id_idx
  ON public.custom_domains (project_id);

ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom domains" ON public.custom_domains
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public read of verified custom domains" ON public.custom_domains
  FOR SELECT
  USING (status = 'verified');

CREATE OR REPLACE FUNCTION public.custom_domains_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS custom_domains_updated_at ON public.custom_domains;
CREATE TRIGGER custom_domains_updated_at
  BEFORE UPDATE ON public.custom_domains
  FOR EACH ROW EXECUTE FUNCTION public.custom_domains_set_updated_at();

COMMENT ON TABLE public.custom_domains IS
  'Domaines personnalisés Tipote. Caddy on-demand TLS gate l''émission des certifs via /api/internal/caddy-ask en filtrant sur status=verified.';
