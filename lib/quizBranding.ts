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
// Couleur des "autres textes" (réponses, corps) par défaut : le navy
// foreground du design system. Sert UNIQUEMENT de valeur d'affichage dans
// le picker quand l'user n'a rien choisi. En base la colonne reste NULL
// tant que l'user n'a pas choisi -> quiz existants rendus comme avant.
export const DEFAULT_BRAND_COLOR_TEXT = "#2E386E";

// ─── Fonds riches (Typeform/Tally) ────────────────────────────────────
// Le fond d'un quiz peut rester une couleur pleine (comportement historique)
// ou passer en dégradé (parmi une palette fermée, ZÉRO injection CSS) ou en
// image. NULL / 'solid' = strictement le rendu actuel : les quiz existants
// ne bougent pas.
export type QuizBackgroundStyle = "solid" | "gradient" | "image";

// Dégradés proposés (clé -> CSS). Palette fermée : on ne stocke jamais de
// CSS libre venant de l'user, seulement une clé validée -> aucune surface
// d'injection. Ajouter un dégradé = ajouter une entrée ici.
export const QUIZ_GRADIENTS: Record<string, string> = {
  aurore: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%)",
  ocean: "linear-gradient(160deg, #0EA5E9 0%, #6366F1 100%)",
  menthe: "linear-gradient(160deg, #34D399 0%, #0EA5E9 100%)",
  soleil: "linear-gradient(160deg, #FBBF24 0%, #FB7185 100%)",
  corail: "linear-gradient(160deg, #FB7185 0%, #F472B6 100%)",
  nuit: "linear-gradient(160deg, #1E293B 0%, #4338CA 100%)",
  sable: "linear-gradient(160deg, #FDE68A 0%, #FCA5A5 100%)",
  lavande: "linear-gradient(160deg, #C4B5FD 0%, #818CF8 100%)",
};

export type QuizGradientKey = keyof typeof QUIZ_GRADIENTS;

// Un dégradé sombre a besoin d'un texte clair : on marque ceux-là pour que
// le rendu bascule les textes en blanc automatiquement (lisibilité).
const DARK_GRADIENTS = new Set(["nuit"]);

// Disposition de l'écran d'accueil (cover). 'card' = carte texte actuelle,
// 'cover' = image plein cadre avec titre en surimpression (welcome screen
// facon Typeform). NULL/'card' = rendu historique.
export type QuizIntroLayout = "card" | "cover";

export type QuizBranding = {
  font: BrandFontChoice;
  primaryColor: string;
  backgroundColor: string;
  /**
   * Couleur des "autres textes" (réponses, corps). NULL = non défini par
   * l'user -> le rendu garde le foreground par défaut (aucun override).
   */
  textColor: string | null;
  logoUrl: string | null;
  // ─── Présentation (fonds riches + cover) ───
  backgroundStyle: QuizBackgroundStyle;
  /** Clé de dégradé validée (dans QUIZ_GRADIENTS), sinon null. */
  backgroundGradient: QuizGradientKey | null;
  /** URL d'image de fond, sinon null. */
  backgroundImageUrl: string | null;
  introLayout: QuizIntroLayout;
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function sanitizeHex(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return HEX_RE.test(trimmed) ? trimmed : fallback;
}

// Variante nullable : hex validé ou null (pour les couleurs optionnelles).
function sanitizeHexOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return HEX_RE.test(trimmed) ? trimmed : null;
}

function sanitizeFont(raw: unknown, fallback: BrandFontChoice): BrandFontChoice {
  if (typeof raw !== "string") return fallback;
  const match = BRAND_FONT_CHOICES.find((f) => f === raw);
  return match ?? fallback;
}

function sanitizeBackgroundStyle(raw: unknown): QuizBackgroundStyle {
  return raw === "gradient" || raw === "image" ? raw : "solid";
}

function sanitizeGradientKey(raw: unknown): QuizGradientKey | null {
  if (typeof raw !== "string") return null;
  return raw in QUIZ_GRADIENTS ? (raw as QuizGradientKey) : null;
}

function sanitizeIntroLayout(raw: unknown): QuizIntroLayout {
  return raw === "cover" ? "cover" : "card";
}

function sanitizeUrlOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 && /^https?:\/\//i.test(t) ? t : null;
}

