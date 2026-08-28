// lib/affiliate/commission.ts
//
// LE MONTANT D'UNE COMMISSION AFFILIÉE, CALCULÉ À UN SEUL ENDROIT.
//
// -- POURQUOI CE FICHIER EXISTE (19 août 2026) -------------------------
//
// En vérifiant la base de calcul, on a trouvé que l'app PROMETTAIT un
// montant et en CALCULAIT un autre :
//
//   ce que l'affiliée lit   : "70% ... soit 32,90 € par vente à 47 €"
//   ce que le code calcule  : 70% du HT, soit 27,42 €
//
// 5,48 € d'écart par vente, et le montant le plus élevé était celui
// affiché. La cause n'est pas une faute de frappe : les montants annoncés
// étaient des CHAÎNES ÉCRITES À LA MAIN dans six fichiers de langue et
// dans un simulateur, pendant que le paiement, lui, était un calcul. Deux
// choses qui disent la même valeur sans passer par le même code finissent
// toujours par se contredire : c'est le motif de ce dépôt depuis trois
// mois (l'alignement du sous-titre, les réseaux de partage, la
// disposition des réponses, le texte de partage du résultat).
//
// **Règle : le montant ANNONCÉ et le montant PAYÉ sortent d'ici.**
// Aucun montant de commission n'est réécrit ailleurs, ni en dur dans une
// traduction, ni recalculé dans un composant.
//
// -- LA BASE EST UN PARAMÈTRE OBLIGATOIRE ------------------------------
//
// Décision Béné du 19 août : "chez nous on va calculer la commission sur
// le HT." Elle est appliquée, mais elle n'est PAS câblée en dur dans la
// fonction : `base` est un argument que l'appelant doit fournir. Deviner
// la mécanique à l'intérieur d'une fonction est exactement ce qui a
// produit la fausse alerte de Véronique (des contrôles "profils"
// appliqués à un quiz scoré). Le jour où un produit se calcule
// autrement, personne ne pourra l'oublier.

/** Sur quoi le pourcentage s'applique. Jamais deviné, toujours passé. */
export type CommissionBase = "ht" | "ttc";

/** La base retenue pour tout le programme (décision Béné, 19 août 2026). */
export const COMMISSION_BASE: CommissionBase = "ht";

/**
 * Taux de TVA de référence pour les montants ANNONCÉS.
 *
 * Les prix sont affichés TTC, donc le HT dépend du pays de l'acheteur.
 * Les montants d'exemple montrés aux affiliés sont calculés avec le taux
 * français ; la commission RÉELLE d'une vente utilise le taux de cette
 * vente-là, passé en argument.
 */
export const REFERENCE_VAT_RATE = 0.2;

/** Taux de commission par produit. */
export const COMMISSION_RATES = {
  atelier: 0.7,
  tiquiz: 0.4,
} as const;

/** Prix publics, TTC, en euros. Aucun chiffre inventé. */
export const PRICES_TTC_EUR = {
  atelier: 47,
  tiquiz_monthly: 17,
  tiquiz_monthly_plus: 29,
  tiquiz_yearly: 170,
  tiquiz_yearly_plus: 290,
} as const;

/**
 * LE TAUX QUI S'APPLIQUE À UNE VENTE.
 *
 * Trois étages, du plus fort au plus faible, et le plus fort doit
 * pouvoir se taire (même modèle que l'alignement des questions) :
 *
 *   1. le taux NÉGOCIÉ À LA MAIN pour cet affilié et ce produit
 *      (`affiliate_rate_overrides`) : un partenariat, un remerciement,
 *      une sanction ;
 *   2. le taux de son PALIER, quand les paliers existeront ;
 *   3. le taux de BASE du produit.
 *
 * `null` ne veut pas dire zéro, il veut dire "je ne me prononce pas".
 * Sans ça, un affilié sans override toucherait 0%, ce qui est la pire
 * erreur possible sur de l'argent.
 */
