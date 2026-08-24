-- 20260825_autofacturation.sql
--
-- ON ÉMET LA FACTURE À LA PLACE DE L'AFFILIÉ.
--
-- Béné, 25 août 2026 : "je veux le même truc que systeme io : l'affilié
-- complète ses infos, son numéro de TVA et siren s'il a, ses
-- coordonnées, son mode paiement et tous les mois on génère sa facture
-- pour sa compta, il peut la télécharger et nous on peut le payer via
-- cette facture qu'on a générée pour lui."
--
-- NE PAS CONFONDRE LES DEUX FACTURES (elle l'a écrit elle même)
-- --------------------------------------------------------------
--   1. les factures de nos ACHETEURS : nous sommes le vendeur, elles
--      vivent dans le dépôt Tiquiz (série `TQ-`) et dans celui de
--      l'Atelier (`AQ-`) ;
--   2. CELLES CI : l'AFFILIÉ est le vendeur, nous sommes le client, et
--      nous les écrivons à sa place pour ne pas attendre les siennes.
--      Série `AFF-`.
--
-- Les deux ont l'air de se ressembler et n'ont PAS les mêmes règles de
-- TVA : elles vont dans des sens opposés. Sur une vente, le prix est TTC
-- et la TVA se calcule dedans. Ici la commission est nette de taxe, et
-- la TVA s'AJOUTE.
--
-- CE QUE LA LOI EXIGE (article 289 I-2 du CGI)
-- ---------------------------------------------
-- Un MANDAT DE FACTURATION accepté par le prestataire AVANT la première
-- facture, la mention « Autofacturation » sur la pièce (article 242
-- nonies A), et la possibilité pour lui de CONTESTER. Sans mandat, on
-- n'émet rien : écrire une facture au nom de quelqu'un sans son accord
-- n'est pas une facilité, c'est un faux.

-- ============================================================
-- 1. LE PROFIL FISCAL DE L'AFFILIÉ
-- ============================================================
--
-- Il s'ajoute aux coordonnées de versement (20260825_affiliate_payouts) :
-- les deux se remplissent sur le même écran, parce que ce sont les deux
-- moitiés de la même question ("comment je te paie, et sur quelle
-- pièce").

alter table public.affiliates
  -- 'entreprise' ou 'particulier'. C'est LUI qui le dit : un particulier
  -- n'a ni SIREN ni numéro de TVA, et lui en réclamer un serait un
  -- formulaire qu'il n'aura jamais fini.
  add column if not exists statut_fiscal text
    check (statut_fiscal in ('entreprise', 'particulier')),
  add column if not exists denomination text,
  add column if not exists adresse1 text,
  add column if not exists adresse2 text,
  add column if not exists code_postal text,
  add column if not exists ville text,
  -- ISO 3166-1 alpha-2. C'est lui qui decide du regime de TVA.
  add column if not exists pays text,
  add column if not exists siren text,
  add column if not exists tva_numero text,
  -- IL FACTURE LA TVA, OU PAS. Ce n'est PAS deductible de la presence
  -- d'un numero : un auto-entrepreneur en franchise en base a souvent un
  -- numero intracommunautaire pour ses achats europeens tout en ne
  -- facturant pas la TVA. Deviner ferait apparaitre 20 % sur sa facture,
  -- et c'est LUI qui devrait les reverser.
  add column if not exists assujetti_tva boolean not null default false,
  -- LE MANDAT. Sans lui, aucune piece n'est emise.
  add column if not exists mandat_accepte_le timestamptz,
  -- La version du texte accepte : un mandat reecrit se reaccepte.
  add column if not exists mandat_version text,
  add column if not exists profil_fiscal_maj_le timestamptz;

comment on column public.affiliates.mandat_accepte_le is
  'Mandat de facturation (art. 289 I-2 CGI). NULL = on n''emet aucune autofacture.';
comment on column public.affiliates.assujetti_tva is
  'Choix EXPLICITE. Ne jamais le deduire de la presence d''un numero de TVA.';

-- ============================================================
-- 2. LE COMPTEUR, ET POURQUOI PAS UNE SEQUENCE
-- ============================================================
--
-- Une sequence Postgres saute des numeros des qu'une transaction est
-- annulee, c'est meme sa raison d'etre. Une numerotation de factures
-- doit etre CHRONOLOGIQUE ET CONTINUE : un trou est exactement ce qu'un
-- controle cherche. On prend donc un verrou sur une ligne de compteur,
-- dans la meme transaction que l'insertion.
--
-- Meme mecanique que les factures de vente cote Tiquiz : deux endroits,
-- deux compteurs, une seule facon de faire.

create table if not exists public.autofacture_compteurs (
  serie    text primary key,
  dernier  integer not null default 0
);

-- ============================================================
-- 3. LES AUTOFACTURES ÉMISES
-- ============================================================

create table if not exists public.affiliate_factures (
  id             uuid primary key default gen_random_uuid(),

  -- "AFF-2026-0001"
  serie          text not null,
  rang           integer not null,
  numero         text not null unique,

  genre          text not null default 'facture' check (genre in ('facture', 'avoir')),
  avoir_de       uuid references public.affiliate_factures(id) on delete set null,

  sa             text not null references public.affiliates(sa) on update cascade,
  email_affilie  text not null,
  periode        text not null,

  -- LE FIL VERS LE VIREMENT. Le jour ou une affiliee dit "je n'ai pas
  -- ete payee", c'est cette colonne qui repond.
  payout_id      uuid references public.affiliate_payouts(id) on delete set null,
  commission_ids uuid[] not null default '{}',

  libelle        text not null,
  nombre_ventes  integer not null default 0,

  currency       text not null default 'EUR',
  -- La commission est NETTE DE TAXE : la TVA s'AJOUTE. C'est l'inverse
  -- des factures de vente.
  ht_cents       integer not null,
  tva_cents      integer not null,
  ttc_cents      integer not null,
  tva_taux_bp    integer not null,
  -- Les mentions legales, FIGEES avec la piece. Les regles changent, la
  -- facture emise ne change pas.
  mentions       text[] not null default '{}',

  -- L'IDENTITE RECOPIEE, prestataire ET client. C'est ce qui rend la
  -- piece opposable des annees apres, et ce qui fait qu'un demenagement
  -- ne reecrit pas l'historique.
  prestataire    jsonb not null default '{}'::jsonb,
  client         jsonb not null default '{}'::jsonb,

  a_verifier     text[] not null default '{}',
  emise_le       timestamptz not null default now()
);

-- L'IDEMPOTENCE : une affiliee, un lot, une piece. Sans cet index, un
-- lot rejoue emettrait une deuxieme facture avec un numero de plus.
create unique index if not exists affiliate_factures_lot_uidx
  on public.affiliate_factures (sa, payout_id, genre)
  where payout_id is not null;

create index if not exists affiliate_factures_sa_idx
  on public.affiliate_factures (sa, emise_le desc);
create index if not exists affiliate_factures_a_verifier_idx
  on public.affiliate_factures (emise_le desc)
  where array_length(a_verifier, 1) is not null;

alter table public.affiliate_factures enable row level security;
-- AUCUNE POLICY : une autofacture porte une adresse, un SIREN, un numero
-- de TVA et un montant. Seule la cle de service y accede, donc uniquement
-- nos routes serveur, apres verification de la session.

-- ============================================================
-- 4. ÉMETTRE, EN UNE SEULE TRANSACTION
-- ============================================================
--
-- Allouer le numero puis inserer en deux appels laisserait un trou dans
-- la numerotation des que le second echoue. Et la fonction NE LEVE JAMAIS
-- sur un doublon : elle rend la piece deja emise, pour qu'un lot rejoue
-- ne consomme pas un numero pour rien.

create or replace function public.emettre_autofacture(
  p_serie          text,
  p_genre          text,
  p_sa             text,
  p_email          text,
  p_periode        text,
  p_payout_id      uuid,
  p_commission_ids uuid[],
  p_libelle        text,
  p_nombre_ventes  integer,
  p_currency       text,
  p_ht_cents       integer,
  p_tva_cents      integer,
  p_ttc_cents      integer,
  p_tva_taux_bp    integer,
  p_mentions       text[],
  p_prestataire    jsonb,
  p_client         jsonb,
  p_a_verifier     text[],
  p_avoir_de       uuid
) returns public.affiliate_factures
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rang   integer;
  v_numero text;
  v_ligne  public.affiliate_factures;
begin
  if p_payout_id is not null then
    select * into v_ligne from public.affiliate_factures
     where sa = p_sa and payout_id = p_payout_id and genre = p_genre
     limit 1;
    if found then
      return v_ligne;
    end if;
  end if;

  -- LE BLOC EST UNE SOUS-TRANSACTION, ET C'EST TOUT L'INTERET.
  --
  -- Le SELECT ci-dessus ne suffit pas : deux appels simultanes pour le
  -- meme lot le passent tous les deux, allouent chacun un numero, et le
  -- second INSERT tombe sur l'index unique. Sans ce bloc, la fonction
  -- LEVE, donc le lot echoue, donc les virements attendent une piece
  -- comptable : exactement ce qu'on refuse.
  --
  -- L'exception ramene aussi le compteur en arriere (le bloc entier est
  -- annule), donc aucun numero n'est brule : la numerotation reste
  -- continue, et c'est un trou dans la numerotation qu'un controle
  -- fiscal cherche.
  begin
    insert into public.autofacture_compteurs (serie, dernier)
         values (p_serie, 0)
    on conflict (serie) do nothing;

    update public.autofacture_compteurs
       set dernier = dernier + 1
     where serie = p_serie
    returning dernier into v_rang;

    v_numero := p_serie || '-' || lpad(v_rang::text, 4, '0');

    insert into public.affiliate_factures (
      serie, rang, numero, genre, avoir_de, sa, email_affilie, periode,
      payout_id, commission_ids, libelle, nombre_ventes, currency,
      ht_cents, tva_cents, ttc_cents, tva_taux_bp, mentions,
      prestataire, client, a_verifier
    ) values (
      p_serie, v_rang, v_numero, p_genre, p_avoir_de, p_sa, p_email, p_periode,
      p_payout_id, coalesce(p_commission_ids, '{}'::uuid[]), p_libelle,
      coalesce(p_nombre_ventes, 0), coalesce(p_currency, 'EUR'),
      p_ht_cents, p_tva_cents, p_ttc_cents, p_tva_taux_bp,
      coalesce(p_mentions, '{}'::text[]),
      coalesce(p_prestataire, '{}'::jsonb), coalesce(p_client, '{}'::jsonb),
      coalesce(p_a_verifier, '{}'::text[])
    )
    returning * into v_ligne;
  exception
    when unique_violation then
      -- Quelqu'un d'autre l'a emise pendant qu'on la preparait. On rend
      -- LA SIENNE : une piece, un versement.
      select * into v_ligne from public.affiliate_factures
       where sa = p_sa and payout_id = p_payout_id and genre = p_genre
       limit 1;
      if not found then
        raise;
      end if;
  end;

  return v_ligne;
end;
$$;

revoke all on function public.emettre_autofacture(
  text, text, text, text, text, uuid, uuid[], text, integer, text,
  integer, integer, integer, integer, text[], jsonb, jsonb, text[], uuid
) from public, anon, authenticated;

notify pgrst, 'reload schema';
