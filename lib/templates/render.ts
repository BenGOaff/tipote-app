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
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function ensureArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function splitSiteName(siteName: string): { root: string; tld: string } {
  const s = safeString(siteName).trim();
  if (!s) return { root: "VotreSite", tld: ".com" };
  const lastDot = s.lastIndexOf(".");
  if (lastDot > 0 && lastDot < s.length - 1) return { root: s.slice(0, lastDot), tld: s.slice(lastDot) };
  return { root: s, tld: ".com" };
}

function buildCapture02ContentData(contentData: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...(contentData || {}) };

  const split = splitSiteName(safeString(out.site_name));
  out.site_name_root = safeString(out.site_name_root) || split.root;
  out.site_name_tld = safeString(out.site_name_tld) || split.tld;

  out.cta_href = safeString(out.cta_href) || "#";

  out.legal_privacy_text = safeString(out.legal_privacy_text) || "Politique de confidentialité";
  out.legal_mentions_text = safeString(out.legal_mentions_text) || "Mentions légales";
  out.legal_cgv_text = safeString(out.legal_cgv_text) || "CGV";
  out.legal_privacy_url = safeString(out.legal_privacy_url) || "#";
  out.legal_mentions_url = safeString(out.legal_mentions_url) || "#";
  out.legal_cgv_url = safeString(out.legal_cgv_url) || "#";

  const mh = safeString(out.main_headline);

  if (!safeString(out.headline_line1)) {
    const m = mh.match(/^(\d+\s*jours\s*pour[^,]*,?)/i);
    out.headline_line1 = m?.[1]?.trim() || "X jours pour [action/transformation],";
  }

  if (!safeString(out.headline_domain)) {
    const m = mh.match(/votre\s+([^\n]+?)\s+pour/i);
    const v = m?.[1]?.trim();
    out.headline_domain = v ? `votre ${v}` : "votre [domaine/business]";
  }

  if (!safeString(out.headline_profit)) {
    const m = mh.match(/(\d[\d\s]*€\s*par\s*mois)/i);
    out.headline_profit = m?.[1]?.replace(/\s+/g, " ")?.trim() || "XXX€ par mois";
  }

  out.headline_without_you =
    safeString(out.headline_without_you) || (mh.toLowerCase().includes("sans vous") ? "sans vous" : "sans vous");

  out.headline_domain_suffix = safeString(out.headline_domain_suffix) || "pour qu'elle dépasse les";
  out.headline_profit_suffix = safeString(out.headline_profit_suffix) || "de profit...";

  const experts = ensureArray<any>(out.experts);
  while (experts.length < 4) experts.push({ expert_name: `Expert ${experts.length + 1}`, expert_company: "" });
  out.experts = experts.slice(0, 4).map((e: any, i: number) => ({
    expert_name: toText(e?.expert_name).trim() || `Expert ${i + 1}`,
    expert_company: toText(e?.expert_company).trim(),
  }));

  const features = ensureArray<any>(out.features);
  while (features.length < 3) {
    features.push({
      benefit_text: "Bénéfice concret et transformation mesurable pour ton audience.",
      expert_attribution: `— Avec ${toText(out.experts?.[Math.min(features.length, 3)]?.expert_name).trim() || "un expert"}`,
    });
  }
  out.features = features.slice(0, 3).map((f: any, i: number) => ({
    benefit_text: toText(f?.benefit_text).trim() || "Bénéfice concret et transformation mesurable pour ton audience.",
    expert_attribution:
      toText(f?.expert_attribution).trim() ||
      `— Avec ${toText(out.experts?.[i]?.expert_name).trim() || "un expert"}`,
  }));

  const testimonials = ensureArray<any>(out.testimonials);
  while (testimonials.length < 3) testimonials.push({ person_name: "Prénom", result_metric: "Métrique de résultat" });
  out.testimonials = testimonials.slice(0, 3).map((t: any) => ({
    person_name: toText(t?.person_name).trim() || "Prénom",
    result_metric: toText(t?.result_metric).trim() || "Métrique de résultat",
  }));

  const imgs = ensureArray<any>(out.testimonials_images);
  while (imgs.length < 3) imgs.push({ image_url: "", image_alt: "[Capture d'écran témoignage]", badge_text: "" });

  out.testimonials_images = imgs.slice(0, 3).map((img: any, i: number) => ({
    image_url: toText(img?.image_url).trim(),
    image_alt: toText(img?.image_alt).trim() || "[Capture d'écran témoignage]",
    badge_text: i === 1 ? toText(img?.badge_text).trim() || "Résultat" : toText(img?.badge_text).trim(),
  }));

  out.results_title = toText(out.results_title).trim() || "Les résultats des challengers :";
  out.footer_disclaimer =
    toText(out.footer_disclaimer).trim() ||
    "Ce site ne fait pas partie du site Web de Facebook ou de Facebook, Inc. Facebook est une marque déposée de Meta, Inc.";

  return out;
}

function postProcessContentData(args: { kind: TemplateKind; templateId: string; contentData: Record<string, any> }) {
  if (args.kind === "capture" && args.templateId === "capture-02") return buildCapture02ContentData(args.contentData);
  return args.contentData || {};
}

export async function renderTemplate(req: RenderTemplateRequest): Promise<{ html: string }> {
  const kind = normalizeKind(req.kind);
  const mode: RenderMode = req.mode === "kit" ? "kit" : "preview";
  const templateId = normalizeTemplateId(req.templateId, kind);

  const contentData = postProcessContentData({ kind, templateId, contentData: req.contentData || {} });

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

  out = renderRepeaters(out, contentData);
  out = renderPlaceholders(out, contentData);
  out = applyVariant(out, req.variantId);

  out = applyStaticTemplateReplacements({
    kind,
    templateId,
    html: out,
    contentData: contentData || {},
  });

  const isFullDoc = looksLikeFullHtmlDocument(out);

  if (isFullDoc) {
    return { html: out };
  }

  if (mode === "kit") {
    const hasInlineAssets =
      /<style[\s>]/i.test(out) || /<link[\s>]/i.test(out) || /<script[\s>]/i.test(out);

    if (hasInlineAssets) {
      return { html: out };
    }

    const styleCss = kitCss || css || "";
    const vars = cssVars ? `:root{${cssVars}}\n` : "";
    const styleBlock = `<style>\n${vars}${styleCss}\n</style>`;

    const body = out.includes('class="tpt-scope"') ? out : `<div class="tpt-scope">${out}</div>`;
    const head = (fontsHtml || "").trim();

    return { html: `${head ? head + "\n\n" : ""}${styleBlock}\n\n${body}` };
  }

  const doc = wrapAsDocument({
    htmlBody: out,
    styleCss: css,
    cssVars,
    mode,
    headHtml: fontsHtml || "",
  });

  return { html: doc };
}

/**
 * ✅ IMPORTANT : les routes API attendent renderTemplateHtml(...) => { html }
 * (et font: const { html } = await renderTemplateHtml(...))
 */
export async function renderTemplateHtml(req: RenderTemplateRequest): Promise<{ html: string }> {
  return renderTemplate(req);
}

/**
 * Optionnel: si un autre endroit veut directement une string.
 * (ne casse pas les imports actuels)
 */
export async function renderTemplateHtmlString(req: RenderTemplateRequest): Promise<string> {
  const { html } = await renderTemplate(req);
  return html;
}
