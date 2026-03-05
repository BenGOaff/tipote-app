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
import { mapUniversalToTemplate } from "./universalSchema";

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

  // locale for language-aware rendering (default "fr")
  locale?: string;
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
  locale?: string;
}): string {
  const body = args.mode === "kit" ? `<div class="tpt-scope">${args.htmlBody}</div>` : args.htmlBody;
  const lang = (args.locale || "fr").slice(0, 2);

  return `<!doctype html>
<html lang="${lang}">
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
    pickFirstNonEmpty(contentData.hook, contentData.hero_eyebrow, contentData.hero_kicker, "Affirmation choc qui capte l'attention ici")
  );
  out = replaceAll(out, "Affirmation choc qui capte l'attention ici", hook);

  // --- Hero title ---
  // The template has a complex multi-span hero title. When the AI generates a single hero_title
  // (universal schema), replace the entire <h1> content with that title.
  const heroTitle = pickFirstNonEmpty(contentData.hero_title, contentData.headline, "");
  if (heroTitle) {
    // Replace the entire hero title H1 content with the AI-generated title
    out = out.replace(
      /<h1 class="hero-title">([\s\S]*?)<\/h1>/,
      `<h1 class="hero-title">\n            ${escapeHtml(heroTitle)}\n        </h1>`
    );
  }

  // --- Video overlay lines ---
  // If user provided a video embed URL, the video container is replaced elsewhere.
  // Otherwise use the subtitle text or keep defaults.
  const heroSub = pickFirstNonEmpty(contentData.hero_subtitle, "");
  const v1 = escapeHtml(pickFirstNonEmpty(contentData.video_line1, heroSub ? "" : "Télécharge"));
  const v2 = escapeHtml(pickFirstNonEmpty(contentData.video_line2, heroSub || "ce template"));
  const v3 = escapeHtml(pickFirstNonEmpty(contentData.video_line3, heroSub ? "" : "offert"));

  if (v1) out = replaceAll(out, "Télécharge", v1);
  if (v2) out = replaceAll(out, "ce template", v2);
  if (v3) out = replaceAll(out, "offert", v3);

  // --- Benefits section title ---
  const benefitsTitle = escapeHtml(
    pickFirstNonEmpty(contentData.benefits_title, contentData.section_title, "Explique ce que propose ton freebie")
  );
  out = replaceAll(out, "Explique ce que propose ton freebie", benefitsTitle);

  // --- Benefits (cards) ---
  // Template has 3 cards by default; replace existing ones and clone for extra items
  const benefitsArr = Array.isArray(contentData.benefits) ? contentData.benefits : [];
  if (benefitsArr.length >= 1) {
    // Replace existing benefit card texts
    let idx = 0;
    out = out.replace(/<p class="benefit-text">([\s\S]*?)<\/p>/g, (m0) => {
      const val = benefitsArr[idx++];
      if (typeof val !== "string" || !val.trim()) return m0;
      return `<p class="benefit-text">\n${escapeHtml(val.trim())}\n                </p>`;
    });

    // If we have more benefits than template cards, add extra cards
    if (benefitsArr.length > 3) {
      const extraCards = benefitsArr.slice(3).map((b: string, i: number) => {
        if (typeof b !== "string" || !b.trim()) return "";
        return `<div class="benefit-card">
                <div class="benefit-number">${i + 4}</div>
                <p class="benefit-text">\n${escapeHtml(b.trim())}\n                </p>
            </div>`;
      }).filter(Boolean).join("\n            ");
      if (extraCards) {
        out = out.replace(
          /(<\/div>\s*<\/div>\s*<div style="text-align: center)/,
          `</div>\n            ${extraCards}\n        </div>\n\n        <div style="text-align: center`
        );
      }
    }
  }

  // --- About section ---
  const aboutLabel = escapeHtml(pickFirstNonEmpty(contentData.about_label, contentData.about_title, "Présenté par :"));
  const aboutName = escapeHtml(pickFirstNonEmpty(contentData.about_name, contentData.author_name, "Nom Prénom"));
  const aboutStory = escapeHtml(pickFirstNonEmpty(contentData.about_story, contentData.about_description, ""));

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
/* IMPORTANT: inject legal URLs FIRST so CTA replacement skips them */
var legalMap={'mentions':d.legal_mentions_url,'cgv':d.legal_cgv_url,'privacy':d.legal_privacy_url,'confidentialit':d.legal_privacy_url,'politique':d.legal_privacy_url};
document.querySelectorAll('footer a, .footer a, .footer-links a, [class*="footer"] a, [class*="legal"] a').forEach(function(el){
  var t=(el.textContent||'').toLowerCase();
  for(var k in legalMap){if(t.indexOf(k)>=0&&legalMap[k]){el.setAttribute('href',legalMap[k]);el.setAttribute('target','_blank');el.setAttribute('data-legal','1');break;}}
});
/* Inject payment URL into CTA buttons (href="#" → actual URL), skip legal links */
var payUrl=d.cta_url||d.cta_primary_url||d.payment_url||'';
if(payUrl){
  document.querySelectorAll('a[href="#"],a[href="#capture"],.cta-button,.cta-primary,.btn-primary,button[class*="cta"]').forEach(function(el){
    if(el.getAttribute('data-legal')==='1')return;
    if(el.closest('footer')||el.closest('[class*="footer"]')||el.closest('[class*="legal"]'))return;
    if(el.tagName==='A')el.setAttribute('href',payUrl);
    else{var wrap=el.closest('a');if(wrap&&wrap.getAttribute('data-legal')!=='1')wrap.setAttribute('href',payUrl);}
  });
}
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

  // Map universal contentData → template-specific fields using selectors.json
  let effectiveContentData = req.contentData;
  if (selectorsStr && req.contentData && Object.keys(req.contentData).length > 0) {
    try {
      const selectors = JSON.parse(selectorsStr);
      effectiveContentData = mapUniversalToTemplate(req.contentData, selectors);
    } catch { /* use original contentData */ }
  }

  let out = html;

  // 1) conditionals first (remove absent sections before expanding)
  out = renderConditionals(out, effectiveContentData);

  // 2) repeaters (so placeholders inside blocks are expanded)
  out = renderRepeaters(out, effectiveContentData);

  // 3) simple placeholders
  out = renderPlaceholders(out, effectiveContentData);

  // 4) apply variant hooks
  out = applyVariant(out, req.variantId);

  // 5) apply static replacements (premium raw HTML templates like capture-01)
  out = applyStaticTemplateReplacements({
    kind,
    templateId,
    html: out,
    contentData: effectiveContentData || {},
  });

  const isFullDoc = looksLikeFullHtmlDocument(out);

  // If it's a full standalone HTML doc, do NOT wrap it again.
  if (isFullDoc) {
    // For any full-doc template with selectors.json: inject contentData via script
    // This covers vente templates AND capture templates (capture-02 to 05) that
    // don't use {{placeholder}} syntax.
    if (selectorsStr && effectiveContentData && Object.keys(effectiveContentData).length > 0) {
      try {
        const selectors = JSON.parse(selectorsStr);
        out = injectVenteContentScript(out, effectiveContentData, selectors);
      } catch { /* ignore parse errors */ }
    }

    // Inject brand CSS variables AND override hardcoded colors in full-doc templates
    if (cssVars || req.brandTokens) {
      const brandOverrides = buildBrandOverrideCss(req.brandTokens);
      const brandFont = buildBrandFontImport(req.brandTokens);
      const brandStyle = `${brandFont}<style>:root{${cssVars}}${brandOverrides}</style>`;
      if (out.includes("</head>")) {
        out = out.replace("</head>", `${brandStyle}\n</head>`);
      } else if (out.includes("<body")) {
        out = out.replace("<body", `${brandStyle}\n<body`);
      }
    }

    // Inject contrast safety CSS to prevent white-on-light issues
    out = injectContrastSafety(out);

    // Replace hardcoded template placeholder text with actual content
    out = replaceHardcodedTemplatePlaceholders(out, effectiveContentData);

    // Inject FAQ styling
    out = injectFaqStyling(out);

    // Inject inline capture form for capture pages (email + name + privacy checkbox)
    if (kind === "capture") {
      out = injectInlineCaptureForm(out, effectiveContentData);
    }

    // Inject legal footer if legal URLs are present in contentData
    out = injectLegalFooterHtml(out, effectiveContentData);

    // Final sanitization pass: strip ALL remaining placeholders from HTML
    out = sanitizeHtmlPlaceholders(out, effectiveContentData);

    return { html: out };
  }

  const styleCss = mode === "kit" ? kitCss || css : css;
  // Add brand font import for wrapped templates
  const brandFontHtml = buildBrandFontImport(req.brandTokens);
  const brandOverrideCss = buildBrandOverrideCss(req.brandTokens);

  // Inject inline capture form for capture pages
  if (kind === "capture") {
    out = injectInlineCaptureForm(out, effectiveContentData);
  }

  // Inject legal footer for wrapped templates
  out = injectLegalFooterHtml(out, effectiveContentData);

  let doc = wrapAsDocument({
    htmlBody: out,
    styleCss: styleCss + "\n" + brandOverrideCss,
    cssVars,
    mode,
    headHtml: (fontsHtml || "") + brandFontHtml,
  });

  // Inject contrast safety CSS
  doc = injectContrastSafety(doc);

  // Replace hardcoded template placeholder text
  doc = replaceHardcodedTemplatePlaceholders(doc, effectiveContentData);

  // Inject FAQ styling
  doc = injectFaqStyling(doc);

  // Final sanitization pass: strip ALL remaining placeholders from HTML
  doc = sanitizeHtmlPlaceholders(doc, effectiveContentData);

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

