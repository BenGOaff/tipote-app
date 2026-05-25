// Presets du Studio visuels : formats (dimensions réseaux) + brand kits.
//
// Dimensions alignées sur les recommandations réseaux 2026 :
//   1:1  → feed carré (IG/FB/LinkedIn)
//   4:5  → portrait feed (occupe le max de hauteur en feed mobile)
//   9:16 → story / reel plein écran

import type { BrandKit, StudioFormat, StudioFormatId } from "./types";

export const FORMATS: Record<StudioFormatId, StudioFormat> = {
  "1:1": { id: "1:1", label: "Carré 1:1", width: 1080, height: 1080 },
  "4:5": { id: "4:5", label: "Portrait 4:5", width: 1080, height: 1350 },
  "9:16": { id: "9:16", label: "Story 9:16", width: 1080, height: 1920 },
};

export const ALL_FORMATS: StudioFormatId[] = ["1:1", "4:5", "9:16"];

/**
 * Calcule la taille d'AFFICHAGE du visuel (preview) pour tenir dans une
 * boîte maxW×maxH en gardant le ratio. Source UNIQUE de vérité partagée
 * par le canvas Konva et les calques HTML superposés (toolbar, textarea
 * d'édition inline) — sinon désalignement.
 */
export function fitDisplay(
  format: StudioFormat,
  maxW: number,
  maxH: number,
): { displayWidth: number; displayHeight: number; scale: number } {
  const ratio = format.width / format.height;
  let displayWidth = maxW;
  let displayHeight = displayWidth / ratio;
  if (displayHeight > maxH) {
    displayHeight = maxH;
    displayWidth = displayHeight * ratio;
  }
  return { displayWidth, displayHeight, scale: displayWidth / format.width };
}

/**
 * Polices proposées. La `value` est une STACK CSS complète (avec
 * fallback générique) : c'est ce qu'on passe à Konva (ctx.font) ET au
 * textarea, pour un rendu identique au DOM. Sans fallback générique, le
 * canvas retombe sur du serif quand la police n'est pas chargée (bug
 * "Inter affiché en serif", 24/05).
 */
export const INTER_STACK =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

// Polices display (chargées via Google Fonts dans le layout racine) pour un
// rendu "2026" : titres lourds (Anton/Archivo Black), condensé (Bebas Neue),
// script d'accent (Caveat), texte (Montserrat). + les classiques système.
export const FONT_OPTIONS = [
  { label: "Anton", value: 'Anton, "Arial Narrow", Impact, sans-serif' },
  { label: "Bebas Neue", value: '"Bebas Neue", "Arial Narrow", sans-serif' },
  { label: "Archivo Black", value: '"Archivo Black", Arial, sans-serif' },
  { label: "Montserrat", value: 'Montserrat, "Helvetica Neue", Arial, sans-serif' },
  { label: "Caveat", value: 'Caveat, "Comic Sans MS", cursive' },
  { label: "Inter", value: INTER_STACK },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Times", value: '"Times New Roman", Times, serif' },
  { label: "Trebuchet", value: '"Trebuchet MS", Verdana, sans-serif' },
] as const;

/** Police de titre par défaut (display lourd) pour les visuels. */
export const DISPLAY_HEADING_STACK = 'Anton, "Arial Narrow", Impact, sans-serif';

/** Mappe un nom de police de marque ("Inter") vers sa stack CSS. */
export function fontStackFor(name?: string): string {
  if (!name) return INTER_STACK;
  if (name.includes(",")) return name; // déjà une stack
  const hit = FONT_OPTIONS.find((f) => f.label.toLowerCase() === name.toLowerCase());
  return hit ? hit.value : `${name}, ${INTER_STACK}`;
}

// Brand kits par défaut. Tiquiz & Tipote partagent la base de marque
// (#2E386E texte / #5D6CDB CTA / Inter). On les expose nommés pour que
// l'app hôte (ou l'affilié) en pioche un sans le redéclarer.
export const BRAND_PRESETS = {
  tipote: {
    name: "Tipote",
    logoUrl: "/logo-fonce.png",
    primaryColor: "#5D6CDB",
    textColor: "#2E386E",
    accentColor: "#C1FF6F",
    backgroundColor: "#F6F7FB",
    font: "Inter",
  },
  tiquiz: {
    name: "Tiquiz",
    // TODO: déposer un vrai logo Tiquiz dans public/affiliate-assets/
    // et pointer ici. En attendant on réutilise le logo Tipote.
    logoUrl: "/logo-fonce.png",
    primaryColor: "#5D6CDB",
    textColor: "#2E386E",
    accentColor: "#20BBE6",
    backgroundColor: "#FFFFFF",
    font: "Inter",
  },
} satisfies Record<string, BrandKit>;
