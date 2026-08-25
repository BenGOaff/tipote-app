// lib/affiliate/codeReduction.ts
//
// UN CODE DE RÉDUCTION QUI NE MARCHE QUE SUR LE LIEN DE SON AFFILIÉ.
//
// Béné, 25 août 2026 : "Codes de réduction : à prévoir pour que j'en
// attribue un à un affilié si besoin. Ne sera valable que sur le lien de
// l'affilié."
//
// Cette deuxième phrase n'est pas un détail de confort, c'est ce qui
// rend le code sûr. Un code de réduction finit TOUJOURS par sortir de la
// main de celui à qui on l'a donné : il est recopié sur un site de bons
// plans, dans un groupe Facebook, dans un commentaire YouTube. Un code
// ordinaire, à ce moment là, se met à raboter des ventes qu'on aurait
// faites au prix plein. Un code lié au lien de son affilié, lui, n'a
// aucune valeur pour celui qui n'est pas passé par ce lien : il ne peut
// rabotter que le trafic que cet affilié a lui-même amené.
//
// -- CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS --------------------
//
// Il DÉCIDE, et rien d'autre : pas de base, pas de réseau, donc testable.
// La lecture en base vit dans la route, l'application du prix vit dans le
// bon de commande de Tiquiz.
//
// -- TROIS CHOIX ASSUMÉS, ET LEURS RAISONS -----------------------------
//
// 1. POURCENTAGE UNIQUEMENT, jamais un montant fixe. Nos paliers existent
//    en plusieurs devises depuis avril : "10 €" sur un plan en dollars ne
//    veut rien dire, et convertir avec un taux inventé produirait une
//    remise fausse qui a l'air juste (leçon des commissions en devise
//    étrangère, 26 août).
//
// 2. LA PREMIÈRE ÉCHÉANCE SEULEMENT. Un abonnement remisé "pour toujours"
//    ampute un revenu récurrent à vie sur une décision prise une fois, et
//    personne ne s'en aperçoit avant de lire un tableau de bord des mois
//    plus tard. Une remise de lancement porte sur l'entrée.
//
// 3. AUCUN QUOTA D'UTILISATIONS. Un compteur exige d'être incrémenté au
//    moment exact de l'encaissement, donc depuis le webhook de Tiquiz,
//    donc par un appel réseau vers ici qui peut échouer : un quota qui ne
//    décrémente pas en silence est pire que pas de quota. La date de fin
//    et l'interrupteur suffisent à reprendre la main, et la liaison au
//    lien borne déjà les dégâts. Le jour où il en faut un, c'est une
//    migration, pas une refonte.
//
// Le plafond à 90 % est volontaire : "gratuit" n'est pas une remise.
// Un accès offert se pose depuis l'admin, où il est tracé comme tel, au
// lieu de fabriquer un abonnement à zéro euro qui ne paie aucune
// commission, n'émet aucune facture, et qu'aucun écran ne distingue d'un
// vrai client.

/** Le plus fort rabais qu'un code puisse porter. */
export const REMISE_MAX_PCT = 90;
/** En dessous, le code ne change rien de visible pour l'acheteur. */
export const REMISE_MIN_PCT = 1;

/** Ce qu'un code donne. Deux natures, jamais mélangées. */
export type AvantageKind = "percent" | "free_days";

/** Sur combien d'échéances porte une remise. */
export type RemiseDuree = "once" | "forever" | "months";

export type CodeReductionRow = {
  code: string;
  /** L'affiliée propriétaire. C'est SON lien qui ouvre le code. */
  sa: string;
  percent_off: number;
  /** Les produits concernés. `null` ou vide = tous. */
  produits?: string[] | null;
  expires_at?: string | null;
  enabled?: boolean | null;
  /** Défaut `percent` : un code écrit avant le 25 août est une remise. */
  kind?: AvantageKind | string | null;
  /** Défaut `once` : la première échéance PAYÉE. */
  duration?: RemiseDuree | string | null;
  duration_months?: number | null;
  /** Les jours d'essai en plus, quand `kind` vaut `free_days`. */
  free_days?: number | null;
  /** Une remise par palier : `{ "monthly": 20, "yearly": 30 }`. */
  percent_by_product?: Record<string, unknown> | null;
  /** Le début d'une campagne. `null` = ouvert tout de suite. */
  starts_at?: string | null;
};