export function resolveCommissionRate(params: {
  product: keyof typeof COMMISSION_RATES;
  override?: number | null;
  tierRate?: number | null;
}): number {
  const valide = (v: number | null | undefined): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : null;
  };
  return valide(params.override) ?? valide(params.tierRate) ?? COMMISSION_RATES[params.product];
}

/**
 * Le montant hors taxes, en centimes, déduit d'un prix TTC.
 *
 * Béné facture TOUJOURS en TTC : le prix affiché est le prix payé, et la
 * TVA se déduit à l'envers. Le calcul se fait en centimes et arrondit une
 * seule fois, sinon deux lecteurs peuvent tomber sur des valeurs
 * différentes et la somme cesse d'être juste.
 */
export function htFromTtcCents(ttcCents: number, vatRate: number = REFERENCE_VAT_RATE): number {
  const ttc = Number(ttcCents);
  if (!Number.isFinite(ttc) || ttc <= 0) return 0;
  const rate = Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0;
  return Math.round(ttc / (1 + rate));
}

/**
 * La commission due sur UNE vente, en centimes.
 *
 * `base` est obligatoire : voir l'en-tête. `vatRate` ne sert que sur la
 * base HT, et vaut le taux français par défaut pour les montants
 * d'exemple.
 */
export function commissionCents(params: {
  ttcCents: number;
  rate: number;
  base: CommissionBase;
  vatRate?: number;
}): number {
  const { ttcCents, rate, base } = params;
  const ttc = Number(ttcCents);
  const taux = Number(rate);
  if (!Number.isFinite(ttc) || ttc <= 0) return 0;
  if (!Number.isFinite(taux) || taux <= 0) return 0;

  const assiette = base === "ht" ? htFromTtcCents(ttc, params.vatRate) : Math.round(ttc);
  return Math.round(assiette * taux);
}

/**
 * La même chose en euros, pour les écrans et les traductions.
 *
 * `ttcEur` est le prix public en euros (47, 17, 29...). Le passage par
 * les centimes n'est pas cosmétique : il garantit que le montant affiché
 * est EXACTEMENT celui qui sera payé.
 */
export function commissionEur(params: {
  ttcEur: number;
  rate: number;
  base: CommissionBase;
  vatRate?: number;
}): number {
  const cents = commissionCents({
    ttcCents: Math.round(Number(params.ttcEur) * 100),
    rate: params.rate,
    base: params.base,
    vatRate: params.vatRate,
  });
  return cents / 100;
}

/**
 * Ce qu'un abonné rapporte sur une PROJECTION de N mois (12 par défaut).
 *
 * C'est un HORIZON DE SIMULATION, jamais un plafond : rien dans le
 * chemin de paiement n'arrête les commissions après douze mois, la
 * commission tombe à chaque encaissement tant que l'abonné reste
 * (Béné, 26 août 2026). L'espace affilié a annoncé "les 12 premiers
 * mois" jusqu'au 27 août, dans 7 chaînes et 6 langues : le programme
 * versait plus que ce qu'il promettait, et des affiliés ont pu renoncer
 * sur un chiffre faux.
 *
 * C'est bien 12 x la commission MENSUELLE arrondie, pas la commission
 * d'un montant annuel : chaque échéance produit sa propre ligne de
 * commission, donc son propre arrondi. Calculer autrement afficherait
 * quelques centimes de moins que ce qui sera réellement versé.
 */
export function yearlyRecurringEur(params: {
  monthlyTtcEur: number;
  rate: number;
  base: CommissionBase;
  vatRate?: number;
  months?: number;
}): number {
  const months = params.months ?? 12;
  const parMois = commissionEur({
    ttcEur: params.monthlyTtcEur,
    rate: params.rate,
    base: params.base,
    vatRate: params.vatRate,
  });
  return parMois * months;
}
