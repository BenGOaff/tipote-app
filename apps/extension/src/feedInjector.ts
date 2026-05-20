// Injecteur inline LinkedIn — v5.
//
// Diag terrain (Béné, 22 mai 2026) :
//   - LinkedIn 2026 utilise TipTap / ProseMirror (plus Quill).
//   - Composer = <div contenteditable role="textbox"
//                  aria-label="Éditeur de texte pour créer un commentaire"
//                  class="tiptap ProseMirror ...">
//   - Le composer n'est PLUS dans un <article> — il vit dans son propre
//     container, à côté du post (overlay-style).
//
// Stratégie v5 (qui marche enfin) :
//   1. Matcher les contenteditable role=textbox dont l'aria-label
//      contient "commentaire" — exclut le composer de publication
//      ("Éditeur de texte pour créer une publication") et la messagerie.
//   2. Plus de filtre <article>. On accroche notre barre directement
//      au-dessus du composer.
//   3. Pour extraire le contenu du post à commenter, on remonte le DOM
//      depuis l'éditeur jusqu'à trouver le post le plus proche (heuristique
//      simple : on cherche un ancêtre qui contient au moins 100 chars
//      de texte qui ne soit pas le composer lui-même).

const INJECTED_ATTR = "data-tipote-injected";

const TONES = [
  { key: "agree", label: "Je suis d'accord", emoji: "✅" },
  { key: "disagree", label: "Je ne suis pas d'accord", emoji: "🤔" },
  { key: "add_value", label: "Ajouter de la valeur", emoji: "💡" },
  { key: "ask_question", label: "Poser une question", emoji: "❓" },
] as const;

type ToneKey = (typeof TONES)[number]["key"];

/** aria-label des composers qu'on cible. LinkedIn génère des labels en
 *  français + anglais + autres langues — on matche en case-insensitive
 *  sur les radicaux "commentaire" / "comment" / "comentario" / "kommentar"
 *  / "commento". Si LinkedIn ajoute une langue exotique on l'ajoute ici. */
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