// ---------- Hardcoded template text replacement ----------

/**
 * Replace hardcoded placeholder text in templates with actual content data.
 * Covers all known hardcoded strings across all templates.
 */
function replaceHardcodedTemplatePlaceholders(html: string, contentData: Record<string, any>): string {
  let out = html;
  const offerName = safeString(contentData.offer_name || contentData.hero_title || contentData.challenge_name || "");
  const logoText = safeString(contentData.logo_text || contentData.site_name || offerName || "");
  const authorName = safeString(contentData.about_name || contentData.author_name || "");
  const contactEmail = safeString(contentData.contact_email || "");

  // sale-05: "SYSTEME.IO ACADÉMIE", "BUNDLE SYSTÈME.IO", "BONUS 2 : MONÉTISE SYSTÈME.IO"
  if (logoText) {
    out = out.replace(/BUNDLE SYSTÈME\.IO/g, logoText.toUpperCase());
    out = out.replace(/SYSTÈME\.IO ACADÉMIE/g, logoText.toUpperCase());
    out = out.replace(/MONÉTISE SYSTÈME\.IO/g, logoText.toUpperCase());
    out = out.replace(/SYSTEME\.IO ACADÉMIE/g, logoText.toUpperCase());
  }

  // sale-07: "[Nom de ta méthode]"
  if (offerName) {
    out = out.replace(/\[Nom de ta méthode\]/g, escapeHtml(offerName));
  }

  // Generic: replace any remaining [Placeholder text] patterns
  out = out.replace(/\[Nom [^\]]*\]/g, offerName ? escapeHtml(offerName) : "");
  out = out.replace(/\[Titre [^\]]*\]/g, "");
  out = out.replace(/\[Votre [^\]]*\]/g, "");

  // Replace "Nom Prénom" placeholder with actual author name
  if (authorName && authorName !== "Nom Prénom") {
    out = out.replace(/(?<![a-zA-ZÀ-ÿ])Nom\s+(?:et\s+)?Pr[eé]nom(?![a-zA-ZÀ-ÿ])/g, escapeHtml(authorName));
  }

  // Replace "votresite.com" / "contact@votresite.com" / "VotreSite.com" with actual data
  if (contactEmail) {
    out = out.replace(/contact@votresite\.com/gi, escapeHtml(contactEmail));
  }
  // Replace standalone "votresite.com" / "VotreSite.com"
  const siteReplacement = contactEmail ? contactEmail.split("@")[1] || "" : logoText || "";
  if (siteReplacement) {
    out = out.replace(/(?:www\.)?(?:V|v)otre(?:S|s)ite\.com/g, escapeHtml(siteReplacement));
  }

  // capture-01: "VOTRE LOGO", "VOTRE BASELINE ICI" — already handled by applyCapture01Replacements
  // capture-02: "VotreSite.com" — also handled above now

  // Replace placeholder text for images/icons
  const authorPhoto = contentData.author_photo_url || contentData.about_img_url || contentData.trainer_img_url || "";
  if (authorPhoto) {
    // Replace img src placeholders with actual photo
    out = out.replace(
      /(<img[^>]*class="[^"]*(?:author|trainer|coach|expert|speaker|profile|about|photo)[^"]*"[^>]*src=["'])([^"']*)(['"][^>]*>)/gi,
      `$1${safeString(authorPhoto)}$3`
    );
  }

  // Replace remaining "[Photo ...]" text with empty (will be handled by CSS/layout)
  out = out.replace(/>\s*\[(?:Photo|Image|Icône|Icon|Ta photo)[^\]]*\]\s*</g, "><");

  return out;
}

// ---------- Post-render HTML placeholder sanitization ----------

/**
 * Aggressively strip ALL remaining placeholder/instruction text from the final HTML.
 * This is the last line of defense: runs on the full HTML after all rendering.
 * Handles text that templates hardcode and that selectors.json missed.
 */