export type RaisonRefus =
  | "inconnu"
  | "desactive"
  | "expire"
  | "pas-encore"
  | "mauvais-lien"
  | "produit-exclu"
  | "remise-illisible";

/**
 * Ce que le code donne, une fois toutes les vérifications passées.
 *
 * C'est une UNION, pas un objet à champs optionnels : une remise et des
 * jours offerts ne se calculent pas de la même façon, ne se cumulent pas,
 * et ne s'appliquent pas au même endroit chez Stripe comme chez PayPal.
 * Un objet qui porterait les deux laisserait un appelant lire le mauvais
 * champ, et ce serait un client qui paie ce qu'il ne devait pas payer.
 */
export type Avantage =
  | { type: "percent"; percentOff: number; duree: RemiseDuree; mois: number | null }
  | { type: "free_days"; jours: number };

export type VerdictCode =
  | { ok: true; code: string; sa: string; avantage: Avantage }
  | { ok: false; raison: RaisonRefus };

/**
 * Met un code saisi dans sa forme de référence.
 *
 * NORMALISER N'EST PAS VALIDER (leçon du 25 août sur le BIC) : cette
 * fonction NETTOIE et rend ce qu'elle a compris, elle ne juge pas. Un
 * code saisi de travers ressort vide, et c'est `validerCodeReduction`
 * qui dit non, avec une raison que l'écran sait mettre en mots.
 *
 * L'acheteur tape ce qu'il a lu : minuscules, espaces avant et après,
 * parfois un espace au milieu recopié d'une story. On accepte tout ça,
 * parce qu'un code refusé pour une majuscule est une vente perdue sur un
 * détail que personne ne voit.
 */
export function normaliserCode(brut: unknown): string {
  return String(brut ?? "")
    .trim()
    .toUpperCase()
    // LES ACCENTS SE TRANSLITTÈRENT, ILS NE SE SUPPRIMENT PAS. Les
    // retirer ferait de "ÉTÉ20" un "T20" : un code muet, qui pourrait en
    // plus tomber par hasard sur celui de quelqu'un d'autre. Même règle
    // que les noms du fichier SEPA (25 août), et pour la même raison :
    // ce qui reste doit rester reconnaissable.
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}

/** La remise est-elle dans les bornes ? */
export function remiseValide(pct: unknown): boolean {
  const n = Number(pct);
  return Number.isInteger(n) && n >= REMISE_MIN_PCT && n <= REMISE_MAX_PCT;
}

/**
 * Ce code s'applique-t-il à ce checkout ?
 *
 * `saDuLien` est le `sa` de l'affiliée dont le lien a amené l'acheteur,
 * résolu AVANT l'appel. C'est un PARAMÈTRE OBLIGATOIRE, jamais déduit
 * ici : les deux générations de liens (`?ref=` et `?sa=`) se résolvent
 * différemment, et deviner laquelle on a reçu casserait le jour où une
 * affiliée choisit un code qui ressemble à un `sa`.
 *
 * L'ordre des contrôles est celui de l'utilité du message. "Ce code ne
 * marche que sur le lien de X" est une phrase qui explique ; "code
 * inconnu" envoie chercher une faute de frappe qui n'existe pas.
 */
