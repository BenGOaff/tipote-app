-- 20260612_pod_autolike.sql (Tipote)
--
-- Auto-like du pod à la publication via Tipote (Béné 12 juin 2026).
--
-- Principe : quand un membre publie sur LinkedIn DEPUIS TIPOTE (flux
-- /api/social/publish), on connaît l'URN immédiatement -> fan-out
-- instantané vers les pod-mates, et leurs extensions likent
-- AUTOMATIQUEMENT (sans validation manuelle) dès qu'un onglet LinkedIn
-- est ouvert, dans le respect du throttle anti-ban existant
-- (12 actions/h max, délais humains, pause auto sur signaux LinkedIn)
-- + cap quotidien d'auto-likes côté extension.
--
-- Les posts détectés par l'extension (publication manuelle sur
-- LinkedIn) gardent le comportement actuel : like envoyé au moment où
-- le membre valide son commentaire en 1 clic.

-- Origine du post : 'extension' (détection DOM/Voyager, historique) ou
-- 'tipote' (publié via /api/social/publish, URN connu à la source).
alter table public.pod_posts
  add column if not exists source text not null default 'extension';

-- Tâche éligible à l'auto-like (figé au fan-out : post publié via
-- Tipote ET membre opt-in à ce moment-là).
alter table public.pod_engagement_tasks
  add column if not exists auto_like boolean not null default false;

-- Opt-out individuel : un membre peut couper les likes automatiques
-- (il garde les tâches classiques like+commentaire 1-click).
alter table public.pod_linkedin_profiles
  add column if not exists auto_like_enabled boolean not null default true;

comment on column public.pod_engagement_tasks.auto_like is
'true = l''extension du membre like ce post automatiquement (post publie via Tipote + membre opt-in au moment du fan-out).';

-- ============================================================================
NOTIFY pgrst, 'reload schema';
-- ============================================================================
