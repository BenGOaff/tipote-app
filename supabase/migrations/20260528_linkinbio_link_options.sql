-- 20260528_linkinbio_link_options.sql
--
-- Options par bouton sur les pages Link in Bio :
--   - open_in_new_tab : si true (défaut), target="_blank" ; sinon
--     ouvre dans le même onglet (utile si le créateur veut garder
--     l'user sur sa page).
--   - color : override couleur du bouton (hex #RRGGBB). NULL = on
--     suit le thème global de la page.
--
-- Eric (Tipote user) a remonté ces deux besoins le 23/05. Cf.
-- docs/TODO-linkinbio-editor.md.

alter table public.linkinbio_links
  add column if not exists open_in_new_tab boolean not null default true,
  add column if not exists color text;

comment on column public.linkinbio_links.open_in_new_tab is
  'Si true, le bouton ouvre dans un nouvel onglet (target="_blank"). '
  'Défaut true. Mettre false pour garder l''utilisateur sur la page.';

comment on column public.linkinbio_links.color is
  'Override couleur du bouton au format #RRGGBB. NULL = utilise la '
  'couleur du thème global.';

notify pgrst, 'reload schema';
