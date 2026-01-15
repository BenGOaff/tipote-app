// src/lib/hotjar.ts
"use client";

import Hotjar from "@hotjar/browser";

const siteId = 2450589;
const hotjarVersion = 6;

export function initHotjar() {
  // Sécurité : ne rien faire en SSR
  if (typeof window === "undefined") return;

  // Évite les doubles init en dev avec React StrictMode
  if ((window as any).__hotjar_initialized) return;
  (window as any).__hotjar_initialized = true;

  Hotjar.init(siteId, hotjarVersion);
}
