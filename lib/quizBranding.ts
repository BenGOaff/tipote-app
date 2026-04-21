// lib/quizBranding.ts
// Canonical brand resolver for a quiz.
// A quiz can override its creator's business profile branding with its own values;
// any unset value falls back to business_profiles, then to safe constants.
//
// Used by:
//   - /api/quiz/[quizId]/public (GET) to return resolved brand to the visitor
//   - editor preview to show the exact same look as the public page (WYSIWYG)

export const BRAND_FONT_CHOICES = [
  "Inter",
  "Poppins",
  "DM Sans",
  "Montserrat",
  "Playfair Display",
  "Lato",
  "Roboto",
  "Open Sans",
  "Nunito",
] as const;

export type BrandFontChoice = (typeof BRAND_FONT_CHOICES)[number];

export const DEFAULT_BRAND_FONT: BrandFontChoice = "Inter";
export const DEFAULT_BRAND_COLOR_PRIMARY = "#5D6CDB";
export const DEFAULT_BRAND_COLOR_BACKGROUND = "#ffffff";

export type QuizBranding = {
  font: BrandFontChoice;
  primaryColor: string;
  backgroundColor: string;
  logoUrl: string | null;
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function sanitizeHex(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return HEX_RE.test(trimmed) ? trimmed : fallback;
}

function sanitizeFont(raw: unknown, fallback: BrandFontChoice): BrandFontChoice {
  if (typeof raw !== "string") return fallback;
  const match = BRAND_FONT_CHOICES.find((f) => f === raw);
  return match ?? fallback;
}

type QuizInput = {
  brand_font?: string | null;
  brand_color_primary?: string | null;
  brand_color_background?: string | null;
} | null | undefined;

// Tipote stores branding on business_profiles: brand_color_base is the
// canonical "primary" color. brand_color_accent is used elsewhere (landing
// pages) but not consumed here — quizzes only need a single primary hue.
type BusinessProfileInput = {
  brand_font?: string | null;
  brand_color_base?: string | null;
  brand_logo_url?: string | null;
} | null | undefined;

export function resolveQuizBranding(quiz: QuizInput, profile: BusinessProfileInput): QuizBranding {
  const profileFont = sanitizeFont(profile?.brand_font, DEFAULT_BRAND_FONT);
  const profilePrimary = sanitizeHex(profile?.brand_color_base, DEFAULT_BRAND_COLOR_PRIMARY);

  return {
    font: sanitizeFont(quiz?.brand_font, profileFont),
    primaryColor: sanitizeHex(quiz?.brand_color_primary, profilePrimary),
    backgroundColor: sanitizeHex(quiz?.brand_color_background, DEFAULT_BRAND_COLOR_BACKGROUND),
    logoUrl: typeof profile?.brand_logo_url === "string" && profile.brand_logo_url.trim().length > 0
      ? profile.brand_logo_url.trim()
      : null,
  };
}

/**
 * Generates a Google Fonts <link href="..."> URL for the given font.
 * Loads weights 400/500/600/700. Non-whitelisted fonts fall back to Inter.
 */
export function googleFontHref(font: BrandFontChoice): string {
  const family = font.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
}

/**
 * CSS font-family value with safe fallbacks.
 */
export function cssFontFamily(font: BrandFontChoice): string {
  return `"${font}", system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
}

/**
 * Converts a #rgb or #rrggbb hex color to an "H S% L%" triplet (the format
 * Tailwind expects behind `hsl(var(--primary))`). Returns null on invalid input.
 */
export function hexToHslTriplet(hex: string): string | null {
  if (!HEX_RE.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      case b: hue = (r - g) / d + 4; break;
    }
    hue *= 60;
  }
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/;

/**
 * Validates + normalizes a user-entered slug. Returns the cleaned slug or null
 * if the input fails validation. Null is a sentinel for "no custom slug".
 */
export function sanitizeSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!cleaned) return null;
  return SLUG_RE.test(cleaned) ? cleaned : null;
}

export const ALLOWED_SHARE_NETWORKS = [
  "facebook",
  "linkedin",
  "x",
  "whatsapp",
  "threads",
  "instagram",
  "pinterest",
  "reddit",
  "email",
] as const;

export type ShareNetwork = (typeof ALLOWED_SHARE_NETWORKS)[number];

export function sanitizeShareNetworks(raw: unknown): ShareNetwork[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ShareNetwork[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const match = ALLOWED_SHARE_NETWORKS.find((n) => n === item);
    if (match && !seen.has(match)) {
      seen.add(match);
      out.push(match);
    }
  }
  return out;
}
