// Injecteur inline LinkedIn — UX façon Kawaak.
//
// On suit le pattern Kawaak (analysé depuis leur content-script) :
//
// 1. POUR CHAQUE POST visible (détecté via .feed-shared-social-action-bar),
//    on enregistre un click listener sur le <article>.
//
// 2. AU CLICK n'importe où sur le post, on tente d'injecter notre bouton
//    "Tipote" DANS le toolbar du composer de commentaire (à côté des
//    icônes emoji/image). On retry 3 fois avec 300ms entre les tentatives
//    parce que le composer met un instant à apparaître après que l'user
//    ait cliqué "Commenter".
//
// 3. On localise le composer via 2 stratégies en parallèle (Kawaak en a
//    aussi 2 — v1 et v2) :
//      v2 (préférée, stable aux refactos) : on cherche les <button>
//      qui contiennent svg[id="emoji-medium"] ou svg[id="image-medium"]
//      — les SVG icon IDs sont des constantes LinkedIn jamais refactorées.
//      v1 (fallback) : selectors CSS classiques
//      `.comments-comment-box__form > div > div` + `.ql-editor`.
//
// 4. Notre bouton "Tipote ▾" est inséré dans le ctas toolbar avec un
//    dropdown des 4 tons. Click sur un ton → fetch /api/pod/ai-suggest →
//    on remplit le <p> dans l'éditeur Quill via textContent (pattern
//    Kawaak — Quill observe les mutations et propage l'état React).
//
// 5. L'user édite si besoin et publie via le bouton "Publier" natif
//    LinkedIn. Pas d'appel Voyager comment côté extension → 0 surface
//    bot, validation 100% manuelle pour la review CWS.

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 300;
const INJECTED_POST_ATTR = "data-tipote-post-init";
const INJECTED_BTN_ATTR = "data-tipote-button";

const TONES = [
  { key: "agree", label: "Je suis d'accord", emoji: "✅" },
  { key: "disagree", label: "Je ne suis pas d'accord", emoji: "🤔" },
  { key: "add_value", label: "Ajouter de la valeur", emoji: "💡" },
  { key: "ask_question", label: "Poser une question", emoji: "❓" },
] as const;

type ToneKey = (typeof TONES)[number]["key"];