function sanitizeHtmlPlaceholders(html: string, contentData: Record<string, any>): string {
  let out = html;

  // 1. Strip [bracketed placeholder] patterns from visible text
  //    But preserve [href] or [class] attributes inside HTML tags
  out = out.replace(/>([^<]*)\[(?:Icône|Icon|Photo|Image|Ta photo|Ton nom|Nom|Prénom|Titre|Bénéfice|Audience|Logo|Votre)[^\]]*\]([^<]*)</g, ">$1$2<");

  // 2. Strip "Lorem ipsum" text blocks (but not inside attributes)
  out = out.replace(/>([^<]*?)Lorem ipsum[^<]*/g, (match, before) => `>${before}`);
  out = out.replace(/>([^<]*?)Dolor sit amet[^<]*/g, (match, before) => `>${before}`);

  // 3. Strip challenge/template-specific instruction text
  const INSTRUCTION_PATTERNS = [
    /Exercice du jour \d+/g,
    /Objectif du challenge/g,
    /Puce promesse (?:irrésistible|avec bénéfice)[^<]*/g,
    /(?:bénéfice|Bénéfice) \+ (?:conséquence|Conséquence)[^<]*/g,
    /(?:Décris|Explique) (?:ici|ce que|ton|ta|les)[^<]*/g,
    /\bOption \d+ : Explique[^<]*/g,
    /Description de l'?(?:exercice|objectif|étape|jour)[^<]*/g,
  ];
  for (const pat of INSTRUCTION_PATTERNS) {
    out = out.replace(pat, "");
  }

  // 4. Replace photo placeholder <img> tags with actual branding photo
  const authorPhotoUrl = contentData.about_img_url || contentData.author_photo_url || contentData.brand_author_photo_url || "";
  if (authorPhotoUrl) {
    // Replace img tags that have placeholder alt text
    out = out.replace(
      /<img([^>]*?)(?:alt=["'](?:Photo|Ta photo|Photo professionnelle|Photo de|Votre photo|Photo représent)[^"']*["'])([^>]*?)(?:src=["'][^"']*["'])?([^>]*?)>/gi,
      `<img$1 alt="Photo" $2 src="${safeString(authorPhotoUrl)}" $3>`
    );
    // Also replace images with placeholder src (data:, placeholder.com, etc.)
    out = out.replace(
      /<img([^>]*?)src=["'](?:data:image\/[^;]+;base64,[^"']*|https?:\/\/(?:via\.placeholder|placehold)[^"']*)["']([^>]*?)>/gi,
      `<img$1 src="${safeString(authorPhotoUrl)}" $2>`
    );
  }

  // 5. Hide sections that only contain placeholder text (empty after stripping)
  //    Look for elements that became empty and add display:none
  out = out.replace(/<(?:h[1-6]|p|span|li|div)([^>]*)>\s*<\/(?:h[1-6]|p|span|li|div)>/g, (match, attrs) => {
    // Don't hide elements with specific functional classes
    if (attrs && /(tipote-|cta-|btn-|form|capture|footer)/.test(attrs)) return match;
    return match.replace(">", ' style="display:none">');
  });

  // 6. Strip remaining {{mustache}} template variables that weren't filled
  out = out.replace(/\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}/g, "");

  return out;
}

// ---------- FAQ styling injection ----------

/**
 * Inject CSS to visually distinguish FAQ questions from answers.
 * FAQ sections use .faq-item, .faq-question, .faq-answer or similar classes.
 */
function injectFaqStyling(html: string): string {
  const css = `<style>
/* FAQ styling - distinguish questions from answers */
.faq-item, [class*="faq-item"], .accordion-item {
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 12px;
  background: rgba(255,255,255,0.03);
}
.faq-question, [class*="faq-question"], .accordion-header, .accordion-title,
.faq-item h3, .faq-item h4, [class*="faq-item"] h3, [class*="faq-item"] h4 {
  font-weight: 700 !important;
  font-size: 1.05em !important;
  margin-bottom: 8px !important;
  display: block;
}
.faq-question::before, [class*="faq-question"]::before,
.faq-item h3::before, .faq-item h4::before,
[class*="faq-item"] h3::before, [class*="faq-item"] h4::before {
  content: "Q. ";
  font-weight: 800;
  opacity: 0.6;
}
.faq-answer, [class*="faq-answer"], .accordion-body, .accordion-content,
.faq-item p, [class*="faq-item"] p {
  opacity: 0.85;
  line-height: 1.6;
  padding-left: 8px;
  border-left: 3px solid rgba(128,128,128,0.2);
  margin-top: 4px;
}
</style>`;

  if (html.includes("</head>")) {
    return html.replace("</head>", `${css}\n</head>`);
  }
  return html + css;
}

// ---------- Inline capture form injection ----------

/**
 * Build a contextual hero illustration HTML based on the visual type.
 * Generates a modern mockup/animation adapted to the offer (SaaS, ebook, call, etc.)
 * Uses brand colors via CSS variables.
 */
function buildHeroVisualHtml(contentData: Record<string, any>): string {
  const visualType = safeString(contentData.hero_visual_type || "saas_dashboard");
  const vTitle = escapeHtml(safeString(contentData.hero_visual_title || contentData.hero_title || ""));
  const vSubtitle = escapeHtml(safeString(contentData.hero_visual_subtitle || ""));
  const vItems: string[] = Array.isArray(contentData.hero_visual_items) ? contentData.hero_visual_items.map((i: any) => safeString(i)) : [];
  const vMetrics: Array<{ icon: string; value: string; label: string }> = Array.isArray(contentData.hero_visual_metrics) ? contentData.hero_visual_metrics : [];

  // Floating cards HTML (metrics)
  const floatingCards = vMetrics.slice(0, 3).map((m, i) => {
    const colorClasses = ["leads", "email", "success"];
    const delays = ["0s", "1s", "2s"];
    const positions = [
      "top:-20px;right:-20px;",
      "bottom:60px;left:-30px;",
      "bottom:-15px;right:30px;",
    ];
    return `<div class="tpt-float-card" style="animation-delay:${delays[i]};${positions[i]}">
      <div class="tpt-float-icon tpt-float-${colorClasses[i]}">${escapeHtml(safeString(m.icon || "&#10003;"))}</div>
      <div class="tpt-float-content">
        <span class="tpt-float-value">${escapeHtml(safeString(m.value || ""))}</span>
        <span class="tpt-float-label">${escapeHtml(safeString(m.label || ""))}</span>
      </div>
    </div>`;
  }).join("\n");

  // Items list for the mockup interior
  const itemsHtml = vItems.slice(0, 5).map((item, i) =>
    `<div class="tpt-mock-item${i === 0 ? " active" : ""}"><span class="tpt-mock-icon"></span>${escapeHtml(item)}</div>`
  ).join("\n");

  // Build different mockup interiors based on visual type
  let mockupContent = "";

  if (visualType === "ebook_cover") {
    const chapters = vItems.length > 0 ? vItems : ["Chapitre 1", "Chapitre 2", "Chapitre 3"];
    mockupContent = `
      <div class="tpt-mock-ebook">
        <div class="tpt-mock-ebook-badge">GRATUIT</div>
        <div class="tpt-mock-ebook-title">${vTitle}</div>
        ${vSubtitle ? `<div class="tpt-mock-ebook-sub">${vSubtitle}</div>` : ""}
        <div class="tpt-mock-ebook-chapters">
          ${chapters.slice(0, 5).map((c, i) => `<div class="tpt-mock-ebook-ch"><span class="tpt-mock-ch-num">${i + 1}</span>${escapeHtml(typeof c === "string" ? c : "")}</div>`).join("\n")}
        </div>
      </div>`;
  } else if (visualType === "video_call") {
    mockupContent = `
      <div class="tpt-mock-videocall">
        <div class="tpt-mock-vc-header">${vTitle}</div>
        <div class="tpt-mock-vc-grid">
          <div class="tpt-mock-vc-avatar"><div class="tpt-mock-vc-circle">&#128100;</div><span>Expert</span></div>
          <div class="tpt-mock-vc-avatar"><div class="tpt-mock-vc-circle tpt-mock-vc-you">&#128100;</div><span>Vous</span></div>
        </div>
        <div class="tpt-mock-vc-bar">
          <span class="tpt-mock-vc-btn">&#127908;</span>
          <span class="tpt-mock-vc-btn">&#127909;</span>
          <span class="tpt-mock-vc-btn tpt-mock-vc-end">&#128308;</span>
        </div>
        ${vSubtitle ? `<div class="tpt-mock-vc-sub">${vSubtitle}</div>` : ""}
      </div>`;
  } else if (visualType === "checklist") {
    const checks = vItems.length > 0 ? vItems : ["&#201;tape 1", "&#201;tape 2", "&#201;tape 3"];
    mockupContent = `
      <div class="tpt-mock-checklist">
        <div class="tpt-mock-cl-title">${vTitle}</div>
        ${vSubtitle ? `<div class="tpt-mock-cl-sub">${vSubtitle}</div>` : ""}
        <div class="tpt-mock-cl-items">
          ${checks.slice(0, 5).map((c, i) => `<div class="tpt-mock-cl-item${i < 2 ? " done" : ""}"><span class="tpt-mock-cl-check">${i < 2 ? "&#10003;" : ""}</span><span>${escapeHtml(typeof c === "string" ? c : "")}</span></div>`).join("\n")}
        </div>
      </div>`;
  } else if (visualType === "calendar") {
    const days = vItems.length > 0 ? vItems : ["Jour 1", "Jour 2", "Jour 3", "Jour 4", "Jour 5"];
    mockupContent = `
      <div class="tpt-mock-calendar">
        <div class="tpt-mock-cal-header">${vTitle}</div>
        ${vSubtitle ? `<div class="tpt-mock-cal-sub">${vSubtitle}</div>` : ""}
        <div class="tpt-mock-cal-grid">
          ${days.slice(0, 5).map((d, i) => `<div class="tpt-mock-cal-day${i < 2 ? " done" : i === 2 ? " current" : ""}"><span class="tpt-mock-cal-num">${i + 1}</span><span class="tpt-mock-cal-label">${escapeHtml(typeof d === "string" ? d : "")}</span></div>`).join("\n")}
        </div>
      </div>`;
  } else if (visualType === "chat_interface") {
    mockupContent = `
      <div class="tpt-mock-chat">
        <div class="tpt-mock-chat-header">${vTitle}</div>
        <div class="tpt-mock-chat-msgs">
          <div class="tpt-mock-chat-msg tpt-mock-chat-user">Comment augmenter mes ventes ?</div>
          <div class="tpt-mock-chat-msg tpt-mock-chat-bot">Voici 3 strat&#233;gies prouv&#233;es pour booster tes conversions...</div>
          <div class="tpt-mock-chat-typing"><span></span><span></span><span></span></div>
        </div>
      </div>`;
  } else if (visualType === "certificate") {
    mockupContent = `
      <div class="tpt-mock-cert">
        <div class="tpt-mock-cert-border">
          <div class="tpt-mock-cert-badge">&#127942;</div>
          <div class="tpt-mock-cert-title">${vTitle}</div>
          ${vSubtitle ? `<div class="tpt-mock-cert-sub">${vSubtitle}</div>` : ""}
          <div class="tpt-mock-cert-line"></div>
          <div class="tpt-mock-cert-name">Votre nom ici</div>
        </div>
      </div>`;
  } else {
    // Default: saas_dashboard
    mockupContent = `
      <div class="tpt-mock-content">
        <div class="tpt-mock-sidebar">${itemsHtml}</div>
        <div class="tpt-mock-main">
          <div class="tpt-mock-header">
            <div class="tpt-mock-title">${vTitle}</div>
            ${vSubtitle ? `<div class="tpt-mock-subtitle">${vSubtitle}</div>` : ""}
          </div>
          <div class="tpt-mock-progress">
            <div class="tpt-mock-progress-header"><span>Progression</span><span class="tpt-mock-progress-val">75%</span></div>
            <div class="tpt-mock-progress-bar"><div class="tpt-mock-progress-fill"></div></div>
          </div>
          <div class="tpt-mock-tasks">
            <div class="tpt-mock-task done"><span class="tpt-mock-task-check">&#10003;</span><span>Configur&#233;</span></div>
            <div class="tpt-mock-task done"><span class="tpt-mock-task-check">&#10003;</span><span>Lanc&#233;</span></div>
            <div class="tpt-mock-task"><span class="tpt-mock-task-check"></span><span>En cours...</span></div>
          </div>
        </div>
      </div>`;
  }

  return `<div class="tpt-hero-visual" data-tipote-visual="1" title="Cliquez pour remplacer par votre image">
  <div class="tpt-mockup">
    <div class="tpt-mock-browser">
      <span class="tpt-dot red"></span><span class="tpt-dot yellow"></span><span class="tpt-dot green"></span>
    </div>
    ${mockupContent}
  </div>
  ${floatingCards}
</div>`;
}

