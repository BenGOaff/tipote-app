// lib/quiz/textAlign.ts
//
// SUR QUEL BORD SE CALE UN BLOC DE TEXTE DE L'ÉCRAN D'ACCUEIL.
//
// DRAME BÉNÉ, 3 août 2026 : "je ne comprends pas pourquoi il y a toujours
// ce décalage entre le titre et le sous-titre. On a déjà parlé de ça
// mille fois et ça n'a pas été corrigé."
//
// Elle a raison sur les deux points, le décalage ET le "mille fois". Il
// n'a jamais été corrigé PARTOUT parce que la règle n'existait nulle
// part : elle était réécrite à la main, en ternaires, dans chaque écran
// de chaque composant. Corriger le viewer ne corrigeait pas l'éditeur ;
// corriger l'écran de question ne corrigeait pas l'écran d'accueil. À
// chaque passage il restait un endroit oublié, donc le bug revenait.
//
// CE QUI SE PASSAIT EXACTEMENT. Le sous-titre portait `max-w-xl mx-auto`
// écrit en dur : largeur bridée ET bloc CENTRÉ. Tant que le titre est
// centré lui aussi, personne ne voit rien. Dès que le titre est aligné à
// gauche, le titre part du bord gauche du conteneur et le sous-titre,
// lui, reste centré : il commence donc ~50 px plus à droite. C'est le
// décalage de la capture, et il ne venait pas d'une marge oubliée mais
// d'un `mx-auto` qui ne s'était jamais posé la question de l'alignement.
//
// LA RÈGLE, EN UNE PHRASE : un bloc se cale sur SON alignement s'il en a
// un, sinon sur celui du TITRE, sinon sur la disposition. Ce qui donne le
// comportement que Béné demande : "si j'aligne mon texte à gauche, le
// titre et le sous-titre commencent au même endroit à gauche."
//
// Pourquoi le titre sert de référence par défaut : c'est le bloc qui
// donne le ton de l'écran. Un sous-titre qui n'a jamais été aligné
// explicitement doit suivre son titre, pas un réglage global que la
// créatrice a oublié depuis longtemps.
//
// Et pourquoi l'alignement PROPRE du bloc passe devant : si elle aligne
// le sous-titre à gauche en laissant le titre centré, c'est un choix
// délibéré, il serait absurde de le recentrer.
//
// La largeur (`max-w-xl`) n'est PAS un décalage et elle reste : elle
// raccourcit la ligne pour la lisibilité. Ce qui décalait, c'est
// `mx-auto`, remplacé par la marge que cette fonction calcule.

export type BlockAlign = "left" | "center" | "right";

/**
 * Alignement posé PAR LA CRÉATRICE dans le champ, via le bouton aligner
 * de l'éditeur riche (qui écrit un `style="text-align: …"` inline).
 *
 * `null` = elle n'a jamais touché à l'alignement de ce champ. C'est une
 * information différente de "elle a choisi gauche", et c'est pour ça
 * qu'on ne renvoie pas "left" par défaut : sans ce null, un champ jamais
 * touché imposerait la gauche à tout l'écran.
 */
export function richTextAlign(html: string | null | undefined): BlockAlign | null {
  if (!html) return null;
  const m = /text-align:\s*(left|right|center)/i.exec(html);
  return m ? (m[1].toLowerCase() as BlockAlign) : null;
}

/**
 * Le bord d'un bloc de l'écran d'accueil.
 *
 * @param ownHtml   le HTML du bloc lui-même (sous-titre, description…)
 * @param titleHtml le HTML du titre de l'écran, bloc de référence
 * @param layout    `quizzes.question_layout` ("centered" | "left" | "split"…)
 *
 * Ordre : son propre alignement -> celui du titre -> la disposition.
 * Passer `titleHtml` comme `ownHtml` donne l'alignement du titre lui-même.
 */
export function resolveBlockAlign(
  ownHtml: string | null | undefined,
  titleHtml: string | null | undefined,
  layout: string | null | undefined,
): BlockAlign {
  return (
    richTextAlign(ownHtml) ??
    richTextAlign(titleHtml) ??
    (layout === "centered" ? "center" : "left")
  );
}

/** Classe d'alignement du TEXTE à l'intérieur du bloc. */
export function alignTextClass(align: BlockAlign): string {
  return align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
}

/**
 * Classe de marge du BLOC, quand il est plus étroit que son conteneur.
 *
 * C'est LA ligne qui produisait le décalage : `mx-auto` centre le bloc
 * quoi qu'il arrive, y compris sous un titre calé à gauche.
 */
export function alignBlockMarginClass(align: BlockAlign): string {
  return align === "center" ? "mx-auto" : align === "right" ? "ml-auto" : "mr-auto";
}

/** Classe de justification pour un conteneur flex (logo, bouton). */
export function alignJustifyClass(align: BlockAlign): string {
  return align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
}
