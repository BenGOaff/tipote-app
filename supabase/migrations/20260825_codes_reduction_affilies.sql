-- 20260825_codes_reduction_affilies.sql
--
-- UN CODE DE RÉDUCTION QUI NE MARCHE QUE SUR LE LIEN DE SON AFFILIÉ.
--
-- Béné, 25 août 2026 : "Codes de réduction : à prévoir pour que j'en
-- attribue un à un affilié si besoin. Ne sera valable que sur le lien de
-- l'affilié."
--
-- La deuxième phrase est ce qui rend le code sûr. Un code de réduction
-- finit toujours par sortir de la main de celui à qui on l'a donné (site
-- de bons plans, groupe Facebook, commentaire YouTube). Lié au lien de
-- son affilié, il n'a aucune valeur pour qui n'est pas passé par ce lien.
--
-- POURQUOI LA TABLE VIT ICI ET PAS DANS TIQUIZ : le registre des
-- affiliées est ici, et le code doit s'afficher à côté des commissions de
-- son affiliée, dans son espace et dans l'admin. Une donnée dans une
-- autre base est une donnée qu'on ne croisera jamais (22 août). Le bon de
-- commande de Tiquiz demande, par le même appel qui lui dit déjà à qui
-- appartient le lien : un seul aller-retour, pas deux.
--
-- CE QUE LA TABLE NE PORTE PAS, ET POURQUOI :
--   - pas de montant fixe, un POURCENTAGE. Nos paliers existent en
--     plusieurs devises : "10 €" sur un plan en dollars ne veut rien
--     dire, et convertir avec un taux inventé produit une remise fausse
--     qui a l'air juste.
--   - pas de compteur d'utilisations. Il faudrait l'incrémenter au moment
--     de l'encaissement, donc depuis le webhook de Tiquiz, donc par un
--     appel réseau qui peut échouer : un quota qui ne décrémente pas en
--     silence est pire que pas de quota. La date de fin et l'interrupteur
--     reprennent la main, et la liaison au lien borne déjà les dégâts.

create table if not exists affiliate_discount_codes (
  code text primary key,
  sa text not null references affiliates(sa) on delete cascade,
  percent_off int not null check (percent_off between 1 and 90),
  -- NULL = tous les produits. Un tableau vide vaut NULL côté lecture.
  produits text[],
  expires_at timestamptz,
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- L'affiliée voit SES codes, et l'admin les liste par affiliée.
create index if not exists idx_aff_discount_sa
  on affiliate_discount_codes (sa);

-- Le code est saisi par un acheteur : il arrive en majuscules normalisées
-- (lib/affiliate/codeReduction.ts), et la clé primaire suffit. L'index
-- ci-dessous protège quand meme d'un doublon a la casse pres, pose a la
-- main dans Studio.
create unique index if not exists idx_aff_discount_code_upper
  on affiliate_discount_codes (upper(code));

comment on table affiliate_discount_codes is
  'Codes de reduction attribues a un affilie. Un code ne s''applique QUE si l''acheteur est arrive par le lien de CET affilie (verifie dans /api/affiliate/code-reduction). Remise sur la premiere echeance uniquement.';

notify pgrst, 'reload schema';