/**
 * Inject a standardized capture hero section into ALL capture pages.
 *
 * ARCHITECTURE:
 * - Replaces the template's ENTIRE first section (hero) with a standard split layout
 * - LEFT side: headline + subtitle + 3-5 bullet points + capture form (prénom, email, checkbox, CTA)
 * - RIGHT side: contextual illustration/mockup (AI-generated, click-to-replace with user image)
 * - NO logo, NO site name in the hero section
 * - Header bar: urgency or target audience only (no "ce template est offert")
 * - Footer: logo + legal links
 * - Fully responsive
 */
function injectInlineCaptureForm(html: string, contentData: Record<string, any>): string {
  // Skip if already injected
  if (html.includes("tipote-capture-hero")) return html;

  const primary = "var(--colors-primary, #2563eb)";
  const ctaText = escapeHtml(safeString(contentData.cta_text || contentData.cta_label || "Je m&#039;inscris !"));
  const ctaSub = safeString(contentData.cta_subtitle || "");
  const privacyUrl = safeString(contentData.legal_privacy_url || "");
  const heroTitle = escapeHtml(safeString(contentData.hero_title || contentData.headline || ""));
  const heroSubtitle = escapeHtml(safeString(contentData.hero_subtitle || ""));
  const headerBarText = escapeHtml(safeString(contentData.header_bar_text || contentData.hero_eyebrow || ""));
  const benefits: string[] = Array.isArray(contentData.benefits) ? contentData.benefits.filter((b: any) => typeof b === "string" && b.trim()) : [];
  const logoText = safeString(contentData.logo_text || "");
  const logoUrl = safeString(contentData.logo_image_url || "");
  const authorPhoto = safeString(contentData.author_photo_url || contentData.about_img_url || contentData.brand_author_photo_url || "");

  // Build the illustration
  const visualHtml = buildHeroVisualHtml(contentData);

  // Build benefits bullets
  const bulletsHtml = benefits.slice(0, 5).map(b =>
    `<li style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;font-size:0.95rem;line-height:1.5;color:#e2e8f0">
      <span style="color:${primary};font-size:1.1rem;flex-shrink:0;margin-top:2px">&#10003;</span>
      <span>${escapeHtml(b)}</span>
    </li>`
  ).join("\n");

  // Build header bar (urgency/target only — no "ce template est offert")
  const headerBar = headerBarText ? `<div class="tipote-capture-header-bar" style="background:${primary};color:#fff;text-align:center;padding:10px 16px;font-size:0.85rem;font-weight:600;letter-spacing:0.3px">${headerBarText}</div>` : "";

  // Build footer with logo + legal
  const legalLinks: string[] = [];
  if (contentData.legal_mentions_url) legalLinks.push(`<a href="${safeString(contentData.legal_mentions_url)}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.6);text-decoration:underline">Mentions l&#233;gales</a>`);
  if (contentData.legal_cgv_url) legalLinks.push(`<a href="${safeString(contentData.legal_cgv_url)}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.6);text-decoration:underline">CGV</a>`);
  if (privacyUrl) legalLinks.push(`<a href="${privacyUrl}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.6);text-decoration:underline">Politique de confidentialit&#233;</a>`);

  const footerLogoHtml = logoUrl
    ? `<img src="${safeString(logoUrl)}" alt="Logo" style="max-height:36px;width:auto;margin-bottom:12px">`
    : (logoText ? `<div style="font-size:1.1rem;font-weight:700;color:rgba(255,255,255,0.8);margin-bottom:12px">${escapeHtml(logoText)}</div>` : "");

  const footerHtml = `<footer class="tipote-capture-footer" style="background:#0f172a;text-align:center;padding:32px 16px;font-size:0.8rem;color:rgba(255,255,255,0.5);border-top:1px solid rgba(255,255,255,0.08)">
    ${footerLogoHtml}
    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px">${legalLinks.join("")}</div>
  </footer>`;

  // The complete capture hero section
  const heroSection = `
${headerBar}
<section class="tipote-capture-hero" style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);min-height:100vh;display:flex;align-items:center;padding:60px 24px;position:relative;overflow:hidden">
  <div style="max-width:1200px;margin:0 auto;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center" class="tipote-hero-grid">
    <!-- LEFT: Text + Form -->
    <div class="tipote-hero-left" style="color:#fff">
      <h1 style="font-size:clamp(1.6rem,3.5vw,2.8rem);font-weight:800;line-height:1.15;margin:0 0 16px;color:#fff">${heroTitle}</h1>
      ${heroSubtitle ? `<p style="font-size:1.1rem;line-height:1.6;color:#cbd5e1;margin:0 0 24px">${heroSubtitle}</p>` : ""}
      ${bulletsHtml ? `<ul style="list-style:none;padding:0;margin:0 0 28px">${bulletsHtml}</ul>` : ""}

      <div class="tipote-capture-form-wrap" style="max-width:400px">
        <form id="tipote-capture-form" style="display:flex;flex-direction:column;gap:10px">
          <input type="text" name="first_name" placeholder="Ton pr&#233;nom" style="padding:14px 18px;border:2px solid rgba(255,255,255,0.15);border-radius:10px;font-size:1rem;outline:none;width:100%;box-sizing:border-box;background:rgba(255,255,255,0.08);color:#fff;transition:border-color .2s" onfocus="this.style.borderColor='${primary}'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">
          <input type="email" name="email" placeholder="Ton adresse email" required style="padding:14px 18px;border:2px solid rgba(255,255,255,0.15);border-radius:10px;font-size:1rem;outline:none;width:100%;box-sizing:border-box;background:rgba(255,255,255,0.08);color:#fff;transition:border-color .2s" onfocus="this.style.borderColor='${primary}'" onblur="this.style.borderColor='rgba(255,255,255,0.15)'">
          <label style="display:flex;align-items:flex-start;gap:8px;font-size:0.78rem;color:rgba(255,255,255,0.55);cursor:pointer;margin:2px 0;line-height:1.4">
            <input type="checkbox" required style="margin-top:3px;accent-color:${primary};flex-shrink:0;width:16px;height:16px">
            <span>J&#039;accepte la <a href="${privacyUrl || "#"}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.7);text-decoration:underline">politique de confidentialit&#233;</a> et de recevoir des emails.</span>
          </label>
          <button type="submit" class="cta-button cta-primary" style="padding:16px 24px;background:${primary};color:#fff;border:none;border-radius:10px;font-size:1.1rem;font-weight:700;cursor:pointer;margin-top:4px;width:100%;letter-spacing:0.3px;box-shadow:0 8px 24px rgba(0,0,0,0.3);transition:transform .2s,box-shadow .2s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 12px 32px rgba(0,0,0,0.4)'" onmouseout="this.style.transform='none';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'">${ctaText}</button>
          ${ctaSub ? `<p style="font-size:0.75rem;color:rgba(255,255,255,0.45);margin:4px 0 0;text-align:center">${escapeHtml(ctaSub)}</p>` : ""}
        </form>
      </div>
    </div>

    <!-- RIGHT: Illustration (click-to-replace with user image) -->
    <div class="tipote-hero-right" style="position:relative;display:flex;justify-content:center;align-items:center">
      ${visualHtml}
    </div>
  </div>
</section>`;

  // Responsive CSS + visual styling + click-to-replace script
  const heroCss = `<style>
/* ═══ TIPOTE CAPTURE HERO — Standardized layout ═══ */
@keyframes tpt-fadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
@keyframes tpt-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-12px); } }
@keyframes tpt-progressFill { from { width:0%; } to { width:75%; } }
@keyframes tpt-typing { 0%,80%,100% { opacity:.3; transform:scale(.8); } 40% { opacity:1; transform:scale(1); } }

.tipote-capture-hero { animation: tpt-fadeIn 0.6s ease; }
.tipote-hero-left { animation: tpt-fadeIn 0.5s ease 0.1s backwards; }
.tipote-hero-right { animation: tpt-fadeIn 0.6s ease 0.3s backwards; }

/* Visual mockup container */
.tpt-hero-visual {
  position:relative;width:100%;cursor:pointer;transition:transform .3s;
}
.tpt-hero-visual:hover { transform:scale(1.02); }
.tpt-hero-visual::after {
  content:"Cliquez pour changer l\\2019image";
  position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
  background:rgba(0,0,0,0.7);color:#fff;padding:6px 14px;border-radius:8px;
  font-size:0.72rem;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap;
}
.tpt-hero-visual:hover::after { opacity:1; }

/* When user replaces with custom image */
.tpt-hero-visual img.tpt-user-image {
  width:100%;max-width:520px;border-radius:16px;box-shadow:0 25px 80px rgba(0,0,0,0.3);
  object-fit:cover;display:block;
}

/* Mockup frame */
.tpt-mockup {
  background:#fff;border-radius:16px;box-shadow:0 25px 80px rgba(0,0,0,0.25);
  overflow:hidden;position:relative;width:100%;max-width:520px;
}
.tpt-mock-browser {
  background:#f2f4f8;padding:12px 16px;display:flex;align-items:center;gap:8px;
  border-bottom:1px solid #e5e7eb;
}
.tpt-dot { width:10px;height:10px;border-radius:50%;display:inline-block; }
.tpt-dot.red { background:#ff5f57; } .tpt-dot.yellow { background:#ffbd2e; } .tpt-dot.green { background:#28c840; }

/* SaaS dashboard mockup */
.tpt-mock-content { display:flex;min-height:280px; }
.tpt-mock-sidebar { width:160px;background:#f7f8fb;padding:14px;border-right:1px solid #f0f0f0; }
.tpt-mock-item { display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;font-size:0.75rem;color:#6d6f90;margin-bottom:3px; }
.tpt-mock-item.active { background:rgba(var(--colors-primary-rgb,37,99,235),0.1);color:var(--colors-primary,#2563eb);font-weight:500; }
.tpt-mock-icon { width:14px;height:14px;background:currentColor;border-radius:3px;opacity:.4;flex-shrink:0; }
.tpt-mock-main { flex:1;padding:18px;background:#fff; }
.tpt-mock-header { margin-bottom:16px; }
.tpt-mock-title { font-size:1rem;font-weight:600;color:#141414;margin-bottom:3px; }
.tpt-mock-subtitle { font-size:0.75rem;color:#6d6f90; }
.tpt-mock-progress { margin-bottom:16px; }
.tpt-mock-progress-header { display:flex;justify-content:space-between;margin-bottom:6px; }
.tpt-mock-progress-header span { font-size:0.7rem;color:#6d6f90; }
.tpt-mock-progress-val { font-weight:600;color:var(--colors-primary,#2563eb) !important; }
.tpt-mock-progress-bar { height:7px;background:#f0f0f0;border-radius:4px;overflow:hidden; }
.tpt-mock-progress-fill { height:100%;background:var(--colors-primary,#2563eb);border-radius:4px;width:0%;animation:tpt-progressFill 1.5s ease forwards;animation-delay:1s; }
.tpt-mock-tasks { display:flex;flex-direction:column;gap:6px; }
.tpt-mock-task { display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f7f8fb;border-radius:8px;font-size:0.75rem;color:#141414; }
.tpt-mock-task-check { width:16px;height:16px;border-radius:50%;border:2px solid #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.55rem; }
.tpt-mock-task.done .tpt-mock-task-check { background:var(--colors-primary,#2563eb);border-color:var(--colors-primary,#2563eb);color:#fff; }
.tpt-mock-task.done { color:#aaa; }
.tpt-mock-task.done span:last-child { text-decoration:line-through; }

/* Ebook mockup */
.tpt-mock-ebook { padding:28px;text-align:center;min-height:280px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#f8fafc,#eef2ff); }
.tpt-mock-ebook-badge { display:inline-block;background:var(--colors-primary,#2563eb);color:#fff;padding:4px 14px;border-radius:20px;font-size:0.7rem;font-weight:700;margin-bottom:16px;letter-spacing:1px; }
.tpt-mock-ebook-title { font-size:1.2rem;font-weight:700;color:#141414;margin-bottom:6px; }
.tpt-mock-ebook-sub { font-size:0.8rem;color:#6d6f90;margin-bottom:18px; }
.tpt-mock-ebook-chapters { text-align:left;max-width:280px;margin:0 auto; }
.tpt-mock-ebook-ch { display:flex;align-items:center;gap:10px;padding:6px 0;font-size:0.78rem;color:#333;border-bottom:1px solid #eee; }
.tpt-mock-ch-num { width:22px;height:22px;background:var(--colors-primary,#2563eb);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;flex-shrink:0; }

/* Video call mockup */
.tpt-mock-videocall { padding:20px;min-height:280px;display:flex;flex-direction:column;background:#1a1a2e; }
.tpt-mock-vc-header { color:#fff;font-size:0.85rem;font-weight:600;text-align:center;margin-bottom:16px; }
.tpt-mock-vc-grid { display:flex;gap:16px;justify-content:center;flex:1;align-items:center; }
.tpt-mock-vc-avatar { text-align:center;color:#ccc;font-size:0.7rem; }
.tpt-mock-vc-circle { width:100px;height:100px;border-radius:16px;background:#2a2a4a;display:flex;align-items:center;justify-content:center;font-size:2.5rem;margin-bottom:6px; }
.tpt-mock-vc-you { border:2px solid var(--colors-primary,#2563eb); }
.tpt-mock-vc-bar { display:flex;gap:12px;justify-content:center;margin-top:16px; }
.tpt-mock-vc-btn { width:36px;height:36px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;font-size:0.9rem; }
.tpt-mock-vc-end { background:#dc2626; }
.tpt-mock-vc-sub { color:#888;font-size:0.7rem;text-align:center;margin-top:10px; }

/* Checklist mockup */
.tpt-mock-checklist { padding:24px;min-height:280px; }
.tpt-mock-cl-title { font-size:1rem;font-weight:600;color:#141414;margin-bottom:4px; }
.tpt-mock-cl-sub { font-size:0.78rem;color:#6d6f90;margin-bottom:16px; }
.tpt-mock-cl-items { display:flex;flex-direction:column;gap:8px; }
.tpt-mock-cl-item { display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f7f8fb;border-radius:8px;font-size:0.8rem;color:#333; }
.tpt-mock-cl-check { width:20px;height:20px;border-radius:6px;border:2px solid #ccc;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.65rem;color:transparent; }
.tpt-mock-cl-item.done .tpt-mock-cl-check { background:var(--colors-primary,#2563eb);border-color:var(--colors-primary,#2563eb);color:#fff; }
.tpt-mock-cl-item.done { color:#999;text-decoration:line-through; }

/* Calendar mockup */
.tpt-mock-calendar { padding:20px;min-height:280px; }
.tpt-mock-cal-header { font-size:1rem;font-weight:600;color:#141414;margin-bottom:4px; }
.tpt-mock-cal-sub { font-size:0.78rem;color:#6d6f90;margin-bottom:16px; }
.tpt-mock-cal-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px; }
.tpt-mock-cal-day { padding:12px 8px;border-radius:10px;background:#f7f8fb;text-align:center;border:2px solid transparent; }
.tpt-mock-cal-day.done { background:rgba(var(--colors-primary-rgb,37,99,235),0.1);border-color:var(--colors-primary,#2563eb); }
.tpt-mock-cal-day.current { border-color:var(--colors-primary,#2563eb);background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.08); }
.tpt-mock-cal-num { display:block;font-size:1.1rem;font-weight:700;color:#141414;margin-bottom:2px; }
.tpt-mock-cal-label { font-size:0.65rem;color:#6d6f90; }

/* Chat mockup */
.tpt-mock-chat { padding:16px;min-height:280px;display:flex;flex-direction:column;background:#f8fafc; }
.tpt-mock-chat-header { font-size:0.85rem;font-weight:600;color:#141414;padding:8px 12px;background:#fff;border-radius:10px;margin-bottom:12px;box-shadow:0 1px 4px rgba(0,0,0,0.05); }
.tpt-mock-chat-msgs { flex:1;display:flex;flex-direction:column;gap:10px; }
.tpt-mock-chat-msg { padding:10px 14px;border-radius:12px;font-size:0.8rem;max-width:80%;line-height:1.4; }
.tpt-mock-chat-user { background:var(--colors-primary,#2563eb);color:#fff;align-self:flex-end;border-bottom-right-radius:4px; }
.tpt-mock-chat-bot { background:#fff;color:#333;align-self:flex-start;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,0.05); }
.tpt-mock-chat-typing { display:flex;gap:4px;padding:10px 14px;background:#fff;border-radius:12px;align-self:flex-start;box-shadow:0 1px 4px rgba(0,0,0,0.05); }
.tpt-mock-chat-typing span { width:7px;height:7px;background:#aaa;border-radius:50%;animation:tpt-typing 1.4s infinite; }
.tpt-mock-chat-typing span:nth-child(2) { animation-delay:.2s; }
.tpt-mock-chat-typing span:nth-child(3) { animation-delay:.4s; }

/* Certificate mockup */
.tpt-mock-cert { padding:24px;min-height:280px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fffbeb,#fef3c7); }
.tpt-mock-cert-border { border:3px solid var(--colors-primary,#2563eb);border-radius:12px;padding:28px 32px;text-align:center;width:100%;background:#fff; }
.tpt-mock-cert-badge { font-size:2.5rem;margin-bottom:10px; }
.tpt-mock-cert-title { font-size:1.1rem;font-weight:700;color:#141414;margin-bottom:4px; }
.tpt-mock-cert-sub { font-size:0.78rem;color:#6d6f90;margin-bottom:12px; }
.tpt-mock-cert-line { width:60%;height:2px;background:var(--colors-primary,#2563eb);margin:12px auto;opacity:.4; }
.tpt-mock-cert-name { font-size:0.9rem;color:#888;font-style:italic; }

/* Floating metric cards */
.tpt-float-card {
  position:absolute;background:#fff;border-radius:12px;padding:12px 16px;
  box-shadow:0 10px 40px rgba(0,0,0,0.15);display:flex;align-items:center;gap:10px;
  animation:tpt-float 4s ease-in-out infinite;z-index:2;
}
.tpt-float-icon { width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0; }
.tpt-float-leads { background:#e0f2fe;color:#0284c7; }
.tpt-float-email { background:#fce7f3;color:#db2777; }
.tpt-float-success { background:#d1fae5;color:#059669; }
.tpt-float-content { display:flex;flex-direction:column; }
.tpt-float-value { font-size:0.95rem;font-weight:700;color:#141414; }
.tpt-float-label { font-size:0.68rem;color:#6d6f90; }

/* Responsive */
@media (max-width:900px) {
  .tipote-hero-grid { grid-template-columns:1fr !important;gap:40px !important; }
  .tipote-hero-right { order:-1; }
  .tpt-hero-visual { max-width:400px;margin:0 auto; }
  .tpt-float-card { display:none; }
  .tipote-capture-hero { padding:40px 20px !important;min-height:auto !important; }
}
@media (max-width:520px) {
  .tipote-capture-hero h1 { font-size:1.5rem !important; }
  .tpt-mockup { max-width:100%; }
  .tpt-mock-sidebar { width:120px;padding:10px; }
  .tpt-mock-main { padding:14px; }
}
</style>`;

  // Click-to-replace script: lets user click the illustration to swap with their own image
  const heroScript = `<script>
(function(){
  var visual = document.querySelector('.tpt-hero-visual[data-tipote-visual]');
  if (!visual) return;
  visual.addEventListener('click', function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.addEventListener('change', function() {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        visual.innerHTML = '<img class="tpt-user-image" src="' + e.target.result + '" alt="Illustration">';
        // Notify parent (editor) about the image change
        try { parent.postMessage('tipote:hero-image:' + e.target.result.slice(0, 100), '*'); } catch(ex) {}
      };
      reader.readAsDataURL(file);
    });
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
})();
</script>`;

  // ---- INJECTION STRATEGY ----
  // Find the first <section> (hero) and EVERYTHING before the second <section> (or content after hero)
  // Replace it entirely with our standardized hero section

  // Find where to inject: remove template header + hero, keep remaining sections
  let out = html;

  // Remove the "Ce template de page de capture est 100% offert" header bar if present
  out = out.replace(/<div[^>]*class="[^"]*(?:header-bar|top-bar|banner-bar|notice-bar|promo-bar)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  // Also remove any header that contains "offert" or "template" text
  out = out.replace(/<(?:header|div)[^>]*>[\s\S]*?(?:offert|template|télécharger)[\s\S]*?<\/(?:header|div)>/gi, "");

  // Inject the CSS into <head>
  if (out.includes("</head>")) {
    out = out.replace("</head>", `${heroCss}\n</head>`);
  } else {
    out = heroCss + "\n" + out;
  }

  // Find and replace the first section (hero) entirely
  // Strategy: find the first <section and replace up to its closing </section>
  const firstSectionMatch = out.match(/<section[\s>]/i);
  if (firstSectionMatch && firstSectionMatch.index != null) {
    const sectionStart = firstSectionMatch.index;
    // Find the matching </section> for the first section
    let depth = 0;
    let sectionEnd = -1;
    let searchPos = sectionStart;
    while (searchPos < out.length) {
      const openIdx = out.indexOf("<section", searchPos);
      const closeIdx = out.indexOf("</section>", searchPos);

      if (closeIdx === -1) break; // no closing tag found

      if (openIdx !== -1 && openIdx < closeIdx) {
        depth++;
        searchPos = openIdx + 8;
      } else {
        depth--;
        if (depth === 0) {
          sectionEnd = closeIdx + "</section>".length;
          break;
        }
        searchPos = closeIdx + 10;
      }
    }

    if (sectionEnd !== -1) {
      // Replace the first section with our hero
      out = out.slice(0, sectionStart) + heroSection + out.slice(sectionEnd);
    } else {
      // Fallback: insert before the first section
      out = out.slice(0, sectionStart) + heroSection + out.slice(sectionStart);
    }
  } else {
    // No section found — insert after <body> or at the beginning
    const bodyMatch = out.match(/<body[^>]*>/i);
    if (bodyMatch && bodyMatch.index != null) {
      const insertPos = bodyMatch.index + bodyMatch[0].length;
      out = out.slice(0, insertPos) + heroSection + out.slice(insertPos);
    } else {
      out = heroSection + out;
    }
  }

  // Remove any existing <header> that's inside the template (we use our own header bar)
  // But preserve the header if it's outside the first section (i.e., site navigation)
  out = out.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, (match) => {
    // Keep if it's our own header
    if (match.includes("tipote-capture-header-bar")) return match;
    return "";
  });

  // Remove any existing logo section in the hero (we don't want logos above the fold)
  // This is handled by the hero replacement above

  // Inject click-to-replace script before </body>
  const bodyEndIdx = out.lastIndexOf("</body>");
  if (bodyEndIdx !== -1) {
    out = out.slice(0, bodyEndIdx) + heroScript + "\n" + out.slice(bodyEndIdx);
  } else {
    out += heroScript;
  }

  // Remove duplicate forms: if the template already had forms in other sections, remove them
  // (we only want our hero form)
  let formCount = 0;
  out = out.replace(/<form[\s\S]*?<\/form>/gi, (match) => {
    formCount++;
    if (formCount === 1) return match; // Keep first (our hero form)
    return ""; // Remove duplicates
  });

  return out;
}

