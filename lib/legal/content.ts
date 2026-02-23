// lib/legal/content.ts
// Lit les fichiers markdown légaux et retourne le HTML par section/locale.
// Les fichiers .md dans /legal/ contiennent 5 sections séparées par des # titres.

import fs from "fs";
import path from "path";
import { marked } from "marked";
import type { LegalDocument, LegalSlug } from "./types";

const LOCALE_FILES: Record<string, string> = {
  fr: "FR legal.md",
  en: "US legal.md",
  es: "ES legal.md",
  it: "IT legal.md",
  ar: "AR legal.md",
};

// Ordre des sections dans chaque fichier .md (séparées par # heading)
const SECTION_SLUGS: LegalSlug[] = ["mentions", "privacy", "cgv", "cgu", "cookies"];

/** Split a markdown file into sections based on `# ` headings. */
function splitSections(md: string): string[] {
  const parts = md.split(/^(?=# )/m);
  return parts.filter((p) => p.trim().length > 0);
}

/** Extract title and lastUpdated from a markdown section, then convert body to HTML. */
function parseSection(section: string): LegalDocument {
  const lines = section.split("\n");

  // Title = first # heading
  const titleLine = lines[0] ?? "";
  const title = titleLine.replace(/^#\s+/, "").trim();

  // Look for *Dernière mise à jour...* or *Last updated...* style line
  let lastUpdated = "";
  for (const line of lines.slice(1, 10)) {
    const trimmed = line.trim();
    if (/^\*[^*]+\*$/.test(trimmed)) {
      lastUpdated = trimmed.replace(/^\*|\*$/g, "").trim();
      break;
    }
  }

  // Convert full section to HTML (marked handles headings, bold, lists, links, etc.)
  const html = marked.parse(section, { async: false }) as string;

  return { title, lastUpdated, html };
}

/** Cache to avoid re-reading files on every request in dev mode. */
const cache = new Map<string, Record<LegalSlug, LegalDocument>>();

export function getLegalContent(slug: LegalSlug, locale: string): LegalDocument | null {
  if (!SECTION_SLUGS.includes(slug)) return null;

  const file = LOCALE_FILES[locale] ?? LOCALE_FILES.fr;
  const cacheKey = file;

  if (!cache.has(cacheKey)) {
    const filePath = path.join(process.cwd(), "legal", file);
    if (!fs.existsSync(filePath)) return null;

    const md = fs.readFileSync(filePath, "utf-8");
    const sections = splitSections(md);

    const parsed: Record<string, LegalDocument> = {};
    for (let i = 0; i < SECTION_SLUGS.length && i < sections.length; i++) {
      parsed[SECTION_SLUGS[i]] = parseSection(sections[i]);
    }
    cache.set(cacheKey, parsed as Record<LegalSlug, LegalDocument>);
  }

  return cache.get(cacheKey)![slug] ?? null;
}
