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
  // FR
  "répondre à",
  "répondre",
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
  "start a thread",
  "commencer un fil",
  "iniciar un hilo",
  "começar uma thread",
  "thread starten",
  "inizia un thread",
];

function matchesAria(el: HTMLElement, patterns: string[]): boolean {
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  if (!ariaLabel) return false;
  return patterns.some((p) => ariaLabel.includes(p));
}

function isComposerEl(el: HTMLElement): boolean {
  // Threads expose à la fois `[role="textbox"]` ET juste
  // `[contenteditable]` selon les contextes. On accepte les deux.
  if (!el.matches('[contenteditable="true"]')) return false;
  return matchesAria(el, REPLY_ARIA_PATTERNS);
}

function isPostComposerEl(el: HTMLElement): boolean {
  if (!el.matches('[contenteditable="true"]')) return false;
  return matchesAria(el, POST_ARIA_PATTERNS);
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
