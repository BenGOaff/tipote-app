// lib/pageLayout.ts
// Responsive layout engine for capture hero (photo / form positioning).
//
// Design goals:
//  - One config per screen (mobile / desktop), chosen independently
//  - 6 presets per screen covering 95% of real-world needs
//  - Advanced overrides (ratio, gap, overlay) are additive and optional
//  - Pure CSS output (no JS runtime, no SSR device sniffing): the same
//    html_snapshot serves mobile and desktop correctly via media queries
//  - Strict validation: this module NEVER injects user strings into CSS —
//    every emitted CSS value is derived from enums or clamped numbers

export type LayoutPreset =
  | "photo-top"        // visual above form (stacked)
  | "form-top"         // form above visual (stacked)
  | "split-form-left"  // form left / visual right (desktop-style)
  | "split-form-right" // visual left / form right (desktop-style)
  | "photo-bg"         // visual as full-bleed background, form floats over
  | "no-photo";        // form only, visual hidden

export type PhotoFit = "cover" | "contain";
export type FormWidth = "narrow" | "normal" | "wide";
export type PhotoRatio = "auto" | "16:9" | "4:3" | "1:1" | "9:16";

export interface ScreenLayout {
  preset: LayoutPreset;
  /** Optional: how the photo fills its box (cover = crop, contain = letterbox). Default: cover. */
  photoFit?: PhotoFit;
  /** Optional: locked aspect ratio. Default: auto (intrinsic). */
  photoRatio?: PhotoRatio;
  /** Optional: form column width hint (narrow/normal/wide). Default: normal. */
  formWidth?: FormWidth;
  /** Optional: dark overlay for photo-bg (0-80%). Default: 40. */
  overlayOpacity?: number;
  /** Optional: gap between photo and form in px (0-96). Default: 36. */
  gap?: number;
}

export interface LayoutConfig {
  version: 1;
  mobile: ScreenLayout;
  desktop: ScreenLayout;
}

// ── Defaults ──────────────────────────────────────────────────────────────
// Legacy behavior reproduced by these defaults:
//   desktop = split with form-left / visual-right  (tp-hero-grid 1fr 1fr)
//   mobile  = photo-top (stacked, visual first via order:-1)
export const DEFAULT_LAYOUT: LayoutConfig = {
  version: 1,
  mobile: { preset: "photo-top" },
  desktop: { preset: "split-form-left" },
};

// Mobile-eligible presets (split doesn't make sense on narrow screens, but we
// accept it in the schema and gracefully fall back to photo-top at render).
const MOBILE_PRESETS: readonly LayoutPreset[] = [
  "photo-top", "form-top", "photo-bg", "no-photo",
] as const;

const DESKTOP_PRESETS: readonly LayoutPreset[] = [
  "photo-top", "form-top", "split-form-left", "split-form-right", "photo-bg", "no-photo",
] as const;

const VALID_FITS: readonly PhotoFit[] = ["cover", "contain"] as const;
const VALID_RATIOS: readonly PhotoRatio[] = ["auto", "16:9", "4:3", "1:1", "9:16"] as const;
const VALID_FORM_WIDTHS: readonly FormWidth[] = ["narrow", "normal", "wide"] as const;

// ── Validation (untrusted input → strict LayoutConfig) ────────────────────

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function sanitizeScreen(raw: unknown, allowed: readonly LayoutPreset[], fallback: ScreenLayout): ScreenLayout {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const r = raw as Record<string, unknown>;
  return {
    preset: pickEnum(r.preset, allowed, fallback.preset),
    photoFit: pickEnum(r.photoFit, VALID_FITS, fallback.photoFit ?? "cover"),
    photoRatio: pickEnum(r.photoRatio, VALID_RATIOS, fallback.photoRatio ?? "auto"),
    formWidth: pickEnum(r.formWidth, VALID_FORM_WIDTHS, fallback.formWidth ?? "normal"),
    overlayOpacity: clamp(r.overlayOpacity, 0, 80, fallback.overlayOpacity ?? 40),
    gap: clamp(r.gap, 0, 96, fallback.gap ?? 36),
  };
}

/**
 * Safe parser — accepts anything and always returns a valid LayoutConfig.
 * Use at ALL boundaries: API input, DB output, preview props.
 */
