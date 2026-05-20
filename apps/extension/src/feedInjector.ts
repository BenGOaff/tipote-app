// Injecteur inline LinkedIn — version v3 simplifiée.
//
// Les versions précédentes dépendaient de selectors LinkedIn spécifiques
// (.feed-shared-social-action-bar, .comments-comment-box__form, SVG IDs
// emoji-medium/image-medium). En pratique LinkedIn 2026 les a soit
// renommés soit refactorés — chez Béné, aucun de ces selectors ne match.
//
// Stratégie v3 : on ne dépend QUE de signaux universels :
//   - <article> ou [role="article"] : tout post LinkedIn a l'un des deux
//   - [role="textbox"][contenteditable="true"] : tout composer de
//     commentaire utilise ce pattern ARIA (norme accessibilité,
//     LinkedIn ne peut pas y déroger sans casser leur compliance)
//
// Quand un nouveau composer apparaît dans le DOM (= l'user a cliqué
// "Commenter" sur un post), on insère notre barre 4-tons JUSTE AU-DESSUS
// du contenteditable. Pas dans le toolbar, plus simple.
//
// Quand l'user clique un ton → fetch suggestion IA → on remplit le
// contenteditable. L'user édite si besoin et publie via le bouton
// "Publier" natif de LinkedIn.

const INJECTED_ATTR = "data-tipote-injected";

const TONES = [
  { key: "agree", label: "Je suis d'accord", emoji: "✅" },
  { key: "disagree", label: "Je ne suis pas d'accord", emoji: "🤔" },
  { key: "add_value", label: "Ajouter de la valeur", emoji: "💡" },
  { key: "ask_question", label: "Poser une question", emoji: "❓" },
] as const;

type ToneKey = (typeof TONES)[number]["key"];

export function startFeedInjector(): void {
  console.log("[tipote/feed] injector v3 starting");
  scanForEditables(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) scanForEditables(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Exposé pour debug console — scan manuellement et logge tout ce
  // qu'on trouve sur la page courante.
  (window as unknown as { tipoteScanComposers?: () => void }).tipoteScanComposers = () => {
    const editables = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
    const articles = document.querySelectorAll('article, [role="article"]');
    console.log("[tipote/feed] scan: editables=", editables.length, "articles=", articles.length);
    editables.forEach((ed, i) => {
      const article = ed.closest("article, [role='article']");
      console.log(`  editable[${i}]`, ed, "inside article:", !!article);
    });
  };
}

function scanForEditables(root: HTMLElement): void {
  // Liste tous les contenteditable textbox dans ce sous-arbre.
  const editables: HTMLElement[] = [];
  if (root.matches?.('[role="textbox"][contenteditable="true"]')) {
    editables.push(root);
  }
  editables.push(
    ...Array.from(root.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]'))
  );

  for (const editable of editables) {
    if (editable.hasAttribute(INJECTED_ATTR)) continue;
    const article = editable.closest("article, [role='article']") as HTMLElement | null;
    if (!article) {
      // Pas dans un article = c'est probablement l'éditeur de POST principal
      // ou la messagerie. On ignore (on ne veut pas polluer ces UI).
      continue;
    }
    editable.setAttribute(INJECTED_ATTR, "true");
    console.log("[tipote/feed] new composer detected, injecting Tipote bar");
    injectToneBar(editable, article);
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
  logo.style.cssText = `
    color: #5d6cdb;
    font-weight: 700;
    font-size: 11px;
    margin-right: 6px;
    letter-spacing: 0.3px;
  `;
  logo.textContent = "Tipote";
  bar.appendChild(logo);

  for (const tone of TONES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", tone.label);
    btn.style.cssText = `
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 999px;
      padding: 4px 11px;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      color: #374151;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
    `;
    btn.textContent = `${tone.emoji} ${tone.label}`;

    btn.addEventListener("mouseenter", () => {
      if (!btn.disabled) {
        btn.style.background = "#eef2ff";
        btn.style.borderColor = "#a5b4fc";
      }
    });
    btn.addEventListener("mouseleave", () => {
      if (!btn.disabled) {
        btn.style.background = "white";
        btn.style.borderColor = "#d1d5db";
      }
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
          const content = extractPostText(article);
          const language = detectLanguage();
          cachedSuggestions = await fetchSuggestions(content, language);
          loading = false;
        }
        const text = cachedSuggestions[tone.key];
        fillEditable(editable, text);
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

  // Insert la barre au-dessus du contenteditable. On cherche un container
  // parent stable, puis fallback. Le contenteditable LinkedIn est souvent
  // wrappé dans plusieurs <div> — on remonte 2 niveaux pour avoir un
  // emplacement visuellement propre, sinon fallback direct.
  const wrapper = editable.parentElement?.parentElement ?? editable.parentElement ?? editable;
  wrapper.parentElement?.insertBefore(bar, wrapper);
}

function extractPostText(article: HTMLElement): string {
  return article.innerText.trim().slice(0, 1500);
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
      { type: "ai/suggest", payload: { content_excerpt: content, language } },
      (resp: unknown) => {
        const r = resp as { ok?: boolean; suggestions?: Record<string, string> } | undefined;
        if (r?.ok && r.suggestions) resolve(r.suggestions as Record<ToneKey, string>);
        else reject(new Error("ai_suggest_failed"));
      },
    );
  });
}

/** Remplit le contenteditable de LinkedIn. On efface d'abord le contenu
 *  existant via sélection + replace via execCommand("insertText"). C'est
 *  la méthode qui marche avec les éditeurs React/Quill modernes parce
 *  qu'elle fire un InputEvent que l'éditeur écoute. */
function fillEditable(editable: HTMLElement, text: string): void {
  editable.focus();
  // Sélectionne tout le contenu existant
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editable);
    sel.addRange(range);
  }
  // Insert le nouveau texte — remplace la sélection
  try {
    document.execCommand("insertText", false, text);
  } catch {
    editable.textContent = text;
    editable.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: text, bubbles: true }));
  }
  // Place le caret à la fin
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    sel.addRange(range);
  }
}
