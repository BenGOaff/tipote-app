// Injecteur inline multi-plateforme.
//
// Phase 1 (mai 2026, Béné) : supporte LinkedIn (existant) + Facebook +
// Threads + Instagram + X/Twitter. Pour chaque réseau, on détecte les
// composers de commentaire/réponse, on insère un bouton "✨ Tipote ▾"
// qui ouvre un menu de 4 suggestions IA dans 4 tons, l'user clique sur
// un ton et le texte généré est inséré dans le composer.
//
// AUCUNE auto-action. L'user lit, ajuste, publie via le bouton natif
// du réseau. Risque de ban : zéro sur toutes les plateformes.
//
// L'adapter par plateforme (./platforms/*.ts) abstrait :
//   - isComposer() : reconnaître le bon élément DOM
//   - findParentPost() : extraire le contexte (le post à commenter)
//     pour l'envoyer à l'IA
//   - fillEditor() : insérer du texte dans l'éditeur (chaque réseau
//     utilise un framework différent — TipTap, Lexical, DraftJS, plain
//     textarea — d'où la sandbox par adapter).

import { t } from "./i18n";
import { detectPlatform, type PlatformAdapter } from "./platforms";
import { extractPostContext } from "./postContext";

const INJECTED_ATTR = "data-tipote-injected";

const TONES = [
  { key: "agree", emoji: "✅" },
  { key: "disagree", emoji: "🤔" },
  { key: "add_value", emoji: "💡" },
  { key: "ask_question", emoji: "❓" },
] as const;

type ToneKey = (typeof TONES)[number]["key"];

function toneLabel(key: ToneKey): string {
  return t(`tone.${key}` as Parameters<typeof t>[0]);
}

let detectedAny = false;

export function startFeedInjector(): void {
  const adapter = detectPlatform();
  if (!adapter) {
    console.log("[tipote/feed] platform not supported, skip injector");
    return;
  }
  console.log(`[tipote/feed] injector starting for platform: ${adapter.id}`);
  scanForComposers(document.body, adapter);
  // Auto-diag : si aucun composer détecté après 8s, on dump l'état du
  // DOM pour faciliter le debug. Le content script tourne en monde isolé
  // → tipoteDiag() ne s'expose pas dans la console "page" du devtools,
  // d'où l'autolog. Béné voit le résultat sans avoir à switcher de
  // contexte console (qui est super peu intuitif).
  setTimeout(() => {
    if (!detectedAny) {
      // Log (pas warn) : sur une page sans composer (subreddit list,
      // home FB, etc.), c'est normal. Pas la peine de polluer le panneau
      // erreurs de l'extension.
      console.log(`[tipote/feed] no composer detected after 8s on ${adapter.id} — running auto-diag`);
      autoDiag(adapter);
    }
  }, 8000);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof HTMLElement) scanForComposers(node, adapter);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  // Reddit (et autres SPA modernes) lazy-mount le composer au focus :
  // l'élément n'existe pas dans le DOM tant que l'user n'a pas cliqué
  // dans la zone "Ajouter un commentaire". On rescan le ciblage du focus
  // pour rattraper ces composers tardifs.
  document.addEventListener("focusin", (e) => {
    const target = e.target;
    if (target instanceof HTMLElement) {
      // Scan le sous-arbre du parent — le composer peut être un sibling
      // ou un wrapper du focused element.
      const root = target.closest("form, [role='dialog'], [role='article'], faceplate-form, shreddit-comment-composer") as HTMLElement | null;
      scanForComposers(root ?? target.parentElement ?? document.body, adapter);
    }
  });
}

