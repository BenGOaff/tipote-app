-- 20260826_commission_regle_par.sql
--
-- QUI PAIE CETTE COMMISSION : NOUS, OU SYSTEME.IO ?
--
-- Béné, 26 août 2026 : "ce qui est vendu dans systeme io est payé sur
-- systeme io mais doit être tracké pour un dashboard affilié fiable
-- pour l'affilié et pour moi, et ce qui passe sur nos nouvelles pages
-- bah c'est ok on peut tout tracker proprement ?"
--
-- C'est exactement le bon modèle, et le code ne le connaissait pas.
--
-- -- LE DOUBLE PAIEMENT QUE ÇA FERME ------------------------------------
--
-- `affiliate_commissions` mélange DEUX populations depuis le début :
--
--   * les ventes passées par les tunnels Systeme.io, enregistrées chez
--     nous POUR L'AFFICHAGE (le tableau de bord de l'affilié doit être
--     complet), mais versées par EUX ;
--   * les ventes prises sur notre propre bon de commande, que nous
--     versons nous mêmes depuis le 25 août.
--
-- `preparerLot` prenait TOUT ce qui portait `status = 'approved'`. Le
-- premier lot aurait donc viré une deuxième fois les commissions que
-- Systeme.io a déjà payées. Aucun lot n'a encore tourné (la table date
-- d'hier et n'est pas appliquée en prod) : c'est pris avant le premier
-- virement, pas après.
--
-- -- POURQUOI UNE COLONNE ET PAS UNE DÉDUCTION ---------------------------
--
-- On POURRAIT le deviner : nos ventes portent un `sio_order_id` préfixé
-- (`stripe:...`), celles de Systeme.io portent leur numéro de commande
-- nu. Mais deviner la mécanique au lieu de la porter est exactement le
-- défaut qui a coûté la fausse alerte de Véronique (1er août) et les
-- deux bases de commission divergentes (26 août au matin). Le jour où
-- un troisième encaisseur arrive, la déduction se tait et l'argent part.
--
-- La colonne est donc écrite À LA CRÉATION, par un paramètre obligatoire
-- de `attributeSale`. Le compilateur refuse un appelant qui se tait.

alter table public.affiliate_commissions
  add column if not exists regle_par text;

-- Le REMPLISSAGE DE L'HISTORIQUE, et c'est la seule fois où on déduit.
--
-- Ces lignes existent déjà, personne ne peut plus leur demander d'où
-- elles viennent. Le préfixe est le seul signal disponible, et il est
-- fiable : `commissionnerVente` écrit `stripe:<ref>` depuis le premier
-- jour de notre bon de commande, et Systeme.io n'a jamais produit un
-- numéro de commande commençant par `stripe:`.
update public.affiliate_commissions
   set regle_par = case
         when sio_order_id like 'stripe:%' then 'nous'
         when sio_order_id like 'paypal:%' then 'nous'
         else 'systeme_io'
       end
 where regle_par is null;

-- Le DÉFAUT est `systeme_io`, et il est CONSERVATEUR.
--
-- Une ligne écrite par un appelant qu'on aurait oublié de mettre à jour
-- ne partira PAS dans un lot : elle s'affichera comme versée par eux, ce
-- qui se corrige d'un UPDATE. L'inverse partirait en virement, et un
-- virement ne se reprend pas.
alter table public.affiliate_commissions
  alter column regle_par set default 'systeme_io';

alter table public.affiliate_commissions
  drop constraint if exists affiliate_commissions_regle_par_check;
alter table public.affiliate_commissions
  add constraint affiliate_commissions_regle_par_check
  check (regle_par in ('nous', 'systeme_io'));

-- Le lot ne lit QUE `regle_par = 'nous'` : l'index sert cette requête là.
create index if not exists affiliate_commissions_a_verser_idx
  on public.affiliate_commissions (regle_par, status)
  where payout_id is null;

notify pgrst, 'reload schema';
