// Content script LinkedIn — s'exécute dans un contexte isolé sur toute
// page linkedin.com. Charge déclencheur :
//   1. À l'arrivée sur LinkedIn, on tente de détecter l'URN de l'user
//      connecté (via window.__lipi exposé par LinkedIn, ou fallback API
//      Voyager /me).
//   2. Si trouvé, on envoie au background → POST /api/pod/auth/connect
//      pour matcher avec le compte Tipote.
//   3. Le matching est idempotent côté backend, donc le push à chaque
//      navigation n'est pas un problème — on garde un cache court côté
//      content pour éviter le spam de calls inutiles.
//
// Voyager API : LinkedIn protège ses endpoints internes avec un header
// `csrf-token` égal à la partie après "ajax:" du cookie JSESSIONID.
// On extrait via document.cookie (lisible dans le content script car
// les cookies linkedin.com ne sont pas HttpOnly pour ce cookie-là).

import { getCsrfToken, voyagerLike, voyagerComment } from "./voyager";
import { mountBadge } from "./badge";
import { startFeedInjector } from "./feedInjector";

console.log("[tipote/cs] loaded on", location.href);

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";
const LINKEDIN_LANG_HINT_KEY = "li_lang";
const CONNECT_CACHE_KEY = "tipote.cs.lastConnectAt";
const CONNECT_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const PUSHED_URNS_KEY = "tipote.cs.pushedUrns"; // string[] — URNs déjà annoncés au backend
const PUSHED_URNS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Safe wrapper autour de chrome.runtime.sendMessage. Le content script
 *  peut survivre à un reload de l'extension (avec un contexte invalidé),
 *  ce qui throw "Extension context invalidated" sur tout appel chrome.*.
 *  Au lieu de spammer la console, on log un avertissement unique et on
 *  retourne null. */
async function safeSendMessage<T = unknown>(msg: unknown): Promise<T | null> {
  try {
    return await new Promise<T | null>((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          // chrome.runtime.lastError doit être lu pour éviter le warning
          if (chrome.runtime.lastError) {
            warnContextInvalidatedOnce(chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          resolve((response ?? null) as T | null);
        });
      } catch (err) {
        warnContextInvalidatedOnce(err instanceof Error ? err.message : String(err));
        resolve(null);
      }
    });
  } catch (err) {
    warnContextInvalidatedOnce(err instanceof Error ? err.message : String(err));
    return null;
  }
}

let _contextWarnedAt = 0;
function warnContextInvalidatedOnce(msg?: string): void {
  const now = Date.now();
  if (now - _contextWarnedAt < 60_000) return; // throttle 1/min
  _contextWarnedAt = now;
  console.warn("[tipote/cs] extension context unreachable —", msg ?? "(no message)", "— please hard-refresh LinkedIn (Ctrl+Shift+R) after reloading the extension");
}

async function safeStorageGet(keys: string[]): Promise<Record<string, unknown>> {
  try {
    return (await chrome.storage.local.get(keys)) ?? {};
  } catch (err) {
    warnContextInvalidatedOnce(err instanceof Error ? err.message : String(err));
    return {};
  }
}

async function safeStorageSet(items: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.local.set(items);
  } catch (err) {
    warnContextInvalidatedOnce(err instanceof Error ? err.message : String(err));
  }
}

/** Détecte l'URN du user LinkedIn courant. 2 stratégies, dans cet ordre :
 *  1. `window.__lipi` exposé par certaines pages LinkedIn (variable de
 *     tracking interne — contient un URN de session pas toujours utile).
 *  2. Appel Voyager /me — récupère l'URN canonique + nom + headline.
 *  Retourne null si rien trouvé (user pas signé sur LinkedIn). */
