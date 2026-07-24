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

// Forme des boutons. 'pill' = arrondi complet (historique), 'rounded' =
// coins doux, 'square' = coins nets. NULL/'pill' = rendu historique.
export type QuizButtonShape = "pill" | "rounded" | "square";

// ─── Disposition des questions (façon Tally) ──────────────────────────
// 'centered' = rendu historique, contenu centré. 'left' = contenu aligné à
// gauche (épuré, type Tally). 'split' = deux colonnes sur desktop (un
// panneau média/marque d'un côté, la question + les réponses de l'autre),
// empilé en une seule colonne sur mobile. NULL/'centered' = rendu
// STRICTEMENT identique aux quiz existants (dont ceux sous pub).
export type QuizQuestionLayout = "centered" | "left" | "split";

// Côté du panneau média en disposition 'split'. NULL/'left' = média à gauche.
export type QuizSplitSide = "left" | "right";

// ─── Disposition des réponses (colonnes vs liste) ─────────────────────
// 'auto' (défaut/NULL) = comportement historique : multiple_choice avec >= 3
// options -> 2 colonnes (>= sm), sinon 1 colonne. 'grid' = toujours 2
// colonnes (>= sm). 'list' = toujours une seule colonne empilée. NULL/'auto'
// = rendu STRICTEMENT identique aux quiz existants (dont ceux sous pub).
export type QuizAnswerLayout = "auto" | "grid" | "list";

export function sanitizeAnswerLayout(raw: unknown): QuizAnswerLayout {
  return raw === "grid" || raw === "list" ? raw : "auto";
}

// Classe Tailwind d'arrondi correspondant à la forme choisie. Sert aux
// boutons de réponse et aux CTA. 'pill' (défaut) renvoie une chaîne VIDE :
// aucun override, chaque bouton garde son arrondi d'origine -> les quiz
// existants sont rendus STRICTEMENT à l'identique. Seuls 'rounded' et
// 'square' émettent un override (!important pour battre les classes utilitaires).
export function buttonShapeRadiusClass(shape: QuizButtonShape): string {
  return shape === "square" ? "!rounded-md" : shape === "rounded" ? "!rounded-xl" : "";
}

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
  buttonShape: QuizButtonShape;
  // ─── Disposition des questions (façon Tally) ───
  /** Disposition de l'écran de question. 'centered' = rendu historique. */
  questionLayout: QuizQuestionLayout;
  /** Image du panneau média en disposition 'split', sinon null (legacy). */
  splitImageUrl: string | null;
  /** Côté du panneau média en 'split' ('left' = défaut). */
  splitSide: QuizSplitSide;
  /**
   * Visuel du panneau split par page (validé/sanitisé), sinon null. NULL =
   * fallback historique (splitImageUrl puis motif mesh sur la couleur de
   * marque). Résolu par page côté rendu via `resolvePanelMedia`.
   */
  panelMedia: PanelMediaConfig | null;
  /** Disposition des réponses ('auto' = rendu historique). */
  answerLayout: QuizAnswerLayout;
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

function sanitizeButtonShape(raw: unknown): QuizButtonShape {
  return raw === "rounded" || raw === "square" ? raw : "pill";
}

function sanitizeQuestionLayout(raw: unknown): QuizQuestionLayout {
  return raw === "left" || raw === "split" ? raw : "centered";
}

function sanitizeSplitSide(raw: unknown): QuizSplitSide {
  return raw === "right" ? "right" : "left";
}

function sanitizeUrlOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 && /^https?:\/\//i.test(t) ? t : null;
}

// ─── Modele de design PAR PROJET ──────────────────────────────────────
// A la creation d'un quiz/sondage, on estampille la mise en forme preferee
// du projet (colonnes business_profiles.default_*) sur la nouvelle ligne
// quizzes. On ne renvoie QUE les champs explicitement choisis : un default_*
// NULL/absent laisse la colonne du quiz a NULL -> rendu historique, quiz
// existants intacts. Le fond ne propose que solid|gradient comme modele
// (image = trop couplee a un asset precis).
export type ProjectDesignDefaults = {
  default_question_layout?: string | null;
  default_intro_layout?: string | null;
  default_button_shape?: string | null;
  default_answer_layout?: string | null;
  default_background_style?: string | null;
  default_background_gradient?: string | null;
};

