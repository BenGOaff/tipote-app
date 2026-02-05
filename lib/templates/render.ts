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
  if (brandTokens.headingFont)
    out.typography = { ...(out.typography || {}), headingFont: brandTokens.headingFont };
  if (brandTokens.bodyFont) out.typography = { ...(out.typography || {}), bodyFont: brandTokens.bodyFont };
  return out;
}

/**
 * Minimal Mustache-like features:
 * - {{key}} replaced by escaped scalar
 * - {{#arr}}...{{/arr}} repeats inner HTML for each item, using {{.}} and (optionally) {{key}} for object items
 * - {{#str}}...{{/str}} renders once if str is truthy, using {{.}} as the str value
 */
function renderFragment(fragment: string, data: Record<string, unknown>): string {
  const withSections: string = fragment.replace(
    /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m: string, key: string, inner: string): string => {
      const v = (data as any)[key];

      if (Array.isArray(v)) {
        if (v.length === 0) return "";
        return v
          .map((item: any): string => {
            // Arrays of objects: merge into parent scope and recurse.
            if (item != null && typeof item === "object" && !Array.isArray(item)) {
              const merged = { ...(data as any), ...(item as any) } as Record<string, unknown>;
              (merged as any)["."] = ""; // for objects, dot isn't expected
              return renderFragment(inner, merged);
            }

            // Arrays of scalars: support {{.}}
            const itemStr = escapeHtml(item);
            const merged = { ...(data as any), ".": itemStr } as Record<string, unknown>;
            return renderFragment(inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr), merged);
          })
          .join("");
      }

      if (typeof v === "string" && v.trim()) {
        const itemStr = escapeHtml(v);
        const merged = { ...(data as any), ".": itemStr } as Record<string, unknown>;
        return renderFragment(inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr), merged);
      }

      if (typeof v === "number") {
        const itemStr = escapeHtml(String(v));
        const merged = { ...(data as any), ".": itemStr } as Record<string, unknown>;
        return renderFragment(inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr), merged);
      }

      return "";
    },
  );

  const withScalars: string = withSections.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m: string, key: string): string => escapeHtml((data as any)[key]),
  );

  const withDot: string = withScalars.replace(/\{\{\s*\.\s*\}\}/g, (): string =>
    escapeHtml((data as any)["."]),
  );

  return withDot.replace(/\n{3,}/g, "\n\n").trim();
}

function cssVarsFromTokens(tokens: Tokens): string {
  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const accent = pickToken(colors, ["accent", "primary", "brand", "brandAccent"]) || "#2563eb";

  const bg = pickToken(colors, ["bg", "background", "pageBg", "page_bg"]) || "#ffffff";
  const fg = pickToken(colors, ["fg", "text", "textColor", "text_color"]) || "#0f172a";

  const muted = pickToken(colors, ["muted", "mutedText", "muted_text", "subtext"]) || "#64748b";
  const border = pickToken(colors, ["border", "stroke", "line"]) || "#e2e8f0";

  const card = pickToken(colors, ["card", "surface", "panel"]) || "#ffffff";
  const cardFg = pickToken(colors, ["cardFg", "cardText", "surfaceText", "panelText"]) || fg;

  const heroGrad1 = pickToken(colors, ["heroGrad1", "hero_grad_1", "gradient1"]) || "#eff6ff";
  const heroGrad2 = pickToken(colors, ["heroGrad2", "hero_grad_2", "gradient2"]) || "#ffffff";

  const headingFont =
    pickToken(typo, ["headingFont", "heading_font", "display", "titleFont", "fontHeading"]) ||
    "ui-sans-serif, system-ui";
  const bodyFont =
    pickToken(typo, ["bodyFont", "body_font", "body", "textFont", "fontBody"]) || "ui-sans-serif, system-ui";

  const maxw = pickToken(layout, ["maxWidth", "max_width", "containerWidth", "container_width"]) || "980px";
  const pad = pickToken(layout, ["sectionPadding", "section_padding", "pad", "padding"]) || "64px";
  const align = pickToken(layout, ["textAlign", "text_align", "align", "heroAlign"]) || "left";

  const rad = pickToken(radius, ["base", "radius", "r"]) || "16px";
  const sh = pickToken(shadow, ["base", "shadow"]) || "0 12px 40px rgba(2, 6, 23, 0.08)";

  // Some templates expect --tpt-background / --tpt-text (not --tpt-bg/--tpt-fg).
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

    "--tpt-maxw": maxw,
    "--tpt-pad": pad,
    "--tpt-text-align": align,

    "--tpt-radius": rad,
    "--tpt-shadow": sh,
  };

  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
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

  const kitSystemePath = path.join(baseDir, "kit-systeme.html");

  const [layout, fonts, tokensJson, variantsJson, previewCss0, previewCss1, previewCss2, kitCss0, kitCss1, kitSysteme] =
    await Promise.all([
      fs.readFile(layoutPath, "utf-8"),
      readOptional(fontsPath),
      readOptional(tokensPath),
      readOptional(variantsPath),
      readOptional(previewCssPath),
      readOptional(previewCssAlt1),
      readOptional(previewCssAlt2),
      readOptional(kitCssPath),
      readOptional(kitCssAlt1),
      readOptional(kitSystemePath),
    ]);

  const tokens: Tokens = typeof tokensJson === "string" && tokensJson.trim() ? (JSON.parse(tokensJson) as Tokens) : {};
  const variants = typeof variantsJson === "string" && variantsJson.trim() ? JSON.parse(variantsJson) : null;

  return {
    baseDir,
    layout,
    fonts: fonts || "",
    tokens,
    variants,
    previewCss: (previewCss0 || previewCss1 || previewCss2 || "") ?? "",
    kitCss: (kitCss0 || kitCss1 || "") ?? "",
    kitSysteme: kitSysteme || "",
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

  const css =
    mode === "kit" ? `${baseCss}\n${files.kitCss || ""}` : `${baseCss}\n${files.previewCss || ""}`;

  const head = `${files.fonts || ""}`.trim();
  const bodyTemplate = mode === "kit" && files.kitSysteme?.trim() ? files.kitSysteme : files.layout;

  const body = renderFragment(bodyTemplate, contentData);

  const html = mode === "kit" ? wrapKitHtml({ head, body, css }) : wrapPreviewHtml({ head, body, css });
  return { html };
}