export function parseLayoutConfig(raw: unknown): LayoutConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_LAYOUT;
  const r = raw as Record<string, unknown>;
  return {
    version: 1,
    mobile: sanitizeScreen(r.mobile, MOBILE_PRESETS, DEFAULT_LAYOUT.mobile),
    desktop: sanitizeScreen(r.desktop, DESKTOP_PRESETS, DEFAULT_LAYOUT.desktop),
  };
}

/** True when layout is effectively the default (legacy behavior). */
export function isDefaultLayout(cfg: LayoutConfig): boolean {
  return cfg.mobile.preset === DEFAULT_LAYOUT.mobile.preset
    && cfg.desktop.preset === DEFAULT_LAYOUT.desktop.preset
    && !cfg.mobile.photoRatio && !cfg.desktop.photoRatio
    && !cfg.mobile.overlayOpacity && !cfg.desktop.overlayOpacity;
}

// ── CSS generation ────────────────────────────────────────────────────────
// Breakpoint contract: < 900px = mobile, ≥ 900px = desktop.
// This matches the existing pageBuilder.ts breakpoint (line ~940).
export const MOBILE_BREAKPOINT_PX = 900;

function ratioToCss(r: PhotoRatio | undefined): string {
  switch (r) {
    case "16:9": return "aspect-ratio:16/9;";
    case "4:3":  return "aspect-ratio:4/3;";
    case "1:1":  return "aspect-ratio:1/1;";
    case "9:16": return "aspect-ratio:9/16;";
    default:     return "";
  }
}

function formMaxWidth(w: FormWidth | undefined): string {
  switch (w) {
    case "narrow": return "max-width:420px;margin:0 auto;";
    case "wide":   return "max-width:none;";
    default:       return "max-width:560px;margin:0 auto;"; // normal
  }
}

/** Emit CSS rules for a single screen (already scoped inside a media query). */
function rulesForScreen(s: ScreenLayout, scope: "mobile" | "desktop"): string {
  const gap = s.gap ?? (scope === "mobile" ? 36 : 64);
  const fit = s.photoFit ?? "cover";
  const ratio = ratioToCss(s.photoRatio);
  const formBox = formMaxWidth(s.formWidth);
  const overlay = Math.max(0, Math.min(80, s.overlayOpacity ?? 40)) / 100;

  // Shared: make the visual honor requested ratio/fit when set.
  const visualSizing = ratio
    ? `.tp-hero-right{${ratio}overflow:hidden;}.tp-hero-right img,.tp-hero-right .tp-visual,.tp-hero-right .tp-mockup{width:100%;height:100%;object-fit:${fit};}`
    : `.tp-hero-right img{object-fit:${fit};}`;

  switch (s.preset) {
    case "photo-top":
      return `
.tp-hero-grid{grid-template-columns:1fr!important;gap:${gap}px!important;}
.tp-hero-right{order:-1!important;}
.tp-hero-left{${formBox}}
${visualSizing}`;

    case "form-top":
      return `
.tp-hero-grid{grid-template-columns:1fr!important;gap:${gap}px!important;}
.tp-hero-right{order:2!important;}
.tp-hero-left{order:1!important;${formBox}}
${visualSizing}`;

    case "split-form-left":
      return `
.tp-hero-grid{grid-template-columns:1fr 1fr!important;gap:${gap}px!important;}
.tp-hero-right{order:0!important;}
.tp-hero-left{order:0!important;${formBox.includes("none") ? formBox : ""}}
${visualSizing}`;

    case "split-form-right":
      return `
.tp-hero-grid{grid-template-columns:1fr 1fr!important;gap:${gap}px!important;}
.tp-hero-right{order:-1!important;}
.tp-hero-left{order:0!important;}
${visualSizing}`;

    case "photo-bg":
      return `
.tp-hero{position:relative;isolation:isolate;}
.tp-hero-grid{grid-template-columns:1fr!important;gap:0!important;}
.tp-hero-right{position:absolute!important;inset:0!important;z-index:0!important;order:0!important;}
.tp-hero-right::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,${overlay});pointer-events:none;}
.tp-hero-right .tp-visual,.tp-hero-right img,.tp-hero-right .tp-mockup{width:100%;height:100%;object-fit:${fit};}
.tp-hero-right .tp-visual-hint,.tp-hero-right .tp-float{display:none!important;}
.tp-hero-left{position:relative;z-index:1;${formBox}background:rgba(255,255,255,0.08);backdrop-filter:blur(8px);padding:28px;border-radius:16px;}`;

    case "no-photo":
      return `
.tp-hero-grid{grid-template-columns:1fr!important;gap:0!important;}
.tp-hero-right{display:none!important;}
.tp-hero-left{${formBox}}`;
  }
}

