// lib/visualStudio/networkFormats.ts
//
// Mappe un RÉSEAU social vers les formats de visuel recommandés + le format par
// défaut, pour que le Studio pré-sélectionne le bon ratio selon la cible du
// post (l'user peut toujours changer). Aligné sur les specs réseaux 2026 et sur
// les contraintes lues dans le pipeline de publication :
//   - feed carré/portrait (LinkedIn, Facebook, Instagram, X, Threads) → 1:1 / 4:5
//   - vertical plein écran (TikTok) → 9:16
//   - épingle haute (Pinterest) → 4:5 (au plus proche du 2:3 recommandé)

import type { StudioFormatId } from "./types";

export interface NetworkVisualSpec {
  /** Formats proposés dans le studio pour ce réseau. */
  formats: StudioFormatId[];
  /** Format pré-sélectionné. */
  defaultFormat: StudioFormatId;
}

const FEED: NetworkVisualSpec = { formats: ["1:1", "4:5", "9:16"], defaultFormat: "4:5" };

const BY_NETWORK: Record<string, NetworkVisualSpec> = {
  linkedin: { formats: ["1:1", "4:5"], defaultFormat: "1:1" },
  facebook: FEED,
  instagram: { formats: ["1:1", "4:5", "9:16"], defaultFormat: "4:5" },
  threads: { formats: ["1:1", "4:5"], defaultFormat: "4:5" },
  twitter: { formats: ["1:1", "4:5"], defaultFormat: "1:1" },
  x: { formats: ["1:1", "4:5"], defaultFormat: "1:1" },
  tiktok: { formats: ["9:16"], defaultFormat: "9:16" },
  pinterest: { formats: ["4:5", "9:16"], defaultFormat: "4:5" },
  reddit: FEED,
};

/** Spec visuel pour un réseau (fallback feed générique si inconnu). */
export function networkVisualSpec(network?: string | null): NetworkVisualSpec {
  if (!network) return FEED;
  return BY_NETWORK[network.toLowerCase()] ?? FEED;
}