async function detectLinkedInUser(): Promise<{
  urn: string;
  fullName: string | null;
  headline: string | null;
  profileUrl: string | null;
} | null> {
  const csrf = getCsrfToken();
  if (!csrf) {
    console.log("[tipote/cs] no JSESSIONID — user pas connecté à LinkedIn");
    return null;
  }
  try {
    // Headers complets Voyager — l'endpoint /me peut refuser si on n'envoie
    // pas le bon set. csrf-token est obligatoire ; x-restli-protocol-version
    // est demandé par tous les endpoints Voyager modernes ; les autres
    // headers x-li-* sont best-effort (LinkedIn les remplit lui-même côté
    // browser, on duplique pour être safe en contexte content script).
    const res = await fetch(`${VOYAGER_BASE}/me`, {
      credentials: "include",
      headers: {
        "csrf-token": csrf,
        Accept: "application/vnd.linkedin.normalized+json+2.1",
        "x-restli-protocol-version": "2.0.0",
        "x-li-lang": "fr_FR",
      },
    });
    if (!res.ok) {
      console.log("[tipote/cs] voyager /me failed (probably rate-limited or non-feed page) — will retry on next page load", res.status);
      return null;
    }
    const data = await res.json();
    // Le payload est dans un format "Voyager normalized" — l'URN du user
    // est dans `data.data.*MiniProfile` ou `data.included[].entityUrn`.
    // On parcourt le payload pour trouver le 1er entityUrn de type member.
    const flat = JSON.stringify(data);
    const urnMatch = flat.match(/urn:li:(?:member|person):[A-Za-z0-9_-]+/);
    if (!urnMatch) {
      console.log("[tipote/cs] no URN found in voyager /me response — payload format may have changed");
      return null;
    }
    const urn = urnMatch[0];

    // Best-effort pour récupérer nom + headline + URL publique dans le
    // même payload — les chemins changent parfois côté LinkedIn, donc on
    // tolère l'absence.
    let fullName: string | null = null;
    let headline: string | null = null;
    let profileUrl: string | null = null;
    try {
      const included = (data as { included?: Array<Record<string, unknown>> }).included ?? [];
      const profile = included.find((x) =>
        typeof x?.entityUrn === "string" &&
        (x.entityUrn as string).includes("MiniProfile")
      );
      if (profile) {
        const first = (profile.firstName as string | undefined) ?? "";
        const last = (profile.lastName as string | undefined) ?? "";
        fullName = `${first} ${last}`.trim() || null;
        headline = (profile.occupation as string | undefined) ?? null;
        const publicId = (profile.publicIdentifier as string | undefined) ?? null;
        if (publicId) profileUrl = `https://www.linkedin.com/in/${publicId}/`;
      }
    } catch {
      // ignore
    }

    return { urn, fullName, headline, profileUrl };
  } catch (err) {
    console.warn("[tipote/cs] voyager /me error", err);
    return null;
  }
}

/** Heuristique langue : on lit le cookie li_lang (set par LinkedIn pour
 *  l'UI). Fallback sur navigator.language. */
function detectLanguage(): string {
  const m = document.cookie.match(new RegExp(`${LINKEDIN_LANG_HINT_KEY}=([^;]+)`));
  if (m) return decodeURIComponent(m[1]).slice(0, 2).toLowerCase();
  return (navigator.language || "fr").slice(0, 2).toLowerCase();
}

/** Push au background : POST /api/pod/auth/connect via le SW pour
 *  bénéficier des cookies tipote.com côté SW (pas accessibles depuis
 *  un content script linkedin.com).
 *
 *  @param forceFresh true pour ignorer le cache 1h (utile au reload de
 *  l'extension côté dev, et exposé en console via tipoteForceMatch()). */
async function pushConnect(forceFresh = false) {
  if (!forceFresh) {
    const lastAtStr = localStorage.getItem(CONNECT_CACHE_KEY);
    const lastAt = lastAtStr ? Number(lastAtStr) : 0;
    if (Date.now() - lastAt < CONNECT_CACHE_TTL_MS) {
      console.log("[tipote/cs] connect skipped (cached). Run tipoteForceMatch() in console to bypass.");
      return;
    }
  }

  const detected = await detectLinkedInUser();
  if (!detected) {
    // Non-bloquant : l'extension continue de marcher tant que le cache
    // de matching d'1h reste valide (typical). On retentera au prochain
    // load de page LinkedIn. Logging en .log et non .warn pour ne pas
    // alarmer l'user en console DevTools — c'est un cas attendu sur
    // les pages profile / search où Voyager /me peut être rate-limité.
    console.log("[tipote/cs] connect skipped: no LinkedIn user detected on this page (will retry on /feed)");
    return;
  }

  const language = detectLanguage();
  const payload = {
    linkedin_urn: detected.urn,
    full_name: detected.fullName,
    headline: detected.headline,
    profile_url: detected.profileUrl,
    language_detected: language,
  };

  console.log("[tipote/cs] sending connect to bg", payload);
  const resp = await safeSendMessage<{ ok?: boolean }>({ type: "linkedin/connect", payload });
  console.log("[tipote/cs] connect response", resp);
  if (resp?.ok) localStorage.setItem(CONNECT_CACHE_KEY, String(Date.now()));
}

