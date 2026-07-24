// Construction des prompts pour la génération de FOND via OpenAI (images).
//
// Principe (cf. archi studio) : l'IA génère UNIQUEMENT l'image/fond — JAMAIS
// le texte (ajouté en calque éditable par l'éditeur). On bétonne donc deux
// choses dans le prompt :
//   1. Qualité « non-IA-moche » : photoréaliste, naturel, pas de déformation,
//      pas le rendu sur-saturé générique « AI art ». Personnages réels,
//      paysages, abstrait, spatial (cf. demande Béné).
//   2. Lisibilité du texte à venir : on demande une ZONE PROPRE à fort
//      contraste pour superposer titre + CTA.

export type AiStyleId = "photoPerson" | "landscape" | "abstract" | "space" | "minimal";

/** Angles de copywriting tournants (1 par génération) → des posts successifs
 *  ne se ressemblent pas. L'IA les applique SI ça colle à l'esprit du post,
 *  sinon elle choisit le plus pertinent. */
export const COPY_ANGLES = ["contrarian", "number", "social_proof", "question", "how", "why"] as const;
export type CopyAngle = (typeof COPY_ANGLES)[number];

/** Style → (clé i18n du label, fragment de prompt). Le label est traduit
 *  côté UI via le namespace visualStudio (clés aiStyle*). */
export const AI_STYLES: Array<{ id: AiStyleId; labelKey: string; fragment: string }> = [
  {
    id: "photoPerson",
    labelKey: "aiStylePhotoPerson",
    fragment:
      "authentic candid editorial photograph of a real person, composed OFF-CENTER (subject to one side or in the lower third) leaving a large clean uncluttered area for text; a natural REALISTIC face with correct human proportions, symmetric eyes, in sharp focus, with a warm genuine natural smile, relaxed and approachable, quietly confident, positive and engaged (never sad, gloomy or blank); natural skin texture and pores, soft flattering natural light, shallow depth of field, 50mm lens, uplifting editorial lifestyle feel",
  },
  {
    id: "landscape",
    labelKey: "aiStyleLandscape",
    fragment:
      "breathtaking real-world landscape photography, cinematic golden-hour light, natural atmosphere and depth, photorealistic",
  },
  {
    id: "abstract",
    labelKey: "aiStyleAbstract",
    fragment:
      "modern premium abstract composition, smooth gradients and organic flowing shapes, subtle film grain, elegant and uncluttered",
  },
  {
    id: "space",
    labelKey: "aiStyleSpace",
    fragment:
      "deep-space cosmic scene, nebula and distant stars, cinematic and ethereal, rich but tasteful; keep the composition BALANCED with a calm, even, low-detail region (not all the glow in one corner) where text can sit comfortably",
  },
  {
    id: "minimal",
    labelKey: "aiStyleMinimal",
    fragment:
      "premium modern minimalist background: a smooth mesh gradient blending two or three rich brand-adjacent colors with soft glowing light, gentle depth and a faint film grain to avoid any banding; generous negative space, high-end SaaS / Apple-keynote aesthetic, calm and confident — deliberately designed, NOT a flat washed-out beige and not muddy",
  },
];

const STYLE_BY_ID: Record<AiStyleId, (typeof AI_STYLES)[number]> =
  Object.fromEntries(AI_STYLES.map((s) => [s.id, s])) as Record<AiStyleId, (typeof AI_STYLES)[number]>;

// ─── Variété par génération (anti "2 fois la même image") ─────────────
// gpt-image-1 n'a PAS de paramètre seed : deux prompts identiques donnent
// une image quasi identique. On injecte donc à CHAQUE appel une variante
// de scène + une variante d'ambiance tirées de ces pools. L'espace combiné
// (scène x ambiance) rend une répétition très improbable, même en cliquant
// "nouvelle image" plusieurs fois. Chaque scène reste cohérente avec le
// style choisi et garde une zone propre pour le texte.
const SCENE_VARIETY: Record<AiStyleId, string[]> = {
  photoPerson: [
    "in a bright airy modern interior near a large window",
    "outdoors in soft morning light with a gently blurred background",
    "in a warm minimal studio with soft directional light",
    "on a sunlit urban street, candid and in motion",
    "at a wooden desk in a cozy well-lit workspace",
    "against a soft neutral backdrop with a warm rim light",
    "in a natural outdoor setting with greenery softly out of focus",
    "relaxed in a warm-toned lifestyle scene",
  ],
  landscape: [
    "a misty mountain range at dawn",
    "a serene coastline with soft waves at golden hour",
    "rolling green hills under a wide open sky",
    "a calm forest lake with morning reflections",
    "desert dunes at sunset with long soft shadows",
    "an alpine valley wrapped in low clouds",
    "a tranquil field with warm backlight",
    "quiet cliffs meeting a calm sea",
  ],
  abstract: [
    "flowing liquid-like ribbons of light",
    "soft layered waves of colour",
    "organic blurred bokeh orbs",
    "gentle silk-like folds",
    "smooth swirling mist",
    "delicate faceted gradient planes",
  ],
  space: [
    "a violet-blue nebula",
    "a distant spiral galaxy",
    "a soft starfield with a faint aurora glow",
    "a serene cosmic horizon with a far-off planet",
    "drifting clouds of stardust",
    "a calm deep-space vista with subtle colour bands",
  ],
  minimal: [
    "with a soft diagonal light sweep",
    "with a gentle central glow",
    "with a smooth corner-to-corner gradient",
    "with layered pastel bands",
    "with a subtle radial bloom",
    "with a calm two-tone blend",
  ],
};

