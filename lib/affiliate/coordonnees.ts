// lib/affiliate/coordonnees.ts
//
// COMMENT UNE AFFILIÉE VEUT ÊTRE PAYÉE.
//
// Béné, 25 août 2026 : "pour l'affiliation on doit proposer le choix aux
// affiliés : Paypal ou virement bancaire. Ils doivent pouvoir indiquer
// leur mail paypal OU leur rib pour un virement."
//
// -- LA MÉTHODE EST UN CHOIX EXPLICITE, JAMAIS UNE DÉDUCTION -----------
//
// On pourrait deviner : "il a rempli un IBAN, donc virement". Ça marche
// jusqu'au jour où quelqu'un remplit les deux (parce qu'il a hésité, ou
// parce qu'il a changé d'avis sans effacer), et alors c'est le code qui
// décide où part son argent. `payout_method` est donc une colonne, et
// `resoudreMethode` ne devine que pour les lignes HISTORIQUES qui n'ont
// pas encore de choix enregistré.
//
// C'est la règle du dépôt depuis le 1er août : quand un cas a deux
// mécaniques, la mécanique est un PARAMÈTRE, pas une variable devinée à
// l'intérieur.
//
// -- CE QU'ON VALIDE, ET CE QU'ON NE VALIDE PAS ------------------------
//
// La FORME, pas l'existence. Un IBAN bien formé peut être fermé, un
// email PayPal bien formé peut n'être rattaché à aucun compte. La
// vérification réelle, c'est le virement qui la fait : la banque rejette,
// PayPal renvoie l'argent. C'est pour ça que le lot de versement garde
// une trace et que rien ne passe en "payé" sans que Béné l'ait dit.
//
// La clé de contrôle IBAN (modulo 97) attrape en revanche la faute de
// frappe, qui est le cas fréquent : un chiffre inversé donne un IBAN
// syntaxiquement plausible et un virement rejeté trois jours plus tard.

/** Les deux façons d'être payé. Il n'y en aura pas de troisième sans décision. */
export type MethodeVersement = "paypal" | "virement";

export const METHODES: readonly MethodeVersement[] = ["paypal", "virement"];

/** Ce qu'une affiliée a renseigné, tel qu'il sort de la base. */
export interface CoordonneesBrutes {
  payout_method?: string | null;
  paypal_email?: string | null;
  iban_holder?: string | null;
  iban_number?: string | null;
  bic?: string | null;
}

