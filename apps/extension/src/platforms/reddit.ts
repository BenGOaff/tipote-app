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
  // Old Reddit : <textarea name="text"> dans le formulaire de comment.
  if (el.tagName === "TEXTAREA") {
    const name = (el.getAttribute("name") || "").toLowerCase();
    if (name === "text") return true;
    return matchesText(el, COMPOSER_PATTERNS);
  }
  // New Reddit : contenteditable (Slate/Lexical-based)
  if (el.matches('[contenteditable="true"]')) {
    // 1. Vérifier qu'on n'est PAS sur le composer de recherche
    const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
    if (ariaLabel.includes("search") || ariaLabel.includes("recherche")) return false;
    // 2. Match aria-label / placeholder explicite (idéal)
    if (matchesText(el, COMPOSER_PATTERNS)) return true;
    // 3. Reddit met `data-lexical-editor="true"` sur tous ses composers
    if (el.getAttribute("data-lexical-editor") === "true") return true;
    // 4. Fallback : New Reddit encapsule ses composers dans des Web
    //    Components <shreddit-comment-*>, <shreddit-composer-*>, ou
    //    <faceplate-form>. Si un ancêtre porte un de ces noms, on accepte.
    let node: HTMLElement | null = el;
    for (let i = 0; i < 10 && node; i++) {
      const tag = node.tagName.toLowerCase();
      if (
        (tag.startsWith("shreddit-") &&
          (tag.includes("comment") || tag.includes("composer") || tag.includes("reply"))) ||
        tag === "comment-composer-host" ||
        tag === "faceplate-textarea-input"
      ) {
        return true;
      }
      // <faceplate-form> avec name="commentForm" / id qui contient "comment"
      if (tag === "faceplate-form") {
        const formName = (node.getAttribute("name") || "").toLowerCase();
        const formId = (node.id || "").toLowerCase();
        if (formName.includes("comment") || formId.includes("comment")) return true;
      }
      node = node.parentElement;
    }
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