export function designDefaultsToQuizColumns(
  bp: ProjectDesignDefaults | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!bp) return out;
  const ql = bp.default_question_layout;
  if (ql === "left" || ql === "split" || ql === "centered") out.question_layout = ql;
  const il = bp.default_intro_layout;
  if (il === "card" || il === "cover") out.intro_layout = il;
  const bs = bp.default_button_shape;
  if (bs === "pill" || bs === "rounded" || bs === "square") out.button_shape = bs;
  const al = bp.default_answer_layout;
  if (al === "auto" || al === "grid" || al === "list") out.answer_layout = al;
  if (bp.default_background_style === "solid") {
    out.background_style = "solid";
  } else if (
    bp.default_background_style === "gradient" &&
    typeof bp.default_background_gradient === "string" &&
    bp.default_background_gradient in QUIZ_GRADIENTS
  ) {
    out.background_style = "gradient";
    out.background_gradient = bp.default_background_gradient;
  }
  return out;
}

// ─── Panneau media (disposition "colonnes" / split) ───────────────────
// Le panneau decoratif du mode split peut afficher, par page : un motif
// (dessine sur canvas a partir d'une couleur), une couleur pleine, un
// degrade (parmi QUIZ_GRADIENTS) ou une image. Config stockee dans la
// colonne JSONB `quizzes.panel_media`. Palette fermee, ZERO CSS/JSON libre
// injecte : tout est valide/sanitise ici avant rendu.
//
// pageKey convention (source unique) :
//   "intro"            -> ecran d'accueil (non-cover) + personalisation
//   "capture"          -> formulaire email / capture
//   "q:"+questionId    -> une question donnee
//   "r:"+resultId      -> un profil resultat donne

export const PANEL_MOTIFS = ["mesh", "dots", "waves", "aurora", "rings", "grain"] as const;
export type PanelMotifKey = (typeof PANEL_MOTIFS)[number];

export const PANEL_MEDIA_TYPES = ["motif", "color", "gradient", "image"] as const;
export type PanelMediaType = (typeof PANEL_MEDIA_TYPES)[number];

export type PanelMediaItem = {
  type: PanelMediaType;
  color?: string;
  gradient?: QuizGradientKey;
  motif?: PanelMotifKey;
  motifColor?: string;
  imageUrl?: string;
};

export type PanelMediaConfig = {
  perPage?: boolean;
  global?: PanelMediaItem;
  pages?: Record<string, PanelMediaItem>;
};

function sanitizeMotifKey(raw: unknown): PanelMotifKey {
  return typeof raw === "string" && (PANEL_MOTIFS as readonly string[]).includes(raw)
    ? (raw as PanelMotifKey)
    : "mesh";
}

/**
 * Valide/sanitise un Item de panneau media. Renvoie null si l'entree n'est
 * pas un objet exploitable. Chaque champ est verrouille sur son ensemble
 * ferme (type/motif/gradient) ou son format (hex, url http(s)).
 */
export function sanitizePanelMediaItem(raw: unknown): PanelMediaItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type: PanelMediaType =
    typeof r.type === "string" && (PANEL_MEDIA_TYPES as readonly string[]).includes(r.type)
      ? (r.type as PanelMediaType)
      : "motif";
  const item: PanelMediaItem = { type };
  const color = sanitizeHexOrNull(r.color);
  if (color) item.color = color;
  const gradient = sanitizeGradientKey(r.gradient);
  if (gradient) item.gradient = gradient;
  item.motif = sanitizeMotifKey(r.motif);
  const motifColor = sanitizeHexOrNull(r.motifColor);
  if (motifColor) item.motifColor = motifColor;
  const imageUrl = sanitizeUrlOrNull(r.imageUrl);
  if (imageUrl) item.imageUrl = imageUrl;
  return item;
}

/**
 * Valide/sanitise l'objet complet `panel_media`. Ne fait jamais confiance au
 * JSON brut : perPage -> bool, global -> Item, pages -> map de clefs (string)
 * vers Items. Renvoie null si rien d'exploitable (=> fallback historique).
 */
export function sanitizePanelMediaConfig(raw: unknown): PanelMediaConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: PanelMediaConfig = {};
  if (typeof r.perPage === "boolean") out.perPage = r.perPage;
  const global = sanitizePanelMediaItem(r.global);
  if (global) out.global = global;
  if (r.pages && typeof r.pages === "object") {
    const pages: Record<string, PanelMediaItem> = {};
    for (const [key, val] of Object.entries(r.pages as Record<string, unknown>)) {
      if (typeof key !== "string" || key.length === 0 || key.length > 200) continue;
      const item = sanitizePanelMediaItem(val);
      if (item) pages[key] = item;
    }
    if (Object.keys(pages).length > 0) out.pages = pages;
  }
  if (out.perPage === undefined && !out.global && !out.pages) return null;
  return out;
}

/**
 * Item par defaut : motif "mesh" sur la couleur de marque. Sert de rendu
 * garanti quand rien n'est configure -> jamais un panneau vide.
 */
export function defaultPanelMediaItem(brandColor: string): PanelMediaItem {
  return { type: "motif", motif: "mesh", motifColor: brandColor };
}

