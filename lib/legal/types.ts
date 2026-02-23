// lib/legal/types.ts
export type LegalDocument = {
  title: string;
  lastUpdated: string;
  html: string;
};

export type LegalSlug = "cgu" | "cgv" | "privacy" | "mentions" | "cookies";

export const VALID_SLUGS: LegalSlug[] = ["cgu", "cgv", "privacy", "mentions", "cookies"];