// ---------- Legal footer injection ----------

/**
 * Inject legal footer links into rendered HTML if contentData has legal URLs.
 */
// Locale-aware legal link labels
const LEGAL_LABELS: Record<string, { mentions: string; cgv: string; privacy: string }> = {
  fr: { mentions: "Mentions l\u00e9gales", cgv: "CGV", privacy: "Politique de confidentialit\u00e9" },
  en: { mentions: "Legal Notice", cgv: "Terms of Sale", privacy: "Privacy Policy" },
  es: { mentions: "Aviso legal", cgv: "Condiciones de venta", privacy: "Pol\u00edtica de privacidad" },
  de: { mentions: "Impressum", cgv: "AGB", privacy: "Datenschutz" },
  it: { mentions: "Note legali", cgv: "Condizioni di vendita", privacy: "Privacy" },
  pt: { mentions: "Avisos legais", cgv: "Condi\u00e7\u00f5es de venda", privacy: "Pol\u00edtica de privacidade" },
};

// ---------- Brand override CSS ----------

/**
 * Convert a hex color (#rrggbb or #rgb) to rgba(r,g,b,alpha).
 * Used to generate matching shadow/border colors from brand primary.
 */
function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "");
  let r: number, g: number, b: number;
  if (c.length === 3) {
    r = parseInt(c[0] + c[0], 16);
    g = parseInt(c[1] + c[1], 16);
    b = parseInt(c[2] + c[2], 16);
  } else {
    r = parseInt(c.slice(0, 2), 16);
    g = parseInt(c.slice(2, 4), 16);
    b = parseInt(c.slice(4, 6), 16);
  }
  if (isNaN(r)) r = 37;
  if (isNaN(g)) g = 99;
  if (isNaN(b)) b = 235;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Generate CSS that overrides ALL hardcoded template colors/fonts with user's brand.
 * Covers: backgrounds, gradients, box-shadows, text-shadows, borders, text-decoration,
 * pseudo-elements, form focus states, accent colors, and typography.
 *
 * This is critical because full-doc templates use hardcoded hex colors, not CSS variables.
 * Without comprehensive overrides, you get visual mismatches like blue buttons with red shadows.
 */