// Helpers debug exposés sur window pour piloter depuis la console
// DevTools de LinkedIn pendant le développement de l'extension.
// Pas removés en prod : ce sont juste des points d'entrée nommés, sans
// surface d'attaque (et utile en cas de support utilisateur).
const debugBag = window as unknown as {
  tipoteForceMatch?: () => void;
  tipoteLike?: (activityUrn: string) => Promise<unknown>;
  tipoteComment?: (activityUrn: string, text: string) => Promise<unknown>;
  tipoteThrottle?: () => Promise<unknown>;
  tipoteDiag?: () => void;
};

debugBag.tipoteForceMatch = () => {
  console.log("[tipote/cs] forcing match…");
  void pushConnect(true);
};

/** Usage console : tipoteLike("urn:li:activity:7190123456789012345") */
debugBag.tipoteLike = async (activityUrn: string) => {
  console.log("[tipote/cs] tipoteLike", activityUrn);
  const r = await voyagerLike(activityUrn);
  console.log("[tipote/cs] tipoteLike result", r);
  return r;
};

/** Usage console :
 *  tipoteComment("urn:li:activity:7190123456789012345", "Excellent point !") */
debugBag.tipoteComment = async (activityUrn: string, text: string) => {
  console.log("[tipote/cs] tipoteComment", activityUrn, `(${text.length} chars)`);
  const r = await voyagerComment(activityUrn, text);
  console.log("[tipote/cs] tipoteComment result", r);
  return r;
};

// ─── Détection des publications (v1.0 — interception réseau) ──────────
// Stratégie remplaçant le polling Voyager (qui répondait 400/403) :
//
// On inject un petit script dans le MAIN world de LinkedIn qui hook
// `window.fetch` et `XMLHttpRequest`. Quand la page LinkedIn elle-même
// POST vers son endpoint de création de post, on capture l'URN dans la
// réponse et on émet un `window.postMessage` vers le content script.
//
// Avantages vs polling :
//   - Détection instantanée (au lieu de toutes les 5 min)
//   - Aucune dépendance à un endpoint Voyager privé qui peut changer
//   - Pas de quota / risque de throttle car on ne fait aucun call
//   - Zéro faux positif (on capture exactement ce que LinkedIn crée)

function injectPageWorldScript(): void {
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("injected.js");
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  } catch (err) {
    warnContextInvalidatedOnce(err instanceof Error ? err.message : String(err));
  }
}

async function getPushedUrns(): Promise<Record<string, number>> {
  const data = await safeStorageGet([PUSHED_URNS_KEY]);
  const obj = data[PUSHED_URNS_KEY] as Record<string, number> | undefined;
  if (!obj || typeof obj !== "object") return {};
  // GC entries > TTL
  const now = Date.now();
  const fresh: Record<string, number> = {};
  for (const [urn, ts] of Object.entries(obj)) {
    if (typeof ts === "number" && now - ts < PUSHED_URNS_TTL_MS) fresh[urn] = ts;
  }
  return fresh;
}

async function markUrnPushed(urn: string): Promise<void> {
  const pushed = await getPushedUrns();
  pushed[urn] = Date.now();
  await safeStorageSet({ [PUSHED_URNS_KEY]: pushed });
}

async function handleCapturedPost(urn: string, via: string): Promise<void> {
  // Normaliser : activity > ugcPost > share. LinkedIn renvoie souvent
  // ugcPost à la création et activity ensuite. On accepte les 2 mais on
  // dédoublonne par URN brut tel que reçu.
  const pushed = await getPushedUrns();
  if (pushed[urn]) {
    console.log("[tipote/cs] post already pushed, skip", urn);
    return;
  }

  console.log("[tipote/cs] capturing new published post", urn, "via", via);
  const postUrl = `https://www.linkedin.com/feed/update/${urn}/`;
  const language = detectLanguage();

  // On laisse 2s à LinkedIn pour finaliser la création (parfois le post
  // n'est pas immédiatement listable côté backend). Pas critique : si on
  // est trop tôt et que le fan-out échoue, l'extension reprolongera au
  // prochain poll de tasks/pending.
  await new Promise((r) => setTimeout(r, 2000));

  const resp = await safeSendMessage<{ ok?: boolean }>({
    type: "post/published",
    payload: {
      linkedin_post_urn: urn,
      post_url: postUrl,
      content_excerpt: null, // on n'a pas le contenu via fetch interception
      language,
    },
  });
  if (resp?.ok) {
    await markUrnPushed(urn);
    console.log("[tipote/cs] post pushed to backend OK", urn);
  } else {
    console.warn("[tipote/cs] post push to backend failed", urn, resp);
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as { source?: string; type?: string; payload?: { urn?: string; via?: string } } | null;
  if (!data || data.source !== "tipote-page") return;
  if (data.type !== "linkedin/post-created") return;
  const urn = data.payload?.urn;
  const via = data.payload?.via ?? "unknown";
  if (typeof urn !== "string" || !/^urn:li:(activity|ugcPost|share):\d+$/.test(urn)) return;
  void handleCapturedPost(urn, via);
});

