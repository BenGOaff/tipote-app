// Adapter Threads (threads.net + threads.com).
//
// Threads = Meta. Utilise Lexical comme FB, mais le DOM est plus simple
// (plateforme jeune, moins de legacy). Plus facile à cibler.
//
// PAS de auto-action — aide à la rédaction uniquement.

import type { PlatformAdapter } from "./types";

const REPLY_ARIA_PATTERNS = [
  // EN
  "reply to",
  "reply",
  "post your reply",
  // FR
  "répondre à",
  "répondre",
  "publier votre réponse",
  // ES
  "responder a",
  "responder",
  // PT
  "responder",
  // DE
  "antworten",
  // IT
  "rispondi",
  // AR
  "الرد",
];

const POST_ARIA_PATTERNS = [
  // EN
  "start a thread",
  "what's new",
  "what's happening",
  // FR
  "commencer un fil",
  "quoi de neuf",
  "démarrer un fil",
  // ES
  "iniciar un hilo",
  "qué está pasando",
  // PT
  "começar uma thread",
  "o que há de novo",
  // DE
  "thread starten",
  "was gibt's neues",
  // IT
  "inizia un thread",
  "che c'è di nuovo",
];

function matchesText(el: HTMLElement, patterns: string[]): boolean {
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
  const dataPlaceholder = (el.getAttribute("data-placeholder") || "").toLowerCase();
  const haystack = `${ariaLabel} ${placeholder} ${dataPlaceholder}`;
  return patterns.some((p) => haystack.includes(p));
}

function isComposerEl(el: HTMLElement): boolean {
  if (!el.matches('[contenteditable="true"]')) return false;
  // Disqualifier la barre de recherche éventuelle.
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  if (ariaLabel.includes("search") || ariaLabel.includes("recherche")) return false;

  // 1. Match aria-label / placeholder reply (multilangue)
  if (matchesText(el, REPLY_ARIA_PATTERNS)) return true;
  // 2. Lexical editor explicit
  if (el.getAttribute("data-lexical-editor") === "true") return true;
  // 3. Fallback : Threads n'a quasi pas d'autres contenteditables. Si on
  //    est dans un wrapper qui ressemble à un modal de reply ou un
  //    article, on accepte.
  let node: HTMLElement | null = el;
  for (let i = 0; i < 15 && node; i++) {
    const role = node.getAttribute("role");
    if (role === "dialog" || role === "article") return true;
    node = node.parentElement;
  }
  return false;
}

function isPostComposerEl(el: HTMLElement): boolean {
  if (!el.matches('[contenteditable="true"]')) return false;
  return matchesText(el, POST_ARIA_PATTERNS);
}

function findParentPost(composer: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = composer.parentElement;
  let depth = 0;
  while (node && depth < 12) {
    const text = (node.innerText || "").trim();
    const editorText = (composer.innerText || "").trim();
    if (text.length - editorText.length > 60) return node;
    node = node.parentElement;
    depth++;
  }
  return null;
}

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

export const threadsAdapter: PlatformAdapter = {
  id: "threads",
  hosts: ["threads.net", "threads.com"],
  isComposer: isComposerEl,
  isPostComposer: isPostComposerEl,
  findParentPost,
  fillEditor,
};