function scanForComposers(root: HTMLElement, adapter: PlatformAdapter): void {
  const candidates: HTMLElement[] = [];
  const isMatch = (el: HTMLElement): boolean =>
    adapter.isComposer(el) || (adapter.isPostComposer?.(el) ?? false);

  if (isMatch(root)) candidates.push(root);

  // On scan large : tout textbox/contenteditable/textarea potentiel
  // dans le sous-arbre, puis filtrage strict par l'adapter.
  const selector = '[role="textbox"][contenteditable="true"], [contenteditable="true"], textarea';
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    if (isMatch(el)) candidates.push(el);
  }

  // Reddit (et de plus en plus de sites modernes) encapsulent leurs
  // composers dans des Web Components avec Shadow DOM. document.
  // querySelectorAll ne traverse PAS les shadow roots — il faut
  // descendre récursivement. On le fait pour TOUS les adapters
  // (zéro coût si la page n'a pas de shadow DOM, gros gain si oui).
  for (const shadowEl of walkShadowRoots(root)) {
    if (isMatch(shadowEl)) candidates.push(shadowEl);
    for (const inner of shadowEl.querySelectorAll<HTMLElement>(selector)) {
      if (isMatch(inner)) candidates.push(inner);
    }
  }

  for (const composer of candidates) {
    if (composer.hasAttribute(INJECTED_ATTR)) continue;
    composer.setAttribute(INJECTED_ATTR, "true");
    detectedAny = true;
    console.log(`[tipote/feed] composer detected (${adapter.id})`, composer);
    injectToneBar(composer, adapter);
  }
}

function autoDiag(adapter: PlatformAdapter): void {
  console.group(`[tipote/diag] auto-scan (${adapter.id})`);
  const dumpAncestors = (el: Element, depth = 6): string => {
    const parts: string[] = [];
    let n: Element | null = el;
    for (let i = 0; i < depth && n; i++) {
      const id = n.id ? `#${n.id}` : "";
      const cls = typeof n.className === "string" && n.className ? `.${n.className.split(" ").slice(0, 2).join(".")}` : "";
      const role = n.getAttribute("role");
      parts.push(`<${n.tagName.toLowerCase()}${id}${cls}${role ? `[role=${role}]` : ""}>`);
      n = n.parentElement;
    }
    return parts.join(" > ");
  };
  const editables = document.querySelectorAll<HTMLElement>(
    '[role="textbox"][contenteditable="true"], [contenteditable="true"], textarea',
  );
  console.log(`Found ${editables.length} editable elements:`);
  editables.forEach((el, i) => {
    const matches = adapter.isComposer(el);
    console.log(
      `#${i} <${el.tagName}> isComposer=${matches} aria-label=${JSON.stringify(el.getAttribute("aria-label"))} aria-placeholder=${JSON.stringify(el.getAttribute("aria-placeholder"))} placeholder=${JSON.stringify(el.getAttribute("placeholder"))}`,
      el,
    );
    console.log(`  ancestors: ${dumpAncestors(el)}`);
  });
  console.groupEnd();
}

/** Visite récursivement tous les Shadow Roots ouverts sous `root` et
 *  retourne les éléments qu'ils contiennent. Cap profondeur pour
 *  éviter une page malformée qui boucle. */
