// lib/templates/render.ts
// Template renderer for Tipote HTML previews + Systeme.io kits.
// Reads template fragments from /src/templates and injects contentData into {{placeholders}}.
// IMPORTANT: templates are treated as trusted local files, but content is user-generated -> we escape HTML.

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

  // Shallow overrides for known token groups
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

function renderPlaceholders(fragment: string, data: Record<string, unknown>) {
  return fragment.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    return escapeHtml(data[key]);
  });
}

function buildCapture01Css(tokens: Tokens): string {
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
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const bodyFont = typo.bodyFont || headingFont;

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

*{box-sizing:border-box}
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
  align-items:center;
  justify-content:center;
}

.hero.capture-01{
  width:100%;
  padding:var(--tpt-section-pad);
}

.hero.capture-01 .container{
  width:100%;
  max-width:var(--tpt-maxw);
  margin:0 auto;
  text-align:var(--tpt-align);
}

.hero.capture-01 .eyebrow{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:6px 12px;
  border-radius:999px;
  border:1px solid var(--tpt-border);
  color:var(--tpt-muted);
  font-weight:600;
  font-size:13px;
}

.hero.capture-01 h1{
  margin:14px 0 0 0;
  font-family:${headingFont};
  font-weight:800;
  letter-spacing:-0.02em;
  font-size:clamp(28px, 3.2vw, ${h1});
  line-height:1.15;
}

.hero.capture-01 .subtitle{
  margin:14px auto 0 auto;
  max-width:740px;
  color:var(--tpt-muted);
  font-size:clamp(15px, 1.2vw, 18px);
}

.hero.capture-01 .form-preview{
  margin:28px auto 0 auto;
  max-width:520px;
  display:flex;
  gap:10px;
  padding:14px;
  border:1px solid var(--tpt-border);
  border-radius:var(--tpt-card-radius);
  box-shadow:var(--tpt-card-shadow);
  background:#fff;
}

.hero.capture-01 .form-preview input{
  flex:1;
  border:1px solid var(--tpt-border);
  border-radius:12px;
  padding:12px 12px;
  font-size:15px;
  outline:none;
}

.hero.capture-01 .form-preview button{
  border:none;
  border-radius:var(--tpt-btn-radius);
  padding:12px 14px;
  font-weight:800;
  cursor:default;
  background:var(--tpt-accent);
  color:#fff;
  transition:transform .12s ease, filter .12s ease;
}

.hero.capture-01 .micro-proof{
  margin:14px auto 0 auto;
  max-width:620px;
  color:var(--tpt-muted);
  font-size:13px;
}

@media (max-width:560px){
  .hero.capture-01 .form-preview{flex-direction:column}
  .hero.capture-01 .form-preview button{width:100%}
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

  const renderedFragment = renderPlaceholders(fragment, req.contentData || {});

  // For now, template-specific CSS (Capture 01). Later: add styles.css per template.
  let css = "";
  if (kind === "capture" && templateId === "capture-01") {
    css = buildCapture01Css(withBrand);
  }

  const doc = `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tipote — ${escapeHtml(req.templateId)}</title>
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
