// Client-side wrapper for Meta Pixel + Google Analytics 4 + Google Ads
// (Adeline, 19 mai 2026, Phase B). Centralise les `fbq()` et `gtag()`
// calls pour qu'on n'aie qu'UN seul endroit où mapper nos événements
// internes (view/start/complete/share) vers les événements standards
// des plateformes.
//
// Les scripts pixels sont injectés par `<TrackingPixels>` (composant).
// Ce helper ne charge rien — il vérifie juste si `window.fbq` /
// `window.gtag` existent et appelle si oui. Si les scripts ne sont
// pas (encore) chargés (consent pas donné, IDs pas configurés),
// l'appel est silencieux. Pas d'erreur.

// Window globals injectés par les scripts pixels.
declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export type QuizPixelEvent = "view" | "start" | "complete" | "share";

export type QuizPixelConfig = {
  meta_pixel_id?: string | null;
  ga4_measurement_id?: string | null;
  google_ads_conversion_id?: string | null;
  google_ads_conversion_label?: string | null;
};

// Paramètres d'événement optionnels (enrichissement). content_name =
// titre du quiz → aide l'algo Meta à regrouper/optimiser les events.
export type QuizPixelParams = {
  contentName?: string | null;
  // event_id imposé (sinon généré). Sert à DÉDUPLIQUER avec l'event
  // serveur (Conversions API) : même event_id des deux côtés = 1 event.
  eventId?: string | null;
};

// ID de déduplication par event. Évite le double-comptage (ex: un event
// re-fired) et permet le dédoublonnage avec la Conversions API serveur
// (même eventID des deux côtés = 1 seul event). Exporté pour que le Lead
// puisse partager son id entre le pixel navigateur et l'appel CAPI.
export function newEventId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // pas de crypto → fallback ci-dessous
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Mapping de nos événements internes vers les standards Meta + GA4.
// On utilise les "Standard Events" Meta quand pertinent (Lead, etc.)
// et un trackCustom pour QuizStart. GA4 accepte n'importe quel nom
// d'événement custom donc on utilise `quiz_start`, `generate_lead`
// (event recommandé GA4), `share` (recommandé).
const META_EVENT_MAP: Record<QuizPixelEvent, { method: "track" | "trackCustom"; name: string }> = {
  view: { method: "track", name: "PageView" },
  start: { method: "trackCustom", name: "QuizStart" },
  complete: { method: "track", name: "Lead" },
  share: { method: "track", name: "Share" },
};

const GA4_EVENT_MAP: Record<QuizPixelEvent, string> = {
  view: "page_view",
  start: "quiz_start",
  complete: "generate_lead",
  share: "share",
};

/**
 * Fire un événement vers Meta Pixel + GA4 + Google Ads (le cas
 * échéant). Silencieux si les scripts pixels ne sont pas chargés
 * (consent pas encore donné, IDs pas configurés, ad-blocker actif).
 *
 * Note : `fireQuizPixel("view")` est appelé une fois au mount par
 * `<TrackingPixels>` après l'injection des scripts — pas la peine
 * de le re-fire depuis le code applicatif. Les autres événements
 * (start / complete / share) sont fired depuis `PublicQuizClient`
 * en parallèle de `trackEvent` (qui fait le tracking interne).
 */
export function fireQuizPixel(
  event: QuizPixelEvent,
  config: QuizPixelConfig,
  params: QuizPixelParams = {},
): void {
  if (typeof window === "undefined") return;

  // ── Meta Pixel ────────────────────────────────────────────────
  if (config.meta_pixel_id && typeof window.fbq === "function") {
    const { method, name } = META_EVENT_MAP[event];
    const eventParams: Record<string, unknown> = {};
    if (params.contentName) eventParams.content_name = params.contentName;
    try {
      // 4e arg = options Meta ({ eventID }) pour la déduplication.
      window.fbq(method, name, eventParams, { eventID: params.eventId || newEventId() });
    } catch {
      // fbq peut throw si pas init — silent fail.
    }
  }

  // ── Google Analytics 4 ────────────────────────────────────────
  if (config.ga4_measurement_id && typeof window.gtag === "function") {
    try {
      window.gtag("event", GA4_EVENT_MAP[event]);
    } catch {
      // gtag silencieux idem.
    }
  }

  // ── Google Ads Conversion (uniquement sur complete = Lead) ────
  // Les autres événements ne fired pas vers Ads — c'est rare de
  // vouloir tracker un "view" comme conversion. Si un user veut
  // changer ce mapping, c'est ici.
  if (
    event === "complete" &&
    config.google_ads_conversion_id &&
    config.google_ads_conversion_label &&
    typeof window.gtag === "function"
  ) {
    try {
      window.gtag("event", "conversion", {
        send_to: `${config.google_ads_conversion_id}/${config.google_ads_conversion_label}`,
      });
    } catch {
      // silent
    }
  }
}

/**
 * Validation regex côté client pour les 4 champs de config. Utilisée
 * par l'éditeur quiz pour donner un feedback rouge/vert avant save.
 * Pas un schéma strict — on accepte du vide (= disable) et on
 * tolère les variations de longueur (Meta a changé plusieurs fois).
 */
export const PIXEL_REGEX = {
  meta_pixel_id: /^\d{8,20}$/,
  ga4_measurement_id: /^G-[A-Z0-9]{6,12}$/i,
  google_ads_conversion_id: /^AW-\d{6,16}$/i,
  // Label : alphanumeric + _ + - (peut commencer par lettre ou chiffre).
  google_ads_conversion_label: /^[A-Za-z0-9_-]+$/,
};

export function isPixelFieldValid(field: keyof typeof PIXEL_REGEX, value: string): boolean {
  if (!value || !value.trim()) return true; // vide = OK (disable)
  return PIXEL_REGEX[field].test(value.trim());
}
