// lib/visualStudio/stylePrefs.ts
//
// Mémoire de style du Studio visuel : ce qui définit "un look" réutilisable
// (hors contenu), + l'apprentissage par votes.
//
// Un STYLE enregistré = les réglages qu'on veut figer pour générer des visuels
// qui se ressemblent en ne changeant que le texte. On NE stocke PAS le fond
// image lui-même (il est régénéré), mais le STYLE de fond IA + couleurs/police/
// format/logo.

import type { AiStyleId } from "./aiPrompt";
import type { StudioFormatId } from "./types";

export interface StudioStyleSettings {
  /** Style de fond IA ("auto" = laisser l'IA décider selon le post). */
  aiStyle: AiStyleId | "auto";
  format: StudioFormatId;
  /** Couleur de fond (mode uni/dégradé) si pas d'image. */
  bgColor?: string;
  bgColor2?: string;
  bgMode?: "solid" | "gradient" | "image";
  showLogo: boolean;
  logoScale: number;
  logoPosition: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-right";
  scrim?: "none" | "dark" | "light";
}

export interface SavedStyle {
  id: string;
  name: string;
  settings: StudioStyleSettings;
  isDefault: boolean;
}

/** Borne/normalise un objet settings reçu du client ou de la DB (defensive). */
export function sanitizeStyleSettings(raw: unknown): StudioStyleSettings {
  const s = (raw ?? {}) as Record<string, unknown>;
  const positions = ["top-left", "top-center", "top-right", "bottom-left", "bottom-right"];
  const hex = (v: unknown) =>
    typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : undefined;
  return {
    aiStyle: typeof s.aiStyle === "string" ? (s.aiStyle as StudioStyleSettings["aiStyle"]) : "auto",
    format: (["1:1", "4:5", "9:16"].includes(String(s.format)) ? s.format : "4:5") as StudioFormatId,
    bgColor: hex(s.bgColor),
    bgColor2: hex(s.bgColor2),
    bgMode: ["solid", "gradient", "image"].includes(String(s.bgMode)) ? (s.bgMode as StudioStyleSettings["bgMode"]) : undefined,
    showLogo: s.showLogo !== false,
    logoScale: typeof s.logoScale === "number" ? Math.min(0.6, Math.max(0.08, s.logoScale)) : 0.22,
    logoPosition: (positions.includes(String(s.logoPosition)) ? s.logoPosition : "top-center") as StudioStyleSettings["logoPosition"],
    scrim: ["none", "dark", "light"].includes(String(s.scrim)) ? (s.scrim as StudioStyleSettings["scrim"]) : undefined,
  };
}

export interface VoteRow {
  vote: number;
  ai_style: string | null;
}

/**
 * À partir des votes de l'user, déduit le style de fond IA RECOMMANDÉ par défaut
 * (le plus aimé, net solde positif) et les styles à ÉVITER (solde négatif franc).
 * Renvoie null pour la reco s'il n'y a pas de signal clair (on laisse "auto").
 */
export function learnPreferredStyle(votes: VoteRow[]): {
  preferred: AiStyleId | null;
  avoid: AiStyleId[];
} {
  const score = new Map<string, number>();
  for (const v of votes) {
    if (!v.ai_style) continue;
    score.set(v.ai_style, (score.get(v.ai_style) ?? 0) + (v.vote > 0 ? 1 : -1));
  }
  let preferred: AiStyleId | null = null;
  let best = 0;
  const avoid: AiStyleId[] = [];
  for (const [style, sc] of score) {
    if (sc >= 2 && sc > best) {
      best = sc;
      preferred = style as AiStyleId;
    }
    if (sc <= -2) avoid.push(style as AiStyleId);
  }
  return { preferred, avoid };
}