function* walkShadowRoots(root: Element): Generator<HTMLElement> {
  const stack: Element[] = [root];
  let visited = 0;
  while (stack.length > 0 && visited < 5000) {
    const el = stack.pop()!;
    visited++;
    // Si l'élément lui-même a un shadow root ouvert, descend dedans.
    const sr = (el as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (sr) {
      // Tous les éléments du shadow root sont à scanner
      const allInShadow = sr.querySelectorAll<HTMLElement>("*");
      for (const x of allInShadow) {
        yield x;
        // Si cet élément contient lui-même un shadow root, on continue
        if ((x as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot) {
          stack.push(x);
        }
      }
    }
    // Continue à descendre dans le DOM normal pour trouver d'autres
    // hôtes de shadow root.
    for (const child of el.children) {
      stack.push(child);
    }
  }
}

function injectToneBar(composer: HTMLElement, adapter: PlatformAdapter): void {
  // Cache PAR TON : on ne génère que le commentaire du ton cliqué (Béné
  // 18 juin 2026 : générer les 4 d'un coup était un gaspillage de tokens).
  // Re-cliquer le même ton ré-utilise le cache ; changer l'indication vide
  // le cache.
  let cache: Partial<Record<ToneKey, string>> = {};
  // Indication libre (ce que l'user veut, ex: "parle de la lumière",
  // "en anglais", "plus court"). Demandée par Monique le 13 juin 2026 :
  // sur FB/IG elle n'avait aucun moyen d'orienter les commentaires.
  // Quand elle change, on invalide le cache pour régénérer.
  let lastUsedIndications = "";
  let loading = false;
  let menuOpen = false;
  const useFixed = adapter.useFixedTrigger === true;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.setAttribute("data-tipote-trigger", "true");
  trigger.setAttribute("aria-label", t("dropdown.aria"));
  // Empêcher le vol de focus : le composer doit rester focused quand
  // on clique sur Tipote, sinon (notamment TikTok / DraftJS) le blur
  // déclenche un rerender React qui casse au moment de notre execCommand.
  trigger.addEventListener("mousedown", (e) => e.preventDefault());
  if (useFixed) {
    // Mode TikTok : trigger attaché à <body> en position:fixed pour rester
    // invisible côté React de la page hôte. Repositionné via getBoundingClientRect.
    trigger.style.cssText = `
      position: fixed; z-index: 2147483646;
      align-items: center; gap: 6px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; border: 0; border-radius: 999px;
      padding: 6px 14px; cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px; font-weight: 600;
      box-shadow: 0 1px 3px rgba(99, 102, 241, 0.3);
      transition: box-shadow 0.15s, opacity 0.15s;
      white-space: nowrap;
      display: none;
    `;
  } else {
    // Mode inline (LinkedIn, FB, IG, Threads, X, Reddit) : intégration
    // visuelle au-dessus du composer. Plus propre, c'est ce qu'on avait
    // historiquement.
    trigger.style.cssText = `
      display: inline-flex; align-items: center; gap: 6px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; border: 0; border-radius: 999px;
      padding: 6px 14px; cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px; font-weight: 600;
      box-shadow: 0 1px 3px rgba(99, 102, 241, 0.3);
      transition: box-shadow 0.15s, opacity 0.15s;
      white-space: nowrap;
    `;
  }
  trigger.innerHTML = `<span>✨ Tipote</span><span style="font-size: 10px; opacity: 0.9;">▾</span>`;
  trigger.addEventListener("mouseenter", () => {
    trigger.style.boxShadow = "0 2px 6px rgba(99, 102, 241, 0.5)";
  });
  trigger.addEventListener("mouseleave", () => {
    trigger.style.boxShadow = "0 1px 3px rgba(99, 102, 241, 0.3)";
  });

  let container: HTMLElement;
  if (useFixed) {
    document.body.appendChild(trigger);
    container = trigger; // référence pour onDocClick / cleanup
  } else {
    container = document.createElement("div");
    container.setAttribute("data-tipote-bar", "true");
    container.style.cssText = `
      position: relative;
      display: inline-block;
      margin: 6px 0 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    container.appendChild(trigger);
    // Insertion au-dessus du composer (l'historique qui marche sur LI/FB/IG)
    const wrapper = composer.parentElement?.parentElement ?? composer.parentElement;
    if (wrapper?.parentElement) {
      wrapper.parentElement.insertBefore(container, wrapper);
    } else {
      composer.parentElement?.insertBefore(container, composer);
    }
  }

  // Menu attaché au <body> en position:fixed pour échapper aux overflow
  // hidden / transform de la page hôte (LinkedIn, FB, IG ont tous des
  // wrappers qui clip le dropdown s'il est positionné en absolute).
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

  // Champ "indication" en tête du menu : oriente le commentaire.
  const hintWrap = document.createElement("div");
  hintWrap.style.cssText = `padding: 6px 8px 8px; border-bottom: 1px solid #f0f0f0; margin-bottom: 2px;`;
  const hintInput = document.createElement("input");
  hintInput.type = "text";
  hintInput.placeholder = t("dropdown.hintPlaceholder");
  hintInput.setAttribute("data-tipote-hint", "true");
  hintInput.style.cssText = `
    width: 100%; box-sizing: border-box;
    padding: 6px 8px; font-size: 12px;
    border: 1px solid #e5e7eb; border-radius: 6px;
    color: #111; outline: none;
    font-family: inherit;
  `;
  // Empêche la fermeture du menu / le vol de focus du composer.
  hintInput.addEventListener("mousedown", (e) => e.stopPropagation());
  hintInput.addEventListener("click", (e) => e.stopPropagation());
  hintWrap.appendChild(hintInput);
  menu.appendChild(hintWrap);

  for (const tone of TONES) {
    const label = toneLabel(tone.key);
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("aria-label", label);
    item.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      background: transparent; border: 0; border-radius: 6px;
      padding: 8px 10px; cursor: pointer; font: inherit; font-size: 13px;
      color: #374151; text-align: left; width: 100%;
      transition: background 0.1s;
    `;
    item.innerHTML = `<span style="font-size: 16px;">${tone.emoji}</span><span>${label}</span>`;
    // mousedown.preventDefault pour ne pas voler le focus du composer.
    item.addEventListener("mousedown", (e) => e.preventDefault());
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
      trigger.innerHTML = `<span>${tone.emoji} ${t("dropdown.generating")}</span>`;
      try {
        const indications = hintInput.value.trim().slice(0, 400);
        // L'indication a changé depuis la dernière génération -> on vide le
        // cache (les anciens commentaires ne respectent plus la consigne).
        if (indications !== lastUsedIndications) {
          cache = {};
          lastUsedIndications = indications;
        }
        // On ne génère QUE le ton cliqué, et seulement s'il n'est pas déjà
        // en cache. Cliquer "Je suis d'accord" ne génère plus que ce
        // commentaire-là, pas les 3 autres (économie de tokens).
        if (!cache[tone.key]) {
          loading = true;
          const post = adapter.findParentPost(composer);
          // Extraction propre : texte sans bruit UI + image principale
          // (vision). Cf. postContext.ts (drame FB/IG, Béné 13 juin 2026).
          const ctx = extractPostContext(post, composer);
          // Cap large (8000) : on n'ampute plus les longs posts de leur
          // contexte (retour Béné 18 juin 2026).
          const content = ctx.text.slice(0, 8000);
          const language = detectLanguage();
          // Si le réseau auto-traduit le post (ex. EN affiché en FR), on
          // récupère la langue d'origine pour répondre dans CETTE langue.
          const postLang = ctx.translatedFromLang;
          console.log(`[tipote/feed] fetching "${tone.key}" for ${adapter.id}, content length = ${content.length}, image = ${ctx.imageUrl ? "yes" : "no"}, translatedFrom = ${postLang ?? "no"}, hint = ${JSON.stringify(indications)}`);
          cache[tone.key] = await fetchSuggestions(content, language, adapter.id, indications, ctx.imageUrl, tone.key, postLang);
          loading = false;
        }
        adapter.fillEditor(composer, cache[tone.key]!);
        const doneLabel = adapter.clipboardMode ? t("dropdown.copied") : t("dropdown.inserted");
        trigger.innerHTML = `<span>${tone.emoji} ${doneLabel}</span>`;
        // Clipboard mode reste affiché plus longtemps : l'user doit
        // avoir le temps de cliquer dans le composer et coller.
        const resetDelay = adapter.clipboardMode ? 4000 : 1000;
        setTimeout(() => {
          trigger.innerHTML = originalTrigger;
          trigger.disabled = false;
          trigger.style.opacity = "1";
          trigger.style.cursor = "pointer";
        }, resetDelay);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("extension_unreachable")) {
          console.log(`[tipote/feed] extension reloaded — hard-refresh ${adapter.id} (Ctrl+Shift+R) pour reconnecter`);
          trigger.innerHTML = `<span>${t("dropdown.reloadLinkedIn")}</span>`;
        } else {
          console.warn("[tipote/feed] suggestion fill failed", err);
          trigger.innerHTML = originalTrigger;
        }
        trigger.disabled = false;
        trigger.style.opacity = "1";
        trigger.style.cursor = "pointer";
        loading = false;
      }
    });
    menu.appendChild(item);
  }
  document.body.appendChild(menu);

  // Positionne trigger au-dessus du composer. En fixed mode, on garde
  // toujours le trigger visible (display:inline-flex) même si composer
  // est hors viewport — le browser clip naturellement les éléments
  // position:fixed à coords hors écran, et quand l'user scroll le
  // composer dans le viewport, le rAF loop reposition automatiquement.
  function positionTrigger(): void {
    if (!composer.isConnected) {
      trigger.style.display = "none";
      return;
    }
    const rect = composer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      trigger.style.display = "none";
      return;
    }
    trigger.style.display = "inline-flex";
    const tRect = trigger.getBoundingClientRect();
    const triggerW = tRect.width || 110;
    const triggerH = tRect.height || 28;
    let top = rect.top - triggerH - 4;
    if (top < 4) top = rect.top + 4; // overlap si pas la place au-dessus
    let left = rect.left;
    const maxLeft = window.innerWidth - triggerW - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    trigger.style.top = `${top}px`;
    trigger.style.left = `${left}px`;
  }

  function positionMenu(): void {
    const rect = trigger.getBoundingClientRect();
    // Estime la largeur du menu (min-width 220)
    const menuW = Math.max(menu.offsetWidth, 220);
    const menuH = menu.offsetHeight || 200;
    let top = rect.bottom + 4;
    if (top + menuH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuH - 4);
    }
    let left = rect.left;
    if (left + menuW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuW - 8);
    }
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function reposition(): void {
    if (useFixed) positionTrigger();
    if (menuOpen) positionMenu();
  }

  function openMenu(): void {
    menu.style.display = "flex";
    menuOpen = true;
    positionMenu();
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
  }
  function closeMenu(): void {
    menu.style.display = "none";
    menuOpen = false;
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

  if (useFixed) {
    // Throttled polling : 5Hz au lieu de 60Hz. Reddit et autres SPAs
    // modernes ne déplacent pas leur composer plus vite que ça côté
    // user-perceived. Un rAF loop à 60Hz forçait des layouts sync à
    // chaque frame, ce qui race avec la réconciliation React de TikTok
    // et déclenche leur NotFoundError removeChild. 200ms est invisible
    // côté user mais ENORME pour ne pas interférer avec React.
    let lastTop = Number.NaN;
    let lastLeft = Number.NaN;
    let intervalId = 0;
    const tick = (): void => {
      if (!composer.isConnected) {
        trigger.remove();
        menu.remove();
        clearInterval(intervalId);
        return;
      }
      const rect = composer.getBoundingClientRect();
      if (rect.top !== lastTop || rect.left !== lastLeft) {
        lastTop = rect.top;
        lastLeft = rect.left;
        positionTrigger();
        if (menuOpen) positionMenu();
      }
    };
    positionTrigger();
    intervalId = window.setInterval(tick, 200);
    // Scroll/resize en complément : reposition immédiat sans attendre
    // les 200ms, pour ne pas avoir de lag visible sur scroll rapide.
    window.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    setTimeout(() => {
      const r = composer.getBoundingClientRect();
      const t = trigger.getBoundingClientRect();
      console.log(
        `[tipote/feed] trigger placement (${adapter.id}) — composer rect:`,
        { top: r.top, left: r.left, width: r.width, height: r.height },
        "trigger rect:",
        { top: t.top, left: t.left, width: t.width, height: t.height, display: trigger.style.display },
      );
    }, 500);
  } else {
    // Mode inline : le menu en position:fixed doit suivre le scroll/resize
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
  }
}

function detectLanguage(): string {
  // Cookie LinkedIn `li_lang` est LinkedIn-only, mais on tente quand
  // même et on tombe sur navigator.language pour les autres réseaux.
  const m = document.cookie.match(/li_lang=([^;]+)/);
  if (m) return decodeURIComponent(m[1]).slice(0, 2).toLowerCase();
  return (navigator.language || "fr").slice(0, 2).toLowerCase();
}

async function fetchSuggestions(
  content: string,
  language: string,
  network: string,
  indications: string,
  imageUrl: string | null,
  tone: ToneKey,
  postLanguageHint: string | null,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: "ai/suggest",
          payload: {
            content_excerpt: content,
            language,
            network,
            tone,
            ...(indications ? { indications } : {}),
            ...(imageUrl ? { image_url: imageUrl } : {}),
            ...(postLanguageHint ? { post_language_hint: postLanguageHint } : {}),
          },
        },
        (resp: unknown) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`extension_unreachable:${chrome.runtime.lastError.message ?? "unknown"}`));
            return;
          }
          const r = resp as { ok?: boolean; suggestions?: Record<string, string> } | undefined;
          const text = r?.ok && r.suggestions ? r.suggestions[tone] : undefined;
          if (typeof text === "string" && text.trim()) resolve(text);
          else reject(new Error("ai_suggest_failed"));
        },
      );
    } catch (err) {
      reject(new Error(`extension_unreachable:${err instanceof Error ? err.message : "unknown"}`));
    }
  });
}
