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
  templateId: string; // ex: "capture-01", "sale-01"
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
  const s =
    typeof input === "string" ? input : input == null ? "" : String(input);
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeId(v: string) {
  return (v || "").replace(/[^a-z0-9\-]/gi, "").trim();
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

function applyVariant(
  tokens: Tokens,
  variants: any,
  variantId?: string | null
): Tokens {
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

function applyBrand(
  tokens: Tokens,
  brandTokens?: RenderTemplateRequest["brandTokens"] | null
): Tokens {
  if (!brandTokens) return tokens;
  const out: Tokens = JSON.parse(JSON.stringify(tokens || {}));
  if (brandTokens.accent)
    out.colors = { ...(out.colors || {}), accent: brandTokens.accent };
  if (brandTokens.headingFont)
    out.typography = {
      ...(out.typography || {}),
      headingFont: brandTokens.headingFont,
    };
  if (brandTokens.bodyFont)
    out.typography = { ...(out.typography || {}), bodyFont: brandTokens.bodyFont };
  return out;
}

/**
 * Minimal Mustache-like features:
 * - {{key}} replaced by escaped scalar
 * - {{#arr}}...{{/arr}} repeats inner HTML for each item, using {{.}} and (optionally) {{key}} for object items
 * - {{#str}}...{{/str}} renders once if str is truthy, using {{.}} as the str value
 */
function renderFragment(fragment: string, data: Record<string, unknown>) {
  const withSections = fragment.replace(
    /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m: string, key: string, inner: string) => {
      const v = (data as any)[key];

      if (Array.isArray(v)) {
        if (v.length === 0) return "";
        return v
          .map((item: any) => {
            // Support arrays of scalars (string/number) and arrays of objects.
            if (item != null && typeof item === "object" && !Array.isArray(item)) {
              let out = inner;

              // {{.}} fallback for objects -> empty
              out = out.replace(/\{\{\s*\.\s*\}\}/g, "");

              // Replace {{key}} inside the section with item[key]
              out = out.replace(
                /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
                (_mm: string, k: string) => escapeHtml((item as any)[k])
              );

              return out;
            }

            const itemStr = escapeHtml(item);
            return inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr);
          })
          .join("");
      }

      if (typeof v === "string" && v.trim()) {
        const itemStr = escapeHtml(v);
        return inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr);
      }

      if (typeof v === "number") {
        const itemStr = escapeHtml(String(v));
        return inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr);
      }

      return "";
    }
  );

  const withScalars = withSections.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m: string, key: string) => escapeHtml((data as any)[key])
  );

  return withScalars.replace(/\n{3,}/g, "\n\n").trim();
}

function cssVarsFromTokens(tokens: Tokens): string {
  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const vars: Record<string, string> = {
    "--tpt-bg": colors.background || "#ffffff",
    "--tpt-soft": (colors as any).softBackground || "",
    "--tpt-text": colors.primaryText || "#111827",
    "--tpt-muted": colors.secondaryText || "#4b5563",
    "--tpt-accent": colors.accent || "#2563eb",
    "--tpt-accent2": (colors as any).accent2 || "",
    "--tpt-border": colors.border || "#e5e7eb",
    "--tpt-dark": (colors as any).darkBackground || "",

    "--tpt-heading-font":
      typo.headingFont ||
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    "--tpt-body-font":
      typo.bodyFont ||
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    "--tpt-h1": typo.h1 || "42px",
    "--tpt-body-size": typo.body || "16px",
    "--tpt-line-height": typo.lineHeight || "1.6",

    "--tpt-maxw": layout.maxWidth || "980px",
    "--tpt-section-pad": layout.sectionPadding || "80px 24px",
    "--tpt-align": layout.textAlign || "center",

    "--tpt-card-radius": radius.card || "16px",
    "--tpt-btn-radius": radius.button || "12px",
    "--tpt-card-shadow": shadow.card || "0 10px 30px rgba(0,0,0,0.08)",
  };

  const lines = Object.entries(vars)
    .filter(([, v]) => String(v || "").trim().length > 0)
    .map(([k, v]) => `  ${k}:${v};`);

  return `:root{\n${lines.join("\n")}\n}`;
}

export async function renderTemplateHtml(
  req: RenderTemplateRequest
): Promise<{ html: string; tokens: Tokens }> {
  const kind = req.kind;
  const templateId = safeId(req.templateId);

  const templateRoot = path.join(process.cwd(), "src", "templates", kind, templateId);

  const tokensPath = path.join(templateRoot, "tokens.json");
  const variantsPath = path.join(templateRoot, "variants.json");

  const fragmentFile = req.mode === "kit" ? "kit-systeme.html" : "layout.html";
  const fragmentPath = path.join(templateRoot, fragmentFile);

  const [tokensRaw, variantsRaw, fragment] = await Promise.all([
    fs.readFile(tokensPath, "utf-8"),
    readOptional(variantsPath),
    fs.readFile(fragmentPath, "utf-8"),
  ]);

  const tokensJson = (tokensRaw ? JSON.parse(tokensRaw) : {}) as Tokens;
  const variantsJson = variantsRaw ? JSON.parse(variantsRaw) : null;

  const withVariant = applyVariant(tokensJson, variantsJson, req.variantId);
  const withBrand = applyBrand(withVariant, req.brandTokens);

  const renderedFragment = renderFragment(fragment, req.contentData || {});

  const cssFilePrimary = req.mode === "kit" ? "styles.kit.css" : "styles.css";
  const cssFileFallback = "styles.css";

  const cssPrimaryPath = path.join(templateRoot, cssFilePrimary);
  const cssFallbackPath = path.join(templateRoot, cssFileFallback);

  const [cssPrimary, cssFallback, fontsHtml] = await Promise.all([
    readOptional(cssPrimaryPath),
    cssFilePrimary !== cssFileFallback ? readOptional(cssFallbackPath) : null,
    readOptional(path.join(templateRoot, "fonts.html")),
  ]);

  const cssBody = (cssPrimary || cssFallback || "").trim();
  if (!cssBody) {
    throw new Error(
      `Template ${kind}/${templateId} missing styles. Add ${cssFilePrimary} (or styles.css) in the template folder.`
    );
  }

  const cssVars = cssVarsFromTokens(withBrand);
  const css = `${cssVars}\n\n${cssBody}`.trim();

  const fontLink = (fontsHtml || "").trim();

  if (req.mode === "kit") {
    const snippet = `
${fontLink}
<style>
${css}
</style>
<div class="tpt-scope">
${renderedFragment}
</div>
`.trim();

    return { html: snippet, tokens: withBrand };
  }

  const doc = `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tipote — ${escapeHtml(req.templateId)}</title>
    ${fontLink}
    <style>${css}</style>
  </head>
  <body>
    <div class="tpt-page">
      ${renderedFragment}
    </div>
  </body>
</html>
`.trim();

  return { html: doc, tokens: withBrand };
}
