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
import { getMyRecentPosts, type RecentPostHint } from "./voyagerFeed";
import { mountBadge } from "./badge";

console.log("[tipote/cs] loaded on", location.href);

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";
const LINKEDIN_LANG_HINT_KEY = "li_lang";
const CONNECT_CACHE_KEY = "tipote.cs.lastConnectAt";
const CONNECT_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const RECENT_POSTS_KEY = "tipote.cs.recentPostUrns"; // string[]
const RECENT_POSTS_POLL_MS = 5 * 60 * 1000; // 5 min

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
      console.warn("[tipote/cs] voyager /me failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    // Le payload est dans un format "Voyager normalized" — l'URN du user
    // est dans `data.data.*MiniProfile` ou `data.included[].entityUrn`.
    // On parcourt le payload pour trouver le 1er entityUrn de type member.
    const flat = JSON.stringify(data);
    const urnMatch = flat.match(/urn:li:(?:member|person):[A-Za-z0-9_-]+/);
    if (!urnMatch) {
      console.warn("[tipote/cs] no URN found in voyager /me response");
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
    console.warn("[tipote/cs] connect aborted: no LinkedIn user detected");
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
  const resp = await new Promise<unknown>((resolve) => {
    chrome.runtime.sendMessage({ type: "linkedin/connect", payload }, resolve);
  });
  console.log("[tipote/cs] connect response", resp);
  const ok = (resp as { ok?: boolean })?.ok;
  if (ok) localStorage.setItem(CONNECT_CACHE_KEY, String(Date.now()));
}

// Helpers debug exposés sur window pour piloter depuis la console
// DevTools de LinkedIn pendant le développement de l'extension.
// Pas removés en prod : ce sont juste des points d'entrée nommés, sans
// surface d'attaque (et utile en cas de support utilisateur).
const debugBag = window as unknown as {
  tipoteForceMatch?: () => void;
  tipoteLike?: (activityUrn: string) => Promise<unknown>;
  tipoteComment?: (activityUrn: string, text: string) => Promise<unknown>;
  tipoteRefreshMyPosts?: () => Promise<unknown>;
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

// ─── Phase 2.4 : détection des publications de l'utilisateur ─────────
// Poll Voyager toutes les 5 min pour récupérer ses N derniers posts.
// Diff avec ce qu'on a déjà vu (chrome.storage.local) → on push les
// nouveaux URNs au backend qui déclenchera le fan-out.

async function getStoredRecentUrns(): Promise<string[]> {
  const data = await chrome.storage.local.get([RECENT_POSTS_KEY]);
  const arr = data[RECENT_POSTS_KEY];
  return Array.isArray(arr) ? (arr as string[]) : [];
}

async function setStoredRecentUrns(urns: string[]): Promise<void> {
  // Cap à 50 URNs en mémoire — bien plus que ce qu'on poll (10 à la fois).
  await chrome.storage.local.set({ [RECENT_POSTS_KEY]: urns.slice(0, 50) });
}

/** Récupère le URN LinkedIn du user depuis chrome.storage.local (mis
 *  en cache par syncMe côté background après le matching). */
async function getMyMemberUrn(): Promise<string | null> {
  const data = await chrome.storage.local.get(["tipote.user"]);
  const profile = (data["tipote.user"] as
    { linkedin_profile?: { linkedin_urn?: string } } | null
  )?.linkedin_profile;
  return profile?.linkedin_urn ?? null;
}

async function pollMyRecentPosts(): Promise<{ newPosts: RecentPostHint[]; total: number }> {
  const myUrn = await getMyMemberUrn();
  if (!myUrn) {
    console.log("[tipote/cs] pollMyRecentPosts: no URN cached yet, skip");
    return { newPosts: [], total: 0 };
  }
  const fetched = await getMyRecentPosts(myUrn);
  if (fetched.length === 0) {
    return { newPosts: [], total: 0 };
  }
  const seen = new Set(await getStoredRecentUrns());
  const fresh = fetched.filter((p) => !seen.has(p.urn));
  if (fresh.length > 0) {
    console.log("[tipote/cs] new posts detected:", fresh.length);
    // Push au backend, le fan-out vers les pod-mates est fait côté API.
    for (const post of fresh) {
      try {
        const resp = await new Promise<unknown>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "post/published",
              payload: {
                linkedin_post_urn: post.urn,
                post_url: post.postUrl,
                content_excerpt: post.excerpt,
                language: detectLanguage(),
              },
            },
            resolve,
          );
        });
        console.log("[tipote/cs] post pushed", post.urn, resp);
      } catch (err) {
        console.warn("[tipote/cs] post push failed", post.urn, err);
      }
    }
    // Marque tous les URNs (fetched, pas que fresh) comme vus pour ne
    // pas re-push si on en reperd un de la liste seen.
    await setStoredRecentUrns([...fetched.map((p) => p.urn), ...seen]);
  }
  return { newPosts: fresh, total: fetched.length };
}

// Polling timer — actif uniquement quand un onglet LinkedIn est ouvert
// (le content script est lifecycle-tied à la tab).
setInterval(() => {
  void pollMyRecentPosts();
}, RECENT_POSTS_POLL_MS);

// Premier poll après 30s (laisse le temps au matching de se faire si
// l'extension vient d'être installée).
setTimeout(() => void pollMyRecentPosts(), 30_000);

// ─── Phase 2.5 : badge sur une page /feed/update/<urn>/ ──────────────
// Quand l'user navigue vers le permalink d'un post (typiquement via le
// popup "tâches en attente"), on inject une pastille Tipote avec
// les 4 tons de commentaire + auto-like. LinkedIn est une SPA donc
// on observe les changements de URL aussi.

const ACTIVITY_URN_FROM_URL = /\/feed\/update\/(urn:li:(?:activity|share|ugcPost):[A-Za-z0-9_-]+)/;

function maybeMountBadge() {
  const m = location.pathname.match(ACTIVITY_URN_FROM_URL) ??
            location.href.match(ACTIVITY_URN_FROM_URL);
  if (!m) {
    // Diag : si on est sur une page qui RESSEMBLE à un permalink mais
    // que le regex n'a pas matché, on log pour qu'on diagnostique.
    // Sinon (home feed, profil, etc.) c'est normal de pas matcher.
    if (location.pathname.includes("/feed/update/") || location.href.includes("/feed/update/")) {
      console.warn("[tipote/cs] /feed/update detected but no URN extracted", location.href);
    }
    return;
  }
  const urn = m[1];
  console.log("[tipote/cs] /feed/update detected, urn=", urn);
  void mountBadge(urn);
}

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

// Helpers debug supplémentaires Phase 2.4 + 2.5
debugBag.tipoteRefreshMyPosts = async () => {
  console.log("[tipote/cs] forcing post poll…");
  const r = await pollMyRecentPosts();
  console.log("[tipote/cs] poll result", r);
  return r;
};

