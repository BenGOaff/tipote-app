// Adapter LinkedIn. Logique extraite du `feedInjector.ts` original
// (commits 5c8f7bcd → 16d000a3) qu'on a stabilisé pendant ~1 semaine
// de debug avec Béné sur le composer TipTap/ProseMirror 2026.

import type { PlatformAdapter } from "./types";

/** aria-label patterns case-insensitive substring qui marchent en
 *  FR + EN + ES + PT + DE + IT + AR. Si LinkedIn déploie une langue
 *  exotique qui ne contient pas l'un de ces radicaux, l'utilisateur
 *  doit nous le signaler. */
const COMMENT_ARIA_PATTERNS = [
  "commentaire",   // FR
  "comment",       // EN
  "comentario",    // ES / PT
  "kommentar",     // DE
  "commento",      // IT
  "تعليق",         // AR
];

function isCommentComposer(el: HTMLElement): boolean {
  if (!el.matches('[role="textbox"][contenteditable="true"]')) return false;
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  if (!ariaLabel) return false;
  return COMMENT_ARIA_PATTERNS.some((p) => ariaLabel.includes(p));
}

/** Remonte depuis le composer jusqu'à trouver un ancêtre qui contient
 *  ≥ 80 chars de texte hors-composer (donc un vrai post). Cap 12 niveaux
 *  pour ne pas dériver au <body>. */
function findParentPost(composer: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = composer.parentElement;
  let depth = 0;
  while (node && depth < 12) {
    const text = (node.innerText || "").trim();
    const editorText = (composer.innerText || "").trim();
    const otherText = text.length - editorText.length;
    if (otherText > 80) return node;
    node = node.parentElement;
    depth++;
  }
  return null;
}

/** Remplit un éditeur TipTap/ProseMirror. ProseMirror est très strict
 *  sur les mutations DOM — un simple `textContent = text` est ignoré
 *  silencieusement. Il faut soit utiliser execCommand (qui dispatch les
 *  bons events), soit dispatcher des InputEvent natifs avec inputType.
 *  ProseMirror écoute `beforeinput` et `input` — on dispatch les 2. */
function fillEditor(composer: HTMLElement, text: string): void {
  composer.focus();
  // 1. Sélectionne tout le contenu existant
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(composer);
    sel.addRange(range);
  }
  // 2. Tente execCommand (fonctionne sur la plupart des éditeurs)
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }
  // 3. Si execCommand n'a rien fait, fallback InputEvent (ProseMirror
  //    écoute beforeinput avec inputType insertReplacementText).
  if (!inserted) {
    const beforeEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertReplacementText",
      data: text,
    });
    composer.dispatchEvent(beforeEvent);
    if (!beforeEvent.defaultPrevented) {
      composer.textContent = text;
    }
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: text,
    }));
  }
}

export const linkedinAdapter: PlatformAdapter = {
  id: "linkedin",
  hosts: ["linkedin.com"],
  isComposer: isCommentComposer,
  findParentPost,
  fillEditor,
};
