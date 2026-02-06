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
  const parts = (p || "")
    .split(".")
    .map((x) => x.trim())
    .filter(Boolean);

  let cur: any = obj;
  for (const k of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

function toText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function normalizeKind(kind: string): TemplateKind {
  const s = safeString(kind).trim().toLowerCase();
  if (s === "sale" || s === "sales" || s === "vente") return "vente";
  return "capture";
}

function pickToken(obj: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    const hit = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase());
    if (hit) {
      const v = obj[hit];
      const s = safeString(v).trim();
      if (s) return s;
    }
  }
  return null;
}

function mergeTokens(base: TemplateTokens, override: TemplateTokens | null | undefined): TemplateTokens {
  if (!override || !isRecord(override)) return base;

  const out: TemplateTokens = structuredClone(base);
  for (const [k, v] of Object.entries(override)) {
    if (isRecord(v) && isRecord(out[k])) {
      out[k] = mergeTokens(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function cssVarsFromTokens(tokens: Tokens): string {
  const colors = tokens.colors || {};
  const typo = tokens.typography || {};
  const layout = tokens.layout || {};
  const radius = tokens.radius || {};
  const shadow = tokens.shadow || {};

  // Colors (support both new + legacy token keys)
  const accent =
    pickToken(colors, ["accent", "primary", "brand", "brandAccent", "primaryAccent"]) || "#2563eb";

  // Optional accents / tints used by some templates
  const accent2 =
    pickToken(colors, ["accent2", "secondaryAccent", "secondary", "brandSecondary"]) || accent;
  const soft =
    pickToken(colors, ["soft", "softBg", "soft_bg", "softBackground", "surfaceSoft"]) || "#f8fafc";
  const dark = pickToken(colors, ["dark", "darkText", "dark_text", "ink"]) || "#0b1220";

  const bg = pickToken(colors, ["bg", "background", "pageBg", "page_bg"]) || "#ffffff";

  // Many templates use "primaryText" / "secondaryText"
  const fg =
    pickToken(colors, ["fg", "text", "textColor", "text_color", "primaryText", "primary_text"]) ||
    "#0f172a";

  const muted =
    pickToken(colors, ["muted", "mutedText", "muted_text", "subtext", "secondaryText", "secondary_text"]) ||
    "#64748b";

  const border = pickToken(colors, ["border", "stroke", "line"]) || "#e2e8f0";

  const card = pickToken(colors, ["card", "surface", "panel", "panelBg", "panel_bg"]) || "#ffffff";
  const cardFg = pickToken(colors, ["cardFg", "cardText", "surfaceText", "panelText", "panel_text"]) || fg;

  const heroGrad1 = pickToken(colors, ["heroGrad1", "hero_grad_1", "gradient1"]) || "#eff6ff";
  const heroGrad2 = pickToken(colors, ["heroGrad2", "hero_grad_2", "gradient2"]) || "#ffffff";

  // Typography
  const headingFont =
    pickToken(typo, ["headingFont", "heading_font", "display", "titleFont", "fontHeading"]) ||
    "ui-sans-serif, system-ui";
  const bodyFont =
    pickToken(typo, ["bodyFont", "body_font", "textFont", "fontBody"]) || "ui-sans-serif, system-ui";

  // Sizes
  const bodySize = pickToken(typo, ["bodySize", "body_size", "fontSize", "font_size", "body"]) || "16px";
  const h1 = pickToken(typo, ["h1", "h1Size", "h1_size", "heroTitleSize", "display"]) || "42px";
  const lineHeight = pickToken(typo, ["lineHeight", "line_height", "leading"]) || "1.6";

  // Layout
  const maxw = pickToken(layout, ["maxWidth", "max_width", "containerWidth", "container_width"]) || "980px";
  const pad = pickToken(layout, ["sectionPadding", "section_padding", "pad", "padding"]) || "64px";
  const align = pickToken(layout, ["textAlign", "text_align", "align", "heroAlign"]) || "left";

  // Radius / shadows (templates-main expects card/button keys)
  const cardRadius = pickToken(radius, ["card", "cardRadius", "card_radius", "base", "radius", "r"]) || "16px";
  const btnRadius = pickToken(radius, ["button", "btn", "buttonRadius", "button_radius"]) || cardRadius;

  const cardShadow =
    pickToken(shadow, ["card", "cardShadow", "card_shadow", "base", "shadow"]) ||
    "0 12px 40px rgba(2, 6, 23, 0.08)";

  const vars: Record<string, string> = {
    "--tpt-accent": accent,
    "--tpt-accent2": accent2,
    "--tpt-soft": soft,
    "--tpt-dark": dark,

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

    "--tpt-h1": h1,

    "--tpt-maxw": maxw,
    "--tpt-pad": pad,
    "--tpt-section-pad": pad,
    "--tpt-text-align": align,
    "--tpt-align": align,

    "--tpt-card-radius": cardRadius,
    "--tpt-btn-radius": btnRadius,
    "--tpt-card-shadow": cardShadow,
  };

  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
}

async function readFileIfExists(p: string): Promise<string> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return "";
  }
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

function applyVariant(html: string, variantId: string | null | undefined): string {
  const v = safeString(variantId).trim();
  if (!v) return html;

  // Convention: templates may use [data-variant] hooks in CSS.
  // We inject a root attribute to enable variant-specific selectors.
  return html.replace(/<body([^>]*)>/i, (_m: string, attrs: string) => {
    return `<body${attrs} data-variant="${escapeHtml(v)}">`;
  });
}

function renderPlaceholders(templateHtml: string, contentData: Record<string, any>): string {
  // Replace {{path.to.value}} with escaped text.
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
          },
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

// ✅ IMPORTANT: retourne { html } (et pas une string brute)
export async function renderTemplateHtml(req: RenderTemplateRequest): Promise<{ html: string }> {
  const kind = normalizeKind(req.kind);
  const mode: RenderMode = req.mode === "kit" ? "kit" : "preview";
  const templateId = normalizeTemplateId(req.templateId, kind);

  const root = process.cwd();
  const tplDir = path.join(root, "src", "templates", kind, templateId);

  const [html, css, kitCss, tokensStr] = await Promise.all([
    readFileIfExists(path.join(tplDir, "index.html")),
    readFileIfExists(path.join(tplDir, "styles.css")),
    readFileIfExists(path.join(tplDir, "styles.kit.css")),
    readFileIfExists(path.join(tplDir, "tokens.json")),
  ]);

  if (!html) {
    const fallback = wrapAsDocument({
      htmlBody: `<div style="font-family:system-ui;padding:24px">Template introuvable: ${escapeHtml(
        `${kind}/${templateId}`,
      )}</div>`,
      styleCss: "",
      cssVars: "",
      mode,
    });
    return { html: fallback };
  }

  let tokens: Tokens = {};
  try {
    const parsed = tokensStr ? (JSON.parse(tokensStr) as any) : {};
    tokens = (parsed || {}) as Tokens;
  } catch {
    tokens = {};
  }

  const merged = mergeTokens(tokens as any, req.brandTokens || null) as Tokens;
  const cssVars = cssVarsFromTokens(merged);

  let out = html;

  // repeaters first so placeholders inside blocks are expanded
  out = renderRepeaters(out, req.contentData);

  // then simple placeholders
  out = renderPlaceholders(out, req.contentData);

  // apply variant hooks
  out = applyVariant(out, req.variantId);

  const styleCss = mode === "kit" ? kitCss || css : css;

  const doc = wrapAsDocument({
    htmlBody: out,
    styleCss,
    cssVars,
    mode,
  });

  return { html: doc };
}