export function validerCodeReduction(args: {
  code: CodeReductionRow | null | undefined;
  saDuLien: string | null;
  produit: string;
  maintenant: Date;
}): VerdictCode {
  const c = args.code;
  if (!c || !normaliserCode(c.code)) return { ok: false, raison: "inconnu" };
  if (c.enabled === false) return { ok: false, raison: "desactive" };

  // UNE CAMPAGNE A UN DÉBUT ("décembre à -40%"). Un code posé à l'avance
  // ne doit pas s'ouvrir avant sa date, sinon on offre 40 % en novembre à
  // qui a vu passer le code trop tôt.
  if (c.starts_at) {
    const debut = new Date(c.starts_at);
    if (Number.isNaN(debut.getTime())) return { ok: false, raison: "pas-encore" };
    if (debut.getTime() > args.maintenant.getTime()) return { ok: false, raison: "pas-encore" };
  }

  if (c.expires_at) {
    const fin = new Date(c.expires_at);
    // Une date illisible n'ouvre PAS le code : une valeur qu'on ne sait
    // pas lire est un doute, et un doute sur de l'argent se tranche en
    // faveur du prix plein.
    if (Number.isNaN(fin.getTime()) || fin.getTime() <= args.maintenant.getTime()) {
      return { ok: false, raison: "expire" };
    }
  }

  // LA RÈGLE DE BÉNÉ, ET C'EST LA SEULE QUI COMPTE VRAIMENT.
  // Comparaison exacte : `sa` est une clé, pas un texte saisi.
  if (!args.saDuLien || args.saDuLien !== c.sa) {
    return { ok: false, raison: "mauvais-lien" };
  }

  const produits = (c.produits ?? []).filter((p) => typeof p === "string" && p.trim());
  if (produits.length > 0 && !produits.includes(args.produit)) {
    return { ok: false, raison: "produit-exclu" };
  }

  const avantage = lireAvantage(c, args.produit);
  if (!avantage) return { ok: false, raison: "remise-illisible" };

  return { ok: true, code: normaliserCode(c.code), sa: c.sa, avantage };
}

/**
 * Ce que la ligne donne, ou `null` si elle n'est pas exploitable.
 *
 * LA NATURE EST LUE DANS `kind`, JAMAIS DEVINÉE des champs remplis. Une
 * ligne qui porte `free_days: 60` ET `percent_off: 20` (parce que
 * `percent_off` a un défaut en base) doit rendre UN avantage, celui que
 * la colonne annonce. Deviner marcherait tant que personne ne saisit les
 * deux, et casserait le jour où quelqu'un le fait, sur un objet qui
 * décide de ce qu'un client paie.
 *
 * Le défaut de `kind` est `percent` et celui de `duration` est `once` :
 * un code écrit avant le 25 août 2026 vaut exactement ce qu'il valait.
 */
export function lireAvantage(
  c: CodeReductionRow,
  produit: string,
): Avantage | null {
  const kind = c.kind === "free_days" ? "free_days" : "percent";

  if (kind === "free_days") {
    const jours = Number(c.free_days);
    // 365 est la borne de PayPal sur un cycle d'essai : au delà, c'est
    // leur API qui refuserait, avec un message que personne ne lit.
    if (!Number.isInteger(jours) || jours < 1 || jours > 365) return null;
    return { type: "free_days", jours };
  }

  // UNE REMISE PAR PALIER, quand le créateur en a défini une. Un palier
  // absent de la table retombe sur la remise commune : sinon un nouveau
  // produit au catalogue viderait le code de son effet en silence.
  const parProduit = c.percent_by_product;
  const brut =
    parProduit && typeof parProduit === "object" && produit in parProduit
      ? (parProduit as Record<string, unknown>)[produit]
      : c.percent_off;
  const pct = Number(brut);
  if (!remiseValide(pct)) return null;

  const duree: RemiseDuree =
    c.duration === "forever" ? "forever" : c.duration === "months" ? "months" : "once";
  if (duree === "months") {
    const mois = Number(c.duration_months);
    // Une remise "sur N mois" sans N n'est pas applicable. On refuse
    // plutôt que de choisir un N à sa place.
    if (!Number.isInteger(mois) || mois < 1 || mois > 36) return null;
    return { type: "percent", percentOff: pct, duree, mois };
  }
  return { type: "percent", percentOff: pct, duree, mois: null };
}

/**
 * Le prix remisé, en centimes.
 *
 * Arrondi À L'ENTIER LE PLUS PROCHE, et jamais en dessous de 1 centime :
 * un montant à zéro ferait un abonnement gratuit là où on voulait une
 * remise, et les deux ne se ressemblent que sur le papier (pas de
 * commission, pas de facture, un client qu'aucun écran ne distingue).
 */
export function prixRemiseCents(montantCents: number, percentOff: number): number {
  if (!Number.isFinite(montantCents) || montantCents <= 0) return 0;
  if (!remiseValide(percentOff)) return Math.round(montantCents);
  return Math.max(1, Math.round((montantCents * (100 - percentOff)) / 100));
}
