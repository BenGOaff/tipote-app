// lib/templates/render.ts
// Template renderer for Tipote HTML previews + Systeme.io kits.
// Reads template fragments from /src/templates and injects contentData into {{placeholders}}.
//
// IMPORTANT:
// - Templates are trusted local files.
// - Content is user-generated -> we escape HTML.
// - "Kit" output must be safe to paste into Systeme.io without breaking the host page,
//   so we scope styles under a wrapper (".tpt-scope") using styles.kit.css per template.

import fs from "node:fs/promises";
import path from "node:path";

export type TemplateKind = "capture" | "vente";
export type RenderMode = "preview" | "kit";

export type RenderTemplateRequest = {
  kind: TemplateKind;
  templateId: string; // ex: "capture-01", "vente-01"
  mode: RenderMode;
  variantId?: string | null;
  contentData: Record<string, unknown>;
  brandTokens?: Partial<{
    accent: string;
    headingFont: string;
    bodyFont: string;
  }> | null;
};

type Tokens = {
  colors?: Record<string, string>;
  typography?: Record<string, string>;
  layout?: Record<string, string>;
  radius?: Record<string, string>;
  shadow?: Record<string, string>;
};

function escapeHtml(input: unknown): string {
  const s = typeof input === "string" ? input : input == null ? "" : String(input);
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeId(v: string): string {
  return (v || "").replace(/[^a-z0-9\-]/gi, "").trim();
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

function pickToken(obj: Record<string, string> | undefined, keys: string[]): string | undefined {
  const o = obj || {};
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // case-insensitive fallback
  const lowered = Object.keys(o).reduce<Record<string, string>>((acc, k) => {
    acc[k.toLowerCase()] = k;
    return acc;
  }, {});
  for (const k of keys) {
    const real = lowered[k.toLowerCase()];
    if (!real) continue;
    const v = o[real];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function applyVariant(tokens: Tokens, variants: any, variantId?: string | null): Tokens {
  if (!variantId) return tokens;
  const list = Array.isArray(variants?.variants) ? variants.variants : [];
  const v = list.find((x: any) => String(x?.id || "") === String(variantId));
  if (!v) return tokens;

  const out: Tokens = JSON.parse(JSON.stringify(tokens || {}));
  if (typeof v?.sectionPadding === "string") {
    out.layout = { ...(out.layout || {}), sectionPadding: v.sectionPadding };
  }
  if (typeof v?.heroAlign === "string") {
    out.layout = { ...(out.layout || {}), textAlign: v.heroAlign };
  }
  if (typeof v?.maxWidth === "string") {
    out.layout = { ...(out.layout || {}), maxWidth: v.maxWidth };
  }
  return out;
}

function applyBrand(tokens: Tokens, brandTokens?: RenderTemplateRequest["brandTokens"] | null): Tokens {
  if (!brandTokens) return tokens;
  const out: Tokens = JSON.parse(JSON.stringify(tokens || {}));
  if (brandTokens.accent) out.colors = { ...(out.colors || {}), accent: brandTokens.accent };
  if (brandTokens.headingFont) out.typography = { ...(out.typography || {}), headingFont: brandTokens.headingFont };
  if (brandTokens.bodyFont) out.typography = { ...(out.typography || {}), bodyFont: brandTokens.bodyFont };
  return out;
}

function cssVarsFromTokens(tokens: Tokens): string {
  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  // Colors (support both new + legacy token keys)
  const accent = pickToken(colors, ["accent", "primary", "brand", "brandAccent", "primaryAccent"]) || "#2563eb";

  const bg = pickToken(colors, ["bg", "background", "pageBg", "page_bg"]) || "#ffffff";

  // Many templates use "primaryText" / "secondaryText"
  const fg =
    pickToken(colors, ["fg", "text", "textColor", "text_color", "primaryText", "primary_text"]) || "#0f172a";

  const muted =
    pickToken(colors, ["muted", "mutedText", "muted_text", "subtext", "secondaryText", "secondary_text"]) || "#64748b";

  const border = pickToken(colors, ["border", "stroke", "line"]) || "#e2e8f0";

  const card = pickToken(colors, ["card", "surface", "panel", "panelBg", "panel_bg"]) || "#ffffff";

  const cardFg = pickToken(colors, ["cardFg", "cardText", "surfaceText", "panelText", "panel_text"]) || fg;

  const heroGrad1 = pickToken(colors, ["heroGrad1", "hero_grad_1", "gradient1"]) || "#eff6ff";
  const heroGrad2 = pickToken(colors, ["heroGrad2", "hero_grad_2", "gradient2"]) || "#ffffff";

  // Typography
  const headingFont =
    pickToken(typo, ["headingFont", "heading_font", "display", "titleFont", "fontHeading"]) || "ui-sans-serif, system-ui";
  const bodyFont =
    pickToken(typo, ["bodyFont", "body_font", "textFont", "fontBody"]) || "ui-sans-serif, system-ui";

  // Sizes
  const bodySize = pickToken(typo, ["bodySize", "body_size", "fontSize", "font_size", "body"]) || "16px";
  const lineHeight = pickToken(typo, ["lineHeight", "line_height", "leading"]) || "1.6";

  // Layout
  const maxw = pickToken(layout, ["maxWidth", "max_width", "containerWidth", "container_width"]) || "980px";
  const pad = pickToken(layout, ["sectionPadding", "section_padding", "pad", "padding"]) || "64px";
  const align = pickToken(layout, ["textAlign", "text_align", "align", "heroAlign"]) || "left";

  // Radius / shadows (templates-main expects card/button keys)
  const cardRadius = pickToken(radius, ["card", "cardRadius", "card_radius", "base", "radius", "r"]) || "16px";
  const btnRadius = pickToken(radius, ["button", "btn", "buttonRadius", "button_radius"]) || cardRadius;

  const cardShadow =
    pickToken(shadow, ["card", "cardShadow", "card_shadow", "base", "shadow"]) || "0 12px 40px rgba(2, 6, 23, 0.08)";

  const vars: Record<string, string> = {
    "--tpt-accent": accent,

    "--tpt-bg": bg,
    "--tpt-background": bg,

    "--tpt-fg": fg,
    "--tpt-text": fg,

    "--tpt-muted": muted,
    "--tpt-border": border,

    "--tpt-card": card,
    "--tpt-card-fg": cardFg,

    "--tpt-hero-grad-1": heroGrad1,
    "--tpt-hero-grad-2": heroGrad2,

    "--tpt-heading-font": headingFont,
    "--tpt-body-font": bodyFont,
    "--tpt-body-size": bodySize,
    "--tpt-line-height": lineHeight,

    "--tpt-maxw": maxw,
    "--tpt-pad": pad,
    "--tpt-text-align": align,

    "--tpt-card-radius": cardRadius,
    "--tpt-btn-radius": btnRadius,
    "--tpt-card-shadow": cardShadow,

    // Backward compat aliases used in a few templates
    "--tpt-radius": cardRadius,
    "--tpt-shadow": cardShadow,
  };

  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
}

/**
 * Minimal Mustache-like features:
 * - {{key}} replaced by escaped scalar
 * - {{#arr}}...{{/arr}} repeats inner HTML for each item, using {{.}} and (optionally) {{key}} for object items
 * - {{#str}}...{{/str}} renders once if str is truthy, using {{.}} as the str value
 */
function renderFragment(fragment: string, data: Record<string, unknown>): string {
  const withSections: string = fragment.replace(/\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key, inner) => {
    const v = (data as any)?.[String(key)];
    if (Array.isArray(v)) {
      return v
        .map((item) => {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            return renderFragment(inner, item as any);
          }
          const d = { ...data, ".": item };
          return renderFragment(inner, d as any);
        })
        .join("");
    }
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return "";
      const d = { ...data, ".": s };
      return renderFragment(inner, d as any);
    }
    if (typeof v === "number" || typeof v === "boolean") {
      const d = { ...data, ".": String(v) };
      return renderFragment(inner, d as any);
    }
    return "";
  });

  return withSections.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_m, key) => {
    const k = String(key);
    if (k === ".") return escapeHtml((data as any)["."]);
    const v = (data as any)?.[k];
    return escapeHtml(v);
  });
}

