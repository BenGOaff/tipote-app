// Adapter X (anciennement Twitter). Domaines x.com + twitter.com (legacy).
//
// X utilise DraftJS pour ses composers — c'est l'éditeur le plus dur
// à injecter du marché. execCommand("insertText") ne marche PAS (DraftJS
// gère son propre state interne et ignore les mutations DOM directes).
//
// Solution : dispatcher des `beforeinput` natifs avec inputType
// "insertText", DraftJS les écoute via React-DOM et met à jour son
// state. C'est la même technique utilisée par les tests Cypress sur X.
//
// Détection via `data-testid` (X exposait des testids pour ses tests
// internes, ils sont stables depuis 2022) + fallback aria-label.
//
// PAS d'auto-action — aide rédaction only.

import type { PlatformAdapter } from "./types";
import { closestPostContainer } from "../postContext";

// data-testid identifie les composers natifs X. tweetTextarea_0 = nouveau
// tweet ; tweetTextarea_N = reply en thread ; tweetTextarea_N_label =
// le wrapper d'un composer (on filtre via le suffixe).
function hasComposerTestId(el: HTMLElement): boolean {
  const testid = el.getAttribute("data-testid") || "";
  return /^tweetTextarea_\d+$/.test(testid);
}

// Fallback aria-label si X retire les testids un jour.
const REPLY_ARIA_PATTERNS = [
  // EN
  "post your reply",
  "tweet your reply",
  "reply",
  // FR
  "publier votre réponse",
  "tweeter votre réponse",
  "votre réponse",
  // ES
  "publica tu respuesta",
  "tu respuesta",
  // PT
  "publique sua resposta",
  "sua resposta",
  // DE
  "deine antwort",
  // IT
  "la tua risposta",
];

function matchesAria(el: HTMLElement, patterns: string[]): boolean {
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  if (!ariaLabel) return false;
  return patterns.some((p) => ariaLabel.includes(p));
}

function isComposerEl(el: HTMLElement): boolean {
  // testid en priorité (stable)
  if (hasComposerTestId(el)) return true;
  // fallback aria-label
  if (!el.matches('[role="textbox"][contenteditable="true"]')) return false;
  return matchesAria(el, REPLY_ARIA_PATTERNS);
}

function findParentPost(composer: HTMLElement): HTMLElement | null {
  const container = closestPostContainer(composer);
  if (container) return container;
  let node: HTMLElement | null = composer.parentElement;
  let depth = 0;
  while (node && depth < 25) {
    // X = chaque tweet a `data-testid="tweet"` ou `[role="article"]`.
    if (node.getAttribute("data-testid") === "tweet" || node.getAttribute("role") === "article") {
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

/** DraftJS fill — beaucoup plus délicat que LinkedIn/FB. On simule la
 *  séquence : focus → select all → beforeinput insertText. DraftJS
 *  intercepte le beforeinput dans son onCompositionEnd handler React. */
function fillEditor(composer: HTMLElement, text: string): void {
  composer.focus();
  // Sélectionne tout le contenu existant
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(composer);
    sel.addRange(range);
  }

  // DraftJS écoute beforeinput. Si le handler React met à jour son
  // state, l'event est preventDefault() et on ne touche pas au DOM ;
  // si pas, fallback execCommand.
  let inserted = false;
  try {
    const beforeEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    });
    composer.dispatchEvent(beforeEvent);
    // Si DraftJS a intercepté, l'event est preventDefault — on
    // considère que l'insert a marché côté state React.
    inserted = beforeEvent.defaultPrevented;
  } catch {
    inserted = false;
  }

  if (!inserted) {
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch {
      inserted = false;
    }
  }

  // Toujours dispatcher input à la fin pour que React rerender et que
  // le bouton "Poster" se déverrouille.
  composer.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: text,
  }));
}

export const xAdapter: PlatformAdapter = {
  id: "x",
  hosts: ["x.com", "twitter.com"],
  isComposer: isComposerEl,
  findParentPost,
  fillEditor,
};
