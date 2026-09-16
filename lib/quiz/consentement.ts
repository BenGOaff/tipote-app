// lib/quiz/consentement.ts
//
// Le texte de la case de consentement, avant qu'un écran ne le rende.
//
// -- Béné, 15 septembre 2026 -------------------------------------------
//
// "putain pourquoi j'ai encore du &nbsp; sur les pages publiques !!!
// Exactement le genre de trucs de merde qui me font perdre des clients
// tous les jours."
//
// La case disait, en clair : `J'accepte la politique de
// confidentialité&nbsp;`. Le texte vient d'un champ RICHE de l'éditeur :
// un contentEditable colle `&nbsp;` à la place d'une espace de fin, et
// il peut le faire SANS poser la moindre balise autour. Le viewer
// regardait s'il y avait une balise pour choisir entre "rendre en HTML"
// et "rendre en texte" : une entité sans balise partait donc dans la
// branche TEXTE, où React affiche `&nbsp;` tel quel, puisque rien ne
// décode une entité dans un noeud de texte.
//
// C'est le `&nbsp;` de Christian (1er septembre) dans une autre robe :
// une chaîne peut porter une ENTITÉ sans porter la moindre balise. Et
// c'est la neuvième fois que ce viewer décode une entité "pour ce champ
// là" (la description, l'insight, la projection, l'introduction, le
// bonus...), chacune ajoutée le jour où quelqu'un l'a vue en clair. Une
// règle recopiée finit toujours par en oublier un.
//
// -- LA RÈGLE ----------------------------------------------------------
//
// La FORME du texte se décide ICI, une fois, et le texte brut sort
// DÉCODÉ. L'écran ne rend jamais `raw` directement :
//   - `html`  : il y a une balise, l'écran sanitise et rend en HTML ;
//   - `texte` : pas de balise, les entités sont converties en
//               caractères, l'écran rend un noeud de texte.
//
// Le module quiz de Tipote est jumeau : ce fichier y vit à l'octet près.

import { decodeHtmlEntities } from "@/lib/richText";

export type FormeConsentement =
  | { genre: "html"; html: string; porteUnLien: boolean }
  | { genre: "texte"; texte: string };

/** Une balise ouvrante : c'est ce qui fait qu'un texte est du HTML. */
const BALISE = /<[a-z][\s\S]*?>/i;
const LIEN = /<a\s[^>]*href=/i;

export function formeDuConsentement(raw: string): FormeConsentement {
  if (BALISE.test(raw)) {
    return { genre: "html", html: raw, porteUnLien: LIEN.test(raw) };
  }
  return { genre: "texte", texte: decodeHtmlEntities(raw) };
}

/**
 * Où le libellé de la politique de confidentialité se trouve dans le
 * texte brut, pour en faire le lien. `null` quand il n'y est pas :
 * l'écran ajoute alors un lien séparé.
 *
 * On cherche dans le texte DÉCODÉ : un `&nbsp;` collé entre deux mots du
 * libellé ferait sinon rater l'aiguille, donc afficher le lien à côté
 * au lieu de sur les mots.
 *
 * ET TOUTE ESPACE VAUT TOUTE ESPACE (16 septembre 2026). Depuis que
 * `decodeHtmlEntities` rend l'INSÉCABLE au lieu d'une espace ordinaire,
 * `politique\u00a0de confidentialité` ne contenait plus l'aiguille
 * `politique de confidentialité`, et le lien légal repartait à côté des
 * mots : exactement le bug que cette fonction existe pour fermer. On
 * normalise donc les blancs des DEUX côtés. Un blanc remplace UN blanc,
 * donc les positions ne bougent pas et les tranches restent justes.
 */
const TOUT_BLANC = /[\s\u00a0\u202f]/g;
const memesBlancs = (s: string) => s.toLowerCase().replace(TOUT_BLANC, " ");

export function decouperSurLeLibelle(
  texte: string,
  libelle: string,
): { avant: string; libelle: string; apres: string } | null {
  const aiguille = memesBlancs(libelle);
  if (!aiguille.trim()) return null;
  const idx = memesBlancs(texte).indexOf(aiguille);
  if (idx === -1) return null;
  return {
    avant: texte.slice(0, idx),
    libelle: texte.slice(idx, idx + aiguille.length),
    apres: texte.slice(idx + aiguille.length),
  };
}
