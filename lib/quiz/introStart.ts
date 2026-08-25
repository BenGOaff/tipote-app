// lib/quiz/introStart.ts
//
// PAR QUOI LE VISITEUR COMMENCE : un bouton, son prénom, ou la première
// question.
//
// Béné, 25 août 2026 : "j'aimerais proposer de commencer le quiz direct
// par une question, au lieu du CTA commencer le quiz. Par exemple :
// demander le prénom ou poser une question OUI NON : un truc qui engage
// vraiment dès le départ, en dessous du titre et de la description."
//
// -- LA GARANTIE, AVANT TOUT LE RESTE ---------------------------------
//
// `'button'` est le défaut, et SEULE une valeur explicite en sort. Champ
// nul, colonne absente, migration pas encore passée, valeur inconnue,
// faute de frappe : on rend le comportement d'aujourd'hui. Aucun quiz en
// ligne ne bouge tant que sa créatrice n'a rien coché. C'est la même
// garantie que `result_layout` (3 août), et elle se lit ici en une
// ligne : tout ce qui n'est pas reconnu tombe sur `'button'`.
//
// -- POURQUOI UN REFUS SE DIT, ET NE SE TAIT PAS ----------------------
//
// Trois combinaisons ne peuvent pas s'afficher, et une créatrice qui
// coche un réglage sans effet conclut que le bouton ne marche pas
// (Jocelyne, 1er août : le menu de tailles qui affichait la bonne valeur
// pendant que l'écran gardait l'ancienne). La fonction rend donc CE QUI
// S'AFFICHE et, quand elle a dégradé, la RAISON. L'éditeur affiche la
// raison ; le viewer l'ignore.
//
// C'est la même règle que le `ok: false` du 3 août : le serveur renvoie
// la raison, l'interface décide de la phrase, parce qu'elle existe en 7
// langues.
//
// -- CE QUE ÇA FAIT AUX STATS, ET C'EST LE POINT DÉLICAT --------------
//
// Aujourd'hui : `view` au chargement, `start` au clic sur le bouton,
// puis `question_view` de la question 1. La plus grosse fuite d'un quiz
// est presque toujours entre `view` et `start`, et elle n'est mesurée
// nulle part ailleurs que là.
//
// En mode `'question'`, il n'y a plus de clic à compter : l'écran
// d'accueil EST la question 1. Donc
//   - `question_view(0)` part au rendu, comme pour n'importe quelle
//     question. Sa valeur devient égale au nombre de vues, et c'est
//     VRAI : ils l'ont vue.
//   - `start` part à la PREMIÈRE RÉPONSE. C'est le seul geste qui
//     prouve un engagement. Le poser au rendu donnerait 100% de
//     démarrages sur tous les quiz, donc un chiffre qui ne dit plus rien
//     et une fuite d'entrée qui disparaît de l'écran sans avoir disparu
//     de la réalité.
//
// La fuite d'entrée ne disparaît donc pas : elle DÉMÉNAGE dans le
// funnel, entre "vu la question 1" et "répondu à la question 1". Elle
// devient même plus lisible, puisqu'elle porte enfin sur un contenu
// précis au lieu d'un bouton.
//
// MAIS deux périodes du même quiz ne se comparent plus, et c'est
// exactement le piège d'Adeline (un chiffre qui change de sens sous
// l'historique). `introStartAvertissementStats()` existe pour que
// l'écran de stats le DISE au lieu de laisser croire à un bond de
// performance le jour du changement.

/** Ce qui s'affiche sous le titre et la description. */
export type IntroStartMode = "button" | "personalize" | "question";

/** Pourquoi ce qui était demandé n'a pas pu s'afficher. */
export type IntroStartRefus =
  | "capture-avant"
  | "aucune-question"
  | "rien-a-demander";

export interface IntroStartContexte {
  /** L'email est demandé AVANT les questions (sondage). */
  captureAvant: boolean;
  /** Nombre de questions vivantes du quiz. */
  nbQuestions: number;
  /** Le quiz demande le prénom. */
  demandePrenom: boolean;
  /** Le quiz demande le genre. */
  demandeGenre: boolean;
}

export interface IntroStartDecision {
  /** Ce qui s'affiche VRAIMENT. Le viewer ne lit que ça. */
  mode: IntroStartMode;
  /** Ce que la créatrice a demandé, même si ça n'a pas pu s'appliquer. */
  demande: IntroStartMode;
  /** Renseigné uniquement quand `mode` a dégradé `demande`. */
  refus: IntroStartRefus | null;
}

/** Les valeurs qu'une colonne peut porter. Tout le reste vaut "button". */
const MODES: readonly IntroStartMode[] = ["button", "personalize", "question"];

/**
 * Décide par quoi le visiteur commence.
 *
 * `brut` est la valeur telle qu'elle sort de la base : elle peut être
 * `undefined` (colonne pas encore créée), `null`, un nombre, ou un mot
 * qu'on ne connaît pas. Aucun de ces cas ne doit rien changer.
 */
export function resolveIntroStart(brut: unknown, ctx: IntroStartContexte): IntroStartDecision {
  const demande: IntroStartMode =
    typeof brut === "string" && (MODES as readonly string[]).includes(brut)
      ? (brut as IntroStartMode)
      : "button";

  if (demande === "button") return { mode: "button", demande, refus: null };

  if (demande === "question") {
    // Le sondage demande l'email AVANT les questions. Hisser la question
    // 1 sur l'accueil inverserait l'ordre que la créatrice a choisi, et
    // la réponse partirait avant qu'on sache à qui elle appartient.
    if (ctx.captureAvant) return { mode: "button", demande, refus: "capture-avant" };
    if (ctx.nbQuestions <= 0) return { mode: "button", demande, refus: "aucune-question" };
    return { mode: "question", demande, refus: null };
  }

  // personalize : il faut quelque chose à demander.
  if (!ctx.demandePrenom && !ctx.demandeGenre) {
    return { mode: "button", demande, refus: "rien-a-demander" };
  }
  return { mode: "personalize", demande, refus: null };
}

/**
 * Le `start` se compte-t-il sur un clic, ou sur la première réponse ?
 *
 * Paramètre obligatoire plutôt que déduit à l'intérieur du viewer : deux
 * endroits qui décideraient ça séparément finiraient par compter deux
 * fois, ou zéro fois. En `'question'`, le bouton n'existe plus, donc le
 * seul geste qui prouve un engagement est la réponse.
 */
export function startSurPremiereReponse(mode: IntroStartMode): boolean {
  return mode === "question";
}

/**
 * L'écran d'accueil est-il fusionné avec la question 1 ?
 *
 * Utilisé par le viewer pour partir directement sur l'écran de question,
 * et par cet écran pour afficher le titre et l'introduction au dessus de
 * la question 1. Un SEUL appel décide des deux, sinon on obtient un
 * accueil qui disparaît sans que le titre réapparaisse ailleurs.
 */
export function accueilFusionne(mode: IntroStartMode): boolean {
  return mode === "question";
}

/**
 * Ce que l'écran de stats doit dire quand le quiz démarre sur une
 * question, ou rien du tout.
 *
 * Rendre une CLÉ et pas une phrase : l'interface existe en 7 langues, et
 * c'est la règle du 3 août (le serveur renvoie la raison, jamais le
 * texte).
 */
export function introStartAvertissementStats(mode: IntroStartMode): "demarrage-sur-question" | null {
  return mode === "question" ? "demarrage-sur-question" : null;
}