function buildBrandOverrideCss(brandTokens: Record<string, any> | null | undefined): string {
  if (!brandTokens || Object.keys(brandTokens).length === 0) return "";

  const primary = brandTokens["colors-primary"] || "";
  const accent = brandTokens["colors-accent"] || "";
  const font = brandTokens["typography-heading"] || "";

  const rules: string[] = [];

  if (primary) {
    // Pre-compute shadow/border variations from primary color
    const shadow40 = hexToRgba(primary, 0.4);
    const shadow25 = hexToRgba(primary, 0.25);
    const shadow15 = hexToRgba(primary, 0.15);
    const shadow60 = hexToRgba(primary, 0.6);
    const shadow10 = hexToRgba(primary, 0.1);

    rules.push(`
/* ═══ BRAND COLOR OVERRIDE — PRIMARY: ${primary} ═══ */

/* 1. CTA/Button backgrounds — solid brand color, no gradients */
.cta-button, .cta-primary, .btn-primary, [class*="cta-button"], [class*="btn-primary"],
button[class*="cta"], a[class*="cta"], .hero-cta, .main-cta,
button[type="submit"], .command-button, .order-button, [class*="day-cta"] {
  background: ${primary} !important;
  background-color: ${primary} !important;
  background-image: none !important;
  border-color: ${primary} !important;
}

/* 2. CTA/Button BOX-SHADOWS — must match brand color, not template theme */
.cta-button, .cta-primary, .btn-primary, [class*="cta-button"], [class*="btn-primary"],
button[class*="cta"], a[class*="cta"], .hero-cta, .main-cta,
button[type="submit"], .command-button, .order-button, [class*="day-cta"] {
  box-shadow: 0 8px 24px ${shadow40} !important;
}
.cta-button:hover, .cta-primary:hover, .btn-primary:hover,
[class*="cta-button"]:hover, [class*="btn-primary"]:hover,
button[class*="cta"]:hover, a[class*="cta"]:hover, button[type="submit"]:hover {
  box-shadow: 0 12px 32px ${shadow60} !important;
}

/* 3. Accent/highlight text colors */
.gold-text, .accent-text, [class*="gold-text"], [class*="accent-text"],
.highlight, .text-highlight, [class*="highlight"], .hook,
[class*="headline-highlight"], [class*="text-curiosity"],
.section-title::after, .section-emphasis, .accent-line {
  color: ${primary} !important;
}

/* 4. Decorative lines and pseudo-elements */
.section-title::after, .accent-line, [class*="accent-line"], hr[class*="accent"] {
  background: ${primary} !important;
  background-image: none !important;
}
.headline-underline, [class*="headline-underline"] {
  text-decoration-color: ${primary} !important;
}

/* 5. Card/element hover states — border + shadow */
.benefit-card:hover, .feature-card:hover, .testimonial-card:hover,
.goal-card:hover, [class*="card"]:hover {
  border-color: ${primary} !important;
  box-shadow: 0 8px 24px ${shadow15} !important;
}

/* 6. Numbered badges, benefit numbers, step indicators */
.benefit-number, .step-number, [class*="number"], [class*="badge"] {
  background: ${primary} !important;
  background-image: none !important;
}
.badge-label, [class*="badge-label"] {
  color: ${primary} !important;
}

/* 7. Form input focus states */
input:focus, textarea:focus, select:focus,
.form-input:focus, [class*="form-input"]:focus {
  border-color: ${primary} !important;
  box-shadow: 0 0 0 3px ${shadow10} !important;
  outline-color: ${primary} !important;
}
input[type="checkbox"] {
  accent-color: ${primary} !important;
}

/* 8. Capture form button */
.tipote-capture-form-wrap button[type="submit"] {
  background: ${primary} !important;
  box-shadow: 0 4px 16px ${shadow40} !important;
}

/* 9. Header/border accents */
.hero, .header, [class*="hero-section"], header {
  border-color: ${primary} !important;
}
.featured, [class*="featured"] {
  border-color: ${primary} !important;
}

/* 10. Links */
a:not([class]):not([data-legal]):not(.footer-links a) { color: ${primary}; }
.footer-links a:hover { color: ${primary} !important; }

/* 11. List bullets with color */
ul li::before, ol li::before,
.benefits-list li::before, [class*="benefits"] li::before,
[class*="list"] li::before {
  color: ${primary} !important;
}

/* 12. Counter/social proof accent */
.counter-number, [class*="counter-number"], .stats-number {
  color: ${primary} !important;
}
`);
  }

  if (accent) {
    const accentShadow = hexToRgba(accent, 0.3);
    rules.push(`
/* ═══ BRAND ACCENT COLOR: ${accent} ═══ */
.cta-secondary, .btn-secondary, [class*="cta-secondary"], [class*="btn-outline"] {
  border-color: ${accent} !important;
  color: ${accent} !important;
}
.cta-secondary:hover, .btn-secondary:hover {
  background-color: ${accent} !important;
  color: #fff !important;
  box-shadow: 0 8px 24px ${accentShadow} !important;
}
.section-accent, [class*="section-accent"] {
  background-color: ${accent} !important;
}
`);
  }

  if (font) {
    rules.push(`
/* ═══ BRAND FONT: ${font} ═══ */
h1, h2, h3, h4, h5, h6,
.hero-title, .main-headline, [class*="title"], [class*="heading"] {
  font-family: '${font}', sans-serif !important;
}
body {
  font-family: '${font}', system-ui, -apple-system, sans-serif !important;
}
`);
  }

  return rules.join("\n");
}

