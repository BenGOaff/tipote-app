-- supabase/migrations/20260831_affiliate_stats_honnetes.sql
--
-- LE TABLEAU DE BORD DE L'AFFILIÉ DISAIT UN CHIFFRE QU'IL NE TOUCHERA
-- JAMAIS.
--
-- Béné, 31 août 2026 : "je vais démarcher de très gros affiliés, je ne
-- peux pas me permettre de proposer un système instable."
--
-- -- CE QUE LA VUE COMPTAIT, ET QUI EST FAUX --------------------------
--
-- `affiliate_stats` sommait `commission_cents` sur TOUTES les lignes,
-- quel que soit leur statut. Depuis le 26 août, un remboursement ou un
-- impayé pose `status = 'cancelled'` (`lib/affiliate/annulationStore.ts`)
-- et la ligne restait donc comptée dans "Gains totaux". Un affilié
-- lisait 1 240 EUR, recevait 1 180 EUR, et rien à l'écran n'expliquait
-- l'écart. C'est exactement le genre de chose qui se voit au PREMIER
-- virement, et un gros affilié ne revient pas dessus.
--
-- Même faute sur `total_sales` : les badges de `BadgesCard` fêtaient
-- une vente remboursée.
--
-- -- ET UN TROU ENTRE LES DEUX AUTRES CHIFFRES ------------------------
--
-- L'écran affiche "Gains totaux / En attente / Déjà payé", et
-- "En attente" ne comptait que `pending`. Or une commission mûre passe
-- en `approved` à J+30 et n'est virée qu'entre le 10 et le 13 du mois :
-- pendant cette fenêtre, son argent n'était NI en attente NI payé. Il
-- disparaissait de deux compteurs sur trois, tout en restant dans le
-- total. La question qui suit est toujours la même, et elle est
-- légitime : "où est passé mon argent ?"
--
-- `pending_commission_cents` garde donc son sens strict (utile côté
-- admin), et `a_venir_commission_cents` porte ce que l'affilié attend
-- vraiment : ce qui est gagné et pas encore versé.
--
-- -- CE QUI EST ÉCARTÉ EST DIT, JAMAIS AVALÉ --------------------------
--
-- `cancelled_commission_cents` existe pour que l'écran puisse MONTRER
-- l'annulé au lieu de le faire disparaître. C'est la règle du 25 août
-- sur les lignes écartées d'un lot : une somme qui disparaît en silence
-- est une décision qu'on ne peut plus expliquer six mois plus tard, ni
-- à l'affilié, ni à un comptable.
--
-- Aucune colonne ajoutée, aucune donnée réécrite : c'est une VUE. Elle
-- se remplace, et rien d'autre ne bouge.

create or replace view affiliate_stats as
select
  a.sa,
  a.email,
  a.display_name,
  a.locale,
  a.status,
  coalesce(clicks.click_count, 0) as total_clicks,
  coalesce(convs.conversion_count, 0) as total_conversions,
  coalesce(comm.sales_count, 0) as total_sales,
  coalesce(comm.total_sale_cents, 0) as total_sale_cents,
  coalesce(comm.total_commission_cents, 0) as total_commission_cents,
  coalesce(comm.pending_commission_cents, 0) as pending_commission_cents,
  coalesce(comm.approved_commission_cents, 0) as approved_commission_cents,
  coalesce(comm.paid_commission_cents, 0) as paid_commission_cents,
  -- Gagné et pas encore versé : c'est CE chiffre que l'affilié attend.
  coalesce(comm.a_venir_commission_cents, 0) as a_venir_commission_cents,
  -- Annulé (remboursement, impayé, fraude). Affiché quand il n'est pas
  -- nul, jamais soustrait en silence.
  coalesce(comm.cancelled_commission_cents, 0) as cancelled_commission_cents
from affiliates a
left join (
  select sa, count(*) as click_count
  from affiliate_clicks
  group by sa
) clicks on clicks.sa = a.sa
left join (
  select sa, count(*) as conversion_count
  from affiliate_conversions
  group by sa
) convs on convs.sa = a.sa
left join (
  select
    sa,
    -- UNE VENTE ANNULÉE N'EST PAS UNE VENTE. Les badges la fêtaient.
    count(*) filter (where status not in ('cancelled', 'rejected')) as sales_count,
    coalesce(
      sum(sale_amount_cents) filter (where status not in ('cancelled', 'rejected')),
      0
    ) as total_sale_cents,
    -- LE TOTAL EST CE QUI RESTE ACQUIS, jamais ce qui a été annulé.
    coalesce(
      sum(commission_cents) filter (where status not in ('cancelled', 'rejected')),
      0
    ) as total_commission_cents,
    coalesce(sum(commission_cents) filter (where status = 'pending'), 0)
      as pending_commission_cents,
    coalesce(sum(commission_cents) filter (where status = 'approved'), 0)
      as approved_commission_cents,
    coalesce(sum(commission_cents) filter (where status = 'paid'), 0)
      as paid_commission_cents,
    coalesce(sum(commission_cents) filter (where status in ('pending', 'approved')), 0)
      as a_venir_commission_cents,
    coalesce(sum(commission_cents) filter (where status in ('cancelled', 'rejected')), 0)
      as cancelled_commission_cents
  from affiliate_commissions
  group by sa
) comm on comm.sa = a.sa;

notify pgrst, 'reload schema';
