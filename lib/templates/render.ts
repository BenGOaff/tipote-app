// lib/templates/render.ts
// Template renderer for Tipote HTML previews + Systeme.io kits.
// Reads template fragments from /src/templates and injects contentData into {{placeholders}}.
//
// IMPORTANT:
// - Templates are trusted local files.
// - Content is user-generated -> we escape HTML.
// - "Kit" output must be safe to paste into Systeme.io without breaking the host page,
//   so we scope styles under a wrapper (".tpt-scope").

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
    out.typography = { ...(out.typography || {}), bodyFont: brandTokens.bodyFont };
  return out;
}

/**
 * Minimal Mustache-like features:
 * - {{key}} replaced by escaped scalar
 * - {{#arr}}...{{/arr}} repeats inner HTML for each item:
 *   - scalar arrays: use {{.}}
 *   - object arrays: use {{key}} inside the section
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
          .map((item) => {
            // Support arrays of scalars (string/number) and arrays of objects.
            if (item != null && typeof item === "object" && !Array.isArray(item)) {
              let out = inner;

              // {{.}} fallback for objects -> empty
              out = out.replace(/\{\{\s*\.\s*\}\}/g, "");

              // Replace {{key}} inside the section with item[key]
              out = out.replace(
                /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
                (_mm: string, k: string) =>
                  escapeHtml((item as Record<string, unknown>)[k])
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

function buildFontLink(tokens: Tokens) {
  const heading = String(tokens.typography?.headingFont || "").toLowerCase();
  const body = String(tokens.typography?.bodyFont || "").toLowerCase();
  const ff = `${heading} ${body}`;

  if (ff.includes("poppins")) {
    return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">`;
  }

  if (ff.includes("nunito") || ff.includes("noto serif")) {
    return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@300;400;600;700;800;900&family=Noto+Serif:wght@400;600;700;800&display=swap" rel="stylesheet">`;
  }

  if (ff.includes("raleway")) {
    return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">`;
  }

  if (
    ff.includes("work sans") ||
    ff.includes("worksans") ||
    ff.includes("noto sans") ||
    ff.includes("caveat")
  ) {
    return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&family=Noto+Sans:wght@300;400;500;600;700;800;900&family=Work+Sans:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">`;
  }

  if (ff.includes("roboto")) {
    return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap" rel="stylesheet">`;
  }

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
  text-align:var(--tpt-align);
  background:
    radial-gradient(900px 600px at 50% -55%, rgba(37,99,235,0.20), transparent 70%),
    radial-gradient(900px 600px at 10% 0%, rgba(37,99,235,0.10), transparent 65%);
}

${scope}.hero.capture-01 .container{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
}

${scope}.hero.capture-01 .eyebrow{
  display:inline-flex;
  padding:8px 12px;
  border-radius:999px;
  font-weight:700;
  font-size:12px;
  letter-spacing:0.1em;
  text-transform:uppercase;
  background:rgba(37,99,235,0.10);
  color:var(--tpt-accent);
  border:1px solid rgba(37,99,235,0.18);
}

${scope}.hero.capture-01 h1{
  margin:18px auto 12px auto;
  font-family:${headingFont};
  font-weight:900;
  font-size:${h1};
  line-height:1.05;
  max-width:18ch;
}

${scope}.hero.capture-01 .subtitle{
  margin:0 auto 26px auto;
  max-width:70ch;
  color:var(--tpt-muted);
  font-weight:500;
}

${scope}.hero.capture-01 .benefits{
  margin: 0 auto 26px auto;
  display:grid;
  gap:10px;
  max-width:720px;
  text-align:left;
}

${scope}.hero.capture-01 .benefit{
  display:flex;
  gap:12px;
  align-items:flex-start;
  padding:12px 14px;
  border-radius:14px;
  border:1px solid var(--tpt-border);
  background:rgba(255,255,255,0.7);
  box-shadow:0 10px 30px rgba(0,0,0,0.04);
}

${scope}.hero.capture-01 .dot{
  margin-top:6px;
  width:10px;
  height:10px;
  border-radius:999px;
  background:var(--tpt-accent);
  box-shadow:0 10px 20px rgba(37,99,235,0.25);
  flex:0 0 auto;
}

${scope}.hero.capture-01 .form-preview,
${scope}.hero.capture-01 .systeme-form{
  margin: 0 auto;
  max-width: 520px;
  border-radius: var(--tpt-card-radius);
  box-shadow: var(--tpt-card-shadow);
  padding: 16px;
  background: white;
  border: 1px solid var(--tpt-border);
  display:flex;
  gap:10px;
}

${scope}.hero.capture-01 .form-preview input{
  flex:1;
  height:48px;
  border-radius:12px;
  border:1px solid var(--tpt-border);
  padding:0 14px;
}

${scope}.hero.capture-01 .form-preview button{
  height:48px;
  padding:0 18px;
  border-radius: var(--tpt-btn-radius);
  border: 1px solid rgba(37,99,235,0.25);
  background: var(--tpt-accent);
  color: white;
  font-weight:800;
  cursor:not-allowed;
}

${scope}.hero.capture-01 .systeme-form{
  display:block;
  text-align:left;
  color:var(--tpt-muted);
}

${scope}.hero.capture-01 .micro-proof{
  margin: 14px auto 0 auto;
  max-width: 68ch;
  color: var(--tpt-muted);
  font-size: 14px;
}

@media (max-width: 900px){
  ${scope}.hero.capture-01 h1{font-size:36px}
  ${scope}.hero.capture-01 .benefits{text-align:left}
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
  padding:10px 14px;
  border-radius:999px;
  font-weight:800;
  font-size:12px;
  letter-spacing:0.12em;
  text-transform:uppercase;
  background:rgba(221,12,20,0.10);
  color:var(--tpt-accent);
  border:1px solid rgba(221,12,20,0.22);
}

${scope}.hero.capture-02 h1{
  margin:20px auto 10px auto;
  font-family:${headingFont};
  font-weight:900;
  font-size:${h1};
  line-height:1.05;
  max-width: 20ch;
  color:var(--tpt-text);
}

${scope}.hero.capture-02 h1 .accent{
  display:inline-block;
  padding: 0.08em 0.28em;
  border-radius: 12px;
  background: rgba(221,12,20,0.10);
  color: var(--tpt-accent);
  border:1px solid rgba(221,12,20,0.18);
}

${scope}.hero.capture-02 .subtitle{
  margin:0 auto 24px auto;
  max-width:70ch;
  color:var(--tpt-muted);
  font-weight:500;
}

${scope}.hero.capture-02 .grid{
  width:100%;
  margin: 0 auto;
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:18px;
  align-items:stretch;
  max-width: 980px;
}

${scope}.hero.capture-02 .card{
  background:white;
  border:1px solid var(--tpt-border);
  border-radius: var(--tpt-card-radius);
  box-shadow: var(--tpt-card-shadow);
  padding:16px;
  text-align:left;
}

${scope}.hero.capture-02 .video{
  min-height: 260px;
  border-radius: 16px;
  border:1px dashed rgba(0,0,0,0.15);
  background: linear-gradient(180deg, rgba(221,12,20,0.06), rgba(221,12,20,0.02));
  display:flex;
  align-items:center;
  justify-content:center;
  color:var(--tpt-muted);
  font-weight:700;
}

${scope}.hero.capture-02 .bullets{
  margin:0;
  padding:0;
  list-style:none;
  display:grid;
  gap:10px;
}

${scope}.hero.capture-02 .bullets li{
  display:flex;
  align-items:flex-start;
  gap:12px;
  background: rgba(0,0,0,0.02);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 14px;
  padding: 10px 12px;
}

${scope}.hero.capture-02 .dot{
  width: 10px;
  height: 10px;
  border-radius:999px;
  background: var(--tpt-accent);
  box-shadow: 0 10px 20px rgba(221,12,20,0.25);
  margin-top: 6px;
  flex: 0 0 auto;
}

${scope}.hero.capture-02 .systeme-form{
  display:block;
  margin-top: 14px;
  color:var(--tpt-muted);
}

${scope}.hero.capture-02 .cta{
  margin-top: 14px;
  display:flex;
  gap:10px;
}

${scope}.hero.capture-02 .cta input{
  flex:1;
  height:48px;
  border-radius:12px;
  border:1px solid var(--tpt-border);
  padding:0 14px;
}

${scope}.hero.capture-02 .cta button{
  height:48px;
  border-radius: var(--tpt-btn-radius);
  border:1px solid rgba(221,12,20,0.25);
  background: var(--tpt-accent);
  color:white;
  padding:0 16px;
  font-weight:900;
  cursor:not-allowed;
}

${scope}.hero.capture-02 .reassurance{
  margin: 14px auto 0 auto;
  max-width: 70ch;
  font-size: 14px;
  color: var(--tpt-muted);
}

${scope}.hero.capture-02 .dark{
  width:100%;
  margin: 44px auto 0 auto;
  max-width: 980px;
  border-radius: 24px;
  padding: 22px 22px;
  background: var(--tpt-dark);
  color: white;
  text-align:left;
  box-shadow: 0 18px 60px rgba(0,0,0,0.22);
}

${scope}.hero.capture-02 .dark h2{
  margin:0 0 8px 0;
  font-family:${headingFont};
  font-weight:900;
  letter-spacing:-0.02em;
}

${scope}.hero.capture-02 .dark p{
  margin:0;
  opacity:0.85;
}

@media (max-width: 980px){
  ${scope}.hero.capture-02 .grid{grid-template-columns: 1fr}
  ${scope}.hero.capture-02 h1{font-size:38px}
  ${scope}.hero.capture-02 .cta{flex-direction:column}
  ${scope}.hero.capture-02 .cta button{width:100%}
}
`.trim();
}

function buildCapture03Css(tokens: Tokens, opts?: { scoped?: boolean }): string {
  const scoped = !!opts?.scoped;
  const scope = scoped ? ".tpt-scope " : "";

  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const bg = colors.background || "#ffffff";
  const primary = colors.primaryText || "#020817";
  const secondary = colors.secondaryText || "#4b5563";
  const accent = colors.accent || "#2a80ff";
  const border = colors.border || "#e1e7ef";
  const soft = (colors as any).softBackground || "#f1f5f9";

  const headingFont =
    typo.headingFont ||
    '"Noto Serif", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
  const bodyFont =
    typo.bodyFont ||
    '"Nunito Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';

  const h1 = typo.h1 || "44px";
  const body = typo.body || "16px";
  const lineHeight = typo.lineHeight || "1.7";

  const maxWidth = layout.maxWidth || "1040px";
  const sectionPadding = layout.sectionPadding || "86px 24px";
  const textAlign = layout.textAlign || "center";

  const cardRadius = radius.card || "20px";
  const buttonRadius = radius.button || "16px";

  const cardShadow = shadow.card || "0 14px 40px rgba(0,0,0,0.10)";

  return `
:root{
  --tpt-bg:${bg};
  --tpt-soft:${soft};
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

${scope}.hero.capture-03{
  width:100%;
  padding:var(--tpt-section-pad);
  background:
    radial-gradient(900px 520px at 50% -25%, rgba(42,128,255,0.18), rgba(42,128,255,0) 65%),
    radial-gradient(860px 520px at 10% 10%, rgba(223,231,241,0.9), rgba(223,231,241,0) 60%);
}

${scope}.capture-03 .container{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
  text-align:var(--tpt-align);
}

${scope}.capture-03 .date-pill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:10px;
  padding:10px 16px;
  border-radius:999px;
  background:rgba(255,255,255,0.85);
  border:1px solid var(--tpt-border);
  box-shadow:0 10px 30px rgba(0,0,0,0.05);
  color:var(--tpt-text);
  font-weight:800;
  letter-spacing:0.2px;
  margin-bottom:18px;
}

${scope}.capture-03 h1{
  margin:0 auto 14px auto;
  max-width: 18ch;
  font-family:${headingFont};
  font-weight:800;
  font-size:${h1};
  line-height:1.08;
  color:var(--tpt-text);
}

${scope}.capture-03 .subtitle{
  margin:0 auto 26px auto;
  max-width: 70ch;
  color:var(--tpt-muted);
  font-weight:600;
}

${scope}.capture-03 .form-card{
  width:100%;
  max-width: 560px;
  margin: 0 auto 18px auto;
  background:rgba(255,255,255,0.92);
  border:1px solid var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  box-shadow:var(--tpt-card-shadow);
  padding:18px 18px 16px 18px;
  text-align:left;
}

${scope}.capture-03 .consent{
  display:flex;
  align-items:flex-start;
  gap:10px;
  color:var(--tpt-muted);
  font-size:14px;
  margin: 0 0 12px 0;
}
${scope}.capture-03 .consent input{
  margin-top:3px;
  width:16px;
  height:16px;
  accent-color: var(--tpt-accent);
}

${scope}.capture-03 .cta{
  display:flex;
  gap:10px;
}
${scope}.capture-03 .cta input{
  flex:1;
  height:48px;
  border-radius:12px;
  border:1px solid var(--tpt-border);
  padding:0 14px;
  font-size:15px;
}
${scope}.capture-03 .cta button{
  height:48px;
  border-radius:var(--tpt-btn-radius);
  padding:0 16px;
  border:1px solid rgba(42,128,255,0.25);
  background: linear-gradient(180deg, rgba(42,128,255,1), rgba(98,151,255,1));
  color:white;
  font-weight:900;
  cursor:pointer;
  white-space:nowrap;
  box-shadow: 0 14px 34px rgba(42,128,255,0.35);
}
${scope}.capture-03 .cta button:disabled{
  opacity:0.7;
  cursor:not-allowed;
}

${scope}.capture-03 .micro{
  margin:0;
  text-align:center;
  font-size:14px;
  color:var(--tpt-muted);
}

${scope}.capture-03 .section{
  width:100%;
  padding: 64px 24px;
  background: var(--tpt-soft);
  border-top:1px solid var(--tpt-border);
}

${scope}.capture-03 .section .inner{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
  text-align:left;
  display:grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap:28px;
}

${scope}.capture-03 .section h2{
  margin:0 0 12px 0;
  font-family:${headingFont};
  font-weight:800;
  font-size:28px;
  line-height:1.15;
}

${scope}.capture-03 .list{
  margin:0;
  padding:0;
  list-style:none;
  display:grid;
  gap:12px;
}

${scope}.capture-03 .list li{
  display:flex;
  gap:12px;
  align-items:flex-start;
  background: rgba(255,255,255,0.85);
  border:1px solid var(--tpt-border);
  border-radius:16px;
  padding:12px 14px;
}

${scope}.capture-03 .dot{
  margin-top:6px;
  width:10px;
  height:10px;
  border-radius:999px;
  background: var(--tpt-accent);
  box-shadow: 0 8px 16px rgba(42,128,255,0.35);
  flex:0 0 auto;
}

${scope}.capture-03 .aside{
  background: rgba(255,255,255,0.92);
  border:1px solid var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  padding:18px;
  box-shadow: var(--tpt-card-shadow);
}

${scope}.capture-03 .aside h3{
  margin:0 0 8px 0;
  font-weight:900;
}

${scope}.capture-03 .aside p{
  margin:0;
  color:var(--tpt-muted);
}

${scope}.capture-03 .footer-cta{
  margin-top:18px;
  display:flex;
  justify-content:flex-start;
}
${scope}.capture-03 .footer-cta .btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height:46px;
  padding:0 18px;
  border-radius:var(--tpt-btn-radius);
  background: var(--tpt-text);
  color:white;
  text-decoration:none;
  font-weight:900;
}

@media (max-width: 900px){
  ${scope}.capture-03 h1{font-size:38px}
  ${scope}.capture-03 .section .inner{grid-template-columns: 1fr}
  ${scope}.capture-03 .form-card{text-align:left}
  ${scope}.capture-03 .cta{flex-direction:column}
  ${scope}.capture-03 .cta button{width:100%}
}
`.trim();
}

function buildCapture04Css(tokens: Tokens, opts?: { scoped?: boolean }): string {
  const scoped = !!opts?.scoped;
  const scope = scoped ? ".tpt-scope " : "";

  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const bg = colors.background || "#ffffff";
  const primary = colors.primaryText || "#000b1f";
  const secondary = colors.secondaryText || "#4b5563";
  const accent = colors.accent || "#f36843";
  const border = colors.border || "#eaeaea";
  const soft = (colors as any).softBackground || "#f1f5f9";

  const headingFont =
    typo.headingFont ||
    "Raleway, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const bodyFont =
    typo.bodyFont ||
    "Raleway, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";

  const h1 = typo.h1 || "48px";
  const body = typo.body || "16px";
  const lineHeight = typo.lineHeight || "1.65";

  const maxWidth = layout.maxWidth || "1040px";
  const sectionPadding = layout.sectionPadding || "92px 24px";
  const textAlign = layout.textAlign || "center";

  const cardRadius = radius.card || "22px";
  const buttonRadius = radius.button || "16px";

  const cardShadow = shadow.card || "0 18px 60px rgba(0,0,0,0.12)";

  return `
:root{
  --tpt-bg:${bg};
  --tpt-soft:${soft};
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

${scope}.hero.capture-04{
  width:100%;
  padding:var(--tpt-section-pad);
  text-align:var(--tpt-align);
  background:
    radial-gradient(900px 520px at 50% -30%, rgba(243,104,67,0.22), rgba(243,104,67,0) 60%),
    radial-gradient(820px 520px at 10% 12%, rgba(0,0,0,0.06), rgba(0,0,0,0) 60%);
}

${scope}.capture-04 .container{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
}

${scope}.capture-04 .badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:10px;
  padding:10px 16px;
  border-radius:999px;
  background:rgba(255,255,255,0.88);
  border:1px solid var(--tpt-border);
  box-shadow:0 10px 30px rgba(0,0,0,0.06);
  font-weight:800;
  letter-spacing:0.2px;
  color:var(--tpt-text);
  margin-bottom:18px;
}

${scope}.capture-04 h1{
  margin:0 auto 14px auto;
  max-width: 19ch;
  font-family:${headingFont};
  font-weight:900;
  font-size:${h1};
  line-height:1.06;
  color:var(--tpt-text);
}

${scope}.capture-04 h1 .accent{
  color:var(--tpt-accent);
}

${scope}.capture-04 .subtitle{
  margin:0 auto 28px auto;
  max-width: 72ch;
  color:var(--tpt-muted);
  font-weight:600;
}

${scope}.capture-04 .form-card{
  width:100%;
  max-width: 560px;
  margin: 0 auto 14px auto;
  background:rgba(255,255,255,0.94);
  border:1px solid var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  box-shadow:var(--tpt-card-shadow);
  padding:18px;
  text-align:left;
}

${scope}.capture-04 .cta{
  display:flex;
  gap:10px;
}
${scope}.capture-04 .cta input{
  flex:1;
  height:50px;
  border-radius:14px;
  border:1px solid var(--tpt-border);
  padding:0 14px;
  font-size:15px;
}
${scope}.capture-04 .cta button{
  height:50px;
  border-radius:var(--tpt-btn-radius);
  padding:0 18px;
  border:1px solid rgba(243,104,67,0.35);
  background: linear-gradient(180deg, rgba(243,104,67,1), rgba(243,104,67,0.88));
  color:white;
  font-weight:900;
  cursor:pointer;
  white-space:nowrap;
  box-shadow: 0 18px 44px rgba(243,104,67,0.35);
}
${scope}.capture-04 .cta button:disabled{
  opacity:0.7;
  cursor:not-allowed;
}

${scope}.capture-04 .micro{
  margin: 0 auto;
  max-width: 70ch;
  color:var(--tpt-muted);
  font-size:14px;
}

${scope}.capture-04 .section{
  width:100%;
  padding: 58px 24px 76px 24px;
  background: var(--tpt-soft);
  border-top:1px solid var(--tpt-border);
}

${scope}.capture-04 .section .inner{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
  text-align:left;
}

${scope}.capture-04 .section h2{
  margin:0 0 10px 0;
  font-family:${headingFont};
  font-weight:900;
  font-size:28px;
  line-height:1.15;
}

${scope}.capture-04 .section p{
  margin:0 0 18px 0;
  color:var(--tpt-muted);
  font-weight:600;
}

${scope}.capture-04 .features{
  margin:0;
  padding:0;
  list-style:none;
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap:14px;
}

${scope}.capture-04 .feature{
  background: rgba(255,255,255,0.92);
  border: 1px solid var(--tpt-border);
  border-radius: 18px;
  padding: 14px 14px;
  box-shadow: 0 14px 40px rgba(0,0,0,0.06);
  display:flex;
  gap:12px;
  align-items:flex-start;
}

${scope}.capture-04 .dot{
  margin-top:6px;
  width:10px;
  height:10px;
  border-radius:999px;
  background: var(--tpt-accent);
  box-shadow: 0 10px 20px rgba(243,104,67,0.35);
  flex:0 0 auto;
}

${scope}.capture-04 .feature .t{
  font-weight:800;
  color:var(--tpt-text);
}
${scope}.capture-04 .feature .d{
  margin-top:4px;
  color:var(--tpt-muted);
  font-weight:600;
  font-size:14px;
}

@media (max-width: 980px){
  ${scope}.capture-04 h1{font-size:40px}
  ${scope}.capture-04 .cta{flex-direction:column}
  ${scope}.capture-04 .cta button{width:100%}
  ${scope}.capture-04 .features{grid-template-columns:1fr}
}
`.trim();
}

function buildCapture05Css(tokens: Tokens, opts?: { scoped?: boolean }): string {
  const scoped = !!opts?.scoped;
  const scope = scoped ? ".tpt-scope " : "";

  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const bg = colors.background || "#ffffff";
  const primary = colors.primaryText || "#003049";
  const secondary = colors.secondaryText || "rgba(0,48,73,0.70)";
  const accent = colors.accent || "#c1121f";
  const accent2 = (colors as any).accent2 || "#7ed321";
  const border = colors.border || "rgba(0,0,0,0.10)";
  const soft = (colors as any).softBackground || "rgba(102,155,188,0.20)";

  const headingFont =
    typo.headingFont ||
    "Poppins, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const bodyFont =
    typo.bodyFont ||
    "Roboto, ui-sans-serif, system-ui, -apple-system, Segoe UI, Poppins, Helvetica, Arial";

  const h1 = typo.h1 || "54px";
  const body = typo.body || "16px";
  const lineHeight = typo.lineHeight || "1.7";

  const maxWidth = layout.maxWidth || "1040px";
  const sectionPadding = layout.sectionPadding || "92px 24px";
  const textAlign = layout.textAlign || "center";

  const cardRadius = radius.card || "22px";
  const buttonRadius = radius.button || "16px";

  const cardShadow = shadow.card || "0 18px 60px rgba(0,0,0,0.12)";

  return `
:root{
  --tpt-bg:${bg};
  --tpt-soft:${soft};
  --tpt-text:${primary};
  --tpt-muted:${secondary};
  --tpt-accent:${accent};
  --tpt-accent2:${accent2};
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

${scope}.hero.capture-05{
  width:100%;
  padding:var(--tpt-section-pad);
  text-align:var(--tpt-align);
  background:
    radial-gradient(900px 520px at 50% -30%, rgba(193,18,31,0.16), rgba(193,18,31,0) 60%),
    radial-gradient(820px 520px at 10% 12%, rgba(102,155,188,0.22), rgba(102,155,188,0) 60%);
}

${scope}.capture-05 .container{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
}

${scope}.capture-05 .badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:10px;
  padding:10px 16px;
  border-radius:999px;
  background:rgba(255,255,255,0.90);
  border:1px solid rgba(193,18,31,0.25);
  box-shadow:0 10px 30px rgba(0,0,0,0.06);
  font-weight:900;
  letter-spacing:0.24px;
  color:var(--tpt-text);
  margin-bottom:18px;
  font-family:${headingFont};
}

${scope}.capture-05 h1{
  margin:0 auto 14px auto;
  max-width: 20ch;
  font-family:${headingFont};
  font-weight:950;
  font-size:${h1};
  line-height:1.04;
  color:var(--tpt-text);
}

${scope}.capture-05 h1 .accent{
  color:var(--tpt-accent);
  display:inline-block;
}

${scope}.capture-05 .subtitle{
  margin:0 auto 26px auto;
  max-width: 72ch;
  color:var(--tpt-muted);
  font-weight:600;
}

${scope}.capture-05 .form-card{
  width:100%;
  max-width: 560px;
  margin: 0 auto 14px auto;
  background:rgba(255,255,255,0.94);
  border:1px solid rgba(0,48,73,0.10);
  border-radius:var(--tpt-card-radius);
  box-shadow:var(--tpt-card-shadow);
  padding:18px;
  text-align:left;
}

${scope}.capture-05 .cta{
  display:flex;
  gap:10px;
}
${scope}.capture-05 .cta input{
  flex:1;
  height:50px;
  border-radius:14px;
  border:1px solid rgba(0,48,73,0.14);
  padding:0 14px;
  font-size:15px;
}
${scope}.capture-05 .cta button{
  height:50px;
  border-radius:var(--tpt-btn-radius);
  padding:0 18px;
  border:1px solid rgba(193,18,31,0.30);
  background: linear-gradient(180deg, rgba(193,18,31,1), rgba(120,0,0,1));
  color:white;
  font-weight:950;
  cursor:pointer;
  white-space:nowrap;
  box-shadow: 0 18px 44px rgba(193,18,31,0.30);
}
${scope}.capture-05 .cta button:disabled{
  opacity:0.7;
  cursor:not-allowed;
}

${scope}.capture-05 .micro{
  margin: 0 auto;
  max-width: 70ch;
  color:var(--tpt-muted);
  font-size:14px;
}

${scope}.capture-05 .section{
  width:100%;
  padding: 58px 24px 76px 24px;
  background: rgba(102,155,188,0.12);
  border-top:1px solid rgba(0,48,73,0.08);
}

${scope}.capture-05 .section .inner{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
  text-align:left;
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:16px;
}

${scope}.capture-05 .section h2{
  margin:0 0 10px 0;
  font-family:${headingFont};
  font-weight:950;
  font-size:28px;
  line-height:1.15;
}

${scope}.capture-05 .section p{
  margin:0 0 18px 0;
  color:var(--tpt-muted);
  font-weight:600;
}

${scope}.capture-05 .cards{
  margin:0;
  padding:0;
  list-style:none;
  display:grid;
  gap:12px;
}

${scope}.capture-05 .card{
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(0,48,73,0.10);
  border-radius: 18px;
  padding: 14px 14px;
  box-shadow: 0 14px 40px rgba(0,0,0,0.06);
  display:flex;
  gap:12px;
  align-items:flex-start;
}

${scope}.capture-05 .dot{
  margin-top:6px;
  width:10px;
  height:10px;
  border-radius:999px;
  background: var(--tpt-accent2);
  box-shadow: 0 10px 20px rgba(126,211,33,0.28);
  flex:0 0 auto;
}

${scope}.capture-05 .card .t{
  font-weight:900;
  color:var(--tpt-text);
}
${scope}.capture-05 .card .d{
  margin-top:4px;
  color:var(--tpt-muted);
  font-weight:600;
  font-size:14px;
}

@media (max-width: 980px){
  ${scope}.capture-05 h1{font-size:42px}
  ${scope}.capture-05 .cta{flex-direction:column}
  ${scope}.capture-05 .cta button{width:100%}
  ${scope}.capture-05 .section .inner{grid-template-columns:1fr}
}
`.trim();
}

function buildSale01Css(tokens: Tokens, opts?: { scoped?: boolean }): string {
  const scoped = !!opts?.scoped;
  const scope = scoped ? ".tpt-scope " : "";

  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const bg = colors.background || "#0b0b0d";
  const primary = colors.primaryText || "#ffffff";
  const secondary = colors.secondaryText || "rgba(255,255,255,0.75)";
  const accent = colors.accent || "#00adef";
  const accent2 = (colors as any).accent2 || "#ff5210";
  const border = colors.border || "rgba(255,255,255,0.15)";
  const panel = (colors as any).panel || "rgba(255,255,255,0.06)";
  const panel2 = (colors as any).panel2 || "rgba(0,0,0,0.55)";

  const headingFont =
    typo.headingFont ||
    "Roboto, ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial";
  const bodyFont =
    typo.bodyFont ||
    "Roboto, ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial";

  const h1 = typo.h1 || "56px";
  const h2 = typo.h2 || "34px";
  const body = typo.body || "16px";
  const lineHeight = typo.lineHeight || "1.65";

  const maxWidth = layout.maxWidth || "1120px";
  const sectionPadding = layout.sectionPadding || "96px 24px";

  const cardRadius = radius.card || "22px";
  const buttonRadius = radius.button || "14px";

  const cardShadow = shadow.card || "0 22px 70px rgba(0,0,0,0.55)";

  return `
:root{
  --tpt-bg:${bg};
  --tpt-text:${primary};
  --tpt-muted:${secondary};
  --tpt-accent:${accent};
  --tpt-accent2:${accent2};
  --tpt-border:${border};
  --tpt-panel:${panel};
  --tpt-panel2:${panel2};
  --tpt-card-radius:${cardRadius};
  --tpt-btn-radius:${buttonRadius};
  --tpt-card-shadow:${cardShadow};
  --tpt-maxw:${maxWidth};
  --tpt-section-pad:${sectionPadding};
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

${scope}.sale-01 a{color:inherit}
${scope}.sale-01 .container{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
}
${scope}.sale-01 .nav{
  position:sticky;
  top:0;
  z-index:50;
  background: rgba(0,0,0,0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
${scope}.sale-01 .nav-inner{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  padding:12px 0;
}
${scope}.sale-01 .nav-badge{
  display:inline-flex;
  padding:8px 12px;
  border-radius:999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  font-weight:900;
  letter-spacing:0.22px;
  font-size:13px;
}
${scope}.sale-01 .nav-links{
  display:flex;
  gap:18px;
  flex-wrap:wrap;
  justify-content:center;
}
${scope}.sale-01 .nav-links a{
  text-decoration:none;
  opacity:0.8;
  font-weight:800;
  font-size:14px;
}
${scope}.sale-01 .nav-links a:hover{opacity:1}
${scope}.sale-01 .nav-cta{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height:38px;
  padding:0 14px;
  border-radius:999px;
  background: var(--tpt-accent);
  color: #000;
  text-decoration:none;
  font-weight:950;
  letter-spacing:0.02em;
}

${scope}.sale-01 .hero{
  width:100%;
  padding: var(--tpt-section-pad);
  background:
    radial-gradient(900px 520px at 50% -35%, rgba(0,173,239,0.22), rgba(0,173,239,0) 60%),
    radial-gradient(860px 520px at 10% 10%, rgba(255,82,16,0.14), rgba(255,82,16,0) 62%);
}
${scope}.sale-01 .hero-grid{
  display:grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 26px;
  align-items:start;
}
${scope}.sale-01 .pill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:10px 14px;
  border-radius:999px;
  font-weight:900;
  letter-spacing:0.24px;
  background: rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.14);
}
${scope}.sale-01 h1{
  margin:18px 0 12px 0;
  font-family:${headingFont};
  font-weight:950;
  font-size:${h1};
  line-height:1.02;
  letter-spacing:-0.02em;
}
${scope}.sale-01 .hero-sub{
  margin:0 0 16px 0;
  color: var(--tpt-muted);
  font-weight:600;
  max-width: 70ch;
}
${scope}.sale-01 .hero-quote{
  margin-top: 14px;
  padding: 14px 16px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 18px;
  font-weight:650;
  color: rgba(255,255,255,0.86);
}
${scope}.sale-01 .stats{
  margin-top: 16px;
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 12px;
}
${scope}.sale-01 .stat{
  padding: 14px;
  border-radius: 18px;
  background: var(--tpt-panel);
  border: 1px solid rgba(255,255,255,0.10);
}
${scope}.sale-01 .stat .n{
  font-weight:950;
  font-size: 22px;
}
${scope}.sale-01 .stat .d{
  margin-top:4px;
  color: rgba(255,255,255,0.72);
  font-size: 13px;
  font-weight:700;
}

${scope}.sale-01 .order{
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: var(--tpt-card-radius);
  box-shadow: var(--tpt-card-shadow);
  padding: 18px;
  position:sticky;
  top: 82px;
}
${scope}.sale-01 .order h2{
  margin: 0 0 10px 0;
  font-family:${headingFont};
  font-weight:950;
  font-size: 20px;
}
${scope}.sale-01 .price{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
}
${scope}.sale-01 .price .now{
  font-weight:950;
  font-size: 32px;
  color: rgba(255,255,255,0.98);
}
${scope}.sale-01 .price .old{
  font-weight:900;
  color: rgba(255,255,255,0.65);
  text-decoration: line-through;
}
${scope}.sale-01 .order .btn{
  margin-top: 12px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:100%;
  height: 50px;
  border-radius: var(--tpt-btn-radius);
  background: linear-gradient(180deg, rgba(0,173,239,1), rgba(1,200,203,1));
  color:#001018;
  text-decoration:none;
  font-weight:950;
  border: 1px solid rgba(0,173,239,0.28);
}
${scope}.sale-01 .order .micro{
  margin: 10px 0 0 0;
  color: rgba(255,255,255,0.70);
  font-size: 13px;
  line-height:1.55;
}

${scope}.sale-01 .section{
  padding: 76px 24px;
}
${scope}.sale-01 .section.alt{
  background: rgba(255,255,255,0.03);
  border-top: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
${scope}.sale-01 h2.section-title{
  margin:0 0 12px 0;
  font-family:${headingFont};
  font-weight:950;
  font-size:${h2};
  letter-spacing:-0.01em;
}
${scope}.sale-01 .lead{
  margin:0 0 20px 0;
  color: rgba(255,255,255,0.72);
  font-weight:600;
  max-width: 88ch;
}
${scope}.sale-01 .grid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 14px;
}
${scope}.sale-01 .card{
  background: var(--tpt-panel);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 22px;
  padding: 16px;
}
${scope}.sale-01 .card .k{
  font-weight:950;
  margin-bottom: 6px;
}
${scope}.sale-01 .card .d{
  color: rgba(255,255,255,0.72);
  font-weight:600;
}
${scope}.sale-01 .agenda{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 14px;
}
${scope}.sale-01 .day{
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 24px;
  padding: 16px;
}
${scope}.sale-01 .day .top{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:12px;
  margin-bottom: 10px;
}
${scope}.sale-01 .day .n{
  font-weight:950;
  color: rgba(255,255,255,0.96);
}
${scope}.sale-01 .day .date{
  font-weight:900;
  color: rgba(255,255,255,0.65);
}
${scope}.sale-01 .day .title{
  font-weight:950;
  margin: 8px 0 10px 0;
  color: rgba(255,255,255,0.96);
}
${scope}.sale-01 .bullets{
  margin:0;
  padding:0;
  list-style:none;
  display:grid;
  gap:10px;
}
${scope}.sale-01 .bullets li{
  display:flex;
  gap:12px;
  align-items:flex-start;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 16px;
  padding: 10px 12px;
}
${scope}.sale-01 .dot{
  margin-top:6px;
  width:10px;
  height:10px;
  border-radius:999px;
  background: var(--tpt-accent2);
  box-shadow: 0 10px 20px rgba(255,82,16,0.22);
  flex:0 0 auto;
}
${scope}.sale-01 .testimonials{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 14px;
}
${scope}.sale-01 .t-card{
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 22px;
  padding: 16px;
}
${scope}.sale-01 .t-card .q{
  margin:0 0 12px 0;
  color: rgba(255,255,255,0.86);
  font-weight:650;
}
${scope}.sale-01 .t-card .a{
  font-weight:950;
}
${scope}.sale-01 .t-card .r{
  margin-top:2px;
  color: rgba(255,255,255,0.68);
  font-weight:700;
  font-size: 14px;
}

${scope}.sale-01 .guarantee{
  background: rgba(0,0,0,0.58);
  color: white;
  border-radius: 26px;
  padding: 22px;
  border: 1px solid rgba(0,173,239,0.22);
  box-shadow: 0 22px 70px rgba(0,0,0,0.45);
}
${scope}.sale-01 .guarantee h3{
  margin:0 0 10px 0;
  font-family:${headingFont};
  font-weight:950;
}
${scope}.sale-01 .guarantee p{margin:0; opacity:0.86}

${scope}.sale-01 .order-form{
  margin-top: 14px;
  border-radius: 18px;
  border: 1px dashed rgba(255,255,255,0.22);
  padding: 14px;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.72);
  text-align:left;
  font-weight:650;
}

${scope}.sale-01 .footer{
  padding: 34px 24px 56px 24px;
  color: rgba(255,255,255,0.60);
  font-size: 13px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
${scope}.sale-01 .footer a{opacity:0.9}
${scope}.sale-01 .footer a:hover{opacity:1}

@media (max-width: 1040px){
  ${scope}.sale-01 .hero-grid{grid-template-columns: 1fr}
  ${scope}.sale-01 .order{position:relative; top:auto}
  ${scope}.sale-01 h1{font-size:44px}
  ${scope}.sale-01 .grid{grid-template-columns: 1fr}
  ${scope}.sale-01 .agenda{grid-template-columns: 1fr}
  ${scope}.sale-01 .testimonials{grid-template-columns: 1fr}
  ${scope}.sale-01 .nav-links{display:none}
}
`.trim();
}

function buildSale02Css(tokens: Tokens, opts?: { scoped?: boolean }): string {
  const scoped = !!opts?.scoped;
  const scope = scoped ? ".tpt-scope " : "";

  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  const bg = colors.background || "#fbf9f3";
  const primary = colors.primaryText || "#1f170b";
  const secondary = colors.secondaryText || "rgba(31,23,11,0.72)";
  const accent = colors.accent || "#dcc285";
  const accent2 = (colors as any).accent2 || "#02b13a";
  const border = colors.border || "rgba(0,0,0,0.10)";
  const panel = (colors as any).panel || "rgba(255,255,255,0.88)";
  const panel2 = (colors as any).panel2 || "rgba(31,23,11,0.06)";
  const dark = (colors as any).darkBackground || "#011e0f";

  const headingFont =
    typo.headingFont ||
    "Work Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const bodyFont =
    typo.bodyFont ||
    "Noto Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";

  const h1 = typo.h1 || "54px";
  const h2 = typo.h2 || "34px";
  const body = typo.body || "16px";
  const lineHeight = typo.lineHeight || "1.75";

  const maxWidth = layout.maxWidth || "1120px";
  const sectionPadding = layout.sectionPadding || "96px 24px";

  const cardRadius = radius.card || "22px";
  const buttonRadius = radius.button || "14px";

  const cardShadow = shadow.card || "0 22px 70px rgba(0,0,0,0.12)";

  return `
:root{
  --tpt-bg:${bg};
  --tpt-text:${primary};
  --tpt-muted:${secondary};
  --tpt-accent:${accent};
  --tpt-accent2:${accent2};
  --tpt-border:${border};
  --tpt-panel:${panel};
  --tpt-panel2:${panel2};
  --tpt-dark:${dark};
  --tpt-card-radius:${cardRadius};
  --tpt-btn-radius:${buttonRadius};
  --tpt-card-shadow:${cardShadow};
  --tpt-maxw:${maxWidth};
  --tpt-section-pad:${sectionPadding};
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

${scope}.sale-02 a{color:inherit}
${scope}.sale-02 .container{width:100%; max-width:var(--tpt-maxw); margin:0 auto}
${scope}.sale-02 .pill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:10px;
  padding:10px 16px;
  border-radius:999px;
  background: rgba(255,255,255,0.78);
  border:1px solid rgba(220,194,133,0.45);
  box-shadow: 0 14px 34px rgba(0,0,0,0.08);
  font-weight:900;
  letter-spacing:0.22px;
}
${scope}.sale-02 .pill .scribble{
  font-family: Caveat, ${headingFont};
  font-weight:700;
  font-size: 1.18em;
  color: var(--tpt-accent2);
}

${scope}.sale-02 .nav{
  position:sticky;
  top:0;
  z-index:50;
  background: rgba(251,249,243,0.75);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
${scope}.sale-02 .nav-inner{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  padding:14px 0;
}
${scope}.sale-02 .nav-links{
  display:flex;
  gap:18px;
  flex-wrap:wrap;
  justify-content:center;
}
${scope}.sale-02 .nav-links a{
  font-weight:800;
  font-size: 14px;
  text-decoration:none;
  opacity:0.82;
}
${scope}.sale-02 .nav-links a:hover{opacity:1}
${scope}.sale-02 .nav-cta{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height:40px;
  padding:0 14px;
  border-radius: 999px;
  background: var(--tpt-text);
  color: white;
  text-decoration:none;
  font-weight:900;
}

${scope}.sale-02 .hero{
  padding: var(--tpt-section-pad);
  background:
    radial-gradient(900px 560px at 50% -35%, rgba(220,194,133,0.38), rgba(220,194,133,0) 62%),
    radial-gradient(820px 520px at 10% 10%, rgba(2,177,58,0.10), rgba(2,177,58,0) 60%);
}
${scope}.sale-02 .hero-grid{
  display:grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 28px;
  align-items:start;
}
${scope}.sale-02 h1{
  margin: 18px 0 12px 0;
  font-family:${headingFont};
  font-weight: 950;
  font-size:${h1};
  line-height:1.02;
  letter-spacing:-0.02em;
}
${scope}.sale-02 .hero-sub{
  margin:0 0 18px 0;
  color: var(--tpt-muted);
  font-weight: 600;
  max-width: 70ch;
}
${scope}.sale-02 .hero-highlights{
  margin: 18px 0 0 0;
  padding:0;
  list-style:none;
  display:grid;
  gap:10px;
}
${scope}.sale-02 .hero-highlights li{
  display:flex;
  gap:12px;
  align-items:flex-start;
  background: var(--tpt-panel);
  border: 1px solid var(--tpt-border);
  border-radius: 18px;
  padding: 12px 14px;
  box-shadow: 0 18px 60px rgba(0,0,0,0.06);
}
${scope}.sale-02 .dot{
  margin-top:6px;
  width:10px;
  height:10px;
  border-radius:999px;
  background: var(--tpt-accent2);
  box-shadow: 0 10px 20px rgba(2,177,58,0.25);
  flex:0 0 auto;
}

${scope}.sale-02 .order{
  position:sticky;
  top:86px;
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(220,194,133,0.55);
  border-radius: var(--tpt-card-radius);
  box-shadow: var(--tpt-card-shadow);
  padding: 18px;
}
${scope}.sale-02 .price{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:12px;
  margin: 6px 0 10px 0;
}
${scope}.sale-02 .price .now{
  font-weight: 950;
  font-size: 34px;
  letter-spacing:-0.02em;
}
${scope}.sale-02 .price .old{
  font-weight: 900;
  color: rgba(31,23,11,0.55);
  text-decoration: line-through;
}
${scope}.sale-02 .order .cta{
  margin-top: 12px;
  display:flex;
  flex-direction:column;
  gap:10px;
}
${scope}.sale-02 .order .btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height: 48px;
  border-radius: var(--tpt-btn-radius);
  background: linear-gradient(180deg, rgba(2,177,58,1), rgba(1,146,50,1));
  color:white;
  text-decoration:none;
  font-weight:950;
  border: 1px solid rgba(2,177,58,0.35);
  box-shadow: 0 18px 44px rgba(2,177,58,0.25);
}
${scope}.sale-02 .order .micro{
  margin:0;
  color: rgba(31,23,11,0.62);
  font-size: 13px;
  line-height:1.55;
  text-align:center;
}

${scope}.sale-02 .section{
  padding: 76px 24px;
}
${scope}.sale-02 .section.alt{
  background: rgba(255,255,255,0.65);
  border-top: 1px solid rgba(0,0,0,0.06);
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
${scope}.sale-02 h2{
  margin:0 0 14px 0;
  font-family:${headingFont};
  font-weight:950;
  font-size:${h2};
  letter-spacing:-0.01em;
}
${scope}.sale-02 .lead{
  margin:0 0 22px 0;
  color: var(--tpt-muted);
  font-weight: 600;
  max-width: 80ch;
}
${scope}.sale-02 .grid-3{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 14px;
}
${scope}.sale-02 .card{
  background: var(--tpt-panel);
  border: 1px solid var(--tpt-border);
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 18px 60px rgba(0,0,0,0.06);
}
${scope}.sale-02 .card .k{
  font-weight:950;
  margin-bottom: 6px;
}
${scope}.sale-02 .card .d{
  color: var(--tpt-muted);
  font-weight:600;
}

${scope}.sale-02 .video{
  border-radius: 24px;
  overflow:hidden;
  border: 1px solid rgba(0,0,0,0.10);
  box-shadow: var(--tpt-card-shadow);
  background: #000;
}
${scope}.sale-02 video{display:block; width:100%; height:auto}

${scope}.sale-02 .agenda{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 14px;
}
${scope}.sale-02 .day{
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(220,194,133,0.45);
  border-radius: 22px;
  padding: 16px;
  box-shadow: 0 22px 70px rgba(0,0,0,0.08);
}
${scope}.sale-02 .day .top{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:12px;
  margin-bottom: 8px;
}
${scope}.sale-02 .day .n{
  font-weight:950;
  color: var(--tpt-text);
}
${scope}.sale-02 .day .date{
  font-weight:900;
  color: rgba(31,23,11,0.62);
}
${scope}.sale-02 .day .title{
  font-weight:950;
  margin: 8px 0 10px 0;
}
${scope}.sale-02 .bullets{
  margin:0;
  padding:0;
  list-style:none;
  display:grid;
  gap:10px;
}
${scope}.sale-02 .bullets li{
  display:flex;
  gap:12px;
  align-items:flex-start;
  background: var(--tpt-panel2);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 16px;
  padding: 10px 12px;
}

${scope}.sale-02 .testimonials{
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 14px;
}
${scope}.sale-02 .t-card{
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 22px;
  padding: 16px;
  box-shadow: 0 22px 70px rgba(0,0,0,0.08);
}
${scope}.sale-02 .t-card .q{
  margin:0 0 12px 0;
  font-weight:650;
  color: rgba(31,23,11,0.82);
}
${scope}.sale-02 .t-card .a{
  font-weight:950;
}
${scope}.sale-02 .t-card .r{
  margin-top:2px;
  color: rgba(31,23,11,0.62);
  font-weight:700;
  font-size: 14px;
}

${scope}.sale-02 .guarantee{
  background: var(--tpt-dark);
  color: white;
  border-radius: 26px;
  padding: 22px;
  box-shadow: 0 26px 80px rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.14);
}
${scope}.sale-02 .guarantee h3{
  margin:0 0 10px 0;
  font-family:${headingFont};
  font-weight:950;
}
${scope}.sale-02 .guarantee p{margin:0; opacity:0.86}

${scope}.sale-02 .order-form{
  margin-top: 14px;
  border-radius: 18px;
  border: 1px dashed rgba(0,0,0,0.18);
  padding: 14px;
  background: rgba(255,255,255,0.85);
  color: rgba(31,23,11,0.75);
  text-align:left;
  font-weight:650;
}

${scope}.sale-02 .footer{
  padding: 34px 24px 56px 24px;
  color: rgba(31,23,11,0.60);
  font-size: 13px;
}
${scope}.sale-02 .footer a{opacity:0.9}
${scope}.sale-02 .footer a:hover{opacity:1}

@media (max-width: 1040px){
  ${scope}.sale-02 .hero-grid{grid-template-columns: 1fr}
  ${scope}.sale-02 .order{position:relative; top:auto}
  ${scope}.sale-02 h1{font-size:44px}
  ${scope}.sale-02 .grid-3{grid-template-columns: 1fr}
  ${scope}.sale-02 .agenda{grid-template-columns: 1fr}
  ${scope}.sale-02 .testimonials{grid-template-columns: 1fr}
  ${scope}.sale-02 .nav-links{display:none}
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
  if (kind === "capture" && templateId === "capture-03") {
    css = buildCapture03Css(withBrand, { scoped: req.mode === "kit" });
  }
  if (kind === "capture" && templateId === "capture-04") {
    css = buildCapture04Css(withBrand, { scoped: req.mode === "kit" });
  }
  if (kind === "capture" && templateId === "capture-05") {
    css = buildCapture05Css(withBrand, { scoped: req.mode === "kit" });
  }
  if (kind === "vente" && templateId === "sale-01") {
    css = buildSale01Css(withBrand, { scoped: req.mode === "kit" });
  }
  if (kind === "vente" && templateId === "sale-02") {
    css = buildSale02Css(withBrand, { scoped: req.mode === "kit" });
  }

  const fontLink = buildFontLink(withBrand);

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
