// Client API Voyager (LinkedIn interne).
//
// Tourne dans le content script — donc même origine que linkedin.com,
// les cookies de session sont attachés automatiquement par le fetch.
// On n'a "que" besoin du csrf-token (lu depuis JSESSIONID) et de
// quelques headers x-restli.
//
// Voyager n'est PAS une API publique : pas de doc officielle, format
// reverse-engineerie. LinkedIn fait évoluer les payloads ~tous les
// 3-6 mois. Stratégie défensive :
//   - chaque appel logge status + url + payload + body de réponse
//   - on retourne un objet riche (ok + status + bodyText) plutôt qu'un
//     bool, pour pouvoir diagnostiquer depuis la console DevTools.
//   - on essaye d'abord le path "moderne" et on a un fallback sur le
//     legacy si 4xx (à activer plus tard si besoin).
//
// Phase 2.3 : like + comment de base. Phase 2.5 wire-up dans la queue
// de tâches. Phase 2.6 ajoute le throttle + détection captcha.

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";

export type VoyagerResult = {
  ok: boolean;
  status: number;
  url: string;
  bodyText?: string;
  error?: string;
};

/** Lit le CSRF token depuis le cookie JSESSIONID. Le cookie a la forme
 *  `JSESSIONID="ajax:1234567890123456789"`. LinkedIn accepte le token
 *  brut (avec le préfixe ajax:) dans le header `csrf-token`. */
export function getCsrfToken(): string | null {
  const match = document.cookie.match(/JSESSIONID=([^;]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]).replace(/^"+|"+$/g, "");
}

/** Headers de base communs à tous les appels Voyager modernes. */
function voyagerHeaders(csrf: string): Record<string, string> {
  return {
    "csrf-token": csrf,
    "x-restli-protocol-version": "2.0.0",
    "x-li-lang": "fr_FR",
    Accept: "application/vnd.linkedin.normalized+json+2.1",
    "Content-Type": "application/json; charset=UTF-8",
  };
}

/** Génère un trackingId LinkedIn-style (16 octets base64). LinkedIn
 *  attend ce champ sur la plupart des actions write pour la déduplication
 *  côté serveur. */
function makeTrackingId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // base64 url-safe court — LinkedIn n'est pas strict sur le format
  // tant que c'est ~22 chars uniques.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── LIKE ─────────────────────────────────────────────────────────────

/** Like un post via Voyager. `activityUrn` = identifiant du post,
 *  format `urn:li:activity:xxxxxxxxxxxxxxx` (lu depuis l'attribut DOM
 *  `data-urn` du post LinkedIn). */
export async function voyagerLike(activityUrn: string): Promise<VoyagerResult> {
  const csrf = getCsrfToken();
  if (!csrf) {
    return { ok: false, status: 0, url: "", error: "no_csrf_token" };
  }
  if (!/^urn:li:(activity|share|ugcPost):[A-Za-z0-9_-]+$/.test(activityUrn)) {
    return { ok: false, status: 0, url: "", error: "invalid_activity_urn" };
  }

  // L'endpoint moderne est en GraphQL via /graphql?action=execute,
  // mais on tente d'abord la version "RestLi" classique qui marche
  // toujours sur la majorité des comptes (LinkedIn déploie GraphQL
  // progressivement). Si elle renvoie 404 / 405, on bascule (TODO
  // Phase 2.6 fallback automatique).
  const url = `${VOYAGER_BASE}/voyagerSocialDashReactions?action=createReaction`;
  const body = {
    reactionType: "LIKE",
    threadUrn: activityUrn,
  };

  console.log("[tipote/voyager] like →", activityUrn);
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: voyagerHeaders(csrf),
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    console.log("[tipote/voyager] like ←", res.status, text.slice(0, 300));
    // LinkedIn renvoie 200/201/204 pour une action OK selon les routes.
    // 409 = déjà liké, on considère ça comme un succès idempotent.
    const ok = res.ok || res.status === 409;
    return { ok, status: res.status, url, bodyText: text };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      error: err instanceof Error ? err.message : "network",
    };
  }
}

// ─── COMMENT ──────────────────────────────────────────────────────────

/** Poste un commentaire sur un post via Voyager. */
export async function voyagerComment(
  activityUrn: string,
  text: string,
): Promise<VoyagerResult> {
  const csrf = getCsrfToken();
  if (!csrf) {
    return { ok: false, status: 0, url: "", error: "no_csrf_token" };
  }
  if (!/^urn:li:(activity|share|ugcPost):[A-Za-z0-9_-]+$/.test(activityUrn)) {
    return { ok: false, status: 0, url: "", error: "invalid_activity_urn" };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, status: 0, url: "", error: "empty_text" };
  }
  if (trimmed.length > 3000) {
    return { ok: false, status: 0, url: "", error: "text_too_long" };
  }

  // Endpoint moderne : /voyagerSocialDashNormComments (LinkedIn a renommé
  // l'ancien voyagerSocialDashComments en NormComments en 2024).
  // Si 404, on tente l'ancien chemin (TODO fallback Phase 2.6).
  const url = `${VOYAGER_BASE}/voyagerSocialDashNormComments`;
  const body = {
    commentary: {
      text: trimmed,
      attributesV2: [], // pas de mentions / hashtags pour v1
    },
    threadUrn: activityUrn,
    trackingId: makeTrackingId(),
  };

  console.log("[tipote/voyager] comment →", activityUrn, `(${trimmed.length} chars)`);
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: voyagerHeaders(csrf),
      body: JSON.stringify(body),
    });
    const respText = await res.text().catch(() => "");
    console.log("[tipote/voyager] comment ←", res.status, respText.slice(0, 300));
    return {
      ok: res.ok,
      status: res.status,
      url,
      bodyText: respText,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      error: err instanceof Error ? err.message : "network",
    };
  }
}

// ─── Détection signaux anti-bot ───────────────────────────────────────

/** Heuristique simple : un 429 sur Voyager = on s'est fait throttle, on
 *  arrête tout pendant X minutes. Un challenge captcha = on stoppe
 *  carrément (Phase 2.6 implémentera le backoff complet).
 *  Pour Phase 2.3 c'est juste un signal exposé que la queue (Phase 2.5)
 *  consommera. */
export function isThrottleSignal(result: VoyagerResult): boolean {
  return result.status === 429 || result.status === 999;
}

export function isCaptchaSignal(result: VoyagerResult): boolean {
  // LinkedIn renvoie 401 ou 403 + un body qui mentionne challenge / captcha
  // quand le compte est sous surveillance.
  if (result.status === 401 || result.status === 403) {
    const body = result.bodyText?.toLowerCase() ?? "";
    if (body.includes("challenge") || body.includes("captcha") || body.includes("verify")) {
      return true;
    }
  }
  return false;
}
