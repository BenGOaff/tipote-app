// Mode CARROUSEL du Studio visuels.
//
// Philosophie (cf. prompt de réf Béné) : flat design, zéro gradient / zéro
// ombre, on fait RYTHMER les slides en alternant les couleurs de la PALETTE DE
// MARQUE (≥3 couleurs). Le brand kit est injecté par l'hôte → sur affiliate ce
// sont les couleurs Tipote ou Tiquiz selon l'outil promu ; quand le studio sera
// branché sur Tipote, ce seront les couleurs + le logo que l'user pose dans ses
// réglages. Ici on NE génère donc PAS d'image IA par slide : juste du texte (1
// appel) posé sur des fonds de marque → rapide, gratuit, et 100 % on-brand.

import type { BrandKit } from "./types";

/** Rôle narratif de chaque slide — structure éprouvée (hook → CTA). L'ORDRE
 *  est contractuel : la route IA renvoie 10 slides dans cet ordre exact. */
export const CAROUSEL_ROLES = [
  "hook",
  "rehook",
  "problem",
  "value",
  "value",
  "value",
  "value",
  "aha",
  "takeaway",
  "cta",
] as const;

export type CarouselRole = (typeof CAROUSEL_ROLES)[number];
export const CAROUSEL_SLIDE_COUNT = CAROUSEL_ROLES.length;

/** Une slide telle que produite par l'IA puis éditée par l'user. Les champs
 *  mappent les calques texte du canvas (kicker / headline / subline / cta). */
export interface CarouselSlide {
  role: CarouselRole;
  /** Petit tag (1-3 mots) au-dessus du titre. "" = pas de tag. */
  kicker: string;
  /** La ligne qui claque. */
  headline: string;
  /** Ligne de soutien (ou 3 actions \n-séparées pour la slide "takeaway"). */
  subline: string;
  /** Action — uniquement sur la slide finale ("cta"). */
  cta: string;
}

/** Style flat appliqué à une slide (fond + couleurs de texte/déco contrastées). */
export interface CarouselSlideStyle {
  bg: string;
  textColor: string;
  accentColor: string;
  buttonColor: string;
  buttonTextColor: string;
}

// ── Contraste (luminance relative WCAG) ────────────────────────────────
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1; // inconnu → traité comme clair
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Fond "sombre" → on écrira en clair dessus. */
export function isDarkColor(hex: string): boolean {
  return relLuminance(hex) < 0.5;
}

/** Couleur de texte qui contraste avec `bg` : blanc sur fond sombre, sinon la
 *  couleur de texte de marque (foncée). */
export function textOn(bg: string, darkText: string): string {
  return isDarkColor(bg) ? "#ffffff" : darkText || "#0f172a";
}

/** Palette ORDONNÉE de fonds dérivée du brand kit. On garde des couleurs bien
 *  distinctes (dédup) pour que l'alternance se voie. Toujours ≥3 si possible. */
export function carouselPalette(brand: BrandKit): string[] {
  const candidates = [
    brand.backgroundColor,
    brand.primaryColor,
    brand.textColor,
    brand.accentColor,
  ].filter((c): c is string => !!c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c));
  // Dédoublonnage insensible à la casse, en gardant l'ordre.
  const seen = new Set<string>();
  const palette = candidates.filter((c) => {
    const k = c.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return palette.length ? palette : ["#F6F7FB", "#5D6CDB", "#2E386E"];
}

/** Style flat d'une slide donnée : on fait tourner la palette pour le rythme,
 *  et on dérive des couleurs de texte/déco lisibles sur le fond choisi. La
 *  slide "aha" force la couleur d'accent (le punch) si elle existe. */
export function slideStyle(brand: BrandKit, index: number, role: CarouselRole): CarouselSlideStyle {
  const palette = carouselPalette(brand);
  let bg = palette[index % palette.length];
  // L'AHA-moment doit trancher → couleur d'accent de marque si dispo et pas
  // déjà le fond courant (sinon on garde la rotation).
  if (role === "aha" && brand.accentColor && brand.accentColor.toLowerCase() !== bg.toLowerCase()) {
    bg = brand.accentColor;
  }
  const dark = isDarkColor(bg);
  const textColor = textOn(bg, brand.textColor);
  // Accent (tag kicker) : doit pop sur le fond. Sur fond sombre on prend
  // l'accent de marque (souvent vif) ou blanc ; sur fond clair, le primary.
  let accentColor = dark ? (brand.accentColor || "#ffffff") : brand.primaryColor;
  if (accentColor.toLowerCase() === bg.toLowerCase()) accentColor = textColor;
  // Bouton CTA : un vrai contraste plein (flat, pas de gradient).
  const buttonColor = dark ? "#ffffff" : brand.primaryColor;
  const buttonTextColor = dark ? (brand.textColor || "#0f172a") : "#ffffff";
  return { bg, textColor, accentColor, buttonColor, buttonTextColor };
}
