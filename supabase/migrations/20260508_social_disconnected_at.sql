-- Bug Béné 2026-05-08 : un user ne sait pas quand son compte social
-- est déconnecté ni quand un post programmé n'a finalement pas été
-- publié. Ce sont deux failles différentes :
--
--   1) Le cron email-alerts/route.ts ne checke QUE `token_expires_at <
--      NOW()`. Si LinkedIn/Facebook révoque le token avant la date
--      d'expiration (changement de mot de passe, désautorisation app
--      depuis le dashboard SIO/LinkedIn), la date est encore future
--      donc aucun email n'est envoyé.
--
--   2) Quand un post programmé bascule en `status='failed'` (après 5
--      tentatives dans publish-callback), aucun email n'est envoyé.
--      L'user découvre par hasard.
--
-- Cette migration ajoute juste l'état persistant nécessaire pour
-- dédupliquer et tracer la déconnexion. Le code applicatif (helper
-- + appels) vit dans lib/social/notifications.ts.

ALTER TABLE public.social_connections
  ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;

COMMENT ON COLUMN public.social_connections.disconnected_at IS
  'Timestamp de détection de déconnexion (token révoqué/invalidé). NULL = compte considéré comme actif. Reset à NULL lors de la reconnexion OAuth. Sert à éviter les emails redondants et à afficher un badge "Reconnect" dans la UI.';

-- Index pour les crons qui scannent les connexions déconnectées
CREATE INDEX IF NOT EXISTS social_connections_disconnected_idx
  ON public.social_connections(disconnected_at)
  WHERE disconnected_at IS NOT NULL;
