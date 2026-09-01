// lib/quiz/brouillonReponse.ts
//
// CE QUE LE VISITEUR VOIT QUAND IL REVIENT SUR UNE QUESTION
// (retour Adeline, 1er septembre 2026).
//
// "On peut revenir en arrière, ce qui est un plus, mais lorsqu'on le
// fait ça efface les cases suivantes déjà remplies."
//
// Elle a raison, et rien n'était effacé en base : `answers` n'est jamais
// tronqué. Ce qui était cassé, c'est le BROUILLON, c'est à dire l'état
// de saisie de la question affichée (le texte tapé, les cases cochées,
// le champ "Autre"). Il vivait dans QUATRE variables GLOBALES au
// composant, jamais remises à la question courante :
//
//   - le texte tapé dans une question à texte libre PARTAIT AVEC LE
//     VISITEUR : en avançant, la question suivante s'affichait
//     pré-remplie avec la réponse de la précédente, et valider écrasait
//     la réponse déjà donnée. C'est littéralement "ça efface les cases
//     suivantes déjà remplies" ;
//   - les cases cochées d'un multi-choix restaient cochées d'une
//     question à l'autre ;
//   - revenir sur un multi-choix déjà répondu affichait bien les cases
//     d'avant, mais le premier clic repartait d'un brouillon VIDE :
//     toutes les autres cases se décochaient d'un coup ;
//   - et décocher la dernière case faisait RÉAPPARAÎTRE la sélection
//     enregistrée (l'affichage retombait dessus), donc il était
//     impossible de tout décocher ;
//   - revenir sur un "Autre : précisez" rouvrait l'option surlignée mais
//     le champ FERMÉ, donc le texte écrit était invisible.
//
// La cause commune : la question affichée et l'état de saisie n'étaient
// reliés par rien. Un commentaire posé sur `multiOptionsDraft` affirmait
// pourtant "Reset whenever currentQ changes (handled in commitAnswer +
// an effect below)". Cet effet n'a jamais existé. Une règle écrite en
// commentaire n'est pas une règle : quatrième fois que ce dépôt le paie
// (le `w-full h-auto` des images de réponse, l'`ADD_ATTR: ["target"]`
// des liens légaux, le "Next décode déjà le segment" du pilotage).
//
// -- LA RÈGLE ----------------------------------------------------------
//
// LE BROUILLON EST DÉRIVÉ DE LA RÉPONSE DE LA QUESTION COURANTE, à
// chaque changement de question, et il est le SEUL à décider de
// l'affichage. Plus de repli du genre
// `brouillon.length > 0 ? brouillon : réponse enregistrée` : c'est ce
// repli qui rendait "tout décocher" impossible, parce qu'un brouillon
// vide est une intention, pas une absence.
//
// PURE, donc testable : c'est la seule façon d'empêcher que ça revienne.
// La logique vivait dans un composant de 5000 lignes, ce qui est
// exactement pourquoi personne ne l'a vue.

/** La réponse déjà enregistrée pour une question, telle que le viewer la porte. */
export type ReponseEnregistree =
  | { kind: "option"; optionIndex: number; text?: string }
  | { kind: "options"; optionIndices: number[]; text?: string }
  | { kind: "rating"; value: number }
  | { kind: "star"; value: number }
  | { kind: "text"; value: string };

/** L'état de saisie d'UNE question. */
export interface BrouillonQuestion {
  /** Le texte libre en cours de frappe. */
  texte: string;
  /** Les index cochés d'un multi-choix. */
  options: number[];
  /** Le texte tapé dans le champ "Autre : précisez". */
  autreTexte: string;
  /** "Autre" est choisi en choix SIMPLE (donc le champ est ouvert). */
  autreChoisi: boolean;
}

/** Une question jamais répondue, ou dont le type n'a pas de saisie. */
export const BROUILLON_VIDE: BrouillonQuestion = Object.freeze({
  texte: "",
  options: [],
  autreTexte: "",
  autreChoisi: false,
});

/**
 * Le brouillon avec lequel une question doit s'ouvrir.
 *
 * PURE. `autreIdx` vient de `otherOptionIndex(q.options)` et vaut -1
 * quand la question n'a pas de "Autre" : on ne le DEVINE jamais depuis
 * la présence d'un `text`, sinon une question sans "Autre" ouvrirait un
 * champ qui n'existe pas.
 *
 * Le tableau rendu est toujours NEUF : le partager avec la réponse
 * enregistrée ferait qu'un simple clic de case modifierait la réponse
 * déjà en base, sans passer par le bouton de validation.
 */
export function brouillonPourQuestion(
  reponse: ReponseEnregistree | null | undefined,
  autreIdx: number,
): BrouillonQuestion {
  if (!reponse) return { texte: "", options: [], autreTexte: "", autreChoisi: false };

  const aUnAutre = Number.isInteger(autreIdx) && autreIdx >= 0;

  switch (reponse.kind) {
    case "text":
      return {
        texte: typeof reponse.value === "string" ? reponse.value : "",
        options: [],
        autreTexte: "",
        autreChoisi: false,
      };

    case "options": {
      const brutes = Array.isArray(reponse.optionIndices) ? reponse.optionIndices : [];
      const options = brutes
        .filter((i) => Number.isInteger(i) && i >= 0)
        .slice()
        .sort((a, b) => a - b);
      const autreCoche = aUnAutre && options.includes(autreIdx);
      return {
        texte: "",
        options,
        // Le champ d'un multi-choix suit la CASE cochée, pas ce drapeau :
        // il reste donc faux ici, et seul le texte est repris.
        autreTexte: autreCoche && typeof reponse.text === "string" ? reponse.text : "",
        autreChoisi: false,
      };
    }

    case "option": {
      const estAutre = aUnAutre && reponse.optionIndex === autreIdx;
      return {
        texte: "",
        options: [],
        autreTexte: estAutre && typeof reponse.text === "string" ? reponse.text : "",
        // En choix simple, c'est ce drapeau qui rouvre le champ. Sans lui,
        // le visiteur revenait sur "Autre" surligné et ne relisait jamais
        // ce qu'il avait écrit.
        autreChoisi: estAutre,
      };
    }

    // Note et étoiles se posent en un tap : aucune saisie à reprendre,
    // l'option choisie se relit directement dans la réponse enregistrée.
    default:
      return { texte: "", options: [], autreTexte: "", autreChoisi: false };
  }
}
