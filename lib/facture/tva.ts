// lib/facture/tva.ts
//
// LA TABLE DES TAUX ET LES FORMATS DE NUMÉRO DE TVA.
//
// **JUMEAU de `lib/facture/tva.ts` du dépôt Tiquiz, et il DOIT le
// rester.** Il n'y a pas de paquet partagé entre les dépôts : c'est une
// recopie, donc ça diverge, donc les deux tests figent `TAUX_MAJ` et les
// 27 pays. Quand un État change son taux, il faut le changer DANS LES
// DEUX, et le test de l'autre rougira.
//
// -- CE QUE TIPOTE EN UTILISE, ET CE QU'IL N'EN UTILISE PAS ------------
//
// Ici on ne vend rien : on ACHÈTE une prestation d'apport d'affaires à
// une affiliée (autofacturation). Le seul taux qui sert est donc le
// FRANÇAIS, parce qu'un prestataire étranger ne nous facture jamais sa
// TVA locale : un service B2B est taxé là où le PRENEUR est établi, donc
// chez nous, en autoliquidation.
//
// Le reste de la table (les 26 autres taux) est là pour rester jumeau du
// fichier de Tiquiz, pas parce qu'on s'en sert. Ne pas l'élaguer : un
// fichier à moitié recopié est un fichier qu'on ne saura plus comparer.
// La décision d'ACHAT vit dans `lib/affiliate/fiscal.ts`.

/** Le pays du vendeur. Tout est écrit de son point de vue. */
export const PAYS_VENDEUR = "FR";

/**
 * LES TAUX STANDARD DE L'UNION, EN POINTS DE BASE.
 *
 * `2000` = 20,00 %. En points de base parce que la Finlande est à 25,5 %
 * et que l'arrondir à 25 ou 26 fausserait chaque facture finlandaise.
 *
 * **CETTE TABLE SE PÉRIME.** Un État change son taux quand il veut, et
 * ça arrive plusieurs fois par an dans l'Union (la Slovaquie est passée
 * de 20 à 23 % en 2025, la Roumanie de 19 à 21 %). D'où la date
 * ci-dessous : un taux faux ne se voit sur aucun écran, il se voit à la
 * déclaration. À revérifier au moins une fois par an sur la liste
 * officielle de la Commission (« VAT rates applied in the Member
 * States »).
 */
export const TAUX_MAJ = "2026-08-24";

export const TAUX_UE: Readonly<Record<string, number>> = {
  AT: 2000, BE: 2100, BG: 2000, CY: 1900, CZ: 2100, DE: 1900, DK: 2500,
  EE: 2400, ES: 2100, FI: 2550, FR: 2000, GR: 2400, HR: 2500, HU: 2700,
  IE: 2300, IT: 2200, LT: 2100, LU: 1700, LV: 2100, MT: 1800, NL: 2100,
  PL: 2300, PT: 2300, RO: 2100, SE: 2500, SI: 2200, SK: 2300,
} as const;

export const PAYS_UE: readonly string[] = Object.keys(TAUX_UE);

