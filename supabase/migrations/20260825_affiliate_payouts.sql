-- 20260825_affiliate_payouts.sql
--
-- PAYER LES AFFILIÉS : LE CYCLE QUI N'EXISTAIT PAS.
--
-- Béné, 25 août 2026 : "pour l'affiliation on doit proposer le choix aux
-- affiliés : Paypal ou virement bancaire. Ils doivent pouvoir indiquer
-- leur mail paypal OU leur rib pour un virement." Et la veille, sur la
-- façon de payer : export SEPA et virement à la main.
--
-- CE QUI N'EXISTAIT PAS
-- ---------------------
-- `affiliate_commissions` porte `pending / approved / paid / cancelled /
-- rejected` et une colonne `payout_id` depuis mai 2026. **Aucun code ne
-- faisait passer une commission d'un statut à l'autre, et aucune table
-- de versement n'existait.** Les statuts étaient décoratifs : tout se
-- passait dans Systeme.io, y compris les coordonnées de paiement.
--
-- UN LOT EST UNE PIÈCE, PAS UN CALCUL
-- ------------------------------------
-- Il FIGE les montants ET les coordonnées au moment où il est construit.
-- Recalculer le total à l'affichage donnerait un chiffre qui bouge quand
-- une commission est annulée après coup, alors qu'un virement parti ne
-- bouge pas. Et si l'affiliée change d'IBAN le lendemain, le fichier
-- déjà déposé à la banque ne doit pas changer.
--
-- C'est exactement la règle de la facture émise (24 août), transposée à
-- l'argent qui SORT.
--
-- L'IBAN EST CHIFFRÉ, ET IL NE RESSORT JAMAIS EN CLAIR
-- -----------------------------------------------------
-- C'est une donnée bancaire. Elle est chiffrée avec le même mécanisme
-- que les leads (`lib/piiCrypto.ts` : une clé par affiliée, elle même
-- protégée par `PII_MASTER_KEY`), donc même un accès direct à la base ne
-- montre que du chiffré. Les écrans n'affichent qu'un masque
-- (`FR14••••2606`) : une affiliée a besoin de RECONNAÎTRE le sien, pas
-- de le relire. Pour le changer, elle le ressaisit en entier.

-- ============================================================
-- 1. COMMENT CHAQUE AFFILIÉE VEUT ÊTRE PAYÉE
-- ============================================================
--
-- Les colonnes `paypal_email`, `iban_holder` et `iban_number` existent
-- depuis mai. Elles avaient été DÉBRANCHÉES en juin, parce qu'elles
-- faisaient croire à une configuration qui n'existait pas (drame Béné du
-- 8 juin : "arrête d'inventer n'importe quoi"). On les rebranche, avec
-- cette fois un cycle derrière.

alter table public.affiliates
  -- LE CHOIX EST EXPLICITE, JAMAIS DÉDUIT. Deviner "il a rempli un IBAN
  -- donc virement" marche jusqu'au jour où quelqu'un remplit les deux.
  add column if not exists payout_method text
    check (payout_method in ('paypal', 'virement')),
  -- L'IBAN CHIFFRÉ remplace `iban_number` en clair. L'ancienne colonne
  -- reste, vide : la supprimer ferait échouer toute route déployée en
  -- retard, et il n'y a rien dedans (la page était débranchée).
  add column if not exists iban_chiffre text,
  -- La clé de chiffrement de CETTE affiliée, elle même protégée par
  -- PII_MASTER_KEY. Une clé par personne : une fuite d'une ligne ne
  -- donne pas les autres.
  add column if not exists pii_dek text,
  add column if not exists bic text,
  -- Les 4 premiers et 4 derniers, en clair, pour l'affichage. C'est ce
  -- qu'on montre partout, y compris à elle.
  add column if not exists iban_masque text,
  add column if not exists coordonnees_maj_le timestamptz;

comment on column public.affiliates.iban_chiffre is
  'IBAN chiffre (AES-256-GCM, cle par affiliee). Ne JAMAIS renvoyer en clair a un client.';
comment on column public.affiliates.iban_number is
  'DEPRECIE depuis le 25 aout 2026 : remplace par iban_chiffre. Laissee vide.';

-- ============================================================
-- 2. LES LOTS DE VERSEMENT
-- ============================================================

create table if not exists public.affiliate_payouts (
  id           uuid primary key default gen_random_uuid(),

  -- "2026-08". Un lot par mois, et l'unicité l'impose : construire deux
  -- fois le lot d'août paierait deux fois.
  periode      text not null unique,

  statut       text not null default 'prepare'
               check (statut in ('prepare', 'exporte', 'paye', 'annule')),

  -- CE QUI EST FIGÉ. Une ligne par affiliée, avec ses coordonnées
  -- RECOPIÉES et la liste des commissions qu'elle solde.
  lignes       jsonb not null default '[]'::jsonb,
  -- Celles qu'on n'a pas pu payer, et POURQUOI. Elles ne disparaissent
  -- jamais en silence : elles ont gagné cet argent, quelqu'un doit leur
  -- écrire (regle du `ok: false`, 3 aout).
  ecartees     jsonb not null default '[]'::jsonb,

  total_cents  integer not null default 0,
  total_paypal_cents integer not null default 0,
  total_virement_cents integer not null default 0,
  currency     text not null default 'EUR',

  -- Qui a fait quoi, et quand. Le jour où une affiliée dit "je n'ai pas
  -- été payée", c'est cette ligne qui répond.
  prepare_par  text,
  prepare_le   timestamptz not null default now(),
  exporte_le   timestamptz,
  paye_le      timestamptz,
  paye_par     text,
  note         text
);

create index if not exists affiliate_payouts_statut_idx
  on public.affiliate_payouts (statut, prepare_le desc);

alter table public.affiliate_payouts enable row level security;
-- AUCUNE POLICY : un lot porte des montants et des coordonnées
-- bancaires. Seule la cle de service y accede, donc uniquement nos
-- routes serveur, apres verification que l'appelant est admin.

-- Le fil entre une commission et le lot qui l'a payee. La colonne
-- existait deja sans contrainte : on la relie, pour qu'un lot supprime
-- ne laisse pas des commissions pointant dans le vide.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'affiliate_commissions_payout_fk'
  ) then
    alter table public.affiliate_commissions
      add constraint affiliate_commissions_payout_fk
      foreign key (payout_id) references public.affiliate_payouts(id) on delete set null;
  end if;
end $$;

create index if not exists affiliate_commissions_payout_idx
  on public.affiliate_commissions (payout_id)
  where payout_id is not null;

-- Lire "ce qui attend d'etre paye" sans parcourir toute la table.
create index if not exists affiliate_commissions_a_verser_idx
  on public.affiliate_commissions (status, sale_at)
  where payout_id is null;

notify pgrst, 'reload schema';
