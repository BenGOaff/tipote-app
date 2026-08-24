// lib/affiliate/fiscal.ts
//
// L'AUTOFACTURATION : ON ÉMET LA FACTURE À LA PLACE DE L'AFFILIÉ.
//
// Béné, 25 août 2026 : "je veux le même truc que systeme io : l'affilié
// complète ses infos, son numéro de TVA et siren s'il a, ses
// coordonnées, son mode paiement et tous les mois on génère sa facture
// pour sa compta, il peut la télécharger et nous on peut le payer via
// cette facture qu'on a générée pour lui."
//
// -- NE PAS CONFONDRE LES DEUX FACTURES --------------------------------
//
// Elle l'a écrit elle même, et c'est la distinction qui structure tout
// ce fichier :
//
//   1. les factures de nos ACHETEURS : nous sommes le vendeur, elles
//      vivent dans le dépôt Tiquiz (`lib/facture/`), série `TQ-`.
//   2. **celle ci** : l'AFFILIÉ est le vendeur (il nous vend un apport
//      d'affaires), nous sommes le client, et nous l'écrivons à sa place
//      pour ne pas attendre la sienne. Série `AFF-`.
//
// Les deux ont l'air de se ressembler et n'ont PAS les mêmes règles de
// TVA : elles vont dans des sens opposés. Recopier l'une sur l'autre
// donnerait des factures fausses des deux côtés.
//
// -- CE QUE LA LOI EXIGE POUR AUTOFACTURER -----------------------------
//
// L'autofacturation est prévue par l'article 289 I-2 du CGI. Trois
// conditions, et les trois sont dans le code :
//
//   a. un MANDAT DE FACTURATION accepté par le prestataire AVANT la
//      première facture. Sans lui on n'émet rien : écrire une facture au
//      nom de quelqu'un sans son accord n'est pas une facilité, c'est un
//      faux. D'où `mandatAccepteLe`, et l'affiliée écartée du lot tant
//      qu'elle n'a pas accepté.
//   b. la mention **« Autofacturation »** sur la pièce (article 242
//      nonies A du CGI).
//   c. la possibilité pour le prestataire de CONTESTER. En pratique : il
//      la télécharge, il nous écrit s'il n'est pas d'accord, et on émet
//      un avoir. C'est pour ça qu'elle doit lui être accessible, pas
//      seulement archivée chez nous.
//
// **À faire valider une fois par ton comptable** : la série de
// numérotation (voir `autofacture.ts`) et le cas de l'affilié
// particulier non assujetti. Le reste est mécanique.

import { normaliserNumeroTva, normaliserPays, numeroTvaBienForme, estDansLUnion, TAUX_UE } from "@/lib/facture/tva";

/** Le pays du CLIENT, c'est à dire nous. Tout est écrit de son point de vue. */
export const PAYS_CLIENT = "FR";

/**
 * LA COMMISSION EST UN MONTANT NET DE TAXE.
 *
 * Elle est calculée sur le HT de la vente (décision Béné du 19 août).
 * C'est donc le HT de la prestation de l'affilié : s'il facture la TVA,
 * elle s'AJOUTE, et Béné la déduit. Un affilié assujetti coûte donc 20 %
 * de trésorerie en plus le mois où on le paie, récupérés à la
 * déclaration suivante.
 *
 * **C'est une décision, pas une évidence**, et c'est pour ça qu'elle est
 * nommée ici plutôt que cachée dans un calcul : si Béné veut que la
 * commission soit TTC (donc que l'affilié assujetti touche moins), c'est
 * cette constante qui change, et une seule.
 */
export const COMMISSION_EST_HT = true;

/** Ce qu'un affilié est, fiscalement. C'est LUI qui le dit. */
export type StatutFiscal =
  /** Entreprise, auto-entrepreneur, association : il peut émettre une facture. */
  | "entreprise"
  /** Particulier : il n'a ni SIREN ni numéro de TVA. */
  | "particulier";

export const STATUTS: readonly StatutFiscal[] = ["entreprise", "particulier"];