/** Le pays, normalisé, ou null si on ne sait pas de quoi on parle. */
export function normaliserPays(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

export function estDansLUnion(pays: string | null): boolean {
  return !!pays && pays in TAUX_UE;
}

/**
 * LA FORME D'UN NUMÉRO DE TVA, par pays.
 *
 * Le préfixe DOIT correspondre au pays de l'adresse : un numéro belge
 * sur une adresse française n'est pas une erreur de frappe, c'est soit
 * une adresse fausse, soit une tentative de ne pas payer la TVA. Dans
 * les deux cas on ne l'accepte pas en silence.
 */
const FORMES: Readonly<Record<string, RegExp>> = {
  AT: /^ATU\d{8}$/, BE: /^BE0?\d{9,10}$/, BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/, CZ: /^CZ\d{8,10}$/, DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/, EE: /^EE\d{9}$/, ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/, FR: /^FR[A-Z0-9]{2}\d{9}$/, GR: /^(EL|GR)\d{9}$/,
  HR: /^HR\d{11}$/, HU: /^HU\d{8}$/, IE: /^IE(\d{7}[A-Z]{1,2}|\d[A-Z*+]\d{5}[A-Z])$/,
  IT: /^IT\d{11}$/, LT: /^LT(\d{9}|\d{12})$/, LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/, MT: /^MT\d{8}$/, NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/, PT: /^PT\d{9}$/, RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/, SI: /^SI\d{8}$/, SK: /^SK\d{10}$/,
};

/** Le numéro sans espaces ni points, en majuscules, ou null. */
export function normaliserNumeroTva(v: unknown): string | null {
  const s = typeof v === "string" ? v.replace(/[\s.\-]/g, "").toUpperCase() : "";
  return s.length >= 4 && s.length <= 16 ? s : null;
}

/**
 * Le numéro est-il BIEN FORMÉ pour ce pays ? (pas : existe-t-il)
 *
 * La Grèce écrit `EL` sur ses numéros et `GR` sur ses adresses : le seul
 * pays où le préfixe du numéro n'est pas le code du pays, et l'oublier
 * ferait refuser toutes les autoliquidations grecques.
 */
export function numeroTvaBienForme(numero: string | null, pays: string | null): boolean {
  if (!numero || !pays) return false;
  const forme = FORMES[pays];
  if (!forme) return false;
  return forme.test(numero);
}

export type RegimeTva =
  /** TVA du pays du vendeur (acheteur français). */
  | "france"
  /** Guichet unique : le taux du pays de l'acheteur. */
  | "oss"
  /** Entreprise de l'Union hors France : 0 %, la TVA est due par elle. */
  | "autoliquidation"
  /** Hors Union : hors champ. */
  | "hors-ue";

export interface DecisionTva {
  regime: RegimeTva;
  /** En points de base. 0 pour l'autoliquidation et le hors UE. */
  tauxBp: number;
  /** Le pays qui a servi à décider. */
  pays: string;
  /** La phrase légale à imprimer sur la facture, ou null. */
  mention: string | null;
  /**
   * CE QUI RESTE À VÉRIFIER À LA MAIN, et pourquoi on émet quand même.
   *
   * "il a payé le client, il doit recevoir ses accès, point barre"
   * (7 août) vaut aussi pour sa facture : on ne la retient pas parce
   * qu'une case est vide. On l'émet, et on dit ce qui manque.
   */
  aCompleter: string[];
}

/**
 * LA DÉCISION. Le pays et le numéro sont des PARAMÈTRES, jamais devinés
 * depuis un objet client : deux appelants qui liraient l'adresse à deux
 * endroits différents finiraient par facturer deux taux différents.
 */
export function resoudreTva(args: {
  pays: string | null | undefined;
  numeroTva?: string | null;
}): DecisionTva {
  const aCompleter: string[] = [];
  const numero = normaliserNumeroTva(args.numeroTva);
  let pays = normaliserPays(args.pays);

  // PAYS INCONNU : on facture au taux français.
  //
  // Ce n'est pas un choix par défaut, c'est le choix le moins coûteux
  // pour le client : on paie 20 % au Trésor français au lieu de deviner
  // un pays. Une facture rectificative reste possible ; un client sans
  // facture, non.
  if (!pays) {
    pays = PAYS_VENDEUR;
    aCompleter.push("pays");
  }

  if (pays === PAYS_VENDEUR) {
    // Un numéro de TVA français ne donne AUCUN droit ici.
    return {
      regime: "france",
      tauxBp: TAUX_UE[PAYS_VENDEUR],
      pays,
      mention: null,
      aCompleter,
    };
  }

  if (!estDansLUnion(pays)) {
    return {
      regime: "hors-ue",
      tauxBp: 0,
      pays,
      mention: "TVA non applicable : prestation de service électronique hors Union européenne (article 259 B du CGI).",
      aCompleter,
    };
  }

  if (numero) {
    if (numeroTvaBienForme(numero, pays)) {
      return {
        regime: "autoliquidation",
        tauxBp: 0,
        pays,
        mention: "Autoliquidation : TVA due par le preneur (article 283-2 du CGI, article 196 de la directive 2006/112/CE).",
        // Bien formé n'est pas valide : voir l'en-tête. Tant que VIES
        // n'est pas branché, chaque autoliquidation se vérifie une fois.
        aCompleter: [...aCompleter, "tva-a-valider-vies"],
      };
    }
    // Numéro donné mais illisible ou d'un autre pays : on NE FAIT PAS
    // d'autoliquidation. Facturer la TVA est réparable, l'oublier non.
    aCompleter.push("tva-numero-invalide");
  }

  return {
    regime: "oss",
    tauxBp: TAUX_UE[pays],
    pays,
    mention: "TVA du pays du preneur, déclarée via le guichet unique OSS.",
    aCompleter,
  };
}

export interface Montants {
  totalCents: number;
  htCents: number;
  tvaCents: number;
  tauxBp: number;
}

/**
 * Décompose un montant TTC. `Math.round` sur le HT, et la TVA est la
 * DIFFÉRENCE : arrondir les deux séparément donne une facture dont la
 * somme des lignes ne fait pas le total, ce qu'un comptable voit tout
 * de suite.
 */
export function decomposerTTC(totalCents: number, tauxBp: number): Montants {
  const total = Math.round(Number(totalCents) || 0);
  const bp = Math.max(0, Math.round(Number(tauxBp) || 0));
  if (bp === 0) return { totalCents: total, htCents: total, tvaCents: 0, tauxBp: 0 };
  const ht = Math.round((total * 10_000) / (10_000 + bp));
  return { totalCents: total, htCents: ht, tvaCents: total - ht, tauxBp: bp };
}

/** "20 %", "25,5 %". Le taux tel qu'il s'imprime. */
export function formatTaux(tauxBp: number, locale = "fr-FR"): string {
  const v = (Number(tauxBp) || 0) / 100;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v)} %`;
}