/**
 * Resout l'Item a rendre pour une page donnee, avec fallback retro-compatible :
 *  - config null + ancienne image split renseignee -> image plein cadre
 *  - config null -> motif mesh sur la couleur de marque
 *  - config.perPage + page presente -> l'Item de cette page
 *  - sinon -> config.global, sinon defaut.
 */
export function resolvePanelMedia(
  config: PanelMediaConfig | null | undefined,
  pageKey: string,
  brandColor: string,
  legacySplitImageUrl?: string | null,
): PanelMediaItem {
  if (!config) {
    const legacy = sanitizeUrlOrNull(legacySplitImageUrl);
    if (legacy) return { type: "image", imageUrl: legacy };
    return defaultPanelMediaItem(brandColor);
  }
  if (config.perPage && config.pages && config.pages[pageKey]) {
    return config.pages[pageKey];
  }
  return config.global ?? defaultPanelMediaItem(brandColor);
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
  button_shape?: string | null;
  question_layout?: string | null;
  split_image_url?: string | null;
  split_side?: string | null;
  /** Visuel du panneau split par page (JSONB). NULL = fallback historique. */
  panel_media?: unknown;
  /** Disposition des réponses ('auto'/NULL = rendu historique). */
  answer_layout?: string | null;
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
    buttonShape: sanitizeButtonShape(quiz?.button_shape),
    questionLayout: sanitizeQuestionLayout(quiz?.question_layout),
    splitImageUrl: sanitizeUrlOrNull(quiz?.split_image_url),
    splitSide: sanitizeSplitSide(quiz?.split_side),
    panelMedia: sanitizePanelMediaConfig(quiz?.panel_media),
    answerLayout: sanitizeAnswerLayout(quiz?.answer_layout),
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
    // Image plein cadre (façon Apple/Tally) : le texte n'est JAMAIS posé
    // directement dessus, il vit dans une "reader surface" translucide (cf.
    // PublicQuizClient). L'image sert donc de simple toile de fond -> plus
    // besoin du scrim clair d'antan.
    return `url("${b.backgroundImageUrl}") center/cover no-repeat fixed`;
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

// ─── Système de contraste (lisibilité sur n'importe quel fond) ────────
// Un fond peut être clair (texte foncé, rendu historique) ou sombre (texte
// clair). On calcule la luminance PERÇUE du "sol" de contenu et on bascule
// TOUTE la palette de texte quand il est sombre. Objectif : titre, question,
// réponses, hints, footer, résultats, TOUS lisibles, sur couleur pleine
// sombre, dégradé sombre OU photo (via reader surface).

/**
 * Luminance perçue (0..1) d'une couleur hex, formule pondérée
 * (0.299*R + 0.587*G + 0.114*B) / 255. Retourne 1 (clair) sur entrée
 * invalide -> jamais de bascule accidentelle vers le thème sombre.
 */
export function relativeLuminance(hex: string): number {
  if (!HEX_RE.test(hex)) return 1;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Une couleur est "sombre" si sa luminance perçue est < 0.55. */
export function isColorDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.55;
}

/**
 * Un dégradé de la palette fermée est-il sombre ? On extrait les hex de sa
 * chaîne CSS et on moyenne leur luminance. Faux si absent/illisible.
 */
export function gradientIsDark(key: QuizGradientKey): boolean {
  const css = QUIZ_GRADIENTS[key];
  if (!css) return false;
  const hexes = css.match(/#[0-9a-fA-F]{6}/g);
  if (!hexes || hexes.length === 0) return false;
  const avg = hexes.reduce((sum, h) => sum + relativeLuminance(h), 0) / hexes.length;
  return avg < 0.55;
}

/**
 * Le SOL DE CONTENU (là où repose le texte) est-il sombre ? Détermine la
 * bascule de TOUTE la palette de texte en clair.
 *  - disposition 'split' : le contenu repose sur backgroundColor (le panneau
 *    média est décoratif) -> on juge backgroundColor.
 *  - fond image : le texte vit dans une reader surface teintée de
 *    backgroundColor -> on juge backgroundColor.
 *  - fond dégradé (centered/left) : luminance moyenne du dégradé.
 *  - fond plein : on juge backgroundColor.
 * Fond blanc par défaut -> jamais sombre -> quiz existants inchangés.
 */
export function quizContentIsDark(b: QuizBranding): boolean {
  if (b.questionLayout === "split") return isColorDark(b.backgroundColor);
  if (b.backgroundStyle === "image") return isColorDark(b.backgroundColor);
  if (b.backgroundStyle === "gradient" && b.backgroundGradient) {
    return gradientIsDark(b.backgroundGradient);
  }
  return isColorDark(b.backgroundColor);
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
