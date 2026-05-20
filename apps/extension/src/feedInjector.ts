// Injecteur inline LinkedIn — UX façon Kawaak.
//
// Au lieu d'un panel flottant qui s'ouvre sur les permalinks, on injecte
// directement une barre de 4 boutons (les 4 tons IA) AU-DESSUS du champ
// de commentaire natif LinkedIn, sur N'IMPORTE QUEL post du fil. L'user
// clique "Commenter" → LinkedIn ouvre son éditeur → on détecte → on
// injecte les tons → click sur un ton → suggestion IA remplie dans
// l'éditeur natif → l'user publie avec son bouton "Publier" habituel.
//
// Pourquoi cette approche :
//   - Aucune dépendance aux classes CSS obfusquées (qui changent tous
//     les 3-6 mois côté LinkedIn).
//   - On n'envoie PAS le commentaire via Voyager → c'est LinkedIn natif
//     qui publie → 0 risque de bannissement côté API write, le user
//     reste maître de la publication (édition, annulation).
//   - Pas de friction : pas de changement de page, pas de panel à
//     ouvrir, l'extension est invisible jusqu'au moment où l'user
//     décide de commenter.
//
// Signaux DOM stables qu'on utilise (ne changent pas avec les refactos
// de classes LinkedIn) :
//   - <article> ou [role="article"] pour identifier un post
//   - [role="textbox"][contenteditable="true"] pour l'éditeur de commentaire
//   - Notre data-attribut pour ne pas ré-injecter 2 fois

const TONES = [
  { key: "agree", label: "Je suis d'accord", emoji: "✅" },
  { key: "disagree", label: "Je ne suis pas d'accord", emoji: "🤔" },
  { key: "add_value", label: "Ajouter de la valeur", emoji: "💡" },
  { key: "ask_question", label: "Poser une question", emoji: "❓" },
] as const;

type ToneKey = (typeof TONES)[number]["key"];

const INJECTED_ATTR = "data-tipote-injected";

export function startFeedInjector() {
  console.log("[tipote/feed] injector starting");
  // Premier balayage du DOM existant.
  scanForComposers(document.body);
  // Puis observe tous les ajouts (lazy-load du fil, scroll, ouverture
  // de l'éditeur de commentaire au click).
  new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node instanceof HTMLElement) scanForComposers(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function scanForComposers(root: HTMLElement) {
  // On cherche tous les textbox contenteditable qui viennent d'apparaître
  // ET qui ne sont pas déjà injectés ET qui sont DANS un article (sinon
  // on tomberait sur l'éditeur de POST ou la messagerie).
  const candidates: HTMLElement[] = [];
  if (root.matches?.('[role="textbox"][contenteditable="true"]')) {
    candidates.push(root);
  }
  candidates.push(
    ...Array.from(
      root.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]')
    )
  );

  for (const editable of candidates) {
    if (editable.hasAttribute(INJECTED_ATTR)) continue;
    const article = editable.closest("article, [role='article']") as HTMLElement | null;
    if (!article) continue; // pas un commentaire de post (éditeur de post, DM, etc.)
    editable.setAttribute(INJECTED_ATTR, "true");
    injectToneBar(article, editable);
  }
}

/** Injecte la barre 4-tons juste au-dessus du champ contenteditable.
 *  Les suggestions sont générées AU 1ER CLICK sur un ton (lazy), puis
 *  cachées pour les clicks suivants sur le même post. */
function injectToneBar(article: HTMLElement, editable: HTMLElement) {
  let cachedSuggestions: Record<ToneKey, string> | null = null;
  let inFlight = false;

  const bar = document.createElement("div");
  bar.setAttribute("data-tipote-bar", "true");
  bar.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
    margin: 8px 0 6px 0;
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
      if (inFlight) return;
      const original = btn.textContent;
      btn.disabled = true;
      btn.style.opacity = "0.6";
      btn.style.cursor = "wait";

      try {
        if (!cachedSuggestions) {
          inFlight = true;
          btn.textContent = `${tone.emoji} Génération…`;
          const content = extractPostText(article);
          const language = detectLanguage();
          cachedSuggestions = await fetchSuggestions(content, language);
          inFlight = false;
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
        inFlight = false;
      }
    });
    bar.appendChild(btn);
  }

  // Insert AU-DESSUS du contenteditable. On vise le plus proche bloc
  // parent stable (forme : <div> qui contient le textbox + le toolbar
  // emoji/image de LinkedIn). Si on n'en trouve pas, fallback sur
  // insertBefore direct.
  const composerWrap = editable.parentElement?.parentElement ?? editable.parentElement;
  if (composerWrap?.parentElement) {
    composerWrap.parentElement.insertBefore(bar, composerWrap);
  } else {
    editable.parentElement?.insertBefore(bar, editable);
  }
}

/** Extrait le contenu textuel du post depuis l'article DOM. innerText
 *  est suffisant — LinkedIn met le texte du post dans des spans qui
 *  contribuent au innerText proprement. On slice à 1500 chars pour
 *  garder le prompt Claude raisonnable. */
function extractPostText(article: HTMLElement): string {
  const text = article.innerText.trim();
  return text.slice(0, 1500);
}

/** Heuristique langue : cookie li_lang puis navigator.language. */
function detectLanguage(): string {
  const m = document.cookie.match(/li_lang=([^;]+)/);
  if (m) return decodeURIComponent(m[1]).slice(0, 2).toLowerCase();
  return (navigator.language || "fr").slice(0, 2).toLowerCase();
}

/** Appelle /api/pod/ai-suggest via le SW pour bénéficier des cookies
 *  tipote.com. Retourne les 4 suggestions ou throw si erreur. */
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
        const r = resp as { ok?: boolean; suggestions?: Record<string, string> } | undefined;
        if (r?.ok && r.suggestions) {
          resolve(r.suggestions as Record<ToneKey, string>);
        } else {
          reject(new Error("ai_suggest_failed"));
        }
      },
    );
  });
}

/** Remplit un contenteditable React-friendly. document.execCommand est
 *  deprecated mais c'est le seul moyen fiable de déclencher les
 *  InputEvents que React/Draft.js écoute — un simple .innerHTML / .textContent
 *  est invisible pour l'état React et LinkedIn pense que le champ est
 *  toujours vide. */
function fillEditable(el: HTMLElement, text: string) {
  el.focus();
  // Sélectionne tout le contenu existant pour le remplacer.
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
  }
  // execCommand dispatch un InputEvent que React capte.
  try {
    document.execCommand("insertText", false, text);
  } catch (err) {
    console.warn("[tipote/feed] execCommand failed, fallback dispatchEvent", err);
    // Fallback : si execCommand ne marche plus dans Chrome, dispatch
    // manuellement un InputEvent avec inputType="insertText".
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: text, bubbles: true }));
  }
  // Place le caret à la fin pour que l'user puisse continuer à éditer
  // depuis la fin de la suggestion s'il veut nuancer.
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}
