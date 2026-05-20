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

  const bar = document.createElement("div");
  bar.setAttribute("data-tipote-bar", "true");
  bar.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
    margin: 8px 0;
    background: linear-gradient(to right, #eef2ff, #f5f3ff);
    border: 1px solid #c7d2fe;
    border-radius: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    align-items: center;
    line-height: 1.3;
  `;

  const logo = document.createElement("span");
  logo.style.cssText = `color: #5d6cdb; font-weight: 700; font-size: 11px; margin-right: 6px; letter-spacing: 0.3px;`;
  logo.textContent = "Tipote";
  bar.appendChild(logo);

  for (const tone of TONES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", tone.label);
    btn.style.cssText = `
      background: white; border: 1px solid #d1d5db; border-radius: 999px;
      padding: 4px 11px; cursor: pointer; font: inherit; font-size: 11px;
      color: #374151; transition: background 0.15s; white-space: nowrap;
    `;
    btn.textContent = `${tone.emoji} ${tone.label}`;
    btn.addEventListener("mouseenter", () => {
      if (!btn.disabled) { btn.style.background = "#eef2ff"; btn.style.borderColor = "#a5b4fc"; }
    });
    btn.addEventListener("mouseleave", () => {
      if (!btn.disabled) { btn.style.background = "white"; btn.style.borderColor = "#d1d5db"; }
    });
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (loading) return;
      const original = btn.textContent;
      btn.disabled = true;
      btn.style.opacity = "0.6";
      btn.style.cursor = "wait";
      try {
        if (!cachedSuggestions) {
          loading = true;
          btn.textContent = `${tone.emoji} Génération…`;
          const post = findPostElement(editable);
          const content = post ? (post.innerText || "").trim().slice(0, 1500) : "";
          const language = detectLanguage();
          console.log("[tipote/feed] fetching suggestions, content length =", content.length);
          cachedSuggestions = await fetchSuggestions(content, language);
          loading = false;
        }
        fillTipTapEditor(editable, cachedSuggestions[tone.key]);
        btn.textContent = `${tone.emoji} ✓`;
        setTimeout(() => {
          btn.textContent = original ?? "";
          btn.disabled = false;
          btn.style.opacity = "1";
          btn.style.cursor = "pointer";
        }, 800);
      } catch (err) {
        console.warn("[tipote/feed] suggestion fill failed", err);
        btn.textContent = original ?? "";
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        loading = false;
      }
    });
    bar.appendChild(btn);
  }

  // Insertion : juste avant l'éditeur. On remonte de 1-2 niveaux pour
  // s'assurer que la barre soit AU-DESSUS du composer (le wrapper TipTap
  // a généralement un padding/border qu'on veut pas couper). En fallback,
  // insertion directe avant l'éditeur.
  const wrapper = editable.parentElement?.parentElement ?? editable.parentElement;
  if (wrapper?.parentElement) {
    wrapper.parentElement.insertBefore(bar, wrapper);
  } else {
    editable.parentElement?.insertBefore(bar, editable);
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
