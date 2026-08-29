-- 20260829_affiliate_sa_aliases.sql
--
-- UNE PERSONNE, PLUSIEURS IDENTIFIANTS SYSTEME.IO (Béné, 29 août 2026).
--
-- En important ses affiliés Systeme.io, une ligne a été refusée :
--
--   sa013476947331a3b65a708ef70cabd5809b547764
--   duplicate key value violates unique constraint "affiliates_email_key"
--
-- La contrainte porte sur l'EMAIL. Eric Legrigeois avait déjà une ligne,
-- créée le 30 mai, sous `sa015482041700065688e89f0e48925ec6c81def4e`.
-- Les DEUX identifiants ont la forme d'un identifiant Systeme.io (40
-- caractères hexadécimaux, quand le nôtre en fait 32) : ce ne sont pas
-- deux comptes chez nous, c'est une même personne que Systeme.io
-- désigne de deux façons.
--
-- CE QUE ÇA COÛTAIT : ses liens en circulation portent `sa0134…`, absent
-- du registre. Ses clics et ses contacts n'étaient attribués à personne,
-- et sa ligne à lui, sans code public, ne recevait rien non plus.
--
-- LA MAUVAISE SOLUTION SERAIT UNE DEUXIÈME LIGNE : deux lignes, ce sont
-- deux personnes à payer, deux versements, deux autofactures. La
-- contrainte d'unicité a eu raison de refuser.
--
-- LA BONNE EST UN ALIAS, exactement le mécanisme qui existe déjà pour
-- les codes publics (`affiliate_ref_aliases`, 19 août) : l'ancien
-- identifiant continue de DÉSIGNER son propriétaire, pour toujours.
--
-- Un identifiant aliassé ne peut pas être en même temps la clé d'une
-- ligne : la contrainte le dit, sinon un même `sa` désignerait deux
-- personnes selon le chemin de lecture emprunté.

create table if not exists public.affiliate_sa_aliases (
  -- L'identifiant tel qu'il circule dans les liens déjà publiés.
  sa_alias text primary key,
  -- La ligne qu'il désigne.
  sa text not null references public.affiliates(sa) on update cascade on delete cascade,
  -- D'où vient cet alias, pour qu'on puisse l'expliquer dans six mois.
  raison text,
  created_at timestamptz not null default now(),
  -- Un alias qui pointe sur lui même serait une boucle de lecture.
  constraint affiliate_sa_aliases_pas_soi_meme check (sa_alias <> sa)
);

create index if not exists affiliate_sa_aliases_sa_idx
  on public.affiliate_sa_aliases (sa);

comment on table public.affiliate_sa_aliases is
  'Anciens identifiants Systeme.io d''un affilie. Un lien deja publie qui porte l''un d''eux paie bien son proprietaire. Jamais une deuxieme ligne dans affiliates : ce serait une deuxieme personne a payer.';

alter table public.affiliate_sa_aliases enable row level security;

-- Aucune politique : seule la clé de service (le serveur) y touche.
-- Un navigateur n'a rien à lire ici, et un alias mal posé enverrait de
-- l'argent au mauvais destinataire.

notify pgrst, 'reload schema';
