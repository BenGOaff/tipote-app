// lib/affiliate/versement.ts
//
// LE CYCLE DE VERSEMENT : QUI EST PAYÉ, COMBIEN, ET QUAND.
//
// Béné, 25 août 2026, sur "comment tu veux les payer" : export SEPA et
// virement à la main. Et : "on doit proposer le choix aux affiliés :
// Paypal ou virement bancaire."
//
// -- CE QUI N'EXISTAIT PAS, ET QUI RENDAIT LES STATUTS DÉCORATIFS ------
//
// `affiliate_commissions` porte `pending / approved / paid / cancelled /
// rejected` et une colonne `payout_id` depuis mai. **Aucun code ne
// faisait passer une commission d'un statut à l'autre**, et aucune table
// de versement n'existait. Tout se passait chez Systeme.io.
//
// -- APPROUVER N'EST PAS PAYER, ET C'EST TOUT L'INTÉRÊT ----------------
//
// Une commission naît `pending`. Elle devient `approved` quand le délai
// de rétractation est passé ET que la vente n'a pas été remboursée :
// c'est le moment où l'argent est acquis. Elle devient `paid` quand un
// LOT la prend, et un lot est une PIÈCE : il fige les montants.
//
// Recalculer le total d'un lot à l'affichage donnerait un chiffre qui
// bouge quand une commission est annulée après coup, alors qu'un virement
// parti ne bouge pas. C'est le même défaut que la facture émise qui
// lirait l'adresse courante.
//
// -- TOUT EST PARAMÈTRE, RIEN N'EST LU À L'INTÉRIEUR -------------------
//
// `maintenant` et `delaiJours` sont passés. Un test qui dépend de
// l'horloge clignote, et un test qui clignote est pire que pas de test
// (1er août). Le délai est un réglage business, pas une constante de code
// enfouie dans une condition.

import type { Coordonnees, MethodeVersement } from "@/lib/affiliate/coordonnees";

/**
 * LE DÉLAI DE RÉTRACTATION, EN JOURS.
 *
 * 14 jours légaux pour un achat en ligne, plus une marge : un
 * remboursement demandé le 14e jour peut n'être traité que le 16e, et
 * une commission déjà virée ne se reprend pas. Béné vire entre le 10 et
 * le 13 du mois, ce qui laisse la marge de toute façon.
 */
export const DELAI_RETRACTATION_JOURS = 21;

/**
 * LE MONTANT MINIMUM D'UN VERSEMENT, EN CENTIMES.
 *
 * En dessous, la commission reste `approved` et attend le lot suivant :
 * un virement de 1,20 € coûte plus cher en temps qu'il ne rapporte, et
 * une affiliée préfère recevoir 30 € une fois que 3 € dix fois. Ce n'est
 * pas de l'argent perdu : il est acquis, il attend.
 */
export const MONTANT_MINIMUM_CENTS = 2000;

/** Une commission, réduite à ce qui décide. */
export interface CommissionAVerser {
  id: string;
  sa: string;
  status: string;
  commission_cents: number;
  currency?: string | null;
  sale_at: string;
  /** Renseigné = la vente a été remboursée, la commission ne l'est plus. */
  cancelled_at?: string | null;
  payout_id?: string | null;
}

/**
 * Cette commission peut-elle passer en `approved` ?
 *
 * `false` n'est pas un refus définitif : c'est "pas encore". La seule
 * sortie définitive est `cancelled`, posée quand la vente est remboursée.
 */
export function commissionApprouvable(
  c: CommissionAVerser,
  maintenant: number,
  delaiJours: number = DELAI_RETRACTATION_JOURS,
): boolean {
  if (String(c.status ?? "").trim().toLowerCase() !== "pending") return false;
  if (c.cancelled_at) return false;
  if (!Number.isFinite(c.commission_cents) || c.commission_cents <= 0) return false;
  const vendue = Date.parse(c.sale_at);
  if (!Number.isFinite(vendue)) return false;
  return maintenant - vendue >= delaiJours * 24 * 60 * 60 * 1000;
}

/** Ce qu'on sait d'une affiliée au moment de construire le lot. */
export interface AffilieePayable {
  sa: string;
  email: string;
  displayName?: string | null;
  /** Ce qu'elle a renseigné, déjà normalisé et validé. */
  coordonnees: Coordonnees;
  /** `false` = ses coordonnées sont incomplètes ou fausses. */
  payable: boolean;
}

/**
 * UNE LIGNE DU LOT, ET ELLE EST FIGÉE.
 *
 * Elle RECOPIE les coordonnées au moment où le lot est construit. Si
 * l'affiliée change d'IBAN le lendemain, le fichier déjà produit ne doit
 * pas changer : il décrit un virement qu'on a déposé à la banque. Lire
 * les coordonnées COURANTES à l'affichage donnerait un écran qui ne
 * correspond plus à ce qui est parti.
 *
 * C'est exactement la règle de la facture émise, transposée à l'argent
 * qui sort.
 */
