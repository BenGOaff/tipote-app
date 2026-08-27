// lib/affiliate/autofacture.ts
//
// D'UNE LIGNE DE LOT À LA FACTURE DE L'AFFILIÉ.
//
// Béné, 25 août : "tous les mois on génère sa facture pour sa compta, il
// peut la télécharger et nous on peut le payer via cette facture qu'on a
// générée pour lui."
//
// **UNE FACTURE PAR AFFILIÉ ET PAR LOT**, jamais une par commission :
// c'est UN virement qu'on lui fait, donc UNE pièce. Le détail des ventes
// est dans la facture, en lignes.
//
// -- LA SÉRIE EST À NOUS, ET C'EST UN CHOIX À FAIRE VALIDER -----------
//
// `AFF-<année>-NNNN`, continue et chronologique, tenue par nous en tant
// que mandataire. C'est la pratique courante en autofacturation : le
// mandataire numérote, et le prestataire intègre ces pièces dans sa
// comptabilité.
//
// L'alternative serait une série PAR affilié, qui a l'avantage de ne pas
// mélanger nos numéros aux siens, et l'inconvénient de multiplier les
// compteurs. **À faire trancher une fois par le comptable de Béné** :
// c'est une décision comptable, pas technique, et les deux se
// défendent. Le code n'a qu'un compteur à changer.
//
// Elle ne se confond JAMAIS avec la série `TQ-` (les factures de nos
// acheteurs, dépôt Tiquiz) ni `AQ-` (celles de l'Atelier) : trois
// préfixes, trois compteurs, trois bases.

import {
  lireProfilFiscal,
  montantsAutofacture,
  resoudreTvaAutofacture,
  type ProfilFiscal,
} from "@/lib/affiliate/fiscal";
import type { LigneLot } from "@/lib/affiliate/versement";
import type { ControleVies } from "@/lib/facture/vies";

/** Le préfixe de la série. Il ne bouge jamais : il est dans les numéros émis. */
export const PREFIXE_SERIE_AFF = "AFF";

export function serieAutofacture(dateIso: string): string {
  const d = new Date(dateIso);
  const annee = Number.isNaN(d.getTime()) ? new Date().getUTCFullYear() : d.getUTCFullYear();
  return `${PREFIXE_SERIE_AFF}-${annee}`;
}

/** NOUS, le client de la prestation. Recopié sur chaque pièce. */
export interface ClientAutofacture {
  denomination: string;
  forme: string;
  adresse: string;
  rcs: string;
  tva: string;
}

/**
 * L'identité de Béné, écrite une seule fois.
 *
 * Elle DOIT correspondre à `lib/legal/company.ts` des deux autres
 * dépôts : c'est la même société. Il n'y a pas de paquet partagé, donc
 * le test fige les valeurs pour qu'un changement soit voulu.
 */
export const CLIENT: ClientAutofacture = {
  denomination: "ETHILIFE",
  forme: "SAS",
  adresse: "377 Tertre Avenue Grassion Cibrand, 34130 Mauguio, France",
  rcs: "Montpellier 909 349 045",
  tva: "FR38909349045",
};

export interface AutofactureAEmettre {
  serie: string;
  sa: string;
  emailAffilie: string;
  periode: string;
  /** Le profil fiscal RECOPIÉ : la pièce ne bouge plus après émission. */
  prestataire: ProfilFiscal;
  client: ClientAutofacture;
  libelle: string;
  /** Le nombre de ventes que cette facture solde. */
  nombreVentes: number;
  htCents: number;
  tvaCents: number;
  ttcCents: number;
  tvaTauxBp: number;
  mentions: string[];
  aVerifier: string[];
  currency: string;
  /** L'identifiant du lot qui la paie : le fil entre la pièce et le virement. */
  lotId: string;
  commissionIds: string[];
}

/**
 * Construit la facture d'une ligne de lot.
 *
 * `profil` est un PARAMÈTRE, jamais relu depuis la base ici : la ligne
 * du lot est déjà figée, et l'identité doit l'être avec elle. Si
 * l'affiliée change d'adresse le lendemain, la facture émise ne change
 * pas : c'est une pièce comptable, pas un écran.
 */
export function construireAutofacture(args: {
  ligne: LigneLot;
  profil: ProfilFiscal;
  periode: string;
  lotId: string;
  emiseLe: string;
  /**
   * Ce que VIES a répondu sur son numéro de TVA, demandé au moment de
   * figer le lot. Obligatoire : un défaut optionnel ferait taire la
   * question au premier appelant qui l'oublie, et c'est Béné qui
   * porterait l'autoliquidation injustifiée.
   */
  vies: ControleVies;
}): AutofactureAEmettre {
  const profil = lireProfilFiscal(args.profil);
  const tva = resoudreTvaAutofacture(profil, args.vies);
  const m = montantsAutofacture(args.ligne.montantCents, tva.tauxBp);
  return {
    serie: serieAutofacture(args.emiseLe),
    sa: args.ligne.sa,
    emailAffilie: args.ligne.email,
    periode: args.periode,
    prestataire: profil,
    client: CLIENT,
    libelle: `Commissions d'apport d'affaires - ${args.periode}`,
    nombreVentes: args.ligne.commissionIds.length,
    htCents: m.htCents,
    tvaCents: m.tvaCents,
    ttcCents: m.ttcCents,
    tvaTauxBp: m.tauxBp,
    mentions: tva.mentions,
    aVerifier: tva.aVerifier,
    currency: "EUR",
    lotId: args.lotId,
    commissionIds: args.ligne.commissionIds,
  };
}

/** Le montant formaté, pour l'écran et pour la pièce. */
export function formatMontantAff(cents: number, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
    (Number(cents) || 0) / 100,
  );
}

/**
 * LE TEXTE DU MANDAT, celui que l'affilié accepte.
 *
 * Il vit ici et pas dans un fichier de langue : c'est un acte juridique,
 * pas de la copy. La VERSION est stockée avec l'acceptation, et changer
 * ce texte force une réacceptation (`MANDAT_VERSION`).
 *
 * Il est en français pour tout le monde, et c'est assumé : le contrat
 * d'affiliation l'est aussi, et une traduction qui dériverait de
 * l'original créerait deux mandats différents.
 */
export const TEXTE_MANDAT = [
  "En acceptant ce mandat, tu autorises ETHILIFE SAS à établir en ton nom et pour ton compte les factures correspondant aux commissions d'apport d'affaires qui te sont dues, conformément à l'article 289 I-2 du Code général des impôts.",
  "Chaque facture t'est mise à disposition dans ton espace dès son émission. Tu disposes de la faculté de la contester : si une facture te semble erronée, écris-nous et nous émettrons un avoir.",
  "Tu restes responsable de tes obligations fiscales et déclaratives, et tu t'engages à nous signaler tout changement de statut, d'adresse, de numéro de TVA ou de régime de TVA.",
  "Ce mandat vaut pour la durée de ta participation au programme d'affiliation. Tu peux y mettre fin à tout moment en nous écrivant : tu émettras alors tes propres factures.",
];