/** Ce que l'affilié renseigne, et que la facture recopie. */
export interface ProfilFiscal {
  statut: StatutFiscal | null;
  /** Sa raison sociale, ou son nom s'il est particulier. */
  denomination: string | null;
  adresse1: string | null;
  adresse2: string | null;
  codePostal: string | null;
  ville: string | null;
  /** ISO 3166-1 alpha-2. C'est LUI qui décide du régime de TVA. */
  pays: string | null;
  /** SIREN ou SIRET, seulement en France. */
  siren: string | null;
  numeroTva: string | null;
  /**
   * IL FACTURE LA TVA, OU PAS.
   *
   * Ce n'est PAS déductible de la présence d'un numéro : un
   * auto-entrepreneur en franchise en base a souvent un numéro de TVA
   * intracommunautaire (pour ses achats européens) tout en ne facturant
   * pas la TVA. Deviner ferait apparaître 20 % sur la facture de
   * quelqu'un qui n'y a pas droit, et c'est lui qui devrait la reverser.
   */
  assujettiTva: boolean;
  /** Le mandat de facturation, accepté. ISO 8601, ou null. */
  mandatAccepteLe: string | null;
  /** La version du texte accepté : un mandat réécrit se réaccepte. */
  mandatVersion: string | null;
}

export const PROFIL_VIDE: ProfilFiscal = {
  statut: null, denomination: null, adresse1: null, adresse2: null,
  codePostal: null, ville: null, pays: null, siren: null, numeroTva: null,
  assujettiTva: false, mandatAccepteLe: null, mandatVersion: null,
};

/** La version courante du mandat. La changer force une réacceptation. */
export const MANDAT_VERSION = "2026-08-25";

function texte(v: unknown, max = 200): string | null {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return s ? s.slice(0, max) : null;
}

/** SIREN (9 chiffres) ou SIRET (14), sans espaces. */
export function normaliserSiren(v: unknown): string | null {
  const s = typeof v === "string" ? v.replace(/[\s.-]/g, "") : "";
  return s ? s.slice(0, 14) : null;
}

/**
 * La clé de Luhn du SIREN / SIRET.
 *
 * Comme pour l'IBAN : c'est la faute de frappe qu'on attrape, et elle
 * est fréquente sur 9 ou 14 chiffres tapés à la main. Un SIREN faux sur
 * une facture, c'est une facture qu'un contrôle rejette.
 *
 * **L'EXCEPTION CONNUE : La Poste.** Ses SIRET ne satisfont pas la clé
 * de Luhn (ils suivent une règle "somme divisible par 5"). Si un jour un
 * affilié est La Poste, il faudra une exception nommée ici plutôt qu'un
 * assouplissement général : desserrer le contrôle pour tout le monde
 * laisserait passer toutes les fautes de frappe.
 */
