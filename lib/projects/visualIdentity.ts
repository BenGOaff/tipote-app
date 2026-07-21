// Visual identity helpers for projects.
//
// Each project (Elite users have several) can be tagged with an accent
// color + icon so the user knows at a glance which one is active. We
// keep both palettes here in TS (not in DB) so the design stays
// curated — every accent color works on the Tipote primary, every
// emoji is business-y / generic enough.

export interface AccentColor {
  /** Hex code stored in projects.accent_color */
  hex: string;
  /** UI label for the picker (fallback if the i18n key is missing) */
  label: string;
  /** Stable i18n key: projectSwitcher.color_<key> (translates the tooltip). */
  key: string;
}

// 10 accent colors — picked to harmonise with our primary #5D6CDB.
// Avoids ambiguous yellows/whites and stays readable on both light
// and dark backgrounds.
export const ACCENT_COLORS: AccentColor[] = [
  { hex: "#5D6CDB", label: "Indigo (Tipote)", key: "indigo" },
  { hex: "#8B5CF6", label: "Violet", key: "violet" },
  { hex: "#EC4899", label: "Rose", key: "rose" },
  { hex: "#F43F5E", label: "Framboise", key: "raspberry" },
  { hex: "#F97316", label: "Orange", key: "orange" },
  { hex: "#EAB308", label: "Or", key: "gold" },
  { hex: "#22C55E", label: "Vert", key: "green" },
  { hex: "#14B8A6", label: "Teal", key: "teal" },
  { hex: "#0EA5E9", label: "Ciel", key: "sky" },
  { hex: "#64748B", label: "Ardoise", key: "slate" },
];

export const DEFAULT_ACCENT_COLOR = ACCENT_COLORS[0]!.hex;

// 20 emoji — a tight set covering the typical solopreneur niches,
// kept neutral enough that "Mon Tipote" remains a sensible default
// when nothing is picked.
export const PROJECT_EMOJI: string[] = [
  "🚀", "💼", "🎯", "💡", "📈",
  "✨", "🔥", "🌱", "🧠", "🎓",
  "💪", "🩺", "🧘", "🛍️", "🏠",
  "🎨", "🎬", "🎙️", "📚", "🌍",
];

export const DEFAULT_EMOJI = "🚀";

export function isValidAccentColor(hex: unknown): hex is string {
  if (typeof hex !== "string") return false;
  return ACCENT_COLORS.some((c) => c.hex.toLowerCase() === hex.toLowerCase());
}

export function isValidEmoji(emoji: unknown): emoji is string {
  if (typeof emoji !== "string") return false;
  return PROJECT_EMOJI.includes(emoji);
}
