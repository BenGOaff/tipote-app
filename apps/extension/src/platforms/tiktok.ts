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

/** TikTok est trop hostile aux extensions — leur anti-bot SDK
 *  (`secsdk_runtime_bundler`) + React fragile crashent dès qu'on touche
 *  au composer OU qu'on dispatche un event dessus, même depuis le MAIN
 *  world (technique Grammarly testée, fail). Cf. draft-js#616.
 *
 *  Stratégie : clipboard + toast "Collez avec Ctrl+V". Limitation
 *  acceptée — TikTok n'est pas une cible viable pour le fill direct. */
function fillEditor(_composer: HTMLElement, text: string): void {
  void copyToClipboardAndToast(text);
}

async function copyToClipboardAndToast(text: string): Promise<void> {
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    // Fallback : créer un textarea temporaire sur body et execCommand copy
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    ta.remove();
  }
  showToast(copied ? "Commentaire copié — collez avec Ctrl+V (Cmd+V)" : "Échec copie clipboard");
}

function showToast(message: string): void {
  const existing = document.querySelector("[data-tipote-toast]");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.setAttribute("data-tipote-toast", "true");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    z-index: 2147483647;
    background: #111827; color: white;
    padding: 10px 18px; border-radius: 999px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px; font-weight: 500;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    opacity: 0; transition: opacity 0.2s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
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
  clipboardMode: true,
};