/**
 * Generate a Google Fonts import link for the user's brand font.
 */
function buildBrandFontImport(brandTokens: Record<string, any> | null | undefined): string {
  if (!brandTokens) return "";
  const font = brandTokens["typography-heading"] || "";
  if (!font) return "";
  // System fonts don't need import
  const systemFonts = ["arial", "georgia", "times new roman", "courier new", "verdana", "tahoma", "trebuchet ms"];
  if (systemFonts.includes(font.toLowerCase())) return "";
  const encoded = encodeURIComponent(font);
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`;
}

function injectLegalFooterHtml(html: string, contentData: Record<string, any>, locale?: string): string {
  // Guard: prevent double injection of legal footer
  // Guard: prevent double injection if ANY legal footer already exists
  // Check for: Tipote injected footer, template built-in footer, or legal URL links
  if (
    html.includes("tipote-legal-footer") ||
    html.includes("tipote-capture-footer") ||
    html.includes("data-tipote-legal") ||
    html.includes('class="footer-links"') ||
    html.includes("class='footer-links'") ||
    // Check if the template already has rendered legal links
    (contentData?.legal_mentions_url && html.includes(contentData.legal_mentions_url)) ||
    (contentData?.legal_cgv_url && html.includes(contentData.legal_cgv_url)) ||
    (contentData?.legal_privacy_url && html.includes(contentData.legal_privacy_url))
  ) return html;

  const lang = (locale || "fr").slice(0, 2);
  const labels = LEGAL_LABELS[lang] || LEGAL_LABELS.fr;
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
    if (mentionsUrl) links.push(`<a href="${safeString(mentionsUrl)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,0.7);text-decoration:underline">${labels.mentions}</a>`);
    if (cgvUrl) links.push(`<a href="${safeString(cgvUrl)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,0.7);text-decoration:underline">${labels.cgv}</a>`);
    if (privacyUrl) links.push(`<a href="${safeString(privacyUrl)}" target="_blank" rel="noopener noreferrer" style="color:rgba(255,255,255,0.7);text-decoration:underline">${labels.privacy}</a>`);
  }

  if (links.length === 0) return html;

  const footer = `<div data-tipote-legal="1" class="tipote-legal-footer" style="text-align:center;padding:20px 16px;font-size:12px;font-family:system-ui,sans-serif;background:#1c1c1c;color:rgba(255,255,255,0.5);border-top:1px solid rgba(255,255,255,0.1)">${links.join(" &nbsp;|&nbsp; ")}</div>`;

  const bodyIdx = html.lastIndexOf("</body>");
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + footer + "\n" + html.slice(bodyIdx);
  }
  return html + footer;
}