export interface Coordonnees {
  methode: MethodeVersement | null;
  paypalEmail: string | null;
  titulaire: string | null;
  iban: string | null;
  bic: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texte(v: unknown, max = 120): string | null {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return s ? s.slice(0, max) : null;
}

/**
 * NORMALISER N'EST PAS VALIDER, et les confondre fait disparaître les
 * fautes de frappe.
 *
 * Premier jet : `normaliserBic` rendait `null` dès que la longueur
 * n'était pas 8 ou 11. Un BIC tapé de travers devenait donc `null`,
 * `manquesVersement` ne voyait plus rien à signaler, et le champ était
 * silencieusement vidé. L'affiliée voyait sa saisie disparaître sans un
 * mot. C'est le défaut du `ok: false` muet (3 août), en plus discret.
 *
 * Ces deux fonctions NETTOIENT (espaces, tirets, casse) et rendent ce
 * qui a été saisi. Ce sont `ibanValide` et `bicValide` qui jugent, et
 * `manquesVersement` qui le dit.
 */
export function normaliserIban(v: unknown): string | null {
  const s = typeof v === "string" ? v.replace(/[\s.\-]/g, "").toUpperCase() : "";
  return s ? s.slice(0, 34) : null;
}

export function normaliserBic(v: unknown): string | null {
  const s = typeof v === "string" ? v.replace(/[\s.\-]/g, "").toUpperCase() : "";
  return s ? s.slice(0, 11) : null;
}

/**
 * LA CLÉ DE CONTRÔLE IBAN (modulo 97, norme ISO 13616).
 *
 * On déplace les 4 premiers caractères à la fin, on remplace les lettres
 * par leur rang + 9 (A=10 ... Z=35), et le nombre obtenu doit valoir 1
 * modulo 97. Le reste se calcule par morceaux : le nombre entier ferait
 * jusqu'à 38 chiffres, très au delà de ce qu'un `number` sait porter
 * sans perdre en précision. Une précision perdue ici accepterait des
 * IBAN faux et en refuserait des bons.
 */
export function ibanValide(v: unknown): boolean {
  const iban = normaliserIban(v);
  if (!iban || iban.length < 15 || iban.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const reordonne = iban.slice(4) + iban.slice(0, 4);
  let reste = 0;
  for (const c of reordonne) {
    const valeur = c >= "0" && c <= "9" ? c : String(c.charCodeAt(0) - 55);
    if (!/^\d+$/.test(valeur)) return false;
    for (const chiffre of valeur) reste = (reste * 10 + Number(chiffre)) % 97;
  }
  return reste === 1;
}

export function bicValide(v: unknown): boolean {
  const bic = normaliserBic(v);
  if (!bic || (bic.length !== 8 && bic.length !== 11)) return false;
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
}

export function emailPaypalValide(v: unknown): boolean {
  const s = texte(v, 320);
  return !!s && EMAIL_RE.test(s);
}

/**
 * Le choix ENREGISTRÉ, ou celui qu'on peut déduire d'une ligne
 * historique.
 *
 * Les lignes d'avant le 25 août n'ont pas de `payout_method` : elles ont
 * parfois un `paypal_email` ou un IBAN saisis en juin, avant que la page
 * Paiement ne soit débranchée. On les lit, mais on ne les considère
 * jamais comme un choix : `explicite` dit la différence, et l'écran
 * redemande.
 */
export function resoudreMethode(brut: CoordonneesBrutes): {
  methode: MethodeVersement | null;
  explicite: boolean;
} {
  const choisi = String(brut.payout_method ?? "").trim().toLowerCase();
  if (choisi === "paypal" || choisi === "virement") {
    return { methode: choisi, explicite: true };
  }
  const aIban = !!normaliserIban(brut.iban_number);
  const aPaypal = emailPaypalValide(brut.paypal_email);
  // Les DEUX remplis sans choix : on ne tranche pas. Décider à la place
  // de quelqu'un où part son argent est exactement ce qu'on ne fait pas.
  if (aIban && aPaypal) return { methode: null, explicite: false };
  if (aIban) return { methode: "virement", explicite: false };
  if (aPaypal) return { methode: "paypal", explicite: false };
  return { methode: null, explicite: false };
}

export function lireCoordonnees(brut: CoordonneesBrutes): Coordonnees {
  return {
    methode: resoudreMethode(brut).methode,
    paypalEmail: texte(brut.paypal_email, 320),
    titulaire: texte(brut.iban_holder, 140),
    iban: normaliserIban(brut.iban_number),
    bic: normaliserBic(brut.bic),
  };
}

export type ManqueVersement =
  | "methode"
  | "paypal-email"
  | "titulaire"
  | "iban"
  | "iban-invalide"
  | "bic-invalide";

/**
 * CE QUI MANQUE POUR POUVOIR LA PAYER.
 *
 * La méthode décide de ce qu'on exige : réclamer un IBAN à quelqu'un qui
 * a choisi PayPal, c'est un formulaire qu'il n'aura jamais fini.
 *
 * **Le BIC n'est PAS exigé.** Depuis 2016 un virement SEPA se fait avec
 * le seul IBAN à l'intérieur de la zone. L'exiger bloquerait des
 * affiliées pour un champ que leur banque n'imprime plus. On le garde
 * s'il est fourni (certaines banques hors zone euro le demandent encore),
 * et on refuse seulement s'il est fourni ET faux.
 */
export function manquesVersement(c: Coordonnees): ManqueVersement[] {
  const m: ManqueVersement[] = [];
  if (!c.methode) {
    m.push("methode");
    return m;
  }
  if (c.methode === "paypal") {
    if (!emailPaypalValide(c.paypalEmail)) m.push("paypal-email");
    return m;
  }
  if (!c.titulaire) m.push("titulaire");
  if (!c.iban) m.push("iban");
  else if (!ibanValide(c.iban)) m.push("iban-invalide");
  if (c.bic && !bicValide(c.bic)) m.push("bic-invalide");
  return m;
}

export function peutEtrePayee(c: Coordonnees): boolean {
  return manquesVersement(c).length === 0;
}

/**
 * L'IBAN tel qu'on le RÉAFFICHE : les 4 premiers, les 4 derniers.
 *
 * Il ne ressort JAMAIS en clair d'une route, pas même vers sa
 * propriétaire : un écran se photographie, se partage, se laisse ouvert.
 * Elle a besoin de reconnaître le sien, pas de le relire. Pour le
 * changer, elle le ressaisit en entier.
 */
export function masquerIban(iban: string | null | undefined): string | null {
  const propre = normaliserIban(iban);
  if (!propre) return null;
  if (propre.length <= 8) return propre;
  return `${propre.slice(0, 4)}${"•".repeat(Math.min(propre.length - 8, 18))}${propre.slice(-4)}`;
}

/** L'adresse PayPal réaffichée : `mar•••@exemple.fr`. */
export function masquerEmail(email: string | null | undefined): string | null {
  const s = texte(email, 320);
  if (!s || !s.includes("@")) return null;
  const [avant, apres] = s.split("@");
  const debut = avant.slice(0, Math.min(3, avant.length));
  return `${debut}${"•".repeat(Math.max(2, avant.length - debut.length))}@${apres}`;
}
