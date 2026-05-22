// Sélection du bon adapter en fonction du hostname courant. Tourne
// au boot du content script. Retourne null si on est sur un site
// non-supporté (l'extension n'injecte alors rien — match natif Chrome
// content_scripts gère déjà la pré-filtration mais belt-and-suspenders).

import type { PlatformAdapter } from "./types";
import { linkedinAdapter } from "./linkedin";
import { facebookAdapter } from "./facebook";
import { threadsAdapter } from "./threads";
import { instagramAdapter } from "./instagram";
import { xAdapter } from "./x";

export const ALL_PLATFORMS: PlatformAdapter[] = [
  linkedinAdapter,
  facebookAdapter,
  threadsAdapter,
  instagramAdapter,
  xAdapter,
];

export function detectPlatform(hostname: string = location.hostname): PlatformAdapter | null {
  const host = hostname.toLowerCase();
  for (const p of ALL_PLATFORMS) {
    if (p.hosts.some((h) => host === h || host.endsWith("." + h))) {
      return p;
    }
  }
  return null;
}

export type { PlatformAdapter };
