// Injecteur inline LinkedIn — v4 avec diagnostic auto.
//
// PROBLÈME : sur LinkedIn 2026, on ne sait plus quels selectors LinkedIn
// expose pour le composer de commentaire. La v3 cherchait
// [role="textbox"][contenteditable="true"] inside <article> mais ne
// trouve rien chez Béné.
//
// SOLUTION : on dump dans la console TOUS les selectors candidats à
// chaque seconde pendant les 10 premières secondes, pour qu'on voit
// lesquels matchent et qu'on adapte. C'est de la triangulation
// terrain, on bricole pas dans le vide.

const INJECTED_ATTR = "data-tipote-injected";

const TONES = [
  { key: "agree", label: "Je suis d'accord", emoji: "✅" },
  { key: "disagree", label: "Je ne suis pas d'accord", emoji: "🤔" },
  { key: "add_value", label: "Ajouter de la valeur", emoji: "💡" },
  { key: "ask_question", label: "Poser une question", emoji: "❓" },
] as const;

type ToneKey = (typeof TONES)[number]["key"];

const SELECTORS_TO_DIAG: Array<{ name: string; sel: string }> = [
  { name: "role=textbox + contenteditable", sel: '[role="textbox"][contenteditable="true"]' },
  { name: "any contenteditable", sel: '[contenteditable="true"]' },
  { name: ".ql-editor", sel: ".ql-editor" },
  { name: ".ql-editor > p", sel: ".ql-editor > p" },
  { name: ".comments-comment-box__form", sel: ".comments-comment-box__form" },
  { name: ".comments-comment-texteditor", sel: ".comments-comment-texteditor" },
  { name: ".comments-comment-box", sel: ".comments-comment-box" },
  { name: "article", sel: "article" },
  { name: '[role="article"]', sel: '[role="article"]' },
  { name: ".feed-shared-update-v2", sel: ".feed-shared-update-v2" },
  { name: ".feed-shared-social-action-bar", sel: ".feed-shared-social-action-bar" },
  { name: 'svg#emoji-medium', sel: 'svg[id="emoji-medium"]' },
  { name: 'svg#image-medium', sel: 'svg[id="image-medium"]' },
  { name: 'button[aria-label*="ommenter" i]', sel: 'button[aria-label*="ommenter" i]' },
  { name: 'button[aria-label*="omment" i]', sel: 'button[aria-label*="omment" i]' },
  { name: 'div[aria-label*="ommenter" i]', sel: 'div[aria-label*="ommenter" i]' },
  { name: 'textarea[placeholder*="commentaire" i]', sel: 'textarea[placeholder*="commentaire" i]' },
  { name: 'textarea', sel: 'textarea' },
];

function runDiagnostic(label: string): void {
  const counts: Record<string, number> = {};
  for (const { name, sel } of SELECTORS_TO_DIAG) {
    try {
      counts[name] = document.querySelectorAll(sel).length;
    } catch (err) {
      counts[name] = -1;
    }
  }
  console.log(`[tipote/diag] ${label}`, counts);
}

export function startFeedInjector(): void {
  console.log("[tipote/feed] injector v4 starting (with diagnostic)");

  // Diagnostic immédiat puis toutes les 2s pendant 20s.
  runDiagnostic("t=0s");
  let diagCount = 0;
  const diagInterval = setInterval(() => {
    diagCount++;
    runDiagnostic(`t=${diagCount * 2}s`);
    if (diagCount >= 10) clearInterval(diagInterval);
  }, 2000);

  scanForEditables(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) scanForEditables(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Expose un helper sur window (isolated world — visible uniquement via
  // dropdown "context" dans DevTools, sinon utiliser le diagnostic auto).
  (window as unknown as { tipoteScanComposers?: () => void }).tipoteScanComposers = () => {
    runDiagnostic("manual scan");
  };
}

function scanForEditables(root: HTMLElement): void {
  // On essaye PLUSIEURS selectors et on garde le premier qui retourne
  // quelque chose. Approche défensive parce que LinkedIn change tout
  // régulièrement.
  const candidates: HTMLElement[] = [];

  // 1. role=textbox + contenteditable (ARIA standard, le plus stable)
  if (root.matches?.('[role="textbox"][contenteditable="true"]')) candidates.push(root);
  candidates.push(...Array.from(root.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]')));

  // 2. .ql-editor (Quill editor — LinkedIn legacy)
  if (root.matches?.('.ql-editor')) candidates.push(root);
  candidates.push(...Array.from(root.querySelectorAll<HTMLElement>('.ql-editor')));

  // 3. Any contenteditable inside .comments-comment-box (LinkedIn legacy)
  candidates.push(...Array.from(root.querySelectorAll<HTMLElement>('.comments-comment-box [contenteditable="true"]')));
  candidates.push(...Array.from(root.querySelectorAll<HTMLElement>('.comments-comment-texteditor [contenteditable="true"]')));

  // Dedupe
  const seen = new Set<HTMLElement>();
  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (el.hasAttribute(INJECTED_ATTR)) continue;
    // On veut être inside un post — sinon c'est le composer principal
    // (créer une publi) ou la messagerie. Mais on est tolérant : si on
    // ne trouve pas d'article, on tente quand même (logé).
    const article =
      el.closest("article, [role='article']") ??
      el.closest(".feed-shared-update-v2") ??
      el.closest(".comments-comment-box") ??
      el.closest(".comments-comment-texteditor");
    if (!article) {
      console.log("[tipote/feed] editable found but no article-like parent — skip", el);
      continue;
    }
    el.setAttribute(INJECTED_ATTR, "true");
    console.log("[tipote/feed] new composer detected, injecting Tipote bar", { editable: el, parent: article });
    injectToneBar(el, article as HTMLElement);
  }
}

function injectToneBar(editable: HTMLElement, article: HTMLElement): void {
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
          const content = article.innerText.trim().slice(0, 1500);
          const language = detectLanguage();
          cachedSuggestions = await fetchSuggestions(content, language);
          loading = false;
        }
        fillEditable(editable, cachedSuggestions[tone.key]);
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

  const wrapper = editable.parentElement?.parentElement ?? editable.parentElement ?? editable;
  wrapper.parentElement?.insertBefore(bar, wrapper);
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

function fillEditable(editable: HTMLElement, text: string): void {
  editable.focus();
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editable);
    sel.addRange(range);
  }
  try {
    document.execCommand("insertText", false, text);
  } catch {
    editable.textContent = text;
    editable.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: text, bubbles: true }));
  }
}