export function startFeedInjector(): void {
  console.log("[tipote/feed] injector v5 starting (TipTap/ProseMirror)");
  scanForComposers(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) scanForComposers(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function scanForComposers(root: HTMLElement): void {
  const editables: HTMLElement[] = [];
  if (isCommentComposer(root)) editables.push(root);
  editables.push(
    ...Array.from(root.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]'))
      .filter((el) => isCommentComposer(el))
  );

  for (const editable of editables) {
    if (editable.hasAttribute(INJECTED_ATTR)) continue;
    editable.setAttribute(INJECTED_ATTR, "true");
    console.log("[tipote/feed] composer detected", editable);
    injectToneBar(editable);
  }
}

/** Cherche le post à commenter à partir du composer. Stratégie :
 *  on remonte le DOM jusqu'à trouver un ancêtre qui contient un texte
 *  conséquent (>= 80 chars) ET qui ne soit pas juste le composer lui-même.
 *  On limite la remontée à 8 niveaux pour pas dériver vers le body. */
function findPostElement(editable: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = editable.parentElement;
  let depth = 0;
  while (node && depth < 12) {
    const text = (node.innerText || "").trim();
    // Exclude le texte de l'éditeur lui-même
    const editorText = (editable.innerText || "").trim();
    const otherText = text.length - editorText.length;
    if (otherText > 80) return node;
    node = node.parentElement;
    depth++;
  }
  return null;
}

function injectToneBar(editable: HTMLElement): void {
  let cachedSuggestions: Record<ToneKey, string> | null = null;
  let loading = false;
  let menuOpen = false;

  // Container relatif pour positionner le menu dropdown en absolute.
  const container = document.createElement("div");
  container.setAttribute("data-tipote-bar", "true");
  container.style.cssText = `
    position: relative;
    display: inline-block;
    margin: 6px 0 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  // Bouton trigger : "Tipote ▾" — style Kawaak (compact, branded).
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.setAttribute("aria-label", "Générer un commentaire avec Tipote");
  trigger.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white; border: 0; border-radius: 999px;
    padding: 6px 14px; cursor: pointer;
    font: inherit; font-size: 12px; font-weight: 600;
    box-shadow: 0 1px 3px rgba(99, 102, 241, 0.3);
    transition: transform 0.1s, box-shadow 0.15s;
    white-space: nowrap;
  `;
  trigger.innerHTML = `<span>✨ Tipote</span><span style="font-size: 10px; opacity: 0.9;">▾</span>`;
  trigger.addEventListener("mouseenter", () => {
    trigger.style.boxShadow = "0 2px 6px rgba(99, 102, 241, 0.5)";
  });
  trigger.addEventListener("mouseleave", () => {
    trigger.style.boxShadow = "0 1px 3px rgba(99, 102, 241, 0.3)";
  });
  container.appendChild(trigger);

  // Menu dropdown — attaché au <body> en position:fixed pour ne pas être
  // rogné par l'overflow:hidden / transform des conteneurs LinkedIn.
  const menu = document.createElement("div");
  menu.setAttribute("data-tipote-menu", "true");
  menu.style.cssText = `
    position: fixed; z-index: 2147483647;
    min-width: 220px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    padding: 4px;
    display: none;
    flex-direction: column;
    gap: 1px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const menuItems: HTMLButtonElement[] = [];
  for (const tone of TONES) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("aria-label", tone.label);
    item.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      background: transparent; border: 0; border-radius: 6px;
      padding: 8px 10px; cursor: pointer; font: inherit; font-size: 13px;
      color: #374151; text-align: left; width: 100%;
      transition: background 0.1s;
    `;
    item.innerHTML = `<span style="font-size: 16px;">${tone.emoji}</span><span>${tone.label}</span>`;
    item.addEventListener("mouseenter", () => {
      if (!item.disabled) item.style.background = "#f3f4f6";
    });
    item.addEventListener("mouseleave", () => {
      if (!item.disabled) item.style.background = "transparent";
    });
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (loading) return;
      closeMenu();
      const originalTrigger = trigger.innerHTML;
      trigger.disabled = true;
      trigger.style.opacity = "0.7";
      trigger.style.cursor = "wait";
      trigger.innerHTML = `<span>${tone.emoji} Génération…</span>`;
      try {
        if (!cachedSuggestions) {
          loading = true;
          const post = findPostElement(editable);
          const content = post ? (post.innerText || "").trim().slice(0, 1500) : "";
          const language = detectLanguage();
          console.log("[tipote/feed] fetching suggestions, content length =", content.length);
          cachedSuggestions = await fetchSuggestions(content, language);
          loading = false;
        }
        fillTipTapEditor(editable, cachedSuggestions[tone.key]);
        trigger.innerHTML = `<span>${tone.emoji} Inséré ✓</span>`;
        setTimeout(() => {
          trigger.innerHTML = originalTrigger;
          trigger.disabled = false;
          trigger.style.opacity = "1";
          trigger.style.cursor = "pointer";
        }, 1000);
      } catch (err) {
        console.warn("[tipote/feed] suggestion fill failed", err);
        trigger.innerHTML = originalTrigger;
        trigger.disabled = false;
        trigger.style.opacity = "1";
        trigger.style.cursor = "pointer";
        loading = false;
      }
    });
    menu.appendChild(item);
    menuItems.push(item);
  }
  document.body.appendChild(menu);

  function positionMenu(): void {
    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
  }
  function openMenu(): void {
    positionMenu();
    menu.style.display = "flex";
    menuOpen = true;
    window.addEventListener("scroll", positionMenu, true);
    window.addEventListener("resize", positionMenu);
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
  }
  function closeMenu(): void {
    menu.style.display = "none";
    menuOpen = false;
    window.removeEventListener("scroll", positionMenu, true);
    window.removeEventListener("resize", positionMenu);
    document.removeEventListener("click", onDocClick);
  }
  function onDocClick(e: MouseEvent): void {
    if (!container.contains(e.target as Node) && !menu.contains(e.target as Node)) {
      closeMenu();
    }
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) closeMenu();
    else openMenu();
  });

  // Insertion : juste au-dessus du composer. On remonte de 1-2 niveaux pour
  // se placer au-dessus du wrapper TipTap (qui a souvent un padding/border
  // qu'on veut pas couper). Fallback : insertion directe avant l'éditeur.
  const wrapper = editable.parentElement?.parentElement ?? editable.parentElement;
  if (wrapper?.parentElement) {
    wrapper.parentElement.insertBefore(container, wrapper);
  } else {
    editable.parentElement?.insertBefore(container, editable);
  }
}

function detectLanguage(): string {
  const m = document.cookie.match(/li_lang=([^;]+)/);
  if (m) return decodeURIComponent(m[1]).slice(0, 2).toLowerCase();
  return (navigator.language || "fr").slice(0, 2).toLowerCase();
}

async function fetchSuggestions(content: string, language: string): Promise<Record<ToneKey, string>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "ai/suggest", payload: { content_excerpt: content, language } },
      (resp: unknown) => {
        const r = resp as { ok?: boolean; suggestions?: Record<string, string> } | undefined;
        if (r?.ok && r.suggestions) resolve(r.suggestions as Record<ToneKey, string>);
        else reject(new Error("ai_suggest_failed"));
      },
    );
  });
}

/** Remplit un éditeur TipTap/ProseMirror. ProseMirror est très strict
 *  sur les mutations DOM — un simple `textContent = text` est ignoré
 *  silencieusement. Il faut soit utiliser execCommand (qui dispatch les
 *  bons events), soit dispatcher des InputEvent natifs avec inputType.
 *  ProseMirror écoute `beforeinput` et `input` — on dispatch les 2. */
function fillTipTapEditor(editable: HTMLElement, text: string): void {
  editable.focus();
  // 1. Sélectionne tout le contenu existant
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editable);
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
    editable.dispatchEvent(beforeEvent);
    if (!beforeEvent.defaultPrevented) {
      // ProseMirror n'a pas intercepté — on fait du DOM direct.
      editable.textContent = text;
    }
    editable.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: text,
    }));
  }
}