// Détection plateforme — gate les fonctions LinkedIn-specific (matching
// URN, injected.js Voyager, badge sur permalink) sur LinkedIn uniquement.
// Sur FB/Threads/IG/X, seul le feedInjector cross-platform tourne.
const IS_LINKEDIN = /(?:^|\.)linkedin\.com$/.test(location.hostname);

// ─── Badge sur une page /feed/update/<urn>/ (LinkedIn only) ──────────
// Quand l'user navigue vers le permalink d'un post, on inject une
// pastille Tipote avec les 4 tons de commentaire. LinkedIn est une SPA
// donc on observe les changements d'URL aussi.
const ACTIVITY_URN_FROM_URL = /\/feed\/update\/(urn:li:(?:activity|share|ugcPost):[A-Za-z0-9_-]+)/;

function maybeMountBadge() {
  const m = location.pathname.match(ACTIVITY_URN_FROM_URL) ??
            location.href.match(ACTIVITY_URN_FROM_URL);
  if (!m) {
    if (location.pathname.includes("/feed/update/") || location.href.includes("/feed/update/")) {
      console.warn("[tipote/cs] /feed/update detected but no URN extracted", location.href);
    }
    return;
  }
  const urn = m[1];
  console.log("[tipote/cs] /feed/update detected, urn=", urn);
  void mountBadge(urn);
}

if (IS_LINKEDIN) {
  // Inject le hook réseau dès que possible. document_idle = on est sûr
  // que document.head existe, mais on cap quand même.
  injectPageWorldScript();

  maybeMountBadge();

  // LinkedIn = SPA, on observe les changements d'URL pour re-monter le
  // badge si l'user change de post via le router interne.
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      maybeMountBadge();
    }
  }).observe(document, { subtree: true, childList: true });

  // Auto-trigger matching à l'arrivée sur LinkedIn.
  void pushConnect();
}

// Injecteur inline — UX principale, marche sur LinkedIn + FB + Threads
// + Instagram + X. Auto-détecte la plateforme via location.hostname.
startFeedInjector();

// ─── Code legacy (gardé pour le diff visible — déplacé au gate ci-dessus)
// Les anciennes lignes top-level injectPageWorldScript() / maybeMountBadge()
// / startFeedInjector() / pushConnect() étaient toutes appelées
// inconditionnellement. Maintenant gated via IS_LINKEDIN sauf startFeedInjector.

// Inspecte l'état du throttle anti-ban depuis la console DevTools.
debugBag.tipoteThrottle = async () => {
  const data = await safeStorageGet(["tipote.voyager.throttle"]);
  console.log("[tipote/cs] throttle state", data["tipote.voyager.throttle"]);
  return data["tipote.voyager.throttle"];
};

// Diagnostic : liste tous les contenteditable/textarea de la page pour
// debug quand l'extension ne trouve pas de composer sur un nouveau site.
// Usage : `tipoteDiag()` dans la console DevTools.
debugBag.tipoteDiag = () => {
  console.group("[tipote/diag] DOM scan");
  console.log("hostname:", location.hostname);
  const editables = document.querySelectorAll(
    '[role="textbox"][contenteditable="true"], [contenteditable="true"], textarea',
  );
  console.log(`Found ${editables.length} editable elements (NOT counting shadow DOM):`);
  editables.forEach((el, i) => {
    const ae = el.getAttribute("aria-label");
    const ph = el.getAttribute("placeholder");
    const dp = el.getAttribute("data-placeholder");
    const de = el.getAttribute("data-e2e");
    const tn = el.tagName;
    console.log(`#${i} <${tn}> aria-label=${JSON.stringify(ae)} placeholder=${JSON.stringify(ph)} data-placeholder=${JSON.stringify(dp)} data-e2e=${JSON.stringify(de)}`, el);
  });
  // Scan aussi les shadow roots
  let shadowCount = 0;
  document.querySelectorAll("*").forEach((el) => {
    const sr = (el as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (sr) {
      shadowCount++;
      const inner = sr.querySelectorAll('[contenteditable="true"], textarea');
      if (inner.length > 0) {
        console.log(`Shadow root in <${el.tagName.toLowerCase()}> contains ${inner.length} editables:`, inner);
      }
    }
  });
  console.log(`Total shadow roots scanned: ${shadowCount}`);
  console.groupEnd();
};

