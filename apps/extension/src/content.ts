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

console.log("[tipote/cs] loaded on", location.href);

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";
const LINKEDIN_LANG_HINT_KEY = "li_lang";
const CONNECT_CACHE_KEY = "tipote.cs.lastConnectAt";
const CONNECT_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

/** Lit le CSRF token depuis le cookie JSESSIONID (format "ajax:<token>"). */
function getCsrfToken(): string | null {
  const match = document.cookie.match(/JSESSIONID=([^;]+)/);
  if (!match) return null;
  // Le cookie est encodé "ajax:..." ou "%22ajax:%22..." selon les pages.
  // On décode + on strip les guillemets pour avoir le token brut.
  const raw = decodeURIComponent(match[1]).replace(/^"+|"+$/g, "");
  return raw; // LinkedIn accepte "ajax:xxx" tel quel dans le header csrf-token
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
    const res = await fetch(`${VOYAGER_BASE}/me`, {
      credentials: "include",
      headers: {
        "csrf-token": csrf,
        Accept: "application/vnd.linkedin.normalized+json+2.1",
      },
    });
    if (!res.ok) {
      console.warn("[tipote/cs] voyager /me failed", res.status);
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
 *  un content script linkedin.com). */
async function pushConnectIfStale() {
  // Cache local pour ne pas hammerer Voyager + backend à chaque pageload.
  const lastAtStr = localStorage.getItem(CONNECT_CACHE_KEY);
  const lastAt = lastAtStr ? Number(lastAtStr) : 0;
  if (Date.now() - lastAt < CONNECT_CACHE_TTL_MS) {
    console.log("[tipote/cs] connect skipped (cached)");
    return;
  }

  const detected = await detectLinkedInUser();
  if (!detected) return;

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

// Auto-trigger à l'arrivée sur une page LinkedIn. Pas besoin d'observer
// les SPA-navigations pour le matching v1 (le 1er pageload suffit, c'est
// stable côté URN). Phase 2.5 ajoutera un observer pour les publications.
void pushConnectIfStale();
