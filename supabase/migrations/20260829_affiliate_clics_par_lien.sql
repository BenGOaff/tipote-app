-- 20260829_affiliate_clics_par_lien.sql
--
-- LE CLIC SE COMPTE LÀ OÙ IL EST ÉCRIT (Béné, 29 août 2026).
--
-- "Mon dashboard dans affiliate me compte 0 clics alors que j'ai shooté
-- mon lien hier et que sur pilotage il me compte 6 inscrits. Donc lequel
-- est juste ? Il me faut un truc redoutablement fiable, pas question de
-- foirer avec mes affiliés."
--
-- Pilotage était juste. L'écran de l'affiliée sommait
-- `affiliate_links.clicks_count`, une colonne que RIEN n'incrémente
-- (aucun code, aucun trigger), sur des lignes qui n'existent que pour
-- les liens passés par le redirecteur `/go/`. Le lien distribué par
-- Promouvoir est `tiquiz.fr/?ref=<code>` : son clic est enregistré avec
-- `link_id = null`, donc il n'apparaissait dans aucune ligne.
--
-- Cette fonction rend le compte EXACT, par lien, avec la ligne des
-- clics sans lien nommé (`link_id is null`). Deux raisons de la
-- préférer à une lecture de lignes côté application :
--
--   1. AUCUN PLAFOND. Une lecture paginée obligerait à borner, et un
--      total borné est un total faux le jour où l'affiliée décolle.
--      C'est exactement ce qu'on veut ne plus jamais avoir.
--   2. LES VISITEURS UNIQUES. `count(distinct ip_hash)` ne se calcule
--      pas sans lire toutes les lignes. Une empreinte est une
--      APPROXIMATION (une famille partage une adresse, un téléphone en
--      4G en change en marchant) : l'écran dit "visiteurs", jamais
--      "personnes".
--
-- Un clic SANS empreinte compte pour un visiteur à lui seul : les
-- fondre en un sous-estimerait justement les clics qu'on connaît le
-- moins bien. C'est la règle déjà écrite dans `provenanceClics.ts`.

create or replace function public.affiliate_clics_par_lien(p_sa text)
returns table (
  link_id uuid,
  clics bigint,
  visiteurs bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.link_id,
    count(*) as clics,
    count(distinct c.ip_hash) + count(*) filter (where c.ip_hash is null) as visiteurs
  from public.affiliate_clicks c
  where c.sa = p_sa
  group by c.link_id;
$$;

comment on function public.affiliate_clics_par_lien(text) is
  'Clics et visiteurs par lien pour un affilié. La ligne link_id null porte les clics du lien de base (?ref= sans passage par /go/).';

-- La colonne morte est NOMMÉE comme telle, pour que personne ne la
-- rebranche par erreur. On ne la supprime pas : une colonne retirée
-- casse toute écriture qui la mentionnerait encore, et il n'y a rien à
-- gagner à la faire disparaître.
comment on column public.affiliate_links.clicks_count is
  'NE PAS LIRE : compteur jamais incrémenté (ni code, ni trigger). Les clics se comptent dans affiliate_clicks, cf. affiliate_clics_par_lien().';

notify pgrst, 'reload schema';
