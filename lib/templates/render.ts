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
    out.typography = {
      ...(out.typography || {}),
      bodyFont: brandTokens.bodyFont,
    };
  return out;
}

/**
 * Minimal Mustache-like features:
 * - {{key}} replaced by escaped scalar
 * - {{#arr}}...{{/arr}} repeats inner HTML for each item, using {{.}}
 * - {{#str}}...{{/str}} renders once if str is truthy, using {{.}} as the str value
 */
function renderFragment(fragment: string, data: Record<string, unknown>) {
  const withSections = fragment.replace(
    /\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, key, inner) => {
      const v = (data as any)[key];

      if (Array.isArray(v)) {
        if (v.length === 0) return "";
        return v
          .map((item) => {
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
    (_m, key) => escapeHtml((data as any)[key])
  );

  // cleanup empty wrappers
  return withScalars
    .replace(/<div class="benefits">\s*<\/div>/g, "")
    .replace(/<div class="tpt-grid">\s*<\/div>/g, "")
    .replace(/<div class="tpt-section tpt-section--dark">\s*<\/div>/g, "");
}

function buildFontLink(fontFamily?: string) {
  const ff = (fontFamily || "").toLowerCase();
  if (ff.includes("poppins")) {
    return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`;
  }
  // default Inter
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">`;
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

  return `
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
  font-weight:900;
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
  font-weight:900;
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
}

function buildCapture02Css(tokens: Tokens, opts?: { scoped?: boolean }): string {
  const scoped = !!opts?.scoped;
  const scope = scoped ? ".tpt-scope " : "";

  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const bg = colors.background || "#ffffff";
  const primary = colors.primaryText || "#474747";
  const secondary = colors.secondaryText || "#6b7280";
  const accent = colors.accent || "#dd0c14";
  const border = colors.border || "#e6e6e6";
  const darkBg = (colors as any).darkBackground || "#15161c";

  const headingFont =
    typo.headingFont ||
    "Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const bodyFont =
    typo.bodyFont ||
    "Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";

  const h1 = typo.h1 || "46px";
  const body = typo.body || "16px";
  const lineHeight = typo.lineHeight || "1.6";

  const maxWidth = layout.maxWidth || "980px";
  const sectionPadding = layout.sectionPadding || "80px 24px";
  const textAlign = layout.textAlign || "center";

  const cardRadius = radius.card || "18px";
  const buttonRadius = radius.button || "14px";

  const cardShadow = shadow.card || "0 18px 60px rgba(0,0,0,0.12)";

  return `
:root{
  --tpt-bg:${bg};
  --tpt-text:${primary};
  --tpt-muted:${secondary};
  --tpt-accent:${accent};
  --tpt-border:${border};
  --tpt-dark:${darkBg};
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

${scope}.hero.capture-02{
  width:100%;
  padding:var(--tpt-section-pad);
  background:
    radial-gradient(900px 600px at 50% -45%, rgba(221,12,20,0.10), transparent 70%),
    radial-gradient(800px 520px at 20% 0%, rgba(221,12,20,0.06), transparent 60%);
}

${scope}.hero.capture-02 .container{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
  text-align:var(--tpt-align);
}

${scope}.hero.capture-02 .eyebrow{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:10px 18px;
  border-radius:999px;
  border:1px solid var(--tpt-border);
  background:rgba(255,255,255,0.85);
  color:var(--tpt-text);
  font-weight:600;
  font-size:14px;
}

${scope}.hero.capture-02 h1{
  margin:18px 0 0 0;
  font-family:${headingFont};
  font-weight:400;
  letter-spacing:-0.01em;
  font-size:clamp(30px, 3.6vw, ${h1});
  line-height:1.26;
}

${scope}.hero.capture-02 h1 .accent{
  color:var(--tpt-accent);
  font-weight:700;
}

${scope}.hero.capture-02 .subtitle{
  margin:14px auto 0 auto;
  max-width:860px;
  color:var(--tpt-text);
  font-size:clamp(15px, 1.25vw, 18px);
  opacity:0.9;
}

${scope}.hero.capture-02 .tpt-grid{
  margin:26px auto 0 auto;
  max-width:980px;
  display:grid;
  grid-template-columns:1.2fr 0.8fr;
  gap:18px;
  align-items:stretch;
}

${scope}.hero.capture-02 .video{
  border:1px solid var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  background:linear-gradient(180deg, rgba(255,255,255,0.94), rgba(255,255,255,0.86));
  box-shadow:var(--tpt-card-shadow);
  padding:18px;
  text-align:left;
}

${scope}.hero.capture-02 .video .frame{
  position:relative;
  width:100%;
  aspect-ratio:16/9;
  border-radius:14px;
  border:1px solid var(--tpt-border);
  background:
    radial-gradient(500px 260px at 30% 30%, rgba(221,12,20,0.10), transparent 55%),
    linear-gradient(180deg, rgba(21,22,28,0.06), rgba(21,22,28,0.02));
  overflow:hidden;
}

${scope}.hero.capture-02 .video .play{
  position:absolute;
  inset:0;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:800;
  color:var(--tpt-accent);
  font-size:44px;
  text-shadow:0 10px 30px rgba(0,0,0,0.12);
}

${scope}.hero.capture-02 .video .caption{
  margin-top:12px;
  color:var(--tpt-muted);
  font-size:14px;
}

${scope}.hero.capture-02 .side{
  border:1px solid var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  background:#fff;
  box-shadow:var(--tpt-card-shadow);
  padding:18px;
  text-align:left;
  display:flex;
  flex-direction:column;
  gap:14px;
}

${scope}.hero.capture-02 .side .benefits{
  display:flex;
  flex-direction:column;
  gap:10px;
}

${scope}.hero.capture-02 .side .benefit{
  display:flex;
  gap:10px;
  align-items:flex-start;
}

${scope}.hero.capture-02 .side .tick{
  width:22px;
  height:22px;
  border-radius:6px;
  background:rgba(221,12,20,0.10);
  color:var(--tpt-accent);
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:900;
  flex:0 0 auto;
}

${scope}.hero.capture-02 .side .benefit p{
  margin:0;
  color:var(--tpt-text);
  font-size:14px;
  line-height:1.35;
  font-weight:500;
}

${scope}.hero.capture-02 .cta-preview{
  margin-top:6px;
  display:flex;
  flex-direction:column;
  gap:10px;
}

${scope}.hero.capture-02 .cta-preview input{
  width:100%;
  border:1px solid var(--tpt-border);
  border-radius:12px;
  padding:14px 14px;
  font-size:15px;
  outline:none;
}

${scope}.hero.capture-02 .cta-preview button{
  border:none;
  border-radius:var(--tpt-btn-radius);
  padding:18px 18px;
  font-weight:800;
  font-size:20px;
  cursor:default;
  background:var(--tpt-accent);
  color:#fff;
  transition:transform .12s ease, filter .12s ease;
}

${scope}.hero.capture-02 .systeme-slot{
  border:1px dashed var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  padding:16px;
  color:var(--tpt-muted);
  font-size:13px;
  background:rgba(255,255,255,0.85);
}

${scope}.hero.capture-02 .micro-proof{
  margin:16px auto 0 auto;
  max-width:860px;
  color:var(--tpt-muted);
  font-size:13px;
}

${scope}.hero.capture-02 .tpt-section--dark{
  margin:32px auto 0 auto;
  max-width:var(--tpt-maxw);
  border-radius:24px;
  background:var(--tpt-dark);
  color:#fff;
  padding:34px 24px;
  text-align:left;
}

${scope}.hero.capture-02 .tpt-section--dark h2{
  margin:0;
  font-size:20px;
  font-weight:700;
  letter-spacing:-0.01em;
}

${scope}.hero.capture-02 .tpt-section--dark p{
  margin:10px 0 0 0;
  color:rgba(255,255,255,0.78);
  font-size:14px;
}

@media (max-width:920px){
  ${scope}.hero.capture-02 .tpt-grid{grid-template-columns:1fr}
  ${scope}.hero.capture-02 .side{text-align:center}
  ${scope}.hero.capture-02 .side .benefit{text-align:left}
}
`.trim();
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

  let css = "";
  if (kind === "capture" && templateId === "capture-01") {
    css = buildCapture01Css(withBrand, { scoped: req.mode === "kit" });
  }
  if (kind === "capture" && templateId === "capture-02") {
    css = buildCapture02Css(withBrand, { scoped: req.mode === "kit" });
  }

  const fontLink = buildFontLink(withBrand.typography?.headingFont);

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
