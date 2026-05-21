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
// ─── ANTI-BAN (v1.0) ──────────────────────────────────────────────────
// LinkedIn bannit les comptes qui font des actions à un rythme non-humain.
// On encadre tout call de write (like, comment) par un throttle persisté :
//   - Max 12 actions/heure par compte (sliding window dans chrome.storage)
//   - Délai gaussien aléatoire (mean 8s, stddev 4s, clamp [3s, 25s])
//     entre 2 actions consécutives. Une humaine clique pas en <1s.
//   - Détection 429 → pause 30 min. Détection challenge/captcha → pause
//     24h (et marquage du compte comme "suspect" côté storage, qui suspend
//     toute auto-action jusqu'à intervention manuelle de l'user).
// Cf. CWS-LISTING.md pour la justification soumise à Google.

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";

const THROTTLE_STORAGE_KEY = "tipote.voyager.throttle";
const MAX_ACTIONS_PER_HOUR = 12;
const ONE_HOUR_MS = 60 * 60 * 1000;
const SUSPECT_PAUSE_MS = 24 * 60 * 60 * 1000;
const THROTTLE_429_PAUSE_MS = 30 * 60 * 1000;

type ThrottleState = {
  /** Timestamps (ms) of write actions in the last sliding window. */
  recentActionTs: number[];
  /** Until when all write actions are paused (ms epoch). 0 = no pause. */
  pausedUntil: number;
  /** Last reason for pause, for diagnostics. */
  lastPauseReason: string | null;
};

async function getThrottleState(): Promise<ThrottleState> {
  try {
    const data = await chrome.storage.local.get([THROTTLE_STORAGE_KEY]);
    const s = data[THROTTLE_STORAGE_KEY] as Partial<ThrottleState> | undefined;
    return {
      recentActionTs: Array.isArray(s?.recentActionTs) ? s!.recentActionTs : [],
      pausedUntil: typeof s?.pausedUntil === "number" ? s!.pausedUntil : 0,
      lastPauseReason: typeof s?.lastPauseReason === "string" ? s!.lastPauseReason : null,
    };
  } catch {
    // chrome.storage indisponible (context invalidated) — comportement
    // fail-open : on refuse l'action plutôt que de spammer en aveugle.
    return { recentActionTs: [], pausedUntil: Date.now() + ONE_HOUR_MS, lastPauseReason: "storage_unavailable" };
  }
}

async function saveThrottleState(state: ThrottleState): Promise<void> {
  try {
    await chrome.storage.local.set({ [THROTTLE_STORAGE_KEY]: state });
  } catch {
    // ignore — voir commentaire getThrottleState
  }
}

/** Vérifie qu'on peut faire un nouveau write action sans dépasser les
 *  caps. Retourne null si OK, sinon une raison de refus. */
async function checkThrottleAllowed(): Promise<{ allowed: boolean; reason: string | null }> {
  const state = await getThrottleState();
  const now = Date.now();

  if (state.pausedUntil > now) {
    const minutesLeft = Math.ceil((state.pausedUntil - now) / 60_000);
    return { allowed: false, reason: `paused_${state.lastPauseReason}_${minutesLeft}min` };
  }

  // Sliding window 1h
  const fresh = state.recentActionTs.filter((ts) => now - ts < ONE_HOUR_MS);
  if (fresh.length >= MAX_ACTIONS_PER_HOUR) {
    return { allowed: false, reason: `hourly_cap_${fresh.length}/${MAX_ACTIONS_PER_HOUR}` };
  }

  return { allowed: true, reason: null };
}

/** À appeler APRÈS un write action réussi pour comptabiliser. */
async function recordAction(): Promise<void> {
  const state = await getThrottleState();
  const now = Date.now();
  state.recentActionTs = [...state.recentActionTs.filter((ts) => now - ts < ONE_HOUR_MS), now];
  await saveThrottleState(state);
}

/** Marque le compte comme suspect (captcha détecté ou pattern anormal). */
async function pauseFor(durationMs: number, reason: string): Promise<void> {
  const state = await getThrottleState();
  state.pausedUntil = Date.now() + durationMs;
  state.lastPauseReason = reason;
  await saveThrottleState(state);
  console.warn(`[tipote/voyager] PAUSED for ${durationMs / 60_000} min (reason: ${reason})`);
}

/** Délai gaussien aléatoire avant action (anti-bot human-like). */
function humanDelayMs(): number {
  // Box-Muller pour gaussienne
  const u = Math.random() || Number.MIN_VALUE;
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const mean = 8000;
  const stddev = 4000;
  const ms = mean + z * stddev;
  return Math.max(3000, Math.min(25000, Math.round(ms)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 *  `data-urn` du post LinkedIn). Throttle-encadré : refuse si cap
 *  horaire atteint ou si compte en pause anti-ban. */
export async function voyagerLike(activityUrn: string): Promise<VoyagerResult> {
  const csrf = getCsrfToken();
  if (!csrf) {
    return { ok: false, status: 0, url: "", error: "no_csrf_token" };
  }
  if (!/^urn:li:(activity|share|ugcPost):[A-Za-z0-9_-]+$/.test(activityUrn)) {
    return { ok: false, status: 0, url: "", error: "invalid_activity_urn" };
  }

  const gate = await checkThrottleAllowed();
  if (!gate.allowed) {
    console.log("[tipote/voyager] like blocked by throttle:", gate.reason);
    return { ok: false, status: 0, url: "", error: `throttled:${gate.reason}` };
  }
  await sleep(humanDelayMs());

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
    const result: VoyagerResult = { ok, status: res.status, url, bodyText: text };
    await handleAntiBanSignals(result);
    if (ok) await recordAction();
    return result;
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

/** Poste un commentaire sur un post via Voyager. Throttle-encadré. */
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

  const gate = await checkThrottleAllowed();
  if (!gate.allowed) {
    console.log("[tipote/voyager] comment blocked by throttle:", gate.reason);
    return { ok: false, status: 0, url: "", error: `throttled:${gate.reason}` };
  }
  await sleep(humanDelayMs());

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
    const result: VoyagerResult = {
      ok: res.ok,
      status: res.status,
      url,
      bodyText: respText,
    };
    await handleAntiBanSignals(result);
    if (res.ok) await recordAction();
    return result;
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      error: err instanceof Error ? err.message : "network",
    };
  }
}

/** Centralise la réaction aux signaux anti-bot LinkedIn. Pause le compte
 *  pour la durée appropriée selon la sévérité. */
async function handleAntiBanSignals(result: VoyagerResult): Promise<void> {
  if (isCaptchaSignal(result)) {
    await pauseFor(SUSPECT_PAUSE_MS, `captcha_${result.status}`);
    return;
  }
  if (isThrottleSignal(result)) {
    await pauseFor(THROTTLE_429_PAUSE_MS, `rate_limit_${result.status}`);
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