export function sirenValide(v: unknown): boolean {
  const s = normaliserSiren(v);
  if (!s || !/^\d+$/.test(s) || (s.length !== 9 && s.length !== 14)) return false;
  let somme = 0;
  for (let i = 0; i < s.length; i++) {
    // On double un chiffre sur deux EN PARTANT DE LA FIN.
    const position = s.length - 1 - i;
    let n = Number(s[position]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme % 10 === 0;
}

export function lireProfilFiscal(brut: unknown): ProfilFiscal {
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const statut = String(o.statut ?? "").trim().toLowerCase();
  return {
    statut: statut === "entreprise" || statut === "particulier" ? statut : null,
    denomination: texte(o.denomination, 160),
    adresse1: texte(o.adresse1, 200),
    adresse2: texte(o.adresse2, 200),
    codePostal: texte(o.codePostal, 20),
    ville: texte(o.ville, 100),
    pays: normaliserPays(o.pays),
    siren: normaliserSiren(o.siren),
    numeroTva: normaliserNumeroTva(o.numeroTva),
    assujettiTva: o.assujettiTva === true,
    mandatAccepteLe: texte(o.mandatAccepteLe, 40),
    mandatVersion: texte(o.mandatVersion, 40),
  };
}

export type ManqueFiscal =
  | "statut"
  | "denomination"
  | "adresse"
  | "ville"
  | "pays"
  | "siren"
  | "siren-invalide"
  | "tva-numero"
  | "tva-numero-invalide"
  | "mandat";

/**
 * CE QUI MANQUE POUR POUVOIR ÉMETTRE SA FACTURE.
 *
 * Le statut décide de ce qu'on exige : réclamer un SIREN à un
 * particulier, c'est un formulaire qu'il n'aura jamais fini. Et le pays
 * décide du reste : un SIREN n'existe qu'en France.
 */
export function manquesFiscaux(p: ProfilFiscal): ManqueFiscal[] {
  const m: ManqueFiscal[] = [];
  if (!p.statut) {
    m.push("statut");
    return m;
  }
  if (!p.denomination) m.push("denomination");
  if (!p.adresse1) m.push("adresse");
  if (!p.codePostal || !p.ville) m.push("ville");
  if (!p.pays) m.push("pays");

  if (p.statut === "entreprise") {
    if (p.pays === PAYS_CLIENT) {
      if (!p.siren) m.push("siren");
      else if (!sirenValide(p.siren)) m.push("siren-invalide");
    }
    if (p.assujettiTva) {
      if (!p.numeroTva) m.push("tva-numero");
      else if (!numeroTvaBienForme(p.numeroTva, p.pays)) m.push("tva-numero-invalide");
    }
    // HORS FRANCE, LE NUMÉRO DE TVA EST OBLIGATOIRE POUR AUTOLIQUIDER.
    // Sans lui, on ne peut pas prouver que le preneur est assujetti, et
    // l'autoliquidation devient de la TVA à notre charge.
    if (p.pays && p.pays !== PAYS_CLIENT && estDansLUnion(p.pays) && !p.numeroTva) {
      m.push("tva-numero");
    }
  }

  // LE MANDAT EST LA CONDITION DE TOUT. Sans lui on n'émet rien.
  if (!p.mandatAccepteLe || p.mandatVersion !== MANDAT_VERSION) m.push("mandat");
  return m;
}

export function profilFiscalComplet(p: ProfilFiscal): boolean {
  return manquesFiscaux(p).length === 0;
}

export type RegimeAutofacture =
  /** Prestataire français assujetti : TVA française, 20 %. */
  | "france-tva"
  /** Prestataire français en franchise en base : pas de TVA. */
  | "franchise-en-base"
  /** Prestataire de l'Union hors France : autoliquidation par NOUS. */
  | "autoliquidation-ue"
  /** Prestataire hors Union : autoliquidation aussi. */
  | "autoliquidation-hors-ue"
  /** Particulier : pas de TVA, et c'est un cas à surveiller. */
  | "particulier";

export interface DecisionAutofacture {
  regime: RegimeAutofacture;
  /** En points de base. 2000 = 20 %. */
  tauxBp: number;
  /** Les mentions légales à imprimer, dans l'ordre. */
  mentions: string[];
  /** Ce qui reste à vérifier à la main. */
  aVerifier: string[];
}

/** La mention obligatoire de l'article 242 nonies A, sur TOUTE la série. */
export const MENTION_AUTOFACTURATION =
  "Autofacturation : facture établie par le client au nom et pour le compte du prestataire, en vertu du mandat de facturation accepté par ce dernier.";

/**
 * LE RÉGIME DE TVA D'UNE AUTOFACTURE.
 *
 * **C'EST LE MIROIR DE LA VENTE, PAS SA COPIE.** Ici l'affilié est le
 * VENDEUR et nous sommes le client. Conséquence directe et
 * contre-intuitive : **on n'a jamais besoin du taux d'un autre pays que
 * la France.** Un prestataire belge ne nous facture pas la TVA belge ;
 * son service est taxé là où le preneur est établi, donc chez nous, et
 * c'est NOUS qui l'autoliquidons.
 *
 * Le cas qui n'existe pas du côté vente et qui est ici le plus
 * fréquent : la FRANCHISE EN BASE. Un auto-entrepreneur sous les seuils
 * ne facture pas la TVA, et lui en faire porter une l'obligerait à la
 * reverser.
 */
export function resoudreTvaAutofacture(p: ProfilFiscal): DecisionAutofacture {
  const mentions = [MENTION_AUTOFACTURATION];
  const aVerifier: string[] = [];
  const pays = p.pays ?? PAYS_CLIENT;
  if (!p.pays) aVerifier.push("pays");

  if (p.statut === "particulier") {
    // Un particulier ne peut pas, en principe, facturer une prestation
    // de services à titre habituel. On émet quand même (il a gagné cet
    // argent), et on SIGNALE : c'est à Béné de voir s'il doit se
    // déclarer. Retenir son argent en attendant serait pire.
    return {
      regime: "particulier",
      tauxBp: 0,
      mentions: [...mentions, "TVA non applicable : prestataire non assujetti."],
      aVerifier: [...aVerifier, "statut-particulier"],
    };
  }

  if (pays === PAYS_CLIENT) {
    if (!p.assujettiTva) {
      return {
        regime: "franchise-en-base",
        tauxBp: 0,
        mentions: [...mentions, "TVA non applicable, article 293 B du CGI."],
        aVerifier,
      };
    }
    return { regime: "france-tva", tauxBp: TAUX_UE[PAYS_CLIENT], mentions, aVerifier };
  }

  const dansLUnion = estDansLUnion(pays);
  const numeroBon = numeroTvaBienForme(p.numeroTva, pays);
  if (dansLUnion && !numeroBon) {
    // Sans numéro valide, on ne peut pas prouver que le prestataire est
    // assujetti. On n'invente pas d'autoliquidation : on marque.
    aVerifier.push("tva-numero-invalide");
  }

  return {
    regime: dansLUnion ? "autoliquidation-ue" : "autoliquidation-hors-ue",
    tauxBp: 0,
    mentions: [
      ...mentions,
      dansLUnion
        ? "Autoliquidation : TVA due par le preneur (article 283-2 du CGI, article 196 de la directive 2006/112/CE)."
        : "Autoliquidation : TVA due par le preneur établi en France (article 283-2 du CGI).",
    ],
    aVerifier: dansLUnion && numeroBon ? [...aVerifier, "tva-a-valider-vies"] : aVerifier,
  };
}

export interface MontantsAutofacture {
  htCents: number;
  tvaCents: number;
  ttcCents: number;
  tauxBp: number;
}

/**
 * LE MONTANT DE LA FACTURE, À PARTIR DE LA COMMISSION.
 *
 * La commission est un montant NET DE TAXE (`COMMISSION_EST_HT`) : la
 * TVA s'AJOUTE quand le prestataire la facture. C'est l'inverse des
 * factures de vente, où le prix est TTC et la TVA se calcule DEDANS.
 *
 * Confondre les deux sens ferait payer 20 % de moins à chaque affilié
 * assujetti, sans que rien ne le signale avant sa réclamation.
 */
export function montantsAutofacture(commissionCents: number, tauxBp: number): MontantsAutofacture {
  const ht = Math.round(Number(commissionCents) || 0);
  const bp = Math.max(0, Math.round(Number(tauxBp) || 0));
  if (!COMMISSION_EST_HT) {
    // La commission serait alors TTC : on décompose au lieu d'ajouter.
    const htDedans = bp === 0 ? ht : Math.round((ht * 10_000) / (10_000 + bp));
    return { htCents: htDedans, tvaCents: ht - htDedans, ttcCents: ht, tauxBp: bp };
  }
  const tva = Math.round((ht * bp) / 10_000);
  return { htCents: ht, tvaCents: tva, ttcCents: ht + tva, tauxBp: bp };
}

/** L'adresse du prestataire, telle qu'elle s'imprime. */
export function lignesAdresseFiscale(p: ProfilFiscal, nomPays: (c: string) => string): string[] {
  const lignes: string[] = [];
  if (p.denomination) lignes.push(p.denomination);
  if (p.adresse1) lignes.push(p.adresse1);
  if (p.adresse2) lignes.push(p.adresse2);
  const ville = [p.codePostal, p.ville].filter(Boolean).join(" ").trim();
  if (ville) lignes.push(ville);
  if (p.pays) lignes.push(nomPays(p.pays));
  return lignes;
}
