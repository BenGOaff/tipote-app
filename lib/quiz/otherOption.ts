// lib/quiz/otherOption.ts (Tipote, jumeau de Tiquiz)
//
// LA RÉPONSE "AUTRE : PRÉCISEZ" (idée de Damien, 27 août 2026).
//
// "Ajouter un vrai Autre dans les réponses des quiz et sondages, comme
// sur Google Form, pour que le visiteur puisse entrer la réponse de son
// choix. Et il faut bien sûr que ce soit collecté et analysé."
//
// -- CE QUE C'EST, ET CE QUE CE N'EST PAS ------------------------------
//
// "Autre" est une OPTION COMME LES AUTRES, plus un champ de texte. Elle
// garde son index, son `result_index` et ses `points` : en mode profils
// elle vote, en mode scoring elle compte. Rien de spécial.
//
// Ce n'est PAS une question de type `free_text` déguisée. La différence
// se voit dans la synthèse : la barre "Autre" se compte comme les
// autres barres (c'est la part de gens que la liste ne couvrait pas),
// et les textes écrits s'affichent DESSOUS. Les deux informations sont
// utiles et elles ne répondent pas à la même question :
//
//   - la barre dit COMBIEN la liste laisse de côté ;
//   - les textes disent CE QU'IL Y AURAIT FALLU METTRE.
//
// -- AUCUNE MIGRATION, ET C'EST VOULU ----------------------------------
//
// `quiz_questions.options` est du JSONB : le drapeau `is_other` s'y
// range sans toucher au schéma. `quiz_leads.answers[]` accepte déjà
// `option_index` ET `text` côte à côte. Un quiz existant ne bouge pas :
// sans le drapeau, `otherOptionIndex` rend -1 et tout se comporte comme
// avant.
//
// ATTENTION, LE PIÈGE EST AILLEURS : le PATCH de /api/quiz/[quizId] et
// les deux éditeurs recopient les options CHAMP PAR CHAMP (liste
// blanche). Un drapeau absent de ces trois listes est perdu en silence
// à la sauvegarde, exactement comme l'`image_url` d'Hugo en mai. Le
// test l'exige.
//
// -- UNE SEULE "AUTRE" PAR QUESTION ------------------------------------
//
// Deux options marquées "Autre" donneraient deux champs de texte pour
// un seul `text` en base : le deuxième écraserait le premier sans que
// personne le voie. La PREMIÈRE gagne, et l'éditeur rend le choix
// exclusif pour que le cas ne se présente pas.

/** Ce qu'on lit d'une option, quel que soit l'écran qui l'appelle. */
export interface OptionAvecAutre {
  text?: string | null;
  is_other?: boolean | null;
}

/**
 * Longueur maximale du texte saisi par le visiteur.
 *
 * Assez pour une vraie réponse, trop court pour qu'on se serve du champ
 * comme d'un dépotoir : ce texte finit dans un export, dans un prompt
 * d'analyse et dans un écran de synthèse.
 */
export const AUTRE_TEXTE_MAX = 200;

/**
 * L'index de LA réponse "Autre" d'une question, ou -1.
 *
 * PURE. Tolérante à tout ce qui peut arriver d'un JSONB : liste nulle,
 * entrée nulle, drapeau écrit en chaîne.
 */
export function otherOptionIndex(
  options: ReadonlyArray<OptionAvecAutre | null | undefined> | null | undefined,
): number {
  if (!Array.isArray(options)) return -1;
  for (let i = 0; i < options.length; i++) {
    if (options[i]?.is_other === true) return i;
  }
  return -1;
}

/** Cette option ouvre-t-elle le champ de texte ? */
export function isOtherOption(option: OptionAvecAutre | null | undefined): boolean {
  return option?.is_other === true;
}

/**
 * Le visiteur a-t-il choisi "Autre" ? `picked` couvre le choix simple
 * (un seul index) comme le multi-select.
 */
export function isOtherPicked(
  options: ReadonlyArray<OptionAvecAutre | null | undefined> | null | undefined,
  picked: ReadonlyArray<number> | null | undefined,
): boolean {
  const idx = otherOptionIndex(options);
  if (idx < 0 || !Array.isArray(picked)) return false;
  return picked.includes(idx);
}

/**
 * Nettoie ce que le visiteur a tapé.
 *
 * PURE. Espaces en trop retirés, retours à la ligne ramenés à une
 * espace (le champ est une ligne, et un retour collé casserait un CSV),
 * longueur bornée.
 */
export function sanitizeAutreTexte(brut: unknown): string {
  return String(brut ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, AUTRE_TEXTE_MAX);
}

/**
 * Peut-on valider la question ?
 *
 * Choisir "Autre" sans rien écrire n'apprend RIEN à la créatrice, et
 * gonfle une barre qui ne veut alors plus rien dire. On ne bloque donc
 * pas le visiteur au hasard : il lui suffit de choisir une autre
 * réponse, ou d'écrire un mot.
 */
export function autreTexteManquant(
  options: ReadonlyArray<OptionAvecAutre | null | undefined> | null | undefined,
  picked: ReadonlyArray<number> | null | undefined,
  texte: string | null | undefined,
): boolean {
  return isOtherPicked(options, picked) && sanitizeAutreTexte(texte).length === 0;
}

/**
 * Comment une réponse "Autre" se lit dans un export ou un tableau.
 *
 * `Autre : je suis coach sportif`, jamais le texte seul : sans le
 * libellé, une colonne CSV mélange les réponses de la liste et les
 * réponses libres sans qu'on puisse les distinguer.
 *
 * PURE. Le libellé vide retombe sur le texte : mieux vaut la réponse
 * du visiteur seule qu'un `:` orphelin.
 */
export function autreAnswerLabel(
  libelleOption: string,
  texte: string | null | undefined,
): string {
  const t = sanitizeAutreTexte(texte);
  const l = String(libelleOption ?? "").trim();
  if (!t) return l;
  if (!l) return t;
  return `${l} : ${t}`;
}

/**
 * Les textes écrits dans le "Autre" d'une question, pour la synthèse.
 *
 * On ne garde QUE les réponses qui ont vraiment coché "Autre" : un
 * `text` posé à côté d'un autre choix n'existe pas aujourd'hui, mais
 * le jour où un nouveau type d'écran en écrira un, il n'a rien à faire
 * dans cette liste.
 *
 * PURE, et c'est ce qui permet de la tester : le même calcul sert la
 * page de stats, l'analyse IA et l'export.
 */
export function collectAutreTextes(
  options: ReadonlyArray<OptionAvecAutre | null | undefined> | null | undefined,
  reponses: ReadonlyArray<
    { option_index?: number; option_indices?: number[]; text?: string } | null | undefined
  >,
): string[] {
  const idx = otherOptionIndex(options);
  if (idx < 0) return [];
  const sortie: string[] = [];
  for (const r of reponses ?? []) {
    if (!r) continue;
    const picked = Array.isArray(r.option_indices)
      ? r.option_indices
      : typeof r.option_index === "number"
        ? [r.option_index]
        : [];
    if (!picked.includes(idx)) continue;
    const t = sanitizeAutreTexte(r.text);
    if (t) sortie.push(t);
  }
  return sortie;
}
