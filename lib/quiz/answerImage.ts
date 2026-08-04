// lib/quiz/answerImage.ts
//
// Comment s'affiche l'image d'une RÉPONSE, décidé une seule fois.
//
// -- CE QUI CLOCHAIT (retour Béné, 4 août 2026) ------------------------
//
// "Adapte la place de l'image au format de la photo, là elles sont
// tronquées dans les réponses et c'est pourri."
//
// Les vignettes de réponse étaient rendues en `aspect-video
// object-cover` : la boîte imposait son format 16/9 et l'image était
// RECADRÉE dedans. Sur ses visuels, le haut du titre passait à la
// trappe ("JE VEUX DES" coupé en deux). C'est le format de la photo qui
// doit commander la boîte, jamais l'inverse.
//
// C'est exactement la règle que l'en-tête de PublicQuizClient énonce
// depuis des mois : "w-full h-auto par défaut, jamais de max-h-*
// object-cover". Elle était écrite au bon endroit, et contredite
// soixante lignes plus bas, à quatre endroits : les deux branches du
// viewer (image_choice et réponse illustrée) et les deux aperçus
// d'éditeur. Une règle écrite en commentaire n'est pas une règle : elle
// vit ici, en fonction, et les quatre appellent la même.
//
// Effet de bord assumé : dans une grille à deux colonnes, deux photos de
// formats différents donnent deux cartes de hauteurs différentes. C'est
// le prix de l'image entière, et c'est ce qui a été demandé. La grille
// aligne les cartes en haut (`items-start`), donc rien ne s'étire.

/** Ce qu'il faut poser sur le `<img>` d'une réponse. */
export type AnswerImageRender = {
  className: string;
  style?: { width: string };
};

/**
 * @param widthPct largeur choisie par la créatrice, en % de la carte.
 *                 `null` / absent = pleine largeur (le comportement
 *                 historique, aucun quiz existant ne bouge).
 */
export function answerImageRender(widthPct?: number | null): AnswerImageRender {
  // `h-auto` = la hauteur suit le format réel du fichier. Aucun recadrage,
  // donc aucun texte coupé.
  if (typeof widthPct === "number" && Number.isFinite(widthPct)) {
    return { className: "h-auto mx-auto block", style: { width: `${widthPct}%` } };
  }
  return { className: "w-full h-auto" };
}
