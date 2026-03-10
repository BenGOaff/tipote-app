// lib/linkinbioBuilder.ts
// Programmatic HTML builder for Link-in-Bio pages.
// Generates a complete, responsive, mobile-first page from structured data.
// Renders inline CSS + HTML (no external dependencies) for html_snapshot.

// ─────────────── Types ───────────────

export type LinkinbioTheme = "minimal" | "dark" | "gradient" | "glass" | "bold";
export type ButtonStyle = "rounded" | "pill" | "outlined" | "shadow" | "square";

export type LinkinbioLink = {
  id: string;
  block_type: "link" | "header" | "social_icons" | "capture_form";
  title: string;
  url?: string;
  icon_url?: string;
  social_links?: { platform: string; url: string }[];
  enabled: boolean;
  sort_order: number;
};

export type LinkinbioPageData = {
  pageId: string;
  bio: string;
  displayName: string;
  avatarUrl?: string;
  logoUrl?: string;
  links: LinkinbioLink[];
  theme: LinkinbioTheme;
  buttonStyle: ButtonStyle;
  backgroundType?: "solid" | "gradient" | "image";
  backgroundValue?: string;
  // Branding
  brandColor?: string;
  brandAccent?: string;
  brandFont?: string;
  // Capture form
  captureHeading?: string;
  captureSubtitle?: string;
  captureFirstName?: boolean;
  sioTag?: string;
  // SEO
  metaTitle?: string;
  metaDescription?: string;
  ogImageUrl?: string;
  // Locale
  locale?: string;
};

// ─────────────── Helpers ───────────────

