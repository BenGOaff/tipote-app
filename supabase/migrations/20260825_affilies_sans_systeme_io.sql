-- 20260825_affilies_sans_systeme_io.sql
--
-- RECRUTER UN AFFILIÉ QUI N'A PAS DE COMPTE SYSTEME.IO.
--
-- Béné, 25 août 2026 : "on est censés avoir NOTRE système d'affiliation ?
-- Du coup pourquoi un type sans systeme io ne pourrait pas devenir affilié
-- chez nous ??"
--
-- Il ne pouvait pas, et ce n'était PAS la base qui l'empêchait :
-- `affiliates.sa` est une colonne `text`, elle accepte n'importe quoi.
-- C'était le formulaire d'inscription, qui exigeait un identifiant à la
-- forme Systeme.io. On fabrique donc le nôtre, à la même forme
-- (lib/affiliate/saFormat.ts), et cette colonne dit d'où il vient.
--
-- POURQUOI UNE COLONNE PLUTÔT QU'UNE DÉDUCTION SUR LA FORME : l'origine
-- change ce qu'on peut promettre à l'affilié. Une vente arrivée par un
-- ancien tunnel Systeme.io ne sera jamais attribuée à quelqu'un que
-- Systeme.io ne connaît pas, et l'Atelier tient son PROPRE registre
-- (profiles.sio_affiliate_id) où il n'existe pas non plus. L'admin doit
-- le voir. Deviner à la forme marcherait aujourd'hui et casserait le jour
-- où Systeme.io change la sienne.
--
-- Le défaut 'systeme_io' est la vérité pour TOUTES les lignes existantes :
-- jusqu'à aujourd'hui, on ne pouvait pas s'inscrire autrement.

alter table affiliates
  add column if not exists origin text not null default 'systeme_io';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'affiliates_origin_check'
  ) then
    alter table affiliates
      add constraint affiliates_origin_check
      check (origin in ('systeme_io', 'tipote'));
  end if;
end $$;

comment on column affiliates.origin is
  'systeme_io = le sa vient de Systeme.io. tipote = identifiant fabrique par nous (lib/affiliate/saFormat.ts), l''affilie n''a pas de compte Systeme.io.';

notify pgrst, 'reload schema';
