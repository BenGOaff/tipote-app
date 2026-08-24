// lib/affiliate/annulation.ts
//
// UNE VENTE REMBOURSÉE NE PAIE PERSONNE.
//
// -- LE TROU QUE CE FICHIER BOUCHE (audit du 26 août 2026) -------------
//
// `affiliate_commissions` porte une colonne `cancelled_at` depuis le
// 25 mai, et **aucune ligne de code ne l'écrivait**. Un remboursement
// fermait l'accès, arrêtait l'abonnement, émettait l'avoir... et
// laissait la commission mûrir tranquillement. Vingt et un jours plus
// tard elle entrait dans un lot, et l'argent partait.
//
// Tant que Systeme.io payait, ça ne coûtait rien : c'est eux qui
// arbitraient. Depuis le 25 août **c'est nous qui virons**, et un
// virement ne se reprend pas.
//
// Nos propres conditions le promettaient déjà (`lib/legal/affiliate.ts`,
// article Commissions) : "elles peuvent être annulées en cas de
// remboursement, d'impayé, de fraude". Le texte annonçait quelque chose
// que le code ne faisait pas, exactement comme les CGV et le bon de
// commande le 22 août.
//
// -- L'ATELIER SAVAIT DÉJÀ LE FAIRE, ET C'EST LA LEÇON -----------------
//
// `refundCommissionByOrder` existe dans le dépôt de l'Atelier depuis
// des mois. Elle n'était branchée que sur le remboursement SYSTEME.IO :
// le jour où l'Atelier a eu son propre bon de commande, personne ne l'a
// rebranchée. Une logique écrite pour un cas, pas portée sur l'autre :
// le défaut signature de ces dépôts.
//
// -- CE QUI NE SE RATTRAPE PAS SE DIT ----------------------------------
//
// Une commission DÉJÀ VERSÉE ne s'annule pas en base : l'argent est
// parti, et réécrire la ligne ferait mentir la facture d'autofacturation
// déjà remise à un comptable. On rend alors `trop-tard`, et l'appelant
// CRIE. C'est un cas pour un humain, pas pour une mise à jour SQL.

/** Ce qui fait tomber une commission. Le serveur dit la raison, jamais la phrase. */
export type MotifAnnulation =
  /** L'argent a été rendu au client. */
  | "remboursement"
  /** La banque a repris l'argent (chargeback / impayé). */
  | "impaye"
  /** Décision humaine : fraude, abus, rupture des conditions. */
  | "fraude";

/** Les statuts qu'une commission peut porter, tels que la base les écrit. */
export type StatutCommission =
  | "pending"
  | "approved"
  | "paid"
  | "cancelled"
  | "rejected";

export type DecisionAnnulation =
  /** On peut l'annuler : elle n'est pas encore payée. */
  | "annuler"
  /** Déjà annulée ou rejetée : rien à faire, et ce n'est pas une erreur. */
  | "deja-close"
  /** Déjà versée : on ne touche à rien, un humain doit regarder. */
  | "trop-tard";

/**
 * QUE FAIRE DE CETTE COMMISSION, sans jamais deviner.
 *
 * `payoutId` compte autant que le statut : une commission peut porter
 * `approved` et être déjà entrée dans un lot figé si le marquage a
 * échoué en route (le cas `commissions_non_marquees` que `figerLot`
 * signale). L'annuler alors la ferait disparaître d'un fichier SEPA
 * déjà déposé à la banque.
 */
export function decideAnnulation(args: {
  statut: string | null | undefined;
  payoutId: string | null | undefined;
}): DecisionAnnulation {
  const statut = String(args.statut ?? "").trim().toLowerCase();
  const dansUnLot = Boolean(String(args.payoutId ?? "").trim());

  if (statut === "cancelled" || statut === "rejected") return "deja-close";
  if (statut === "paid" || dansUnLot) return "trop-tard";
  return "annuler";
}

/**
 * Le résumé d'une annulation, tel que l'appelant le journalise.
 *
 * `trop_tard` n'est pas un échec technique : c'est une somme partie
 * qu'il faut récupérer autrement (compenser sur le lot suivant, ou
 * écrire à l'affilié). Elle doit donc être COMPTÉE, pas noyée.
 */
export interface ResultatAnnulation {
  annulees: number;
  dejaCloses: number;
  tropTard: number;
  /** Les montants, en centimes, des commissions déjà versées. */
  tropTardCents: number;
}

export function resultatVide(): ResultatAnnulation {
  return { annulees: 0, dejaCloses: 0, tropTard: 0, tropTardCents: 0 };
}
