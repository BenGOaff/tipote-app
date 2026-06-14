// Adapter Instagram (instagram.com desktop).
//
// IG desktop expose un composer simple (`<textarea>` ou contenteditable
// selon les pages). Mobile = app native non-supportée (Chrome extension
// only marche sur desktop).
//
// Particularité IG : sur le feed la zone "Ajouter un commentaire"
// initiale est un placeholder qui se transforme en textarea au focus.
// On doit observer ces transformations (MutationObserver le fait déjà
// dans le content script global).
//
// PAS d'auto-action sur IG : ban risk élevé. Aide rédaction only.

import type { PlatformAdapter } from "./types";
import { closestPostContainer } from "../postContext";

const COMMENT_ARIA_PATTERNS = [
  // EN
  "add a comment",
  // FR
  "ajouter un commentaire",
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

// Instagram utilise aussi `placeholder` (sur les textarea) en plus de
// aria-label, donc on accepte les deux.
function matchesText(el: HTMLElement, patterns: string[]): boolean {
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
  const haystack = `${ariaLabel} ${placeholder}`;
  return patterns.some((p) => haystack.includes(p));
}

function isComposerEl(el: HTMLElement): boolean {
  // IG = parfois <textarea>, parfois contenteditable.
  const isTextarea = el.tagName === "TEXTAREA";
  const isContentEditable = el.matches('[contenteditable="true"]');
  if (!isTextarea && !isContentEditable) return false;
  return matchesText(el, COMMENT_ARIA_PATTERNS);
}

function findParentPost(composer: HTMLElement): HTMLElement | null {
  // closest() d'abord (remonte sans limite) — cf. facebook.ts.
  const container = closestPostContainer(composer);
  if (container) return container;
  let node: HTMLElement | null = composer.parentElement;
  let depth = 0;
  while (node && depth < 25) {
    if (node.tagName === "ARTICLE" || node.getAttribute("role") === "article") {
      return node;
    }
    const text = (node.innerText || "").trim();
    const editorText = (composer instanceof HTMLTextAreaElement
      ? composer.value
      : composer.innerText || ""
    ).trim();
    if (text.length - editorText.length > 60) return node;
    node = node.parentElement;
    depth++;
  }
  return null;
}

function fillEditor(composer: HTMLElement, text: string): void {
  if (composer instanceof HTMLTextAreaElement) {
    // Cas textarea simple — set value + dispatch input (React écoute).
    // React utilise un setter custom sur HTMLInputElement/Textarea, on
    // doit appeler le setter natif pour qu'il déclenche la mise à jour
    // de l'état React. Sinon le textarea se vide au rerender.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(composer, text);
    } else {
      composer.value = text;
    }
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.focus();
    return;
  }

  // Cas contenteditable
  composer.focus();
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(composer);
    sel.addRange(range);
  }
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }
  if (!inserted) {
    composer.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    }));
    composer.textContent = text;
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }));
  }
}

export const instagramAdapter: PlatformAdapter = {
  id: "instagram",
  hosts: ["instagram.com"],
  isComposer: isComposerEl,
  findParentPost,
  fillEditor,
};