type QuizInput = {
  brand_font?: string | null;
  brand_color_primary?: string | null;
  brand_color_background?: string | null;
  /** Couleur des autres textes — NULL = non défini, aucun override. */
  brand_color_text?: string | null;
  /** Override par quiz — NULL = fallback sur le logo du business profile. */
  brand_logo_url?: string | null;
  /** Si TRUE, aucun logo affiché (ni override, ni business profile). */
  hide_brand_logo?: boolean | null;
  background_style?: string | null;
  background_gradient?: string | null;
  background_image_url?: string | null;
  intro_layout?: string | null;
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

  // Logo : priorité override quiz > business profile > rien. Si
  // `hide_brand_logo` est explicitement TRUE, on force null (le visiteur
  // ne voit AUCUN logo, pas même celui du business profile — cas "quiz
  // fait pour un client" ou "quiz volontairement anonyme").
  const quizLogo = typeof quiz?.brand_logo_url === "string" && quiz.brand_logo_url.trim().length > 0
    ? quiz.brand_logo_url.trim()
    : null;
  const profileLogo = typeof profile?.brand_logo_url === "string" && profile.brand_logo_url.trim().length > 0
    ? profile.brand_logo_url.trim()
    : null;
  const logoUrl = quiz?.hide_brand_logo === true ? null : (quizLogo ?? profileLogo);

  return {
    font: sanitizeFont(quiz?.brand_font, profileFont),
    primaryColor: sanitizeHex(quiz?.brand_color_primary, profilePrimary),
    backgroundColor: sanitizeHex(quiz?.brand_color_background, DEFAULT_BRAND_COLOR_BACKGROUND),
    textColor: sanitizeHexOrNull(quiz?.brand_color_text),
    logoUrl,
    backgroundStyle: sanitizeBackgroundStyle(quiz?.background_style),
    backgroundGradient: sanitizeGradientKey(quiz?.background_gradient),
    backgroundImageUrl: sanitizeUrlOrNull(quiz?.background_image_url),
    introLayout: sanitizeIntroLayout(quiz?.intro_layout),
  };
}

/**
 * CSS `background` shorthand pour le fond du quiz, selon le style choisi.
 * Retourne null quand le style est 'solid' ou que la donnée manque -> le
 * rendu retombe sur la couleur pleine `backgroundColor` (comportement
 * historique, quiz existants inchangés).
 */
export function quizBackgroundCss(b: QuizBranding): string | null {
  if (b.backgroundStyle === "gradient" && b.backgroundGradient) {
    return QUIZ_GRADIENTS[b.backgroundGradient] ?? null;
  }
  if (b.backgroundStyle === "image" && b.backgroundImageUrl) {
    // Scrim clair sous l'image pour garder les textes lisibles.
    return `linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url("${b.backgroundImageUrl}") center/cover no-repeat fixed`;
  }
  return null;
}

/** Le fond courant demande-t-il des textes clairs (dégradé sombre) ? */
export function quizBackgroundIsDark(b: QuizBranding): boolean {
  return (
    b.backgroundStyle === "gradient" &&
    b.backgroundGradient !== null &&
    DARK_GRADIENTS.has(b.backgroundGradient)
  );
}

// ─── Thèmes prêts à l'emploi (Tally-quality) ──────────────────────────
// Chaque thème regroupe police + couleur + fond en un clic. L'user non-tech
// obtient un rendu pro sans réfléchir ; les réglages fins restent dispo.
// Appliquer un thème = écrire ces champs sur le quiz (voir éditeur), donc
// le rendu public reste piloté par les colonnes brand_* existantes.
export type QuizTheme = {
  id: string;
  name: string;
  font: BrandFontChoice;
  primaryColor: string;
  backgroundColor: string;
  backgroundStyle: QuizBackgroundStyle;
  backgroundGradient: QuizGradientKey | null;
};

export const QUIZ_THEMES: QuizTheme[] = [
  { id: "indigo", name: "Indigo", font: "Inter", primaryColor: "#5D6CDB", backgroundColor: "#ffffff", backgroundStyle: "solid", backgroundGradient: null },
  { id: "aurore", name: "Aurore", font: "Poppins", primaryColor: "#8B5CF6", backgroundColor: "#faf9ff", backgroundStyle: "gradient", backgroundGradient: "aurore" },
  { id: "ocean", name: "Océan", font: "DM Sans", primaryColor: "#0EA5E9", backgroundColor: "#f2fbff", backgroundStyle: "gradient", backgroundGradient: "ocean" },
  { id: "menthe", name: "Menthe", font: "Nunito", primaryColor: "#10B981", backgroundColor: "#f3fbf7", backgroundStyle: "solid", backgroundGradient: null },
  { id: "corail", name: "Corail", font: "Nunito", primaryColor: "#FB7185", backgroundColor: "#fff5f6", backgroundStyle: "gradient", backgroundGradient: "corail" },
  { id: "soleil", name: "Soleil", font: "Montserrat", primaryColor: "#F59E0B", backgroundColor: "#fffaf0", backgroundStyle: "gradient", backgroundGradient: "soleil" },
  { id: "rose", name: "Rose poudré", font: "Playfair Display", primaryColor: "#EC4899", backgroundColor: "#fff5fa", backgroundStyle: "solid", backgroundGradient: null },
  { id: "ardoise", name: "Ardoise", font: "Montserrat", primaryColor: "#334155", backgroundColor: "#f8fafc", backgroundStyle: "solid", backgroundGradient: null },
  { id: "nuit", name: "Nuit", font: "Poppins", primaryColor: "#818CF8", backgroundColor: "#0f172a", backgroundStyle: "gradient", backgroundGradient: "nuit" },
];

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
