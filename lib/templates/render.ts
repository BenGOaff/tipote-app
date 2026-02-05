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
function renderFragment(fragment: string, data: Record<string, unknown>): string {
  // Minimal Mustache-like renderer with *recursive* section support.
  // Important: templates may contain nested sections inside array object items
  // (ex: {{#features}} ... {{#d}}...{{/d}} ... {{/features}}).
  // We therefore render array-object items by recursively rendering the inner fragment
  // with the item merged into the parent scope.

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
              const merged = { ...(data as any), ...(item as any) } as Record<
                string,
                unknown
              >;

              // For objects, {{.}} is usually not expected; keep it empty by default.
              (merged as any)["."] = "";

              return renderFragment(inner, merged);
            }

            // Arrays of scalars: support {{.}}
            const itemStr = escapeHtml(item);
            const merged = { ...(data as any), ".": itemStr } as Record<
              string,
              unknown
            >;

            return renderFragment(
              inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr),
              merged
            );
          })
          .join("");
      }

      if (typeof v === "string" && v.trim()) {
        const itemStr = escapeHtml(v);
        const merged = { ...(data as any), ".": itemStr } as Record<
          string,
          unknown
        >;
        return renderFragment(inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr), merged);
      }

      if (typeof v === "number") {
        const itemStr = escapeHtml(String(v));
        const merged = { ...(data as any), ".": itemStr } as Record<
          string,
          unknown
        >;
        return renderFragment(inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr), merged);
      }

      return "";
    }
  );

  // Scalars (excluding {{.}} which is handled via merged scope above)
  const withScalars: string = withSections.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m: string, key: string): string => escapeHtml((data as any)[key])
  );

  // Any remaining {{.}} (rare) -> data["."] if provided.
  const withDot: string = withScalars.replace(
    /\{\{\s*\.\s*\}\}/g,
    (): string => escapeHtml((data as any)["."])
  );

  return withDot.replace(/\n{3,}/g, "\n\n").trim();
}

function cssVarsFromTokens(tokens: Tokens): string {
  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const vars: Record<string, string> = {
    "--tpt-accent": colors.accent || "#2563eb",
    "--tpt-bg": colors.bg || "#ffffff",
    "--tpt-fg": colors.fg || "#0f172a",
    "--tpt-muted": colors.muted || "#64748b",
    "--tpt-border": colors.border || "#e2e8f0",
    "--tpt-card": colors.card || "#ffffff",
    "--tpt-card-fg": colors.cardFg || "#0f172a",
    "--tpt-hero-grad-1": colors.heroGrad1 || "#eff6ff",
    "--tpt-hero-grad-2": colors.heroGrad2 || "#ffffff",
    "--tpt-heading-font": typo.headingFont || "ui-sans-serif, system-ui",
    "--tpt-body-font": typo.bodyFont || "ui-sans-serif, system-ui",
    "--tpt-maxw": layout.maxWidth || "980px",
    "--tpt-pad": layout.sectionPadding || "64px",
    "--tpt-text-align": layout.textAlign || "left",
    "--tpt-radius": radius.base || "16px",
    "--tpt-shadow": shadow.base || "0 12px 40px rgba(2, 6, 23, 0.08)",
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
  // Systeme-safe: no <html>/<head>/<body>, and scope everything.
  // NOTE: head is intentionally not injected here (Systeme may strip it).
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

  // In repo, preview css file is "styles.css" (legacy name was "styles.preview.css").
  const previewCssPathModern = path.join(baseDir, "styles.css");
  const previewCssPathLegacy = path.join(baseDir, "styles.preview.css");

  const kitCssPath = path.join(baseDir, "styles.kit.css");
  const kitSystemePath = path.join(baseDir, "kit-systeme.html");

  const [
    layout,
    fonts,
    tokensJson,
    variantsJson,
    previewCssModern,
    previewCssLegacy,
    kitCss,
    kitSysteme,
  ] = await Promise.all([
    fs.readFile(layoutPath, "utf-8"),
    readOptional(fontsPath),
    readOptional(tokensPath),
    readOptional(variantsPath),
    readOptional(previewCssPathModern),
    readOptional(previewCssPathLegacy),
    readOptional(kitCssPath),
    readOptional(kitSystemePath),
  ]);

  const tokens: Tokens =
    typeof tokensJson === "string" && tokensJson.trim()
      ? (JSON.parse(tokensJson) as Tokens)
      : {};

  const variants =
    typeof variantsJson === "string" && variantsJson.trim()
      ? JSON.parse(variantsJson)
      : null;

  return {
    baseDir,
    layout,
    fonts: fonts || "",
    tokens,
    variants,
    previewCss: previewCssModern || previewCssLegacy || "",
    kitCss: kitCss || "",
    kitSysteme: kitSysteme || "",
  };
}

export async function renderTemplateHtml(req: RenderTemplateRequest): Promise<{ html: string }> {
  const { kind, templateId, mode, variantId, contentData, brandTokens } = req;

  if (!templateId) throw new Error("templateId required");

  const files = await readTemplateFiles(kind, templateId);

  const withVariant = applyVariant(files.tokens, files.variants, variantId);
  const withBrand = applyBrand(withVariant, brandTokens);

  const cssVars = cssVarsFromTokens(withBrand);
  const baseCss = `:root{${cssVars}}`;

  const css =
    mode === "kit"
      ? `${baseCss}\n${files.kitCss || ""}`
      : `${baseCss}\n${files.previewCss || ""}`;

  const head = `${files.fonts || ""}`.trim();

  const bodyTemplate =
    mode === "kit" && files.kitSysteme?.trim() ? files.kitSysteme : files.layout;

  const body = renderFragment(bodyTemplate, contentData);

  const html =
    mode === "kit"
      ? wrapKitHtml({ head, body, css })
      : wrapPreviewHtml({ head, body, css });

  return { html };
}
