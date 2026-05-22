// Adapter Reddit — reddit.com (new) + old.reddit.com (classic).
//
// Reddit a 2 UIs en parallèle :
//   - Nouveau Reddit (reddit.com par défaut) : composer contenteditable
//     basé sur Slate ou Lexical (selon les routes — leur frontend
//     migre progressivement). Multiples composers par page (un par
//     comment thread).
//   - Old Reddit (old.reddit.com) : <textarea> simple. Beaucoup
//     d'utilisateurs y restent par préférence.
//
// On gère les deux via un adapter unique qui détecte le type d'élément.
//
// Particularité Reddit : multiples composers sur une même page (reply
// à chaque comment d'un thread). Le scan large + dedup via INJECTED_ATTR
// (côté feedInjector) suffit. On a juste à filtrer les bons éléments.

import type { PlatformAdapter } from "./types";

const COMPOSER_PATTERNS = [
  // EN — Reddit affiche "What are your thoughts?" sur le composer principal
  // et "Reply" sur les sous-réponses
  "what are your thoughts",
  "comment",
  "reply",
  "add a comment",
  // FR
  "votre commentaire",
  "qu'en pensez-vous",
  "répondre",
  "commenter",
  // ES
  "tu comentario",
  "responder",
  // PT
  "seu comentário",
  // DE
  "dein kommentar",
  // IT
  "il tuo commento",
];

function matchesText(el: HTMLElement, patterns: string[]): boolean {
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
  const dataPlaceholder = (el.getAttribute("data-placeholder") || "").toLowerCase();
  const haystack = `${ariaLabel} ${placeholder} ${dataPlaceholder}`;
  return patterns.some((p) => haystack.includes(p));
}

function isComposerEl(el: HTMLElement): boolean {
  // Disqualifier d'office la barre de recherche.
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  if (ariaLabel.includes("search") || ariaLabel.includes("recherche")) return false;

  // Old Reddit : <textarea name="text"> dans le formulaire de comment.
  if (el.tagName === "TEXTAREA") {
    const name = (el.getAttribute("name") || "").toLowerCase();
    if (name === "text") return true;
    if (matchesText(el, COMPOSER_PATTERNS)) return true;
    // Fallback : textarea dans n'importe quel ancêtre shreddit-* ou
    // un wrapper dont l'id/class contient "comment".
    return hasCommentAncestor(el);
  }

  if (el.matches('[contenteditable="true"]')) {
    // 1. Match aria-label / placeholder explicite (idéal)
    if (matchesText(el, COMPOSER_PATTERNS)) return true;
    // 2. Reddit met `data-lexical-editor="true"` sur ses composers
    if (el.getAttribute("data-lexical-editor") === "true") return true;
    // 3. Fallback large : ancêtre Web Component shreddit-* / faceplate-*
    //    OU id/class/data-* contenant "comment" / "compose".
    if (hasCommentAncestor(el)) return true;
  }
  return false;
}

/** Remonte le DOM (max 12 niveaux) à la recherche d'un wrapper qui
 *  identifie clairement un contexte "comment composer" Reddit. Pas
 *  parfait — mais beaucoup plus robuste que les selectors stricts qui
 *  cassent à chaque refonte de Reddit. */
function hasCommentAncestor(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  for (let i = 0; i < 12 && node; i++) {
    const tag = node.tagName.toLowerCase();
    // <shreddit-comment-composer>, <shreddit-comment-input>, …
    if (tag.startsWith("shreddit-") && (tag.includes("comment") || tag.includes("composer") || tag.includes("reply"))) {
      return true;
    }
    // <faceplate-textarea-input>, <faceplate-form>, …
    if (tag.startsWith("faceplate-") && (tag.includes("textarea") || tag.includes("editor"))) {
      return true;
    }
    if (tag === "comment-composer-host-app" || tag === "comment-body-header" || tag.includes("composer-host")) {
      return true;
    }
    // id/class/data-* qui annoncent un composer
    const id = (node.id || "").toLowerCase();
    const cls = (node.className && typeof node.className === "string" ? node.className : "").toLowerCase();
    const dataE2e = (node.getAttribute("data-testid") || "").toLowerCase();
    if (
      id.includes("comment") || id.includes("composer") || id.includes("reply") ||
      cls.includes("commentform") || cls.includes("usertext-edit") ||
      dataE2e.includes("comment") || dataE2e.includes("composer")
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function findParentPost(composer: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = composer.parentElement;
  let depth = 0;
  while (node && depth < 15) {
    // New Reddit = chaque post est dans <shreddit-post> ou article
    if (
      node.tagName === "SHREDDIT-POST" ||
      node.tagName === "ARTICLE" ||
      node.getAttribute("role") === "article" ||
      // Old reddit : div.thing.link
      (node.classList.contains("thing") && node.classList.contains("link"))
    ) {
      return node;
    }
    const text = (node.innerText || "").trim();
    const editorText = (composer instanceof HTMLTextAreaElement
      ? composer.value
      : composer.innerText || ""
    ).trim();
    if (text.length - editorText.length > 80) return node;
    node = node.parentElement;
    depth++;
  }
  return null;
}

function fillEditor(composer: HTMLElement, text: string): void {
  if (composer instanceof HTMLTextAreaElement) {
    // Old Reddit / React-controlled textarea : utiliser le setter natif
    // pour que React détecte la mutation et update son state.
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

  // New Reddit contenteditable
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

export const redditAdapter: PlatformAdapter = {
  id: "reddit",
  hosts: ["reddit.com"],
  isComposer: isComposerEl,
  findParentPost,
  fillEditor,
};
