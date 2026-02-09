// lib/templates/render.ts
// Template renderer for Tipote HTML previews + Systeme.io kits.
// Reads template fragments from /src/templates and injects contentData into {{placeholders}}.
//
// IMPORTANT:
// - Templates are trusted local files.
// - Content is user-generated -> we escape HTML.
// - "Kit" output must be safe to paste into Systeme.io without breaking the host page,
//   so we scope styles under a wrapper (".tpt-scope") using styles.kit.css per template.
//
// NOTE (2026-02):
// Some premium templates are provided as full standalone HTML documents (with <html>, <head>, <style>).
// For those, we MUST NOT wrap again. We still apply safe text replacements.

import fs from "node:fs/promises";
import path from "node:path";

export type TemplateKind = "capture" | "vente";
export type RenderMode = "preview" | "kit";

export type RenderTemplateRequest = {
  kind: TemplateKind;
  templateId: string; // ex: "capture-01", "sale-01" (vente)
  mode: RenderMode;

  // optional variants (layout tweaks)
  variantId?: string | null;

  // content data for placeholders
  contentData: Record<string, any>;

  // optional runtime tokens to override template tokens
  // (ex: user brand colors)
  brandTokens?: Record<string, any> | null;
};

type TemplateTokens = Record<string, any>;

