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
  const re =
    /<!--\s*BEGIN\s+([a-zA-Z0-9_.-]+)\s*-->([\s\S]*?)<!--\s*END\s+\1\s*-->/g;

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
  const body =
    args.mode === "kit"
      ? `<div class="tpt-scope">${args.htmlBody}</div>`
      : args.htmlBody;

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
    pickFirstNonEmpty(
      contentData.top_notice_text,
      "Ce template de page de capture est 100% offert !"
    )
  );
  const topNoticeLinkText = escapeHtml(
    pickFirstNonEmpty(contentData.top_notice_link_text, "Cliquez ici pour le télécharger >>")
  );

  out = replaceAll(out, "Ce template de page de capture est 100% offert !", topNoticeText);
  out = replaceAll(out, "Cliquez ici pour le télécharger >>", topNoticeLinkText);

  // --- Logo ---
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
  const heroPrefix = escapeHtml(
    pickFirstNonEmpty(contentData.hero_title_prefix, "Rédige ici ta ")
  );
  const heroH1 = escapeHtml(
    pickFirstNonEmpty(
      contentData.hero_title_highlight1,
      contentData.hero_highlight_1,
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
  const heroBetween2 = escapeHtml(
    pickFirstNonEmpty(contentData.hero_title_between2, " pour ton ")
  );
  const heroH3 = escapeHtml(
    pickFirstNonEmpty(
      contentData.hero_title_highlight3,
      contentData.hero_highlight_3,
      contentData.target_highlight,
      "audience cible"
    )
  );
  const heroSuffix = escapeHtml(
    pickFirstNonEmpty(contentData.hero_title_suffix, ".")
  );

  // Replace exact default sentence parts
  out = replaceAll(out, "Rédige ici ta ", heroPrefix);
  out = replaceAll(out, "promesse de valeur unique", heroH1);
  out = replaceAll(out, ", en une phrase claire qui exprime un ", heroBetween1);
  out = replaceAll(out, "bénéfice concret", heroH2);
  out = replaceAll(out, " pour ton ", heroBetween2);
  out = replaceAll(out, "audience cible", heroH3);

  // Targeted suffix right after the last highlight span in the hero title.
  out = out.replace(
    /(<span class="highlight">\s*[^<]*\s*<\/span>)\s*\./,
    (_m, g1) => {
      const suffix = heroSuffix || ".";
      const normalized = suffix.trim().startsWith(".") ? suffix.trim() : `. ${suffix.trim()}`;
      return `${g1}${escapeHtml(normalized)}`;
    }
  );

  // --- Video overlay lines ---
  const v1 = escapeHtml(pickFirstNonEmpty(contentData.video_line1, "Télécharge"));
  const v2 = escapeHtml(pickFirstNonEmpty(contentData.video_line2, "ce template"));
  const v3 = escapeHtml(pickFirstNonEmpty(contentData.video_line3, "offert"));

  out = replaceAll(out, "Télécharge", v1);
  out = replaceAll(out, "ce template", v2);
  out = replaceAll(out, "offert", v3);

  // --- Benefits section title ---
  const benefitsTitle = escapeHtml(
    pickFirstNonEmpty(contentData.section_title, contentData.benefits_title, "Explique ce que propose ton freebie")
  );
  out = replaceAll(out, "Explique ce que propose ton freebie", benefitsTitle);

  // --- Benefits (3 cards) ---
  // We keep existing spans but replace their inner texts + key phrases.
  const bullets = Array.isArray(contentData.bullets) ? contentData.bullets : [];
  const benefits = Array.isArray(contentData.benefits) ? contentData.benefits : [];

  const getBenefit = (i: number) => {
    const b = benefits[i] || {};
    const bulletFallback = typeof bullets[i] === "string" ? bullets[i] : "";

    const title = pickFirstNonEmpty(b.title, b.bold, `Puce promesse irrésistible`);
    const highlight = pickFirstNonEmpty(b.highlight, b.text_highlight, "concret + conséquence");
    const between = pickFirstNonEmpty(
      b.between,
      b.text_between,
      " du bénéfice pour ton audience cible + un soupçon de "
    );
    const curiosity = pickFirstNonEmpty(b.curiosity, b.text_curiosity, "curiosité");

    // If user only gave a one-liner bullet, use it as title and keep rest minimal.
    if (bulletFallback && !b.title && !b.bold && !b.highlight && !b.curiosity) {
      return {
        title: bulletFallback,
        highlight: "",
        between: "",
        curiosity: "",
      };
    }

    return { title, highlight, between, curiosity };
  };

  const b1 = getBenefit(0);
  const b2 = getBenefit(1);
  const b3 = getBenefit(2);

  const replaceNth = (source: string, needle: string, replacement: string, n: number) => {
    let idx = -1;
    let cur = 0;
    let out2 = source;
    while (cur < n) {
      idx = out2.indexOf(needle, idx + 1);
      if (idx === -1) return out2;
      cur++;
    }
    return out2.slice(0, idx) + replacement + out2.slice(idx + needle.length);
  };

  // Replace occurrences in order (3 cards)
  out = replaceNth(out, "Puce promesse irrésistible", escapeHtml(b1.title), 1);
  out = replaceNth(out, "Puce promesse irrésistible", escapeHtml(b2.title), 2);
  out = replaceNth(out, "Puce promesse irrésistible", escapeHtml(b3.title), 3);

  out = replaceNth(out, "concret + conséquence", escapeHtml(b1.highlight), 1);
  out = replaceNth(out, "concret + conséquence", escapeHtml(b2.highlight), 2);
  out = replaceNth(out, "concret + conséquence", escapeHtml(b3.highlight), 3);

  out = replaceNth(out, "curiosité", escapeHtml(b1.curiosity), 1);
  out = replaceNth(out, "curiosité", escapeHtml(b2.curiosity), 2);
  out = replaceNth(out, "curiosité", escapeHtml(b3.curiosity), 3);

  out = replaceNth(
    out,
    " du bénéfice pour ton audience cible + un soupçon de ",
    escapeHtml(b1.between),
    1
  );
  out = replaceNth(
    out,
    " du bénéfice pour ton audience cible + un soupçon de ",
    escapeHtml(b2.between),
    2
  );
  out = replaceNth(
    out,
    " du bénéfice pour ton audience cible + un soupçon de ",
    escapeHtml(b3.between),
    3
  );

  // --- About section ---
  const presenterName = escapeHtml(
    pickFirstNonEmpty(contentData.presenter_name, contentData.about_name, "Nom Prénom")
  );
  out = replaceAll(out, "Nom Prénom", presenterName);

  const aboutHighlight = escapeHtml(
    pickFirstNonEmpty(contentData.about_highlight, "brief storytelling")
  );
  const aboutObjective = escapeHtml(
    pickFirstNonEmpty(contentData.about_objective, "as réussi à atteindre les objectifs")
  );

  const aboutPrefix = escapeHtml(
    pickFirstNonEmpty(contentData.about_prefix, "Rédige ici un ")
  );
  const aboutBetween = escapeHtml(
    pickFirstNonEmpty(
      contentData.about_between,
      " qui donne confiance en toi et permet à ton audience cible de s'identifier à toi et à ton parcours. Ton prospect doit se dire que tu as vécu la même chose que lui et que tu "
    )
  );
  const aboutSuffix = escapeHtml(
    pickFirstNonEmpty(
      contentData.about_suffix,
      ". Tu es donc la bonne personne pour l'accompagner."
    )
  );

  out = replaceAll(out, "Rédige ici un ", aboutPrefix);
  out = replaceAll(out, "brief storytelling", aboutHighlight);
  out = replaceAll(
    out,
    " qui donne confiance en toi et permet à ton audience cible de s'identifier à toi et à ton parcours. Ton prospect doit se dire que tu as vécu la même chose que lui et que tu ",
    aboutBetween
  );
  out = replaceAll(out, "as réussi à atteindre les objectifs", aboutObjective);
  out = replaceAll(out, ". Tu es donc la bonne personne pour l'accompagner.", aboutSuffix);

  // --- Footer contact email (optional) ---
  const contactEmail = escapeHtml(
    pickFirstNonEmpty(contentData.contact_email, "contact@votresite.com")
  );
  out = replaceAll(out, "contact@votresite.com", contactEmail);

  return out;
}

export async function renderTemplateHtml(
  req: RenderTemplateRequest
): Promise<{ html: string }> {
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
  // We still keep token/CSS logic for non-full docs.
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
