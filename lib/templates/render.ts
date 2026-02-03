// lib/templates/render.ts
// Template renderer for Tipote HTML previews + Systeme.io kits.
// Reads template fragments from /src/templates and injects contentData into {{placeholders}}.
//
// IMPORTANT:
// - Templates are trusted local files.
// - Content is user-generated -> we escape HTML.
// - "Kit" output must be safe to paste into Systeme.io without breaking the host page,
//   so we scope styles under a wrapper.

import fs from "node:fs/promises";
import path from "node:path";

export type TemplateKind = "capture" | "vente";
export type RenderMode = "preview" | "kit";

export type RenderTemplateRequest = {
  kind: TemplateKind;
  templateId: string; // ex: "capture-01"
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
  return v.replace(/[^a-z0-9\-]/gi, "").trim();
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
    out.typography = {
      ...(out.typography || {}),
      bodyFont: brandTokens.bodyFont,
    };
  return out;
}

/**
 * Minimal Mustache-like features:
 * - {{key}} replaced by escaped scalar
 * - {{#arr}}...{{/arr}} repeats inner HTML for each string item, using {{.}}
 */
function renderFragment(fragment: string, data: Record<string, unknown>) {
  // handle array sections first
  const withArrays = fragment.replace(
    /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, key, inner) => {
      const v = (data as any)[key];
      if (!Array.isArray(v) || v.length === 0) return "";
      return v
        .map((item) => {
          const itemStr = escapeHtml(item);
          return inner.replace(/\{\{\s*\.\s*\}\}/g, itemStr);
        })
        .join("");
    }
  );

  // then scalar placeholders
  const withScalars = withArrays.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, key) => escapeHtml((data as any)[key])
  );

  // cleanup: remove empty benefits wrapper if loop produced nothing
  return withScalars.replace(/<div class="benefits">\s*<\/div>/g, "");
}