type Tokens = {
  colors?: Record<string, any>;
  typography?: Record<string, any>;
  layout?: Record<string, any>;
  radius?: Record<string, any>;
  shadow?: Record<string, any>;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function escapeHtml(s: string): string {
  let out = (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Encode non-ASCII characters as numeric HTML entities (&#xxx;)
  // so accented text renders correctly even without a charset declaration
  // (e.g. when kit HTML fragments are pasted into Systeme.io).
  out = out.replace(/[^\x00-\x7F]/g, (ch) => `&#${ch.codePointAt(0)};`);

  return out;
}

// Allows {{a.b.c}} placeholders.
function getByPath(obj: any, p: string): any {
  const parts = String(p || "")
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function deepMerge(base: any, extra: any): any {
  if (Array.isArray(base) || Array.isArray(extra)) return extra ?? base;
  if (!isRecord(base)) return extra ?? base;
  if (!isRecord(extra)) return base;

  const out: any = { ...base };
  for (const k of Object.keys(extra)) {
    if (k in out) out[k] = deepMerge(out[k], extra[k]);
    else out[k] = extra[k];
  }
  return out;
}

function mergeTokens(templateTokens: TemplateTokens, brandTokens: any): TemplateTokens {
  if (!brandTokens) return templateTokens;
  if (!isRecord(brandTokens)) return templateTokens;
  return deepMerge(templateTokens, brandTokens);
}

function cssVarsFromTokens(tokens: Tokens): string {
  const vars: string[] = [];

  const flatten = (obj: any, prefix: string) => {
    if (!isRecord(obj)) return;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const key = prefix ? `${prefix}-${k}` : k;
      if (isRecord(v)) flatten(v, key);
      else vars.push(`--${key}:${safeString(v)};`);
    }
  };

  flatten(tokens as any, "");
  return vars.join("");
}

async function readFileIfExists(fp: string): Promise<string> {
  try {
    return await fs.readFile(fp, "utf-8");
  } catch {
    return "";
  }
}

function normalizeKind(input: any): TemplateKind {
  const s = safeString(input).trim();
  if (s === "vente") return "vente";
  return "capture";
}

function normalizeTemplateId(input: string, kind: TemplateKind): string {
  const raw = safeString(input).trim();
  if (!raw) return kind === "capture" ? "capture-01" : "sale-01";

  // IMPORTANT: "vente" templates live under /src/templates/vente/sale-xx
  // Canonical ids for kind="vente" are "sale-xx".
  // Accept legacy input "vente-xx" and normalize it to "sale-xx".
  if (kind === "vente") {
    if (raw.startsWith("vente-")) return raw.replace(/^vente-/, "sale-");
    return raw;
  }

  return raw;
}

function toText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

function applyVariant(html: string, variantId?: string | null): string {
  const v = safeString(variantId).trim();
  if (!v) return html;
  return html.replace(/\{\{\s*variant\s*\}\}/g, escapeHtml(v));
}

function renderPlaceholders(templateHtml: string, contentData: Record<string, any>): string {
  // {{some.path}} placeholder syntax
  return templateHtml.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m: string, key: string) => {
    const val = getByPath(contentData, String(key));
    const s = toText(val);
    return escapeHtml(s);
  });
}

function renderConditionals(html: string, contentData: Record<string, any>): string {
  return html.replace(
    /<!--\s*IF\s+([a-zA-Z0-9_.]+)\s*-->([\s\S]*?)<!--\s*ENDIF\s+\1\s*-->/g,
    (_m, key, block) => {
      const val = getByPath(contentData, key);
      const hasValue = Array.isArray(val) ? val.length > 0 : !!toText(val).trim();
      return hasValue ? block : "";
    }
  );
}

function renderRepeaters(templateHtml: string, contentData: Record<string, any>): string {
  // Simple repeater syntax:
  // <!-- BEGIN items --> ... {{items[].field}} ... <!-- END items -->
  // Inside repeater, use {{items[].field}} placeholders.
  const re = /<!--\s*BEGIN\s+([a-zA-Z0-9_.-]+)\s*-->([\s\S]*?)<!--\s*END\s+\1\s*-->/g;

  return templateHtml.replace(re, (_m: string, arrKey: string, block: string) => {
    const arr = getByPath(contentData, String(arrKey));
    if (!Array.isArray(arr) || arr.length === 0) return "";

    return arr
      .map((item: any) => {
        const local = block.replace(
          /\{\{\s*([a-zA-Z0-9_.-]+)\[\]\.([a-zA-Z0-9_.-]+)\s*\}\}/g,
          (_m2: string, _a: string, field: string) => {
            const v = item?.[String(field)];
            return escapeHtml(toText(v));
          }
        );
        return local;
      })
      .join("");
  });
}

function wrapAsDocument(args: {
  htmlBody: string;
  styleCss: string;
  cssVars: string;
  mode: RenderMode;
  headHtml?: string;
}): string {
  const body = args.mode === "kit" ? `<div class="tpt-scope">${args.htmlBody}</div>` : args.htmlBody;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Tipote template</title>
${args.headHtml || ""}
<style>
:root{${args.cssVars}}
${args.styleCss || ""}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function looksLikeFullHtmlDocument(html: string): boolean {
  const s = (html || "").trim().toLowerCase();
  if (!s) return false;
  return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<html");
}

/**
 * Premium templates provided as "static HTML" (no {{placeholders}}) must be filled
 * by deterministic replacements WITHOUT changing the template structure.
 *
 * IMPORTANT:
 * - We only replace the exact default strings that exist in the template.
 * - We keep existing spans/classes to preserve the design.
 */
function applyStaticTemplateReplacements(args: {
  kind: TemplateKind;
  templateId: string;
  html: string;
  contentData: Record<string, any>;
}): string {
  const { kind, templateId } = args;
  if (kind !== "capture") return args.html;

  if (templateId === "capture-01") {
    return applyCapture01Replacements(args.html, args.contentData);
  }

  return args.html;
}

function pickFirstNonEmpty(...vals: Array<any>): string {
  for (const v of vals) {
    const s = toText(v).trim();
    if (s) return s;
  }
  return "";
}

function replaceAll(h: string, from: string, to: string) {
  if (!from) return h;
  return h.split(from).join(to);
}

function applyCapture01Replacements(html: string, contentData: Record<string, any>): string {
  let out = html;

  // --- CTA (3 occurrences) ---
  const ctaText = escapeHtml(
    pickFirstNonEmpty(contentData.cta_text, contentData.cta_label, "OK ! Je veux en savoir plus")
  );
  const ctaSubtitle = escapeHtml(
    pickFirstNonEmpty(contentData.cta_subtitle, contentData.reassurance, "Accès gratuit & immédiat")
  );

  out = replaceAll(out, "OK ! Je veux en savoir plus", ctaText);
  out = replaceAll(out, "Accès gratuit & immédiat", ctaSubtitle);

  // --- Top notice ---
  const topNoticeText = escapeHtml(
    pickFirstNonEmpty(contentData.top_notice_text, "Ce template de page de capture est 100% offert !")
  );
  const topNoticeLinkText = escapeHtml(
    pickFirstNonEmpty(contentData.top_notice_link_text, "Cliquez ici pour le télécharger >>")
  );

  out = replaceAll(out, "Ce template de page de capture est 100% offert !", topNoticeText);
  out = replaceAll(out, "Cliquez ici pour le télécharger >>", topNoticeLinkText);

  // --- Logo (both header + footer use "VOTRE LOGO") ---
  const logoText = escapeHtml(pickFirstNonEmpty(contentData.logo_text, contentData.offer_name, "VOTRE LOGO"));
  const logoSubtitle = escapeHtml(pickFirstNonEmpty(contentData.logo_subtitle, "VOTRE BASELINE ICI"));

  out = replaceAll(out, "VOTRE LOGO", logoText);
  out = replaceAll(out, "VOTRE BASELINE ICI", logoSubtitle);

  // --- Hook ---
  const hook = escapeHtml(
    pickFirstNonEmpty(contentData.hook, contentData.hero_kicker, "Affirmation choc qui capte l'attention ici")
  );
  out = replaceAll(out, "Affirmation choc qui capte l'attention ici", hook);

  // --- Hero title segments (preserve spans/classes) ---
  const heroPrefix = escapeHtml(pickFirstNonEmpty(contentData.hero_title_prefix, "Rédige ici ta "));
  const heroH1 = escapeHtml(
    pickFirstNonEmpty(
      contentData.hero_title_highlight1,
      contentData.hero_highlight_1,
      contentData.hero_title, // fallback (legacy)
      contentData.headline,
      "promesse de valeur unique"
    )
  );
  const heroBetween1 = escapeHtml(
    pickFirstNonEmpty(contentData.hero_title_between1, ", en une phrase claire qui exprime un ")
  );
  const heroH2 = escapeHtml(
    pickFirstNonEmpty(contentData.hero_title_highlight2, contentData.hero_highlight_2, "bénéfice concret")
  );
  const heroBetween2 = escapeHtml(pickFirstNonEmpty(contentData.hero_title_between2, " pour ton "));
  const heroH3 = escapeHtml(
    pickFirstNonEmpty(contentData.hero_title_highlight3, contentData.hero_highlight_3, "audience cible")
  );

  out = replaceAll(out, "Rédige ici ta ", heroPrefix);
  out = replaceAll(out, "promesse de valeur unique", heroH1);
  out = replaceAll(out, ", en une phrase claire qui exprime un ", heroBetween1);
  out = replaceAll(out, "bénéfice concret", heroH2);
  out = replaceAll(out, " pour ton ", heroBetween2);
  out = replaceAll(out, "audience cible", heroH3);

  // --- Video overlay lines ---
  const v1 = escapeHtml(pickFirstNonEmpty(contentData.video_line1, "Télécharge"));
  const v2 = escapeHtml(pickFirstNonEmpty(contentData.video_line2, "ce template"));
  const v3 = escapeHtml(pickFirstNonEmpty(contentData.video_line3, "offert"));

  out = replaceAll(out, "Télécharge", v1);
  out = replaceAll(out, "ce template", v2);
  out = replaceAll(out, "offert", v3);

  // --- Benefits section title ---
  const benefitsTitle = escapeHtml(
    pickFirstNonEmpty(contentData.benefits_title, contentData.section_title, "Explique ce que propose ton freebie")
  );
  out = replaceAll(out, "Explique ce que propose ton freebie", benefitsTitle);

  // --- Benefits (3 cards) ---
  const benefitsArr = Array.isArray(contentData.benefits) ? contentData.benefits : [];
  if (benefitsArr.length >= 3) {
    let idx = 0;
    out = out.replace(/<p class="benefit-text">([\s\S]*?)<\/p>/g, (m0) => {
      const val = benefitsArr[idx++];
      if (typeof val !== "string" || !val.trim()) return m0;
      return `<p class="benefit-text">\n${escapeHtml(val.trim())}\n                </p>`;
    });
  }

  // --- About section ---
  const aboutLabel = escapeHtml(pickFirstNonEmpty(contentData.about_label, "Présenté par :"));
  const aboutName = escapeHtml(pickFirstNonEmpty(contentData.about_name, contentData.author_name, "Nom Prénom"));
  const aboutStory = escapeHtml(pickFirstNonEmpty(contentData.about_story, ""));

  out = replaceAll(out, "Présenté par :", aboutLabel);
  out = replaceAll(out, "Nom Prénom", aboutName);

  if (aboutStory) {
    out = out.replace(
      /<p class="about-description">([\s\S]*?)<\/p>/,
      `<p class="about-description">\n                ${aboutStory}\n            </p>`
    );
  }

  // --- Footer text ---
  const footerText = escapeHtml(pickFirstNonEmpty(contentData.footer_text, ""));
  if (footerText) {
    out = out.replace(
      /<p class="footer-text">([\s\S]*?)<\/p>/,
      `<p class="footer-text">\n            ${footerText}\n        </p>`
    );
  }

  return out;
}

export async function renderTemplateHtml(req: RenderTemplateRequest): Promise<{ html: string }> {
  const kind = normalizeKind(req.kind);
  const mode: RenderMode = req.mode === "kit" ? "kit" : "preview";
  const templateId = normalizeTemplateId(req.templateId, kind);

  const root = process.cwd();
  const tplDir = path.join(root, "src", "templates", kind, templateId);

  const [html, css, kitCss, tokensStr, fontsHtml] = await Promise.all([
    readFileIfExists(path.join(tplDir, mode === "kit" ? "kit-systeme.html" : "layout.html")),
    readFileIfExists(path.join(tplDir, "styles.css")),
    readFileIfExists(path.join(tplDir, "styles.kit.css")),
    readFileIfExists(path.join(tplDir, "tokens.json")),
    readFileIfExists(path.join(tplDir, "fonts.html")),
  ]);

  if (!html) {
    const fallback = wrapAsDocument({
      htmlBody: `<div style="font-family:system-ui;padding:24px">Template introuvable: ${escapeHtml(
        `${kind}/${templateId}`
      )}</div>`,
      styleCss: "",
      cssVars: "",
      mode,
      headHtml: "",
    });
    return { html: fallback };
  }

  let tokens: TemplateTokens = {};
  try {
    tokens = tokensStr ? (JSON.parse(tokensStr) as TemplateTokens) : {};
  } catch {
    tokens = {};
  }

  const merged = mergeTokens(tokens, req.brandTokens);
  const cssVars = cssVarsFromTokens(merged as any);

  let out = html;

    // conditionals first (remove absent optional sections)
  out = renderConditionals(out, req.contentData);

  // repeaters so placeholders inside blocks are expanded
  out = renderRepeaters(out, req.contentData);
  // repeaters first so placeholders inside blocks are expanded
  out = renderRepeaters(out, req.contentData);

  // then simple placeholders
  out = renderPlaceholders(out, req.contentData);

  // apply variant hooks
  out = applyVariant(out, req.variantId);

  // apply static replacements (premium raw HTML templates)
  out = applyStaticTemplateReplacements({
    kind,
    templateId,
    html: out,
    contentData: req.contentData || {},
  });

  const isFullDoc = looksLikeFullHtmlDocument(out);

  // If it's a full standalone HTML doc, do NOT wrap it again.
  if (isFullDoc) {
    return { html: out };
  }

  const styleCss = mode === "kit" ? kitCss || css : css;

  const doc = wrapAsDocument({
    htmlBody: out,
    styleCss,
    cssVars,
    mode,
    headHtml: fontsHtml || "",
  });

  return { html: doc };
}

/**
 * Backward-compat : certains endroits appellent déjà renderTemplate(...)
 * → on garde un alias sans casser l'existant.
 */
export const renderTemplate = renderTemplateHtml;