export interface LigneLot {
  sa: string;
  email: string;
  displayName: string | null;
  methode: MethodeVersement;
  /** Recopié : voir ci-dessus. Renseigné selon la méthode, jamais les deux. */
  iban: string | null;
  bic: string | null;
  paypalEmail: string | null;
  montantCents: number;
  commissionIds: string[];
}

export type RaisonEcartee =
  /** Elle n'a pas encore dit comment être payée, ou ses infos sont fausses. */
  | "coordonnees"
  /** Sous le minimum : acquis, mais reporté au lot suivant. */
  | "sous-le-minimum"
  /** On ne connaît pas cette affiliée : ça ne doit jamais arriver en silence. */
  | "affiliee-inconnue";

export interface Ecartee {
  sa: string;
  raison: RaisonEcartee;
  montantCents: number;
  commissionIds: string[];
}

export interface Lot {
  lignes: LigneLot[];
  ecartees: Ecartee[];
  totalCents: number;
  /** Le total par méthode : deux fichiers différents à produire. */
  totalParMethode: Record<MethodeVersement, number>;
}

/**
 * CONSTRUIT LE LOT DU MOIS.
 *
 * Une ligne par affiliée, jamais une par commission : on fait UN virement
 * à quelqu'un, pas douze. Les identifiants des commissions restent
 * attachés pour qu'on sache exactement ce que ce virement a soldé, et
 * pour que le lot puisse les marquer.
 *
 * **CE QUI EST ÉCARTÉ EST DIT, JAMAIS AVALÉ.** Une affiliée sans
 * coordonnées ne doit pas disparaître du lot en silence : elle a gagné
 * cet argent, quelqu'un doit lui écrire. C'est la règle du `ok: false`
 * du 3 août : un échec silencieux coûte plus cher que le problème.
 */
export function construireLot(
  commissions: readonly CommissionAVerser[],
  affiliees: readonly AffilieePayable[],
  minimumCents: number = MONTANT_MINIMUM_CENTS,
): Lot {
  const parSa = new Map<string, AffilieePayable>();
  for (const a of affiliees) parSa.set(a.sa, a);

  const cumul = new Map<string, { montant: number; ids: string[] }>();
  for (const c of commissions) {
    // On ne prend QUE les approuvées, et QUE celles qu'aucun lot n'a
    // déjà prises. Sans le second test, un lot construit deux fois
    // paierait deux fois.
    if (String(c.status ?? "").trim().toLowerCase() !== "approved") continue;
    if (c.payout_id) continue;
    if (!Number.isFinite(c.commission_cents) || c.commission_cents <= 0) continue;
    const entree = cumul.get(c.sa) ?? { montant: 0, ids: [] };
    entree.montant += Math.round(c.commission_cents);
    entree.ids.push(c.id);
    cumul.set(c.sa, entree);
  }

  const lignes: LigneLot[] = [];
  const ecartees: Ecartee[] = [];

  for (const [sa, { montant, ids }] of cumul) {
    const aff = parSa.get(sa);
    if (!aff) {
      ecartees.push({ sa, raison: "affiliee-inconnue", montantCents: montant, commissionIds: ids });
      continue;
    }
    const methode = aff.coordonnees.methode;
    if (!aff.payable || !methode) {
      ecartees.push({ sa, raison: "coordonnees", montantCents: montant, commissionIds: ids });
      continue;
    }
    if (montant < minimumCents) {
      ecartees.push({ sa, raison: "sous-le-minimum", montantCents: montant, commissionIds: ids });
      continue;
    }
    lignes.push({
      sa,
      email: aff.email,
      displayName: aff.displayName ?? null,
      methode,
      // Seulement ce que la méthode utilise : un IBAN recopié dans un lot
      // PayPal serait une donnée bancaire promenée pour rien.
      iban: methode === "virement" ? aff.coordonnees.iban : null,
      bic: methode === "virement" ? aff.coordonnees.bic : null,
      paypalEmail: methode === "paypal" ? aff.coordonnees.paypalEmail : null,
      montantCents: montant,
      commissionIds: ids,
    });
  }

  // Le plus gros d'abord : c'est celui qu'on regarde, et celui dont une
  // erreur coûte le plus.
  lignes.sort((a, b) => b.montantCents - a.montantCents);
  ecartees.sort((a, b) => b.montantCents - a.montantCents);

  const totalParMethode: Record<MethodeVersement, number> = { paypal: 0, virement: 0 };
  for (const l of lignes) totalParMethode[l.methode] += l.montantCents;

  return {
    lignes,
    ecartees,
    totalCents: lignes.reduce((s, l) => s + l.montantCents, 0),
    totalParMethode,
  };
}

/**
 * La référence qui apparaît sur le relevé de l'affiliée.
 *
 * Elle doit lui dire de quoi il s'agit sans qu'elle ait à demander, et
 * tenir dans les 140 caractères d'un libellé SEPA. Le `sa` n'y est PAS :
 * c'est un identifiant interne, illisible, et il finirait sur le relevé
 * bancaire de quelqu'un.
 */
export function libelleVersement(periode: string): string {
  return `Commissions affiliation ${periode}`.slice(0, 140);
}

/** "2026-08" à partir d'une date, pour nommer le lot. */
export function periodeDe(iso: string | number | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
