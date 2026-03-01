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
//
// 2026-02: Added renderConditionals (<!-- IF key -->...<!-- ENDIF key -->)
//          + escapeHtml encodes non-ASCII chars as &#xxx; for Systeme.io compat.

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

/**
 * Escape HTML special chars + encode non-ASCII to &#xxx; HTML entities.
 * This ensures accents (é, è, ê, à…) render correctly in Systeme.io
 * which may re-encode the page with a different charset.
 */
function escapeHtml(s: string): string {
  let out = (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  // Encode any non-ASCII character as &#codepoint;
  out = out.replace(/[^\x00-\x7F]/g, (ch) => "&#" + ch.codePointAt(0) + ";");
  return out;
}

// Allows {{a.b.c}} and {{arr.0.field}} placeholders.
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

/**
 * Conditional blocks: <!-- IF key -->...<!-- ENDIF key -->
 * If contentData[key] is truthy (non-empty string, non-empty array), keep the block.
 * Otherwise, remove it entirely.
 */
function renderConditionals(html: string, contentData: Record<string, any>): string {
  return html.replace(
    /<!--\s*IF\s+([a-zA-Z0-9_.]+)\s*-->([\s\S]*?)<!--\s*ENDIF\s+\1\s*-->/g,
    (_m, key, block) => {
      const val = getByPath(contentData, key);
      const hasValue = Array.isArray(val) ? val.length > 0 : !!toText(val).trim();
      return hasValue ? block : "";
    }
  );
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
  const body = args.mode === "kit" ? `<div class="tpt-scope">${args.htmlBody}</div>` : args.htmlBody;

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
    pickFirstNonEmpty(contentData.top_notice_text, "Ce template de page de capture est 100% offert !")
  );
  const topNoticeLinkText = escapeHtml(
    pickFirstNonEmpty(contentData.top_notice_link_text, "Cliquez ici pour le télécharger >>")
  );

  out = replaceAll(out, "Ce template de page de capture est 100% offert !", topNoticeText);
  out = replaceAll(out, "Cliquez ici pour le télécharger >>", topNoticeLinkText);

  // --- Logo (both header + footer use "VOTRE LOGO") ---
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
  const heroPrefix = escapeHtml(pickFirstNonEmpty(contentData.hero_title_prefix, "Rédige ici ta "));
  const heroH1 = escapeHtml(
    pickFirstNonEmpty(
      contentData.hero_title_highlight1,
      contentData.hero_highlight_1,
      contentData.hero_title, // fallback (legacy)
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
  const heroBetween2 = escapeHtml(pickFirstNonEmpty(contentData.hero_title_between2, " pour ton "));
  const heroH3 = escapeHtml(
    pickFirstNonEmpty(contentData.hero_title_highlight3, contentData.hero_highlight_3, "audience cible")
  );

  out = replaceAll(out, "Rédige ici ta ", heroPrefix);
  out = replaceAll(out, "promesse de valeur unique", heroH1);
  out = replaceAll(out, ", en une phrase claire qui exprime un ", heroBetween1);
  out = replaceAll(out, "bénéfice concret", heroH2);
  out = replaceAll(out, " pour ton ", heroBetween2);
  out = replaceAll(out, "audience cible", heroH3);

  // --- Video overlay lines ---
  const v1 = escapeHtml(pickFirstNonEmpty(contentData.video_line1, "Télécharge"));
  const v2 = escapeHtml(pickFirstNonEmpty(contentData.video_line2, "ce template"));
  const v3 = escapeHtml(pickFirstNonEmpty(contentData.video_line3, "offert"));

  out = replaceAll(out, "Télécharge", v1);
  out = replaceAll(out, "ce template", v2);
  out = replaceAll(out, "offert", v3);

  // --- Benefits section title ---
  const benefitsTitle = escapeHtml(
    pickFirstNonEmpty(contentData.benefits_title, contentData.section_title, "Explique ce que propose ton freebie")
  );
  out = replaceAll(out, "Explique ce que propose ton freebie", benefitsTitle);

  // --- Benefits (3 cards) ---
  const benefitsArr = Array.isArray(contentData.benefits) ? contentData.benefits : [];
  if (benefitsArr.length >= 3) {
    let idx = 0;
    out = out.replace(/<p class="benefit-text">([\s\S]*?)<\/p>/g, (m0) => {
      const val = benefitsArr[idx++];
      if (typeof val !== "string" || !val.trim()) return m0;
      return `<p class="benefit-text">\n${escapeHtml(val.trim())}\n                </p>`;
    });
  }

  // --- About section ---
  const aboutLabel = escapeHtml(pickFirstNonEmpty(contentData.about_label, "Présenté par :"));
  const aboutName = escapeHtml(pickFirstNonEmpty(contentData.about_name, contentData.author_name, "Nom Prénom"));
  const aboutStory = escapeHtml(pickFirstNonEmpty(contentData.about_story, ""));

  out = replaceAll(out, "Présenté par :", aboutLabel);
  out = replaceAll(out, "Nom Prénom", aboutName);

  if (aboutStory) {
    out = out.replace(
      /<p class="about-description">([\s\S]*?)<\/p>/,
      `<p class="about-description">\n                ${aboutStory}\n            </p>`
    );
  }

  // --- Footer text ---
  const footerText = escapeHtml(pickFirstNonEmpty(contentData.footer_text, ""));
  if (footerText) {
    out = out.replace(
      /<p class="footer-text">([\s\S]*?)<\/p>/,
      `<p class="footer-text">\n            ${footerText}\n        </p>`
    );
  }

  return out;
}

/**
 * Escape a JSON string for safe embedding inside a <script> tag.
 * Prevents `</script>` and `<!--` from breaking out of the tag.
 */
function escapeForScriptTag(s: string): string {
  return s.replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
}

/**
 * For vente (sales) templates that are full standalone HTML documents,
 * inject a <script> before </body> that replaces demo text with actual
 * contentData values using CSS selectors from a companion selectors.json file.
 *
 * This avoids modifying each template's HTML while still enabling dynamic content.
 */
function injectVenteContentScript(
  html: string,
  contentData: Record<string, any>,
  selectors: Record<string, any>,
): string {
  if (!contentData || Object.keys(contentData).length === 0) return html;

  const dataJson = escapeForScriptTag(JSON.stringify(contentData));
  const selectorsJson = escapeForScriptTag(JSON.stringify(selectors));

  const script = `<script>(function(){
var d=${dataJson};
var m=${selectorsJson};
if(!d)return;
var sf=m.string||{};
Object.keys(sf).forEach(function(k){
  var v=d[k];
  if(v==null||v==='')return;
  document.querySelectorAll(sf[k]).forEach(function(el){el.textContent=String(v);});
});
var af=m.arrays||{};
Object.keys(af).forEach(function(k){
  var arr=d[k];
  var cfg=af[k];
  if(!Array.isArray(arr)||!arr.length){
    /* Array is empty or missing: hide the parent section that contains these items */
    if(cfg&&cfg.itemSelector){
      var emptyItems=document.querySelectorAll(cfg.itemSelector);
      if(emptyItems.length>0){
        var sec=emptyItems[0].closest('section')||emptyItems[0].closest('[class*="section"]');
        if(sec)sec.style.display='none';
      }
    }
    return;
  }
  var items=document.querySelectorAll(cfg.itemSelector);
  if(!items.length)return;
  if(typeof arr[0]==='string'){
    for(var i=0;i<items.length;i++){
      if(i<arr.length)items[i].textContent=arr[i];
      else items[i].style.display='none';
    }
    for(var j=items.length;j<arr.length;j++){
      var cl=items[0].cloneNode(true);
      cl.textContent=arr[j];
      items[0].parentElement.appendChild(cl);
    }
    return;
  }
  var parent=items[0].parentElement;
  if(!parent)return;
  var tpl=items[0].cloneNode(true);
  for(var i=items.length-1;i>=0;i--)items[i].remove();
  arr.forEach(function(item){
    var clone=tpl.cloneNode(true);
    var ff=cfg.fields||{};
    Object.keys(ff).forEach(function(fk){
      var sub=clone.querySelector(ff[fk]);
      if(sub&&item[fk]!=null)sub.textContent=String(item[fk]);
    });
    parent.appendChild(clone);
  });
});
/* Inject payment URL into CTA buttons (href="#" → actual URL) */
var payUrl=d.cta_url||d.cta_primary_url||d.payment_url||'';
if(payUrl){
  document.querySelectorAll('a[href="#"],a[href="#capture"],.cta-button,.cta-primary,.btn-primary,button[class*="cta"]').forEach(function(el){
    if(el.tagName==='A')el.setAttribute('href',payUrl);
    else{var wrap=el.closest('a');if(wrap)wrap.setAttribute('href',payUrl);}
  });
}
/* Inject legal URLs into footer links (href="#" on footer/legal elements) */
var legalMap={'mentions':d.legal_mentions_url,'cgv':d.legal_cgv_url,'privacy':d.legal_privacy_url,'confidentialit':d.legal_privacy_url};
document.querySelectorAll('footer a[href="#"], .footer a[href="#"], .footer-links a[href="#"]').forEach(function(el){
  var t=(el.textContent||'').toLowerCase();
  for(var k in legalMap){if(t.indexOf(k)>=0&&legalMap[k]){el.setAttribute('href',legalMap[k]);el.setAttribute('target','_blank');break;}}
});
/* Hide empty bonus sections: if no bonus data provided, hide the entire section */
var bonusKeys=['bonuses','bonuses_detailed','bonus_items','bonus_list'];
var hasBonusData=false;
for(var i=0;i<bonusKeys.length;i++){
  var bv=d[bonusKeys[i]];
  if(Array.isArray(bv)&&bv.length>0){hasBonusData=true;break;}
}
if(!hasBonusData){
  var bk=Object.keys(d);
  for(var i=0;i<bk.length;i++){
    if(/^bonus/i.test(bk[i])&&typeof d[bk[i]]==='string'&&d[bk[i]].trim()){hasBonusData=true;break;}
  }
}
if(!hasBonusData){
  document.querySelectorAll('.bonus-section,.bonus-grid,.bonus-intro,.bonus-details,.bonus-teaser,.bonus-recap-section,.bonus-offer,.super-bonus,section.bonus,[class*="bonus-section"]').forEach(function(el){
    var sec=el.closest('section')||el.closest('[class*="section"]')||el;
    sec.style.display='none';
  });
}
/* Hide empty countdown/timer sections: if no countdown data provided, hide */
var countdownKeys=['countdown_label','countdown_date','countdown_end','timer_label','timer_text','counter_label'];
var hasCountdown=false;
for(var i=0;i<countdownKeys.length;i++){
  if(d[countdownKeys[i]]&&String(d[countdownKeys[i]]).trim()){hasCountdown=true;break;}
}
if(!hasCountdown){
  document.querySelectorAll('.countdown,.timer,.sticky-timer,.timer-countdown,[class*="countdown"],[class*="sticky-timer"]').forEach(function(el){
    var sec=el.closest('section')||el.closest('.header-bar')||el.closest('[class*="section"]')||el;
    sec.style.display='none';
  });
}
})()</script>`;

  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html + script;
  return html.slice(0, idx) + "\n" + script + "\n" + html.slice(idx);
}

/**
 * Export attendu par les routes API : renderTemplateHtml
 */
export async function renderTemplateHtml(req: RenderTemplateRequest): Promise<{ html: string }> {
  const kind = normalizeKind(req.kind);
  const mode: RenderMode = req.mode === "kit" ? "kit" : "preview";
  const templateId = normalizeTemplateId(req.templateId, kind);

  const root = process.cwd();
  const tplDir = path.join(root, "src", "templates", kind, templateId);

  const [html, css, kitCss, tokensStr, fontsHtml, selectorsStr] = await Promise.all([
    readFileIfExists(path.join(tplDir, mode === "kit" ? "kit-systeme.html" : "layout.html")),
    readFileIfExists(path.join(tplDir, "styles.css")),
    readFileIfExists(path.join(tplDir, "styles.kit.css")),
    readFileIfExists(path.join(tplDir, "tokens.json")),
    readFileIfExists(path.join(tplDir, "fonts.html")),
    readFileIfExists(path.join(tplDir, "selectors.json")),
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

  // 1) conditionals first (remove absent sections before expanding)
  out = renderConditionals(out, req.contentData);

  // 2) repeaters (so placeholders inside blocks are expanded)
  out = renderRepeaters(out, req.contentData);

  // 3) simple placeholders
  out = renderPlaceholders(out, req.contentData);

  // 4) apply variant hooks
  out = applyVariant(out, req.variantId);

  // 5) apply static replacements (premium raw HTML templates like capture-01)
  out = applyStaticTemplateReplacements({
    kind,
    templateId,
    html: out,
    contentData: req.contentData || {},
  });

  const isFullDoc = looksLikeFullHtmlDocument(out);

  // If it's a full standalone HTML doc, do NOT wrap it again.
  if (isFullDoc) {
    // For any full-doc template with selectors.json: inject contentData via script
    // This covers vente templates AND capture templates (capture-02 to 05) that
    // don't use {{placeholder}} syntax.
    if (selectorsStr && req.contentData && Object.keys(req.contentData).length > 0) {
      try {
        const selectors = JSON.parse(selectorsStr);
        out = injectVenteContentScript(out, req.contentData, selectors);
      } catch { /* ignore parse errors */ }
    }

    // Inject brand CSS variables into full-doc templates (colors, fonts, etc.)
    if (cssVars) {
      const brandStyle = `<style>:root{${cssVars}}</style>`;
      if (out.includes("</head>")) {
        out = out.replace("</head>", `${brandStyle}\n</head>`);
      } else if (out.includes("<body")) {
        out = out.replace("<body", `${brandStyle}\n<body`);
      }
    }

    // Inject contrast safety CSS to prevent white-on-light issues
    out = injectContrastSafety(out);

    // Inject legal footer if legal URLs are present in contentData
    out = injectLegalFooterHtml(out, req.contentData);

    return { html: out };
  }

  const styleCss = mode === "kit" ? kitCss || css : css;

  // Inject legal footer for wrapped templates
  out = injectLegalFooterHtml(out, req.contentData);

  let doc = wrapAsDocument({
    htmlBody: out,
    styleCss,
    cssVars,
    mode,
    headHtml: fontsHtml || "",
  });

  // Inject contrast safety CSS
  doc = injectContrastSafety(doc);

  return { html: doc };
}

/**
 * Backward-compat : certains endroits appellent déjà renderTemplate(...)
 * → on garde un alias sans casser l'existant.
 */
export const renderTemplate = renderTemplateHtml;

// ---------- Contrast safety ----------

/**
 * Inject a small CSS snippet that ensures text readability.
 * Prevents white text on light backgrounds by adding text-shadow fallbacks
 * and ensuring section contrast is maintained.
 */
function injectContrastSafety(html: string): string {
  const css = `<style>
/* Contrast safety - prevent unreadable text */
.section-light, .section-white, .section-cream,
[class*="section-light"], [class*="bg-light"], [class*="bg-white"] {
  color: #1c1c1c !important;
}
.section-light *, .section-white *, .section-cream * {
  color: inherit;
}
.section-light .gold-text, .section-light .accent-text,
.section-white .gold-text, .section-cream .gold-text {
  color: #b8941f !important;
}
.section-dark, .section-dark * { color: #fff; }
.section-dark .gold-text { color: #dcc285 !important; }
/* Ensure buttons/CTAs always have contrast */
.btn-primary, .cta-primary, [class*="btn-primary"], [class*="cta-button"], button[class*="cta"] {
  text-shadow: none;
}
/* Spacing safety - prevent blocks glued to CTA buttons */
.cta-button, .cta-primary, .btn-primary, [class*="cta-button"], [class*="btn-primary"],
a[class*="cta"], button[class*="cta"] {
  margin-top: 24px !important;
  margin-bottom: 24px !important;
}
/* Ensure sections have breathing room */
section + section, [class*="section"] + [class*="section"] {
  margin-top: 0; /* Let padding handle it */
}
section, [class*="section"] {
  padding-top: 60px;
  padding-bottom: 60px;
}
</style>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${css}\n</head>`);
  }
  return html + css;
}

// ---------- Legal footer injection ----------

/**
 * Inject legal footer links into rendered HTML if contentData has legal URLs.
 */
function injectLegalFooterHtml(html: string, contentData: Record<string, any>): string {
  const links: string[] = [];

  const mentionsUrl = contentData?.legal_mentions_url;
  const cgvUrl = contentData?.legal_cgv_url;
  const privacyUrl = contentData?.legal_privacy_url;

  // Also check footer_links array (object form with text+href)
  const footerLinks = contentData?.footer_links;
  if (Array.isArray(footerLinks) && footerLinks.length > 0) {
    for (const l of footerLinks) {
      if (l?.href && l?.text) {
        links.push(`<a href="${safeString(l.href)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,0.7);text-decoration:underline">${safeString(l.text)}</a>`);
      }
    }
  } else {
    if (mentionsUrl) links.push(`<a href="${safeString(mentionsUrl)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,0.7);text-decoration:underline">Mentions légales</a>`);
    if (cgvUrl) links.push(`<a href="${safeString(cgvUrl)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,0.7);text-decoration:underline">CGV</a>`);
    if (privacyUrl) links.push(`<a href="${safeString(privacyUrl)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,0.7);text-decoration:underline">Politique de confidentialité</a>`);
  }

  if (links.length === 0) return html;

  const footer = `<div style="text-align:center;padding:20px 16px;font-size:12px;font-family:system-ui,sans-serif;background:#1c1c1c;color:rgba(255,255,255,0.5);border-top:1px solid rgba(255,255,255,0.1)">${links.join(" &nbsp;|&nbsp; ")}</div>`;

  const bodyIdx = html.lastIndexOf("</body>");
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + footer + "\n" + html.slice(bodyIdx);
  }
  return html + footer;
}