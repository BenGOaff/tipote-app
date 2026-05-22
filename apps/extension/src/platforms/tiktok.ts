// Adapter TikTok (tiktok.com web).
//
// TikTok web : composer de commentaire sur chaque vidéo, accessible
// depuis le feed "For You" en scroll vertical OU depuis la page
// permalink d'une vidéo.
//
// L'éditeur TikTok est un contenteditable custom — proche de Lexical.
// execCommand + InputEvent suffisent dans la majorité des cas.
//
// Particularité TikTok : un seul composer visible à la fois (modal
// over l'écran ou inline sous la vidéo). On capte les 2 cas via le
// scan large + filtre adapter.
//
// PAS d'auto-action — aide rédaction only.

import type { PlatformAdapter } from "./types";

const COMMENT_PATTERNS = [
  // EN
  "add a comment",
  "add comment",
  "leave a comment",
  // FR
  "ajouter un commentaire",
  "écrire un commentaire",
  // ES
  "agregar un comentario",
  "añadir un comentario",
  // PT
  "adicionar um comentário",
  // DE
  "kommentar hinzufügen",
  // IT
  "aggiungi un commento",
  // AR
  "أضف تعليقًا",
];

// TikTok expose aussi un placeholder dans le composer en plus de l'aria-label.
function matchesText(el: HTMLElement, patterns: string[]): boolean {
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
  // Sur TikTok le placeholder peut être dans un <span> enfant data-placeholder
  const dataPlaceholder = (el.getAttribute("data-placeholder") || "").toLowerCase();
  const childPlaceholder = (el.querySelector<HTMLElement>("[data-placeholder]")?.getAttribute("data-placeholder") || "").toLowerCase();
  const haystack = `${ariaLabel} ${placeholder} ${dataPlaceholder} ${childPlaceholder}`;
  return patterns.some((p) => haystack.includes(p));
}

function isComposerEl(el: HTMLElement): boolean {
  // TikTok = contenteditable, parfois sans role=textbox explicite.
  if (!el.matches('[contenteditable="true"]')) return false;
  // 1. TikTok utilise DraftJS — la classe `public-DraftEditor-content`
  //    est posée sur le composer principal (signature DraftJS).
  if (el.classList.contains("public-DraftEditor-content")) return true;
  // 2. Match direct aria-label / placeholder
  if (matchesText(el, COMMENT_PATTERNS)) return true;
  // 3. Fallback : data-e2e="comment-text" / "comment-input" sur ancêtre
  let node: HTMLElement | null = el;
  for (let i = 0; i < 8 && node; i++) {
    const e2e = (node.getAttribute("data-e2e") || "").toLowerCase();
    if (e2e.includes("comment")) return true;
    node = node.parentElement;
  }
  return false;
}

function findParentPost(composer: HTMLElement): HTMLElement | null {
  // TikTok = chaque vidéo est dans un wrapper avec data-e2e ou role.
  let node: HTMLElement | null = composer.parentElement;
  let depth = 0;
  while (node && depth < 15) {
    const dataE2e = node.getAttribute("data-e2e") || "";
    if (dataE2e.includes("video") || dataE2e.includes("recommend") || node.tagName === "ARTICLE") {
      return node;
    }
    const text = (node.innerText || "").trim();
    const editorText = (composer.innerText || "").trim();
    if (text.length - editorText.length > 60) return node;
    node = node.parentElement;
    depth++;
  }
  return null;
}

/** TikTok = DraftJS wrappé. La synthèse de beforeinput cassait la
 *  réconciliation React (NotFoundError removeChild) parce que TikTok
 *  ne preventDefault pas le synthetic event mais update quand même son
 *  state RxJS, puis on doublait avec execCommand → DOM mismatch.
 *
 *  Approche : juste focus + execCommand. execCommand génère un VRAI
 *  input event natif que le browser pipeline propage à DraftJS via
 *  React-DOM, sans risque de double insertion. */
function fillEditor(composer: HTMLElement, text: string): void {
  composer.focus();
  // Positionne le curseur en fin de contenu existant (s'il y en a) ;
  // ne pas selectNodeContents pour ne pas re-sélectionner le placeholder
  // DraftJS, ce qui désynchronise sa state interne avec le DOM.
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(composer);
    range.collapse(false); // collapse au bout = curseur à la fin
    sel.addRange(range);
  }
  try {
    document.execCommand("insertText", false, text);
  } catch {
    // ignore
  }
}

export const tiktokAdapter: PlatformAdapter = {
  id: "tiktok",
  hosts: ["tiktok.com"],
  isComposer: isComposerEl,
  findParentPost,
  fillEditor,
  // TikTok réconcilie agressivement son arbre React → toute insertion
  // d'un node étranger dans le DOM autour du composer casse le diffing
  // (NotFoundError removeChild). On positionne le trigger en fixed sur
  // body pour rester invisible côté React.
  useFixedTrigger: true,
};