const MOOD_VARIETY = [
  "with a fresh, uplifting mood",
  "with a calm, premium mood",
  "with a warm, inviting mood",
  "with a crisp, energetic mood",
  "with a soft, elegant mood",
];

function pick<T>(pool: readonly T[], seed?: number): T {
  const i =
    seed != null
      ? ((seed % pool.length) + pool.length) % pool.length
      : Math.floor(Math.random() * pool.length);
  return pool[i];
}

/** Police de TITRE (+ accent) adaptée au thème/style choisi. Demande Béné :
 *  personne→Montserrat, minimaliste→Roboto, spatial→Anton, etc. Stacks CSS
 *  complètes (cf. FONT_OPTIONS / layout Google Fonts). */
// Police de TITRE par style. PLUS d'Anton (mono-graisse condensée → "fausse"
// graisse illisible). On varie entre serif éditorial (Playfair) et sans heavy
// lisible (Archivo Black / Montserrat). La GRAISSE est gérée par police côté
// canvas (setHeadingFont) pour éviter tout gras synthétique.
export const STYLE_HEADING_FONT: Record<AiStyleId, string> = {
  photoPerson: 'Montserrat, "Helvetica Neue", Arial, sans-serif',
  landscape: '"Playfair Display", Georgia, serif',
  abstract: '"Archivo Black", Arial, sans-serif',
  space: '"Archivo Black", Arial, sans-serif',
  minimal: '"Playfair Display", Georgia, serif',
};

export function isAiStyleId(v: unknown): v is AiStyleId {
  return typeof v === "string" && v in STYLE_BY_ID;
}

/** Directives qualité communes — l'arme anti « image IA générique / moche ». */
const QUALITY_DIRECTIVES =
  "Photorealistic, natural and believable, tasteful and editorial. Anatomically correct: no distorted or deformed faces, no warped hands, no extra fingers or limbs. Avoid the over-saturated, plasticky, generic 'AI art' look — keep it subtle, realistic and premium.";

/** On NE génère JAMAIS de texte dans l'image (ajouté en calque par l'éditeur). */
const NO_TEXT_DIRECTIVE =
  "Absolutely no text, no letters, no words, no numbers, no typography, no captions, no watermark and no logos anywhere in the image.";

type BuildArgs = {
  /** Intention de l'user (sujet du visuel / extrait du post). Optionnel. */
  intent?: string | null;
  styleId: AiStyleId;
  /** Couleurs de marque (hex) pour orienter l'ambiance colorimétrique. */
  brandColors?: string[];
  /** Graine de variété (facultative) : force un tirage scène/ambiance
   *  déterministe (tests, ou pour garantir 2 générations différentes en
   *  passant un compteur). Absent → tirage aléatoire par appel. */
  variationSeed?: number;
};

/**
 * Construit le prompt de génération du fond. On compose : style + variété de
 * scène/ambiance (anti-doublon) + intention + ambiance couleurs de marque +
 * zone propre pour le texte + directives qualité.
 */
export function buildBackgroundPrompt({ intent, styleId, brandColors, variationSeed }: BuildArgs): string {
  const style = STYLE_BY_ID[styleId] ?? STYLE_BY_ID.minimal;
  const subject = (intent ?? "").trim().slice(0, 400);

  // Variété par appel : une scène + une ambiance. Deux graines dérivées d'une
  // seule pour que scène et ambiance ne bougent pas en bloc.
  const scene = pick(SCENE_VARIETY[styleId] ?? SCENE_VARIETY.minimal, variationSeed);
  const mood = pick(MOOD_VARIETY, variationSeed != null ? variationSeed + 3 : undefined);
  const varietyHint = `This specific image: ${scene}, ${mood}.`;

  const colors = (brandColors ?? [])
    .filter((c) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c))
    .slice(0, 4);
  const colorHint = colors.length
    ? `Color mood driven by this brand palette: ${colors.join(", ")} — make these tones clearly present as the dominant ambient/lighting colors (rich and saturated, not washed-out), but blended naturally rather than as flat solid swatches.`
    : "";

  return [
    `A high-quality background visual for a social media post. Style: ${style.fragment}.`,
    varietyHint,
    subject ? `Theme/subject: ${subject}.` : "",
    colorHint,
    // Lisibilité : zone propre + contraste pour le texte superposé ensuite.
    "Composition: keep a clean, low-detail area with strong, even contrast where a headline and a call-to-action will be overlaid afterwards; do not fill the whole frame with busy detail.",
    QUALITY_DIRECTIVES,
    NO_TEXT_DIRECTIVE,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Mappe un format studio (ratio) vers une taille acceptée par l'API images. */
export function aiSizeForRatio(ratio: number): "1024x1024" | "1024x1536" | "1536x1024" {
  if (ratio > 1.15) return "1536x1024"; // paysage
  if (ratio < 0.87) return "1024x1536"; // portrait
  return "1024x1024"; // carré-ish
}