function wrapPreviewHtml(params: { head: string; body: string; css: string }): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${params.head || ""}
<style>${params.css || ""}</style>
</head>
<body>${params.body || ""}</body>
</html>`;
}

function wrapKitHtml(params: { head: string; body: string; css: string }): string {
  return `<style>${params.css || ""}</style>
<div class="tpt-scope">
${params.body || ""}
</div>`;
}

async function readTemplateFiles(kind: TemplateKind, templateId: string) {
  const safeKind = safeId(kind);
  const safeTemplate = safeId(templateId);
  const baseDir = path.join(process.cwd(), "src", "templates", safeKind, safeTemplate);

  const layoutPath = path.join(baseDir, "layout.html");
  const fontsPath = path.join(baseDir, "fonts.html");
  const tokensPath = path.join(baseDir, "tokens.json");
  const variantsPath = path.join(baseDir, "variants.json");

  // ✅ Preview CSS: templates-main ships "styles.css" (not styles.preview.css)
  const previewCssPath = path.join(baseDir, "styles.preview.css");
  const previewCssAlt1 = path.join(baseDir, "styles.css");
  const previewCssAlt2 = path.join(baseDir, "style.css");

  // ✅ Kit CSS: keep dedicated if present, else fallback to styles.css
  const kitCssPath = path.join(baseDir, "styles.kit.css");
  const kitCssAlt1 = path.join(baseDir, "styles.css");
  const kitCssAlt2 = path.join(baseDir, "style.css");

  const kitSystemePath = path.join(baseDir, "kit-systeme.html");

  const layout = (await readOptional(layoutPath)) || "";
  const fonts = (await readOptional(fontsPath)) || "";
  const previewCss = (await readOptional(previewCssPath)) || (await readOptional(previewCssAlt1)) || (await readOptional(previewCssAlt2)) || "";
  const kitCss = (await readOptional(kitCssPath)) || (await readOptional(kitCssAlt1)) || (await readOptional(kitCssAlt2)) || "";
  const kitSysteme = (await readOptional(kitSystemePath)) || "";

  const tokensRaw = (await readOptional(tokensPath)) || "{}";
  const variantsRaw = (await readOptional(variantsPath)) || "{}";

  let tokens: Tokens = {};
  let variants: any = {};
  try {
    tokens = JSON.parse(tokensRaw) as Tokens;
  } catch {
    tokens = {};
  }
  try {
    variants = JSON.parse(variantsRaw) as any;
  } catch {
    variants = {};
  }

  return {
    baseDir,
    layout,
    fonts,
    previewCss,
    kitCss,
    kitSysteme,
    tokens,
    variants,
  };
}

export async function renderTemplateHtml(
  req: RenderTemplateRequest,
): Promise<{
  html: string;
}> {
  const { kind, templateId, mode, variantId, contentData, brandTokens } = req;
  if (!templateId) throw new Error("templateId required");

  const files = await readTemplateFiles(kind, templateId);

  const withVariant = applyVariant(files.tokens, files.variants, variantId);
  const withBrand = applyBrand(withVariant, brandTokens);

  const cssVars = cssVarsFromTokens(withBrand);

  // ✅ IMPORTANT: in kit mode, scope CSS vars under .tpt-scope (no :root leakage in Systeme.io)
  const baseCss = mode === "kit" ? `.tpt-scope{${cssVars}}` : `:root{${cssVars}}`;

  const css = mode === "kit" ? `${baseCss}\n${files.kitCss || ""}` : `${baseCss}\n${files.previewCss || ""}`;

  const head = `${files.fonts || ""}`.trim();
  const bodyTemplate = mode === "kit" && files.kitSysteme?.trim() ? files.kitSysteme : files.layout;

  const body = renderFragment(bodyTemplate, contentData);

  const html = mode === "kit" ? wrapKitHtml({ head, body, css }) : wrapPreviewHtml({ head, body, css });
  return { html };
}