export function startFeedInjector(): void {
  console.log("[tipote/feed] starting injector");
  scanForPosts(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) scanForPosts(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function scanForPosts(root: HTMLElement): void {
  // On énumère les social-action-bars (la barre Like/Commenter/Republier/
  // Envoyer en bas de chaque post). Chaque post a la sienne — c'est notre
  // signal de présence d'un post commentable.
  const bars: HTMLElement[] = [];
  if (root.matches?.(".feed-shared-social-action-bar")) bars.push(root);
  bars.push(
    ...Array.from(root.querySelectorAll<HTMLElement>(".feed-shared-social-action-bar"))
  );

  for (const bar of bars) {
    const post = bar.closest("article, [role='article']") as HTMLElement | null;
    if (!post) continue;
    if (post.hasAttribute(INJECTED_POST_ATTR)) continue;
    post.setAttribute(INJECTED_POST_ATTR, "true");
    setupPost(post);
  }
}

function setupPost(post: HTMLElement): void {
  // Pattern Kawaak : au click n'importe où sur le post, on retente
  // d'injecter — l'user a peut-être cliqué "Commenter" et le composer
  // est en train d'apparaître. Le retry avec sleep gère le délai.
  post.addEventListener("click", () => {
    void tryInject(post, 0);
  });
  // Premier essai immédiat — au cas où le composer serait déjà ouvert
  // (post en cours de commentaire au moment du load de l'extension).
  void tryInject(post, 0);
}

async function tryInject(post: HTMLElement, retry: number): Promise<void> {
  if (retry > MAX_RETRIES) return;

  const ctas = getCommentCtasElement(post) ?? getCommentCtasElementV1(post);
  const paragraph = getCommentParagraphElement(post) ?? getCommentEditorElementV1(post);

  if (!ctas || !paragraph) {
    await sleep(RETRY_DELAY_MS);
    return tryInject(post, retry + 1);
  }

  // Déjà injecté pour ce composer ? skip.
  if (ctas.querySelector(`[${INJECTED_BTN_ATTR}]`)) return;

  console.log("[tipote/feed] composer found, injecting Tipote button");
  injectTipoteButton(ctas, paragraph, post);
}

// ─── V2 selectors — basés sur les SVG icon IDs (stable) ───────────────

function getCommentCtasElement(post: HTMLElement): HTMLElement | null {
  // Le toolbar du composer contient deux boutons stables : emoji + image.
  // Leurs SVG ont des id="emoji-medium" et id="image-medium" qui restent
  // identiques d'une version LinkedIn à l'autre. On remonte au parent
  // pour avoir le container toolbar.
  let btn: HTMLElement | null = null;
  try {
    btn = post.querySelector(
      'button:has(svg[id="image-medium"])',
    ) as HTMLElement | null;
    if (!btn) {
      btn = post.querySelector(
        'button:has(svg[id="emoji-medium"])',
      ) as HTMLElement | null;
    }
  } catch {
    // :has() supporté dans tous les Chrome récents mais on défend
    return null;
  }
  return btn?.parentElement ?? null;
}

function getCommentEditorElement(post: HTMLElement): HTMLElement | null {
  const ctas = getCommentCtasElement(post);
  return (
    (ctas?.parentElement?.querySelector(
      'div[contenteditable="true"]',
    ) as HTMLElement | null) ?? null
  );
}

function getCommentParagraphElement(post: HTMLElement): HTMLElement | null {
  const editor = getCommentEditorElement(post);
  return (
    (editor?.parentElement?.parentElement?.querySelector(
      "p",
    ) as HTMLElement | null) ?? null
  );
}

// ─── V1 selectors — fallback CSS classique ────────────────────────────

function getCommentCtasElementV1(post: HTMLElement): HTMLElement | null {
  return post.querySelector(
    ".comments-comment-box__form > div > div",
  ) as HTMLElement | null;
}

function getCommentEditorElementV1(post: HTMLElement): HTMLElement | null {
  // .ql-editor est le contenteditable Quill ; .ql-editor > p si présent.
  return (
    (post.querySelector(".ql-editor > p") as HTMLElement | null) ??
    (post.querySelector(".ql-editor") as HTMLElement | null)
  );
}

// ─── Injection du bouton + dropdown ───────────────────────────────────

function injectTipoteButton(
  ctas: HTMLElement,
  paragraph: HTMLElement,
  post: HTMLElement,
): void {
  let cachedSuggestions: Record<ToneKey, string> | null = null;
  let loading = false;

  const container = document.createElement("div");
  container.setAttribute(INJECTED_BTN_ATTR, "true");
  container.style.cssText = `
    display: inline-flex;
    position: relative;
    margin: 0 6px;
    align-items: center;
  `;

  // Bouton principal Tipote ▾
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Tipote — Générer un commentaire");
  btn.style.cssText = `
    background: #5d6cdb;
    color: white;
    border: 0;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    line-height: 1.4;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: background 0.15s;
  `;
  btn.innerHTML = `<span>Tipote</span><span style="font-size:9px; opacity:0.7;">▾</span>`;
  btn.addEventListener("mouseenter", () => (btn.style.background = "#4f5acf"));
  btn.addEventListener("mouseleave", () => (btn.style.background = "#5d6cdb"));

  // Menu dropdown
  const menu = document.createElement("div");
  menu.style.cssText = `
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.15);
    min-width: 240px;
    z-index: 999999;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  for (const tone of TONES) {
    const item = document.createElement("button");
    item.type = "button";
    item.style.cssText = `
      display: block;
      width: 100%;
      text-align: left;
      padding: 10px 14px;
      background: white;
      border: 0;
      cursor: pointer;
      font-size: 13px;
      color: #111;
      font-family: inherit;
      line-height: 1.4;
    `;
    item.innerHTML = `<span style="margin-right:8px;">${tone.emoji}</span>${tone.label}`;
    item.addEventListener("mouseenter", () => (item.style.background = "#f3f4f6"));
    item.addEventListener("mouseleave", () => (item.style.background = "white"));
    item.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu.style.display = "none";
      if (loading) return;
      const originalHtml = item.innerHTML;
      item.innerHTML = `<span style="margin-right:8px;">${tone.emoji}</span>Génération…`;
      try {
        if (!cachedSuggestions) {
          loading = true;
          const content = extractPostText(post);
          const language = detectLanguage();
          cachedSuggestions = await fetchSuggestions(content, language);
          loading = false;
        }
        fillEditor(paragraph, cachedSuggestions[tone.key]);
      } catch (err) {
        console.warn("[tipote/feed] suggestion fill failed", err);
      } finally {
        item.innerHTML = originalHtml;
      }
    });
    menu.appendChild(item);
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    menu.style.display = menu.style.display === "block" ? "none" : "block";
  });

  // Click outside → ferme
  const closeOnClickOutside = (e: MouseEvent) => {
    if (!container.contains(e.target as Node)) menu.style.display = "none";
  };
  document.addEventListener("click", closeOnClickOutside);

  container.appendChild(menu);
  container.appendChild(btn);

  // Insert AU DÉBUT du toolbar (avant les icônes emoji/image)
  ctas.insertBefore(container, ctas.firstChild);
}

// ─── Helpers ──────────────────────────────────────────────────────────

function extractPostText(post: HTMLElement): string {
  return post.innerText.trim().slice(0, 1500);
}

function detectLanguage(): string {
  const m = document.cookie.match(/li_lang=([^;]+)/);
  if (m) return decodeURIComponent(m[1]).slice(0, 2).toLowerCase();
  return (navigator.language || "fr").slice(0, 2).toLowerCase();
}

async function fetchSuggestions(
  content: string,
  language: string,
): Promise<Record<ToneKey, string>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "ai/suggest",
        payload: { content_excerpt: content, language },
      },
      (resp: unknown) => {
        const r = resp as
          | { ok?: boolean; suggestions?: Record<string, string> }
          | undefined;
        if (r?.ok && r.suggestions) {
          resolve(r.suggestions as Record<ToneKey, string>);
        } else {
          reject(new Error("ai_suggest_failed"));
        }
      },
    );
  });
}

/** Remplit le paragraphe <p> à l'intérieur du .ql-editor. Pattern Kawaak :
 *  on set juste textContent — Quill observe les mutations et propage
 *  l'état React. Un dispatch InputEvent en bonus pour les cas où Quill
 *  ne capte pas immédiatement. */
function fillEditor(paragraph: HTMLElement, text: string): void {
  paragraph.textContent = text;
  paragraph.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }),
  );
  // Focus l'éditeur pour que l'user puisse éditer
  const editor = paragraph.closest(
    'div[contenteditable="true"], .ql-editor',
  ) as HTMLElement | null;
  editor?.focus();
  // Place le caret à la fin du texte inséré
  const sel = window.getSelection();
  if (sel && editor) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.addRange(range);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
