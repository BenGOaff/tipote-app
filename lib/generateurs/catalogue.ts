// lib/generateurs/catalogue.ts
//
// LES TROIS GÉNÉRATEURS, ET CE QU'IL FAUT AVANT DE POUVOIR S'EN SERVIR.
//
// Béné, 1er septembre 2026 : "pour les générateurs oui on va le faire
// pour les membres + et les beta/lifetime, ça doit être visible pour les
// membres gratuits et sans plus -> s'ils veulent s'en servir on leur
// propose d'upgrader. On doit le faire bien, sur une page générateurs ->
// l'user choisit quel générateur il veut utiliser (3 cartes cliquables).
// Ensuite un nouvel onglet s'ouvre, l'user choisit le quiz pour lequel il
// veut créer, comme sur l'Atelier."
//
// -- POURQUOI CE MODULE EXISTE, ET CE QU'IL EMPÊCHE --------------------
//
// Les trois générateurs n'ont PAS les mêmes conditions, et une page qui
// les propose tous les trois sur n'importe quel projet envoie la
// créatrice se cogner à un écran de saisie qui ne peut rien produire :
//
//   - un SONDAGE n'a pas de profil de résultat. Un bonus qui prolonge
//     LE résultat obtenu, et une séquence d'emails déclenchée par le tag
//     d'un profil, n'ont donc rien à quoi se raccrocher là bas.
//     Promouvoir le sondage, si.
//   - un quiz dont les profils n'ont NI titre NI description ne donne
//     rien à écrire : le modèle inventerait le contenu du quiz, ce qui
//     est exactement le contraire de la promesse (un bonus qui parle de
//     CE résultat là, avec SES mots).
//
// La décision vit donc ICI, en fonction pure, et l'écran l'affiche. Un
// écran qui recalculerait sa propre règle finirait par proposer un
// générateur qui échoue (le défaut sorti six fois dans ce dépôt).
//
// -- ET IL NE REND AUCUNE PHRASE --------------------------------------
//
// L'interface existe en 7 langues. Ce module rend des DONNÉES ; l'écran
// écrit. C'est la même règle que `planSysteme.ts`.

/** Les trois générateurs. La liste est fermée. */
export const GENERATEURS = ["bonus", "emails", "promo"] as const;
export type GenerateurId = (typeof GENERATEURS)[number];

/**
 * Pourquoi un générateur n'est pas utilisable sur CE projet.
 *
 * `null` = il l'est.
 */
export type BlocageGenerateur =
  /** Un sondage n'a pas de profil de résultat. */
  | "sondage"
  /** Le quiz n'a aucun profil renseigné (ni titre ni description). */
  | "profils-vides"
  /** Le quiz n'a pas encore de question : il n'y a rien à exploiter. */
  | "quiz-vide";

/** Le projet, réduit à ce dont la décision a besoin. */
export interface ProjetPourGenerateur {
  mode?: string | null;
  /** Les profils de résultat, déjà nettoyés de leur texte riche. */
  profils?: { titre?: string | null; description?: string | null }[] | null;
  /** Combien de questions le quiz porte. */
  nbQuestions?: number | null;
}

const rempli = (v: unknown): boolean => String(v ?? "").trim().length > 0;

/**
 * Ce générateur peut-il tourner sur ce projet ?
 *
 * L'ORDRE DES CONTRÔLES COMPTE : on nomme d'abord ce qui ne se répare
 * pas (un sondage restera un sondage), puis ce qui se répare (remplir
 * ses profils). Dire "tes profils sont vides" à propos d'un sondage
 * enverrait la créatrice remplir un écran qui n'existe pas.
 */
export function blocageGenerateur(
  id: GenerateurId,
  projet: ProjetPourGenerateur,
): BlocageGenerateur | null {
  const estSondage = String(projet.mode ?? "").trim() === "survey";

  // PROMOUVOIR marche sur tout, y compris un sondage : on parle du
  // projet et de sa promesse, pas de ses résultats.
  if (id === "promo") {
    return (projet.nbQuestions ?? 0) > 0 ? null : "quiz-vide";
  }

  if (estSondage) return "sondage";
  if ((projet.nbQuestions ?? 0) <= 0) return "quiz-vide";

  const profils = projet.profils ?? [];
  const utiles = profils.filter((p) => rempli(p?.titre) || rempli(p?.description));
  return utiles.length > 0 ? null : "profils-vides";
}

/**
 * Ce générateur demande-t-il de décrire une OFFRE payante ?
 *
 * Le quiz ne sait rien de ce qu'elle vend : c'est la SEULE chose qu'elle
 * saisit (règle du 5 août, Atelier). Promouvoir le quiz n'en a pas
 * besoin, et la demander là ferait remplir un champ pour rien.
 */
export function demandeUneOffre(id: GenerateurId): boolean {
  return id === "bonus" || id === "emails";
}

/**
 * Ce générateur écrit-il POUR UN PROFIL précis ?
 *
 * -- CE N'EST PAS UN CHOIX ESTHÉTIQUE, C'EST LE MODÈLE DE DONNÉES -----
 *
 * Le BONUS de Tiquiz est porté par le quiz (`bonus_description`,
 * `virality_enabled`) : il y en a UN, le même pour tout le monde, et
 * l'écran bonus le remet à qui a partagé. Écrire un bonus par profil
 * produirait trois documents dont deux ne seraient jamais remis.
 *
 * La SÉQUENCE D'EMAILS, elle, part d'un tag Systeme.io, et ce tag est
 * posé PAR PROFIL (`sio_tag_names`). C'est toute la mécanique de
 * l'onglet Automatiser : une règle par profil, donc une campagne par
 * profil, donc une séquence par profil. Une séquence commune enverrait
 * le même email à des gens à qui le quiz vient de dire des choses
 * opposées.
 *
 * La PROMOTION s'adresse à des gens qui n'ont pas encore répondu : il
 * n'y a pas de profil à choisir.
 */
export function demandeUnProfil(id: GenerateurId): boolean {
  return id === "emails";
}

/**
 * Les projets utilisables par ce générateur, dans l'ordre reçu.
 *
 * Sert à remplir le sélecteur : proposer un projet bloqué serait
 * proposer un cul-de-sac.
 */
export function projetsUtilisables<T extends ProjetPourGenerateur>(
  id: GenerateurId,
  projets: T[],
): T[] {
  return projets.filter((p) => blocageGenerateur(id, p) === null);
}
