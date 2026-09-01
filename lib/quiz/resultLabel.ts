// lib/quiz/resultLabel.ts
//
// LE NOM D'UN PROFIL, PARTOUT OÙ ON LE MONTRE À LA CRÉATRICE
// (retour Christian, 1er septembre 2026).
//
// "Les différents résultats n'apparaissent pas sous les réponses. Seuls
// apparaissent « Résultat 1, Résultat 2 » etc."
//
// Il avait raison, et le menu ne pouvait RIEN afficher d'autre : les
// deux sélecteurs posés sous chaque réponse de l'éditeur jetaient le
// profil et n'en gardaient que le rang.
//
//   editResults.map((_, ri) => <option>{t("previewResult", {n: ri+1})}</option>)
//                     ^^^ le profil, ignoré
//
// Aucun titre, si bien écrit soit-il, ne pouvait apparaître. Et sur un
// quiz à six profils, "Résultat 4" ne dit rien : la créatrice branche
// ses réponses au hasard, ou remonte vérifier l'ordre à chaque clic.
//
// LA RÈGLE EXISTAIT DÉJÀ, et c'est ce qui rend l'oubli coûteux : quatre
// autres endroits du MÊME fichier composaient correctement
// `stripHtml(extractResultLabel(cleanPlaceholdersForLabel(titre)))` avec
// un repli. La composition était recopiée à la main à chaque fois, donc
// deux endroits ne l'ont jamais eue. Une règle recopiée finit toujours
// par en oublier un (le `mx-auto` du sous-titre, les images de réponse,
// les réseaux de partage : le même défaut, la sixième fois).
//
// Elle vit donc ICI, en fonction pure, et les six appellent.
//
// -- POURQUOI TROIS ÉTAPES, DANS CET ORDRE -----------------------------
//
// 1. les placeholders sont interpolés à VIDE (`{name}` -> ""), sinon le
//    menu afficherait "Bonjour {name}, tu es le Solopreneur" ;
// 2. `extractResultLabel` retire ce que la phrase a de conversationnel
//    (", tu es le·la", les marques inclusives) pour ne garder que le
//    label court ;
// 3. `stripHtml` retire le gras et les couleurs : un `<option>` ne rend
//    pas de HTML, il afficherait les balises telles quelles.

import { extractResultLabel, interpolateText } from "@/lib/quizPersonalization";
import { stripHtml } from "@/lib/richText";

/**
 * Le nom court d'un profil, tel qu'on le montre à la CRÉATRICE
 * (menus de l'éditeur, alertes de cohérence, aide des étiquettes).
 *
 * PURE. `secours` est OBLIGATOIRE : un profil dont le titre est encore
 * vide doit rester choisissable, donc il lui faut un libellé, et c'est
 * l'appelant qui sait le traduire ("Résultat 3" dans les 7 langues).
 * Le rendre optionnel laisserait passer un menu à entrées vides, où
 * l'on ne peut plus rien distinguer.
 */
export function resultChoiceLabel(
  titre: string | null | undefined,
  secours: string,
): string {
  const label = stripHtml(extractResultLabel(interpolateText(titre, { name: "", gender: "x" }))).trim();
  return label || secours;
}