function esc(s: unknown): string {
  const str = typeof s === "string" ? s : s == null ? "" : String(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hexToRgb(hex: string): [number, number, number] {
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
  return [isNaN(r) ? 37 : r, isNaN(g) ? 99 : g, isNaN(b) ? 235 : b];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(
    (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function readableTextOn(bgHex: string): string {
  return luminance(bgHex) > 0.4 ? "#1e293b" : "#ffffff";
}

function readableSubtextOn(bgHex: string): string {
  return luminance(bgHex) > 0.4 ? "#64748b" : "rgba(255,255,255,0.65)";
}

// ─────────────── Social Icons SVGs ───────────────

const SOCIAL_ICONS: Record<string, string> = {
  instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  pinterest: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/></svg>`,
  threads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.187.408-2.228 1.33-2.93.88-.669 2.14-1.058 3.55-1.094l.134-.002c1.074 0 1.975.154 2.68.462-.08-.487-.222-.898-.426-1.233-.508-.838-1.394-1.282-2.562-1.282l-.07.001c-.857.012-1.552.298-2.066.853l-1.474-1.398c.847-.892 2.012-1.378 3.374-1.414l.14-.001c1.883 0 3.356.737 4.26 2.135.774 1.196 1.141 2.785 1.09 4.726 1.04.566 1.882 1.395 2.428 2.44.732 1.398.976 3.18.668 4.864-.434 2.379-1.794 4.326-3.93 5.628C17.642 23.352 15.16 23.976 12.186 24zm.281-9.783l-.204.005c-1.263.035-2.142.368-2.613.69-.384.262-.552.59-.532.983.036.678.67 1.508 2.399 1.414.98-.053 1.74-.422 2.322-1.131.46-.563.768-1.282.905-2.153a8.04 8.04 0 00-2.277.192z"/></svg>`,
  spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  website: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,7 12,13 2,7"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
};

// ─────────────── Theme CSS Generation ───────────────

function buildThemeCSS(data: LinkinbioPageData): string {
  const brand = data.brandColor || "#6366f1";
  const accent = data.brandAccent || brand;
  const font = data.brandFont || "";
  const headingFont = font ? `'${font}', ` : "";
  const [r, g, b] = hexToRgb(brand);
  const theme = data.theme || "minimal";
  const btnStyle = data.buttonStyle || "rounded";

  // Theme-specific background
  let bgCSS = "";
  if (data.backgroundType === "image" && data.backgroundValue) {
    bgCSS = `background: url('${data.backgroundValue}') center/cover no-repeat fixed; `;
  } else if (data.backgroundType === "gradient" || theme === "gradient") {
    bgCSS = `background: linear-gradient(135deg, ${brand} 0%, ${accent} 100%); `;
  } else if (theme === "dark") {
    bgCSS = `background: #0f172a; `;
  } else if (theme === "glass") {
    bgCSS = `background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); `;
  } else if (theme === "bold") {
    bgCSS = `background: ${brand}; `;
  } else {
    bgCSS = `background: #f8fafc; `;
  }

  const isDark = theme === "dark" || theme === "glass" || theme === "bold" || theme === "gradient";
  const textColor = isDark ? "#ffffff" : "#1e293b";
  const subtextColor = isDark ? "rgba(255,255,255,0.65)" : "#64748b";
  const cardBg = isDark
    ? (theme === "glass" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)")
    : "#ffffff";
  const cardBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";

  // Button border-radius
  const btnRadius = btnStyle === "pill" ? "999px"
    : btnStyle === "square" ? "4px"
    : btnStyle === "rounded" ? "12px"
    : "12px"; // outlined, shadow

  // Button base
  let btnCSS = "";
  if (btnStyle === "outlined") {
    btnCSS = `
      background: transparent;
      border: 2px solid ${isDark ? "rgba(255,255,255,0.25)" : brand};
      color: ${isDark ? "#fff" : brand};
    `;
  } else if (btnStyle === "shadow") {
    btnCSS = `
      background: ${cardBg};
      border: 1px solid ${cardBorder};
      color: ${textColor};
      box-shadow: 0 4px 14px rgba(0,0,0,${isDark ? "0.3" : "0.1"});
    `;
  } else {
    // filled (rounded, pill, square)
    btnCSS = `
      background: ${isDark ? "rgba(255,255,255,0.12)" : brand};
      border: none;
      color: ${isDark ? "#fff" : readableTextOn(brand)};
    `;
  }

  return `
/* ═══ TIPOTE LINK-IN-BIO ═══ */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&${font ? `family=${encodeURIComponent(font)}:wght@400;600;700&` : ""}display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-font-smoothing: antialiased; }
body {
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  ${bgCSS}
  min-height: 100vh;
  color: ${textColor};
  line-height: 1.5;
}
img { max-width: 100%; height: auto; display: block; }
a { text-decoration: none; color: inherit; }

/* Container */
.lib-wrap {
  max-width: 480px;
  margin: 0 auto;
  padding: 48px 20px 32px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Profile header */
.lib-profile {
  text-align: center;
  margin-bottom: 28px;
}
.lib-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  object-fit: cover;
  margin: 0 auto 14px;
  border: 3px solid ${isDark ? "rgba(255,255,255,0.15)" : brand};
  ${theme === "glass" ? "backdrop-filter: blur(10px);" : ""}
}
.lib-logo {
  max-height: 40px;
  margin: 0 auto 12px;
}
.lib-name {
  font-family: ${headingFont}system-ui, -apple-system, sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}
.lib-bio {
  font-size: 0.9rem;
  color: ${subtextColor};
  max-width: 320px;
  margin: 0 auto;
  line-height: 1.5;
}

/* Links list */
.lib-links {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  list-style: none;
}

/* Link button */
.lib-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-radius: ${btnRadius};
  ${btnCSS}
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s;
  text-align: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 600;
  font-family: 'DM Sans', system-ui, sans-serif;
  position: relative;
  width: 100%;
}
.lib-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(${r},${g},${b},0.25);
  opacity: 0.9;
}
.lib-link:active {
  transform: scale(0.98);
}
.lib-link-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  position: absolute;
  left: 14px;
}
.lib-link.has-icon {
  justify-content: center;
  padding-left: 52px;
  padding-right: 52px;
}

/* Header / divider */
.lib-header {
  text-align: center;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${subtextColor};
  margin: 12px 0 4px;
}

/* Social icons row */
.lib-socials {
  display: flex;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  margin: 8px 0;
}
.lib-social-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${subtextColor};
  transition: color 0.2s, transform 0.2s;
}
.lib-social-icon:hover {
  color: ${isDark ? "#fff" : brand};
  transform: scale(1.15);
}
.lib-social-icon svg {
  width: 22px;
  height: 22px;
}

/* Capture form */
.lib-capture {
  background: ${isDark ? "rgba(255,255,255,0.06)" : "#fff"};
  border: 1px solid ${cardBorder};
  border-radius: 16px;
  padding: 24px 20px;
  text-align: center;
  ${theme === "glass" ? "backdrop-filter: blur(12px);" : ""}
}
.lib-capture h3 {
  font-family: ${headingFont}system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.lib-capture p {
  font-size: 0.85rem;
  color: ${subtextColor};
  margin-bottom: 14px;
}
.lib-capture-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lib-capture-form input {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1.5px solid ${cardBorder};
  background: ${isDark ? "rgba(255,255,255,0.08)" : "#f8fafc"};
  color: ${textColor};
  font-size: 0.9rem;
  font-family: 'DM Sans', system-ui, sans-serif;
  outline: none;
  transition: border-color 0.2s;
}
.lib-capture-form input:focus {
  border-color: ${brand};
}
.lib-capture-form input::placeholder {
  color: ${isDark ? "rgba(255,255,255,0.35)" : "#94a3b8"};
}
.lib-capture-btn {
  padding: 12px;
  border-radius: 10px;
  background: ${brand};
  color: ${readableTextOn(brand)};
  font-weight: 700;
  font-size: 0.9rem;
  border: none;
  cursor: pointer;
  font-family: 'DM Sans', system-ui, sans-serif;
  transition: opacity 0.2s;
}
.lib-capture-btn:hover { opacity: 0.9; }
.lib-capture-ok {
  display: none;
  padding: 16px;
  text-align: center;
  font-weight: 600;
  color: ${isDark ? "#4ade80" : "#16a34a"};
}

/* Footer */
.lib-footer {
  margin-top: 32px;
  padding-top: 20px;
  text-align: center;
}
.lib-footer a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: ${subtextColor};
  transition: color 0.2s;
}
.lib-footer a:hover { color: ${textColor}; }
.lib-footer img.lib-footer-logo {
  height: 14px;
  width: auto;
  display: inline-block;
  vertical-align: middle;
  opacity: 0.7;
}

/* Animations */
@keyframes lib-fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.lib-links > * {
  animation: lib-fadeUp 0.4s ease backwards;
}
${Array.from({ length: 20 }, (_, i) => `.lib-links > *:nth-child(${i + 1}) { animation-delay: ${i * 0.06}s; }`).join("\n")}

/* Responsive */
@media (max-width: 520px) {
  .lib-wrap { padding: 32px 16px 24px; }
  .lib-avatar { width: 72px; height: 72px; }
  .lib-name { font-size: 1.1rem; }
}
`;
}

// ─────────────── HTML Blocks ───────────────

function blockLink(link: LinkinbioLink, pageId: string): string {
  const hasIcon = !!link.icon_url;
  return `<a href="${esc(link.url || "#")}" class="lib-link${hasIcon ? " has-icon" : ""}" data-link-id="${esc(link.id)}" data-page-id="${esc(pageId)}" target="_blank" rel="noopener noreferrer">${
    hasIcon ? `<img src="${esc(link.icon_url)}" alt="" class="lib-link-icon" loading="lazy">` : ""
  }${esc(link.title)}</a>`;
}

function blockHeader(link: LinkinbioLink): string {
  return `<div class="lib-header">${esc(link.title)}</div>`;
}

function blockSocialIcons(link: LinkinbioLink): string {
  const icons = link.social_links || [];
  if (icons.length === 0) return "";
  return `<div class="lib-socials">${icons.map((s) => {
    const svg = SOCIAL_ICONS[s.platform] || SOCIAL_ICONS.website;
    return `<a href="${esc(s.url)}" class="lib-social-icon" target="_blank" rel="noopener noreferrer" aria-label="${esc(s.platform)}">${svg}</a>`;
  }).join("")}</div>`;
}

function blockCaptureForm(link: LinkinbioLink, data: LinkinbioPageData): string {
  const heading = data.captureHeading || link.title || "Stay in touch";
  const subtitle = data.captureSubtitle || "";
  const askFirst = data.captureFirstName !== false;
  const pageId = data.pageId;
  return `<div class="lib-capture" data-page-id="${esc(pageId)}">
  <h3>${esc(heading)}</h3>
  ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
  <div class="lib-capture-form" id="lib-capture-form">
    ${askFirst ? `<input type="text" name="first_name" placeholder="${esc(data.locale === "fr" ? "Ton pr\u00e9nom" : data.locale === "es" ? "Tu nombre" : data.locale === "it" ? "Il tuo nome" : data.locale === "ar" ? "\u0627\u0633\u0645\u0643" : "Your first name")}" required>` : ""}
    <input type="email" name="email" placeholder="${esc(data.locale === "fr" ? "Ton email" : data.locale === "es" ? "Tu email" : data.locale === "it" ? "La tua email" : data.locale === "ar" ? "\u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a" : "Your email")}" required>
    <button type="button" class="lib-capture-btn" onclick="libCapture(this)">
      ${esc(data.locale === "fr" ? "C'est parti !" : data.locale === "es" ? "\u00a1Vamos!" : data.locale === "it" ? "Andiamo!" : data.locale === "ar" ? "\u0647\u064a\u0627 \u0628\u0646\u0627!" : "Let's go!")}
    </button>
  </div>
  <div class="lib-capture-ok" id="lib-capture-ok">
    ${esc(data.locale === "fr" ? "Merci ! Tu es inscrit(e) \u2728" : data.locale === "es" ? "\u00a1Gracias! Est\u00e1s suscrito/a \u2728" : data.locale === "it" ? "Grazie! Sei iscritto/a \u2728" : data.locale === "ar" ? "\u0634\u0643\u0631\u064b\u0627! \u062a\u0645 \u0627\u0644\u062a\u0633\u062c\u064a\u0644 \u2728" : "Thanks! You're subscribed \u2728")}
  </div>
</div>`;
}

// ─────────────── Footer ───────────────

function buildFooter(locale?: string): string {
  const text = locale === "fr" ? "Toi aussi, cr\u00e9e ta page multiliens avec"
    : locale === "es" ? "T\u00fa tambi\u00e9n puedes crear tu p\u00e1gina multienlaces con"
    : locale === "it" ? "Anche tu puoi creare la tua pagina multilink con"
    : locale === "ar" ? "\u0623\u0646\u062a \u0623\u064a\u0636\u064b\u0627 \u064a\u0645\u0643\u0646\u0643 \u0625\u0646\u0634\u0627\u0621 \u0635\u0641\u062d\u0629 \u0631\u0648\u0627\u0628\u0637 \u0645\u062a\u0639\u062f\u062f\u0629 \u0645\u0639"
    : "You too can create your link-in-bio page with";
  return `<footer class="lib-footer">
  <a href="https://www.tipote.com/" target="_blank" rel="noopener noreferrer">
    ${esc(text)} <strong>Tipote</strong>
  </a>
</footer>`;
}

// ─────────────── Scripts ───────────────

function buildScripts(pageId: string): string {
  return `<script>
// Click tracking
document.querySelectorAll('.lib-link[data-link-id]').forEach(function(el){
  el.addEventListener('click', function(e){
    var lid = el.getAttribute('data-link-id');
    var pid = el.getAttribute('data-page-id');
    if(lid && pid && navigator.sendBeacon){
      navigator.sendBeacon('/api/pages/'+pid+'/links/'+lid+'/click');
    }
  });
});

// Capture form
function libCapture(btn){
  var form = document.getElementById('lib-capture-form');
  var ok = document.getElementById('lib-capture-ok');
  if(!form) return;
  var email = form.querySelector('input[name="email"]');
  var fname = form.querySelector('input[name="first_name"]');
  if(!email || !email.value || !email.value.includes('@')) return;
  btn.disabled = true;
  btn.textContent = '...';
  fetch('/api/pages/${pageId}/leads', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      email: email.value,
      first_name: fname ? fname.value : ''
    })
  }).then(function(){
    form.style.display='none';
    ok.style.display='block';
  }).catch(function(){
    btn.disabled=false;
    btn.textContent='Retry';
  });
}
</script>`;
}

// ─────────────── Main Build Function ───────────────

export function buildLinkinbioPage(data: LinkinbioPageData): string {
  const lang = (data.locale || "fr").slice(0, 2);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const css = buildThemeCSS(data);

  const enabledLinks = data.links
    .filter((l) => l.enabled)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Build blocks HTML
  const blocksHtml = enabledLinks.map((link) => {
    switch (link.block_type) {
      case "link": return blockLink(link, data.pageId);
      case "header": return blockHeader(link);
      case "social_icons": return blockSocialIcons(link);
      case "capture_form": return blockCaptureForm(link, data);
      default: return "";
    }
  }).join("\n    ");

  // OG meta
  const title = data.metaTitle || data.displayName || "Link in Bio";
  const description = data.metaDescription || data.bio || "";

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
<meta name="robots" content="index, follow">
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ""}
<meta property="og:type" content="website">
${data.ogImageUrl ? `<meta property="og:image" content="${esc(data.ogImageUrl)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<style>${css}</style>
</head>
<body>
<div class="lib-wrap">
  <div class="lib-profile">
    ${data.avatarUrl ? `<img src="${esc(data.avatarUrl)}" alt="${esc(data.displayName)}" class="lib-avatar" loading="lazy">` : ""}
    ${data.logoUrl ? `<img src="${esc(data.logoUrl)}" alt="" class="lib-logo" loading="lazy">` : ""}
    <div class="lib-name">${esc(data.displayName)}</div>
    ${data.bio ? `<div class="lib-bio">${esc(data.bio)}</div>` : ""}
  </div>

  <div class="lib-links">
    ${blocksHtml}
  </div>

  ${buildFooter(lang)}
</div>
${buildScripts(data.pageId)}
</body>
</html>`;
}