function buildCapture01Css(tokens: Tokens, opts?: { scoped?: boolean }): string {
  const scoped = !!opts?.scoped;
  const scope = scoped ? ".tpt-scope " : "";

  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const bg = colors.background || "#ffffff";
  const primary = colors.primaryText || "#111827";
  const secondary = colors.secondaryText || "#4b5563";
  const accent = colors.accent || "#2563eb";
  const border = colors.border || "#e5e7eb";

  // Fallbacks must not assume Inter is available in Systeme; we include a font stack.
  const headingFont =
    typo.headingFont ||
    "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const bodyFont =
    typo.bodyFont ||
    "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";

  const h1 = typo.h1 || "42px";
  const body = typo.body || "16px";
  const lineHeight = typo.lineHeight || "1.6";

  const maxWidth = layout.maxWidth || "960px";
  const sectionPadding = layout.sectionPadding || "96px 24px";
  const textAlign = layout.textAlign || "center";

  const cardRadius = radius.card || "16px";
  const buttonRadius = radius.button || "12px";

  const cardShadow = shadow.card || "0 10px 30px rgba(0,0,0,0.08)";

  const base = `
:root{
  --tpt-bg:${bg};
  --tpt-text:${primary};
  --tpt-muted:${secondary};
  --tpt-accent:${accent};
  --tpt-border:${border};
  --tpt-card-radius:${cardRadius};
  --tpt-btn-radius:${buttonRadius};
  --tpt-card-shadow:${cardShadow};
  --tpt-maxw:${maxWidth};
  --tpt-section-pad:${sectionPadding};
  --tpt-align:${textAlign};
}

${scope}*{box-sizing:border-box}

${
  scoped
    ? `
${scope}.tpt-scope{
  background:var(--tpt-bg);
  color:var(--tpt-text);
  font-family:${bodyFont};
  font-size:${body};
  line-height:${lineHeight};
}
`
    : `
html,body{height:100%}
body{
  margin:0;
  background:var(--tpt-bg);
  color:var(--tpt-text);
  font-family:${bodyFont};
  font-size:${body};
  line-height:${lineHeight};
}
.tpt-page{
  min-height:100%;
  display:flex;
  align-items:flex-start;
  justify-content:center;
}
`
}

${scope}.hero.capture-01{
  width:100%;
  padding:var(--tpt-section-pad);
  background:
    radial-gradient(900px 500px at 50% -40%, rgba(37,99,235,0.16), transparent 70%),
    radial-gradient(700px 450px at 90% 10%, rgba(37,99,235,0.10), transparent 60%);
}

${scope}.hero.capture-01 .container{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
  text-align:var(--tpt-align);
}

${scope}.hero.capture-01 .eyebrow{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:6px 12px;
  border-radius:999px;
  border:1px solid var(--tpt-border);
  background:rgba(255,255,255,0.7);
  backdrop-filter:saturate(180%) blur(6px);
  color:var(--tpt-muted);
  font-weight:700;
  font-size:13px;
  max-width:100%;
}

${scope}.hero.capture-01 h1{
  margin:16px 0 0 0;
  font-family:${headingFont};
  font-weight:850;
  letter-spacing:-0.03em;
  font-size:clamp(30px, 3.4vw, ${h1});
  line-height:1.12;
}

${scope}.hero.capture-01 .subtitle{
  margin:14px auto 0 auto;
  max-width:760px;
  color:var(--tpt-muted);
  font-size:clamp(15px, 1.25vw, 18px);
}

${scope}.hero.capture-01 .benefits{
  margin:26px auto 0 auto;
  max-width:860px;
  display:grid;
  grid-template-columns:repeat(2, minmax(0, 1fr));
  gap:12px;
}

${scope}.hero.capture-01 .benefit{
  text-align:left;
  border:1px solid var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  background:rgba(255,255,255,0.9);
  box-shadow:var(--tpt-card-shadow);
  padding:14px 14px;
  display:flex;
  gap:10px;
  align-items:flex-start;
}

${scope}.hero.capture-01 .benefit .dot{
  margin-top:4px;
  width:10px;
  height:10px;
  border-radius:999px;
  background:var(--tpt-accent);
  flex:0 0 auto;
}

${scope}.hero.capture-01 .benefit p{
  margin:0;
  color:var(--tpt-text);
  font-weight:600;
  font-size:14px;
  line-height:1.35;
}

${scope}.hero.capture-01 .form-preview{
  margin:26px auto 0 auto;
  max-width:560px;
  display:flex;
  gap:10px;
  padding:14px;
  border:1px solid var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  box-shadow:var(--tpt-card-shadow);
  background:#fff;
}

${scope}.hero.capture-01 .form-preview input{
  flex:1;
  border:1px solid var(--tpt-border);
  border-radius:12px;
  padding:12px 12px;
  font-size:15px;
  outline:none;
}

${scope}.hero.capture-01 .form-preview button{
  border:none;
  border-radius:var(--tpt-btn-radius);
  padding:12px 16px;
  font-weight:850;
  letter-spacing:-0.01em;
  cursor:default;
  background:var(--tpt-accent);
  color:#fff;
  transition:transform .12s ease, filter .12s ease;
}

${scope}.hero.capture-01 .systeme-slot{
  margin:26px auto 0 auto;
  max-width:560px;
  border:1px dashed var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  background:rgba(255,255,255,0.8);
  padding:16px;
  color:var(--tpt-muted);
  font-size:13px;
}

${scope}.hero.capture-01 .micro-proof{
  margin:14px auto 0 auto;
  max-width:620px;
  color:var(--tpt-muted);
  font-size:13px;
}

@media (max-width:860px){
  ${scope}.hero.capture-01 .benefits{grid-template-columns:1fr}
}

@media (max-width:560px){
  ${scope}.hero.capture-01 .form-preview{flex-direction:column}
  ${scope}.hero.capture-01 .form-preview button{width:100%}
}
`.trim();

  return base;
}

export async function renderTemplateHtml(
  req: RenderTemplateRequest
): Promise<{ html: string; tokens: Tokens }> {
  const kind = req.kind;
  const templateId = safeId(req.templateId);

  const templateRoot = path.join(
    process.cwd(),
    "src",
    "templates",
    kind,
    templateId
  );

  const tokensPath = path.join(templateRoot, "tokens.json");
  const variantsPath = path.join(templateRoot, "variants.json");

  const fragmentFile = req.mode === "kit" ? "kit-systeme.html" : "layout.html";
  const fragmentPath = path.join(templateRoot, fragmentFile);

  const [tokensRaw, variantsRaw, fragment] = await Promise.all([
    fs.readFile(tokensPath, "utf-8"),
    fs.readFile(variantsPath, "utf-8").catch(() => ""),
    fs.readFile(fragmentPath, "utf-8"),
  ]);

  const tokensJson = (tokensRaw ? JSON.parse(tokensRaw) : {}) as Tokens;
  const variantsJson = variantsRaw ? JSON.parse(variantsRaw) : null;

  const withVariant = applyVariant(tokensJson, variantsJson, req.variantId);
  const withBrand = applyBrand(withVariant, req.brandTokens);

  const renderedFragment = renderFragment(fragment, req.contentData || {});

  // For now, template-specific CSS (Capture 01).
  let css = "";
  if (kind === "capture" && templateId === "capture-01") {
    css = buildCapture01Css(withBrand, { scoped: req.mode === "kit" });
  }

  // Load Inter for preview + kit (safe fallback if blocked)
  const fontLink = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;850&display=swap" rel="stylesheet">`;

  if (req.mode === "kit") {
    // Systeme.io: provide a single pasteable snippet.
    // We scope everything to avoid altering the rest of the funnel page.
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
