// lib/affiliate/rattachementManuel.ts
//
// BÉNÉ ATTRIBUE UN CLIENT À UN AFFILIÉ, À LA MAIN.
//
// Béné, 18 septembre 2026 : "je ne veux pas créditer automatiquement un
// affilié, en revanche s'il me prouve que le lien n'a pas fonctionné, je
// veux pouvoir lui attribuer un client manuellement et qu'il devienne
// son affilié, et qu'il touche les commissions. Mais ça doit rester
// manuel depuis pilotage affiliation."
//
// -- CE QUE CE MODULE DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ----------------
//
// Il décide si le geste est POSSIBLE, et sous quelle forme. Il ne décide
// jamais s'il est JUSTE : ça, c'est elle, et c'est pour ça que rien ici
// ne se déclenche tout seul.
//
// PUR : ni base, ni réseau, ni horloge. L'appelant apporte ce qu'il a lu.
//
// -- LE CAS QUI COMPTE : LE CONFLIT ------------------------------------
//
// Le PREMIER rattachement gagne, c'est la règle du 26 août, et elle
// protège l'affilié qui a fait le travail. Un geste manuel qui
// écraserait ce premier rattachement en silence prendrait à l'un pour
// donner à l'autre, sans que personne ne le voie.
//
// Donc : quand la personne est déjà rattachée à quelqu'un d'AUTRE, on
// ne refuse pas, **on exige que ce soit dit**. `remplacer: true` est un
// paramètre séparé, que l'écran ne coche pas tout seul, et qui produit
// une trace nommée. C'est la même mécanique que `base` pour les
// commissions (26 août) : un appelant muet ne peut pas faire le geste
// dangereux par accident.

/** D'où vient un rattachement. Le mot est écrit en base, tel quel. */
export type OrigineRattachement =
  | "clic"
  | "inscription"
  | "vente"
  | "import_sio"
  | "manuel";

/** L'état du rattachement AVANT le geste, tel que la base le dit. */
export interface EtatRattachement {
  /** Le `sa` déjà rattaché à cette personne, ou `null`. */
  saActuel: string | null;
  /** L'origine de ce rattachement là, quand on la connaît. */
  origineActuelle: OrigineRattachement | null;
}

export type VerdictRattachementManuel =
  /** Rien n'existe : on écrit, et c'est le geste courant. */
  | { action: "creer" }
  /** Déjà rattaché au MÊME affilié : rien à faire, et ce n'est pas une erreur. */
  | { action: "rien"; motif: "deja_le_meme" }
  /**
   * Rattaché à QUELQU'UN D'AUTRE, et l'appelant ne l'a pas dit.
   *
   * On s'arrête, on rend le `sa` en place, et l'écran demande une
   * confirmation NOMMÉE. Écraser en silence serait le pire des deux.
   */
  | { action: "conflit"; saEnPlace: string }
  /** Rattaché à quelqu'un d'autre, et l'appelant a explicitement demandé. */
  | { action: "remplacer"; saRemplace: string }
  /** Le geste est impossible, et on dit pourquoi. */
  | { action: "refus"; motif: MotifRefusRattachement };

export type MotifRefusRattachement =
  /** L'adresse ne ressemble pas à une adresse. */
  | "adresse_invalide"
  /** Aucun affilié ne porte ce code, ou il n'est pas actif. */
  | "affilie_inconnu"
  /** On ne se rattache pas à soi même, alias compris. */
  | "soi_meme"
  /** Un geste manuel se signe : sans l'adresse de qui décide, on refuse. */
  | "non_signe";

export interface DemandeRattachementManuel {
  email: string;
  /** L'affilié destinataire, déjà résolu contre la table par l'appelant. */
  sa: string | null;
  /** L'affilié est il ACTIF ? Un affilié exclu ne reçoit rien. */
  affilieActif: boolean;
  /** Est ce la même personne que l'affilié, alias compris ? */
  estSoiMeme: boolean;
  /** Qui décide. Obligatoire : un geste à vie qui porte de l'argent se signe. */
  decidePar: string | null;
  /**
   * REMPLACER UN RATTACHEMENT EXISTANT.
   *
   * Paramètre SÉPARÉ et explicite. Sans lui, un conflit s'arrête et
   * remonte à l'écran : c'est la seule forme qui empêche de prendre à
   * un affilié pour donner à un autre sans s'en rendre compte.
   */
  remplacer: boolean;
  etat: EtatRattachement;
}

export function verdictRattachementManuel(
  d: DemandeRattachementManuel,
): VerdictRattachementManuel {
  const email = String(d.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { action: "refus", motif: "adresse_invalide" };

  const sa = String(d.sa ?? "").trim();
  if (!sa || !d.affilieActif) return { action: "refus", motif: "affilie_inconnu" };

  // LA MÊME RÈGLE QUE LA COMMISSION ET LE MOIS OFFERT. Un affilié qui
  // s'attribue ses propres achats n'est pas un affilié.
  if (d.estSoiMeme) return { action: "refus", motif: "soi_meme" };

  // UN GESTE MANUEL SE SIGNE. Ce n'est pas du confort : ce rattachement
  // vaut 40 % de chaque échéance, pour toujours, et il doit pouvoir
  // s'expliquer six mois plus tard.
  if (!String(d.decidePar ?? "").trim()) return { action: "refus", motif: "non_signe" };

  const enPlace = String(d.etat.saActuel ?? "").trim();
  if (!enPlace) return { action: "creer" };
  if (enPlace === sa) return { action: "rien", motif: "deja_le_meme" };
  return d.remplacer
    ? { action: "remplacer", saRemplace: enPlace }
    : { action: "conflit", saEnPlace: enPlace };
}

/**
 * CE QUE L'ÉCRAN DOIT DIRE D'UN RATTACHEMENT DÉJÀ EN PLACE.
 *
 * Béné : "je dois tout savoir sur tout, de façon fiable et sécurisée."
 *
 * Les cinq origines n'ont pas la même force de preuve, et c'est
 * exactement ce qu'elle a besoin de distinguer le jour où deux affiliés
 * se disputent le même client. `null` est une VRAIE réponse : les
 * lignes d'avant le 18 septembre 2026 n'ont pas d'origine mesurée, et
 * écrire "clic" dessus serait une affirmation que personne n'a faite.
 */
export function forceDeLaPreuve(
  origine: OrigineRattachement | null,
): "mesuree" | "declaree" | "inconnue" {
  switch (origine) {
    case "clic":
    case "inscription":
    case "vente":
      // On l'a VU se produire : une requête, un cookie, une vente.
      return "mesuree";
    case "manuel":
    case "import_sio":
      // Quelqu'un l'a décidé ou repris d'ailleurs. C'est légitime, et
      // ça ne se confond pas avec une mesure.
      return "declaree";
    default:
      return "inconnue";
  }
}