/**
 * Build responsive CSS for a capture hero layout.
 * Output is safe to inline into <style>: no user strings interpolated.
 */
export function buildLayoutCSS(config: LayoutConfig | null | undefined): string {
  const cfg = parseLayoutConfig(config);

  // Mobile rules under a max-width query (overrides desktop defaults on small screens).
  // Desktop rules under a min-width query. This keeps the default CSS cascade
  // in pageBuilder.ts intact when layout_config is empty.
  const mobileCss = rulesForScreen(cfg.mobile, "mobile");
  const desktopCss = rulesForScreen(cfg.desktop, "desktop");

  return `
/* Tipote layout engine (v${cfg.version}) */
@media (min-width:${MOBILE_BREAKPOINT_PX}px){${desktopCss}}
@media (max-width:${MOBILE_BREAKPOINT_PX - 1}px){${mobileCss}}
`.trim();
}

// ── Preset metadata for the editor UI ─────────────────────────────────────
// Used by the preset picker to render icons + labels. i18n keys live under
// `pageBuilder.layout.presets.<id>` so labels stay translatable.

export interface PresetMeta {
  id: LayoutPreset;
  i18nKey: string;
  /** Inline SVG thumbnail (32x32). Pure shapes, theme-agnostic. */
  thumb: string;
}

const T = (id: string) => `presets.${id}`;

const THUMBS: Record<LayoutPreset, string> = {
  "photo-top":        `<rect x="4" y="3" width="24" height="12" rx="2" fill="currentColor" opacity="0.25"/><rect x="4" y="17" width="24" height="3" rx="1" fill="currentColor"/><rect x="4" y="22" width="24" height="3" rx="1" fill="currentColor"/><rect x="4" y="27" width="16" height="3" rx="1" fill="currentColor"/>`,
  "form-top":         `<rect x="4" y="3" width="24" height="3" rx="1" fill="currentColor"/><rect x="4" y="8" width="24" height="3" rx="1" fill="currentColor"/><rect x="4" y="13" width="16" height="3" rx="1" fill="currentColor"/><rect x="4" y="19" width="24" height="12" rx="2" fill="currentColor" opacity="0.25"/>`,
  "split-form-left":  `<rect x="2" y="6" width="13" height="3" rx="1" fill="currentColor"/><rect x="2" y="11" width="13" height="3" rx="1" fill="currentColor"/><rect x="2" y="16" width="10" height="3" rx="1" fill="currentColor"/><rect x="17" y="4" width="13" height="24" rx="2" fill="currentColor" opacity="0.25"/>`,
  "split-form-right": `<rect x="2" y="4" width="13" height="24" rx="2" fill="currentColor" opacity="0.25"/><rect x="17" y="6" width="13" height="3" rx="1" fill="currentColor"/><rect x="17" y="11" width="13" height="3" rx="1" fill="currentColor"/><rect x="17" y="16" width="10" height="3" rx="1" fill="currentColor"/>`,
  "photo-bg":         `<rect x="2" y="2" width="28" height="28" rx="2" fill="currentColor" opacity="0.25"/><rect x="7" y="11" width="18" height="3" rx="1" fill="currentColor"/><rect x="7" y="16" width="18" height="3" rx="1" fill="currentColor"/><rect x="7" y="21" width="12" height="3" rx="1" fill="currentColor"/>`,
  "no-photo":         `<rect x="6" y="6" width="20" height="3" rx="1" fill="currentColor"/><rect x="6" y="12" width="20" height="3" rx="1" fill="currentColor"/><rect x="6" y="18" width="20" height="3" rx="1" fill="currentColor"/><rect x="6" y="24" width="14" height="3" rx="1" fill="currentColor"/>`,
};

export const MOBILE_PRESET_META: readonly PresetMeta[] = MOBILE_PRESETS.map(id => ({
  id, i18nKey: T(id), thumb: THUMBS[id],
}));

export const DESKTOP_PRESET_META: readonly PresetMeta[] = DESKTOP_PRESETS.map(id => ({
  id, i18nKey: T(id), thumb: THUMBS[id],
}));
