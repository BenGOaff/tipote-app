// Adapter Facebook (facebook.com + m.facebook.com desktop).
//
// FB utilise Lexical (Meta) pour les composers en 2024+. Le DOM est
// très obfusqué (classes hashées), donc on cible via `[role="textbox"]
// [contenteditable="true"]` + aria-label.
//
// Particularité FB : le feed contient potentiellement plusieurs dizaines
// de composers (un par post visible) — notre MutationObserver doit
// gérer beaucoup d'éléments. On cap à 1 trigger par composer via
// l'attribut `data-tipote-injected`.
//
// PAS de auto-action sur FB. L'extension ne fait QUE de l'aide à la
// rédaction : suggère 4 commentaires IA, l'user clique pour insérer,
// l'user publie via le bouton natif FB. Aucun risque de ban.

import type { PlatformAdapter } from "./types";
import { closestPostContainer } from "../postContext";

const COMMENT_ARIA_PATTERNS = [
  // FR
  "écrire un commentaire",
  "commenter",
  "répondre", // vue modale / groupes : "Répondre en tant que X" (drame Béné 14 juin 2026)
  // EN
  "write a comment",
  "comment",
  "reply",
  // ES
  "escribe un comentario",
  "comentar",
  "responder",
  // PT
  "escrever um comentário",
  "comentário",
  "responder",
  // DE
  "kommentar schreiben",
  "kommentar",
  "antworten",
  // IT
  "scrivi un commento",
  "commenta",
  "rispondi",
  // AR
  "اكتب تعليقًا",
  "تعليق",
  "رد",
];

const POST_ARIA_PATTERNS = [
  // FR
  "que voulez-vous dire",
  "exprimez-vous",
  // EN
  "what's on your mind",
  "create a post",
  // ES
  "qué estás pensando",
  // PT
  "no que está a pensar",
  "no que você está pensando",
  // DE
  "was machst du gerade",
  // IT
  "a cosa stai pensando",
];

function matchesAria(el: HTMLElement, patterns: string[]): boolean {
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  if (!ariaLabel) return false;
  return patterns.some((p) => ariaLabel.includes(p));
}

function isComposerEl(el: HTMLElement): boolean {
  if (!el.matches('[role="textbox"][contenteditable="true"]')) return false;
  return matchesAria(el, COMMENT_ARIA_PATTERNS);
}

function isPostComposerEl(el: HTMLElement): boolean {
  if (!el.matches('[role="textbox"][contenteditable="true"]')) return false;
  return matchesAria(el, POST_ARIA_PATTERNS);
}

/** Sur FB, le post est plus haut dans le DOM (~5-10 niveaux). On
 *  remonte jusqu'à un ancêtre avec un texte conséquent. Heuristique
 *  identique à LinkedIn mais avec un cap plus large (FB a tendance à
 *  enrouler les posts dans plus de wrappers). */
function findParentPost(composer: HTMLElement): HTMLElement | null {
  // 1. closest() : remonte au post (role="article") sans limite de
  //    profondeur. Le walk-up cappé renvoyait null sur FB (composer trop
  //    profond) -> content length 0 (Béné 14 juin 2026).
  const container = closestPostContainer(composer);
  if (container) return container;
  // 2. Fallback walk-up (cap relevé à 25, article prioritaire).
  let node: HTMLElement | null = composer.parentElement;
  let depth = 0;
  while (node && depth < 25) {
    if (node.tagName === "ARTICLE" || node.getAttribute("role") === "article") {
      return node;
    }
    const text = (node.innerText || "").trim();
    const editorText = (composer.innerText || "").trim();
    if (text.length - editorText.length > 80) return node;
    node = node.parentElement;
    depth++;
  }
  return null;
}

/** Lexical editor (FB). execCommand("insertText") fonctionne sur Lexical
 *  via le browser native behavior (Lexical écoute beforeinput +
 *  contentEditable). Fallback InputEvent en plus si execCommand fail. */
function fillEditor(composer: HTMLElement, text: string): void {
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
    const beforeEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    });
    composer.dispatchEvent(beforeEvent);
    if (!beforeEvent.defaultPrevented) {
      composer.textContent = text;
    }
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }));
  }
}

export const facebookAdapter: PlatformAdapter = {
  id: "facebook",
  hosts: ["facebook.com"],
  isComposer: isComposerEl,
  isPostComposer: isPostComposerEl,
  findParentPost,
  fillEditor,
};
