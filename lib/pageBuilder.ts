// lib/pageBuilder.ts
// Programmatic page builder — replaces the template system.
//
// Instead of loading HTML templates and injecting content, this module
// BUILDS complete pages from scratch using the AI-generated content data.
// This ensures:
// - Consistent, premium-quality design across all pages
// - Full branding integration (colors, fonts, photos)
// - Responsive layout by default
// - No template/content mismatches
// - Unique designs that don't look like generic AI output

// ─────────────── Types ───────────────

type PageParams = {
  pageType: "capture" | "sales" | "showcase";
  contentData: Record<string, any>;
  brandTokens?: Record<string, any> | null;
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
    .replace(/'/g, "&#039;")
    .replace(/[^\x00-\x7F]/g, (ch) => "&#" + ch.codePointAt(0) + ";");
}

function safe(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
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
  if (isNaN(r)) r = 37;
  if (isNaN(g)) g = 99;
  if (isNaN(b)) b = 235;
  return [r, g, b];
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Relative luminance (WCAG 2.1) — returns 0 (black) to 1 (white) */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(
    (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Ensures brand/accent colors used on dark backgrounds are lightened for visibility.
 *  On dark sections (hero, footer, CTA), brand colors used in SVGs/illustrations
 *  should be light enough to be visible. */
function ensureContrastOnDark(hex: string): string {
  const lum = luminance(hex);
  if (lum >= 0.15) return hex; // Already bright enough for dark backgrounds
  // Lighten: blend with white
  const [r, g, b] = hexToRgb(hex);
  const factor = 0.5;
  const nr = Math.min(255, Math.round(r + (255 - r) * factor));
  const ng = Math.min(255, Math.round(g + (255 - g) * factor));
  const nb = Math.min(255, Math.round(b + (255 - b) * factor));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

/** Ensures text on light backgrounds is dark enough to be readable */
function ensureContrastOnLight(hex: string): string {
  const lum = luminance(hex);
  if (lum <= 0.6) return hex; // Already dark enough for light backgrounds
  // Darken: blend with black
  const [r, g, b] = hexToRgb(hex);
  const factor = 0.5;
  const nr = Math.round(r * factor);
  const ng = Math.round(g * factor);
  const nb = Math.round(b * factor);
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

/** WCAG contrast ratio between two hex colors */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Returns a text color that guarantees readability on any background.
 *  For dark backgrounds → white, for light backgrounds → dark gray.
 *  For medium backgrounds → picks whichever has better contrast. */
function readableTextColor(bgHex: string): string {
  const bgLum = luminance(bgHex);
  return bgLum > 0.4 ? "#1e293b" : "#ffffff";
}

/** Returns a muted/secondary text color readable on the given background */
function readableSubtextColor(bgHex: string): string {
  const bgLum = luminance(bgHex);
  return bgLum > 0.4 ? "#475569" : "rgba(255,255,255,0.7)";
}

// ─────────────── Page i18n ───────────────

type PageStrings = {
  firstNamePlaceholder: string;
  emailPlaceholder: string;
  privacyConsent: string;
  privacyPolicy: string;
  defaultCtaCapture: string;
  defaultCtaSales: string;
  benefitsTitle: string;
  contactTitle: string;
  contactCta: string;
  discover: string;
  imageHint: string;
  footerPrivacy: string;
};

const PAGE_I18N: Record<string, PageStrings> = {
  fr: {
    firstNamePlaceholder: "Ton pr&#233;nom",
    emailPlaceholder: "Ton adresse email",
    privacyConsent: "J&#039;accepte la <a href=\"{url}\" target=\"_blank\" rel=\"noopener\">politique de confidentialit&#233;</a> et de recevoir des emails.",
    privacyPolicy: "Politique de confidentialit&#233;",
    defaultCtaCapture: "Je m&#039;inscris !",
    defaultCtaSales: "Je rejoins maintenant",
    benefitsTitle: "Ce que vous allez obtenir",
    contactTitle: "Contactez-nous",
    contactCta: "Envoyer",
    discover: "D&#233;couvrir",
    imageHint: "Cliquez pour changer l&#8217;image",
    footerPrivacy: "Politique de confidentialit&#233;",
  },
  en: {
    firstNamePlaceholder: "Your first name",
    emailPlaceholder: "Your email address",
    privacyConsent: "I agree to the <a href=\"{url}\" target=\"_blank\" rel=\"noopener\">privacy policy</a> and to receive emails.",
    privacyPolicy: "Privacy Policy",
    defaultCtaCapture: "Sign up now!",
    defaultCtaSales: "Join now",
    benefitsTitle: "What you&#039;ll get",
    contactTitle: "Contact us",
    contactCta: "Send",
    discover: "Discover",
    imageHint: "Click to change the image",
    footerPrivacy: "Privacy Policy",
  },
  es: {
    firstNamePlaceholder: "Tu nombre",
    emailPlaceholder: "Tu correo electr&#243;nico",
    privacyConsent: "Acepto la <a href=\"{url}\" target=\"_blank\" rel=\"noopener\">pol&#237;tica de privacidad</a> y recibir emails.",
    privacyPolicy: "Pol&#237;tica de privacidad",
    defaultCtaCapture: "&#161;Quiero inscribirme!",
    defaultCtaSales: "Unirme ahora",
    benefitsTitle: "Lo que vas a obtener",
    contactTitle: "Cont&#225;ctanos",
    contactCta: "Enviar",
    discover: "Descubrir",
    imageHint: "Haz clic para cambiar la imagen",
    footerPrivacy: "Pol&#237;tica de privacidad",
  },
  it: {
    firstNamePlaceholder: "Il tuo nome",
    emailPlaceholder: "La tua email",
    privacyConsent: "Accetto la <a href=\"{url}\" target=\"_blank\" rel=\"noopener\">privacy policy</a> e di ricevere email.",
    privacyPolicy: "Privacy Policy",
    defaultCtaCapture: "Iscriviti ora!",
    defaultCtaSales: "Unisciti ora",
    benefitsTitle: "Cosa otterrai",
    contactTitle: "Contattaci",
    contactCta: "Invia",
    discover: "Scopri",
    imageHint: "Clicca per cambiare l&#039;immagine",
    footerPrivacy: "Privacy Policy",
  },
  ar: {
    firstNamePlaceholder: "&#1575;&#1587;&#1605;&#1603; &#1575;&#1604;&#1571;&#1608;&#1604;",
    emailPlaceholder: "&#1576;&#1585;&#1610;&#1583;&#1603; &#1575;&#1604;&#1573;&#1604;&#1603;&#1578;&#1585;&#1608;&#1606;&#1610;",
    privacyConsent: "&#1571;&#1608;&#1575;&#1601;&#1602; &#1593;&#1604;&#1609; <a href=\"{url}\" target=\"_blank\" rel=\"noopener\">&#1587;&#1610;&#1575;&#1587;&#1577; &#1575;&#1604;&#1582;&#1589;&#1608;&#1589;&#1610;&#1577;</a> &#1608;&#1578;&#1604;&#1602;&#1610; &#1575;&#1604;&#1585;&#1587;&#1575;&#1574;&#1604;.",
    privacyPolicy: "&#1587;&#1610;&#1575;&#1587;&#1577; &#1575;&#1604;&#1582;&#1589;&#1608;&#1589;&#1610;&#1577;",
    defaultCtaCapture: "!&#1587;&#1580;&#1604; &#1575;&#1604;&#1570;&#1606;",
    defaultCtaSales: "&#1575;&#1606;&#1590;&#1605; &#1575;&#1604;&#1570;&#1606;",
    benefitsTitle: "&#1605;&#1575; &#1587;&#1578;&#1581;&#1589;&#1604; &#1593;&#1604;&#1610;&#1607;",
    contactTitle: "&#1575;&#1578;&#1589;&#1604; &#1576;&#1606;&#1575;",
    contactCta: "&#1573;&#1585;&#1587;&#1575;&#1604;",
    discover: "&#1575;&#1603;&#1578;&#1588;&#1601;",
    imageHint: "&#1575;&#1606;&#1602;&#1585; &#1604;&#1578;&#1594;&#1610;&#1610;&#1585; &#1575;&#1604;&#1589;&#1608;&#1585;&#1577;",
    footerPrivacy: "&#1587;&#1610;&#1575;&#1587;&#1577; &#1575;&#1604;&#1582;&#1589;&#1608;&#1589;&#1610;&#1577;",
  },
};

function getPageStrings(lang: string): PageStrings {
  return PAGE_I18N[lang] || PAGE_I18N.fr;
}

// ─────────────── CSS Generation ───────────────

function buildCSS(primary: string, accent: string, font: string, heroBg?: string, sectionBg?: string): string {
  const safePrimary = primary || "#2563eb";
  const safeAccent = accent || safePrimary;
  // Generate contrast-aware variants for dark backgrounds (hero, footer, CTA sections)
  const brandOnDark = ensureContrastOnDark(safePrimary);
  // Text color for brand-colored buttons: white on dark brand, dark on light brand
  const brandTextColor = luminance(safePrimary) > 0.4 ? "#1e293b" : "#ffffff";
  // Ensure accent on light backgrounds is dark enough
  const accentOnLight = ensureContrastOnLight(safeAccent);
  const p40 = hexToRgba(safePrimary, 0.4);
  const p25 = hexToRgba(safePrimary, 0.25);
  const p15 = hexToRgba(safePrimary, 0.15);
  const p10 = hexToRgba(safePrimary, 0.1);
  const p60 = hexToRgba(safePrimary, 0.6);
  const headingFont = font ? `'${font}', ` : "";

  return `
/* ═══ TIPOTE PAGE BUILDER — Premium Design System ═══ */
:root {
  --brand: ${safePrimary};
  --brand-accent: ${safeAccent};
  --brand-on-dark: ${brandOnDark};
  --brand-text: ${brandTextColor};
  --accent-on-light: ${accentOnLight};
  --brand-40: ${p40};
  --brand-25: ${p25};
  --brand-15: ${p15};
  --brand-10: ${p10};
  --brand-60: ${p60};
  --heading-font: ${headingFont}system-ui, -apple-system, sans-serif;
  --body-font: 'DM Sans', system-ui, -apple-system, sans-serif;
  --dark: #0f172a;
  --dark-2: #1e293b;
  --gray-50: #f8fafc;
  --gray-100: #f1f5f9;
  --gray-200: #e2e8f0;
  --gray-300: #cbd5e1;
  --gray-400: #94a3b8;
  --gray-500: #64748b;
  --gray-600: #475569;
  --gray-700: #334155;
  --gray-800: #1e293b;
  --gray-900: #0f172a;
  --white: #ffffff;
  --radius: 12px;
  --radius-lg: 20px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow: 0 4px 16px rgba(0,0,0,0.1);
  --shadow-lg: 0 12px 40px rgba(0,0,0,0.12);
  --shadow-xl: 0 25px 80px rgba(0,0,0,0.18);
  --container: 1140px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; }
body {
  font-family: var(--body-font);
  color: var(--gray-900);
  background: var(--white);
  line-height: 1.6;
  overflow-x: hidden;
}
img { max-width: 100%; height: auto; display: block; }
a { color: var(--brand); text-decoration: none; }

/* Container */
.tp-container { max-width: var(--container); margin: 0 auto; padding: 0 24px; width: 100%; }

/* Animations */
@keyframes tp-fadeUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
@keyframes tp-fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes tp-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-12px); } }
@keyframes tp-progressFill { from { width:0; } to { width: var(--target-width, 75%); } }
@keyframes tp-typing { 0%,80%,100% { opacity:.3; transform:scale(.8); } 40% { opacity:1; transform:scale(1); } }
@keyframes tp-pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }
@keyframes tp-slideInLeft { from { opacity:0; transform:translateX(-40px); } to { opacity:1; transform:translateX(0); } }
@keyframes tp-slideInRight { from { opacity:0; transform:translateX(40px); } to { opacity:1; transform:translateX(0); } }

/* ─── HEADER BAR ─── */
.tp-header-bar {
  background: var(--brand);
  color: var(--brand-text);
  text-align: center;
  padding: 10px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* ─── HERO SECTION (Capture) ─── */
.tp-hero {
  background: ${heroBg ? heroBg : "linear-gradient(135deg, var(--dark) 0%, var(--dark-2) 50%, #0f2847 100%)"};
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: 80px 24px;
  position: relative;
  overflow: hidden;
}
.tp-hero::before {
  content: "";
  position: absolute;
  top: -50%;
  right: -30%;
  width: 80%;
  height: 160%;
  background: radial-gradient(ellipse, ${p10} 0%, transparent 70%);
  pointer-events: none;
}
.tp-hero-grid {
  max-width: var(--container);
  margin: 0 auto;
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 64px;
  align-items: center;
  position: relative;
  z-index: 1;
}
.tp-hero-left { animation: tp-slideInLeft 0.7s ease 0.1s backwards; }
.tp-hero-right { animation: tp-slideInRight 0.7s ease 0.3s backwards; }
.tp-hero h1 {
  font-family: var(--heading-font);
  font-size: clamp(1.8rem, 3.5vw, 3rem);
  font-weight: 800;
  line-height: 1.12;
  color: #fff;
  margin-bottom: 16px;
  letter-spacing: -0.02em;
}
.tp-hero-subtitle {
  font-size: 1.1rem;
  line-height: 1.7;
  color: var(--gray-300);
  margin-bottom: 28px;
}
.tp-hero-bullets { list-style: none; margin-bottom: 32px; }
.tp-hero-bullets li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--gray-200);
}
.tp-hero-bullets .tp-check {
  color: var(--brand-on-dark);
  font-size: 1.15rem;
  flex-shrink: 0;
  margin-top: 2px;
  font-weight: 700;
}

/* ─── CAPTURE FORM ─── */
.tp-form { max-width: 400px; display: flex; flex-direction: column; gap: 10px; }
.tp-form input[type="text"],
.tp-form input[type="email"] {
  padding: 14px 18px;
  border: 2px solid rgba(255,255,255,0.12);
  border-radius: var(--radius);
  font-size: 1rem;
  outline: none;
  width: 100%;
  background: rgba(255,255,255,0.06);
  color: #fff;
  transition: border-color 0.2s, background 0.2s;
  font-family: var(--body-font);
}
.tp-form input[type="text"]:focus,
.tp-form input[type="email"]:focus {
  border-color: var(--brand);
  background: rgba(255,255,255,0.1);
}
.tp-form input::placeholder { color: var(--gray-400); }
.tp-form-legal {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  margin: 2px 0;
  line-height: 1.4;
}
.tp-form-legal input[type="checkbox"] {
  margin-top: 3px;
  accent-color: var(--brand);
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}
.tp-form-legal a { color: rgba(255,255,255,0.6); text-decoration: underline; }
.tp-cta-btn {
  padding: 16px 28px;
  background: var(--brand);
  color: var(--brand-text);
  border: none;
  border-radius: var(--radius);
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  width: 100%;
  letter-spacing: 0.3px;
  box-shadow: 0 8px 24px var(--brand-40);
  transition: transform 0.2s, box-shadow 0.2s;
  font-family: var(--heading-font);
}
.tp-cta-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px var(--brand-60);
}
.tp-cta-sub { font-size: 0.75rem; color: rgba(255,255,255,0.4); text-align: center; margin-top: 4px; }

/* ─── HERO VISUAL (Illustration) ─── */
.tp-visual {
  position: relative;
  cursor: pointer;
  transition: transform 0.3s;
}
.tp-visual:hover { transform: scale(1.02); }
.tp-visual-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.7);
  color: #fff;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.72rem;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
  white-space: nowrap;
}
.tp-visual:hover .tp-visual-hint { opacity: 1; }
.tp-visual img.tp-user-img {
  width: 100%;
  max-width: 520px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  object-fit: cover;
}
.tp-mockup {
  background: var(--white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  width: 100%;
  max-width: 520px;
}
.tp-mock-bar {
  background: var(--gray-50);
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid var(--gray-200);
}
.tp-mock-dot { width: 9px; height: 9px; border-radius: 50%; }
.tp-mock-dot.r { background: #ff5f57; }
.tp-mock-dot.y { background: #ffbd2e; }
.tp-mock-dot.g { background: #28c840; }

/* Mockup interiors (shared) */
.tp-mock-body { min-height: 260px; }
.tp-mock-sidebar { width: 150px; background: var(--gray-50); padding: 14px; border-right: 1px solid var(--gray-100); }
.tp-mock-nav-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 6px; font-size: 0.72rem; color: var(--gray-500); margin-bottom: 2px; }
.tp-mock-nav-item.active { background: var(--brand-10); color: var(--brand); font-weight: 500; }
.tp-mock-nav-dot { width: 12px; height: 12px; background: currentColor; border-radius: 3px; opacity: 0.35; flex-shrink: 0; }
.tp-mock-main { flex: 1; padding: 16px; }
.tp-mock-h { font-size: 0.95rem; font-weight: 600; color: var(--gray-900); margin-bottom: 3px; }
.tp-mock-sub { font-size: 0.72rem; color: var(--gray-500); margin-bottom: 14px; }
.tp-mock-prog-wrap { margin-bottom: 14px; }
.tp-mock-prog-head { display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--gray-500); margin-bottom: 5px; }
.tp-mock-prog-val { font-weight: 600; color: var(--brand); }
.tp-mock-prog-bar { height: 6px; background: var(--gray-100); border-radius: 3px; overflow: hidden; }
.tp-mock-prog-fill { height: 100%; background: var(--brand); border-radius: 3px; --target-width: 75%; animation: tp-progressFill 1.5s ease 1s forwards; width: 0; }
.tp-mock-task { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: var(--gray-50); border-radius: 6px; font-size: 0.72rem; color: var(--gray-900); margin-bottom: 5px; }
.tp-mock-task-chk { width: 15px; height: 15px; border-radius: 50%; border: 2px solid var(--gray-300); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.5rem; }
.tp-mock-task.done .tp-mock-task-chk { background: var(--brand); border-color: var(--brand); color: #fff; }
.tp-mock-task.done { color: var(--gray-400); }

/* Ebook mockup */
.tp-mock-ebook { padding: 28px; text-align: center; min-height: 260px; display: flex; flex-direction: column; justify-content: center; background: linear-gradient(135deg, var(--gray-50), #eef2ff); }
.tp-mock-ebook-badge { display: inline-block; background: var(--brand); color: #fff; padding: 3px 12px; border-radius: 16px; font-size: 0.65rem; font-weight: 700; margin: 0 auto 14px; letter-spacing: 1px; }
.tp-mock-ebook-title { font-size: 1.1rem; font-weight: 700; color: var(--gray-900); margin-bottom: 5px; }
.tp-mock-ebook-sub { font-size: 0.75rem; color: var(--gray-500); margin-bottom: 16px; }
.tp-mock-ebook-ch { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 0.72rem; color: var(--gray-700); border-bottom: 1px solid var(--gray-200); text-align: left; max-width: 260px; margin: 0 auto; }
.tp-mock-ebook-num { width: 20px; height: 20px; background: var(--brand); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700; flex-shrink: 0; }

/* Calendar mockup */
.tp-mock-calendar { padding: 18px; min-height: 260px; }
.tp-mock-cal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 7px; margin-top: 12px; }
.tp-mock-cal-day { padding: 10px 6px; border-radius: 8px; background: var(--gray-50); text-align: center; border: 2px solid transparent; font-size: 0.68rem; }
.tp-mock-cal-day.done { background: var(--brand-10); border-color: var(--brand); }
.tp-mock-cal-day.cur { border-color: var(--brand); background: #fff; box-shadow: var(--shadow-sm); }
.tp-mock-cal-num { display: block; font-size: 1rem; font-weight: 700; color: var(--gray-900); }

/* Chat mockup */
.tp-mock-chat { padding: 14px; min-height: 260px; display: flex; flex-direction: column; background: var(--gray-50); }
.tp-mock-chat-head { font-size: 0.8rem; font-weight: 600; color: var(--gray-900); padding: 7px 10px; background: #fff; border-radius: 8px; margin-bottom: 10px; box-shadow: var(--shadow-sm); }
.tp-mock-chat-msgs { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.tp-mock-chat-msg { padding: 9px 12px; border-radius: 10px; font-size: 0.75rem; max-width: 80%; line-height: 1.4; }
.tp-mock-chat-msg.user { background: var(--brand); color: #fff; align-self: flex-end; border-bottom-right-radius: 3px; }
.tp-mock-chat-msg.bot { background: #fff; color: var(--gray-700); align-self: flex-start; border-bottom-left-radius: 3px; box-shadow: var(--shadow-sm); }
.tp-mock-chat-typing { display: flex; gap: 4px; padding: 9px 12px; background: #fff; border-radius: 10px; align-self: flex-start; box-shadow: var(--shadow-sm); }
.tp-mock-chat-typing span { width: 6px; height: 6px; background: var(--gray-400); border-radius: 50%; animation: tp-typing 1.4s infinite; }
.tp-mock-chat-typing span:nth-child(2) { animation-delay: .2s; }
.tp-mock-chat-typing span:nth-child(3) { animation-delay: .4s; }

/* Checklist mockup */
.tp-mock-checklist { padding: 20px; min-height: 260px; }
.tp-mock-cl-item { display: flex; align-items: center; gap: 9px; padding: 9px 10px; background: var(--gray-50); border-radius: 7px; font-size: 0.75rem; color: var(--gray-700); margin-bottom: 5px; }
.tp-mock-cl-chk { width: 18px; height: 18px; border-radius: 5px; border: 2px solid var(--gray-300); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.6rem; color: transparent; }
.tp-mock-cl-item.done .tp-mock-cl-chk { background: var(--brand); border-color: var(--brand); color: #fff; }
.tp-mock-cl-item.done { color: var(--gray-400); text-decoration: line-through; }

/* Video call mockup */
.tp-mock-vc { padding: 18px; min-height: 260px; display: flex; flex-direction: column; background: #1a1a2e; }
.tp-mock-vc-head { color: #fff; font-size: 0.8rem; font-weight: 600; text-align: center; margin-bottom: 14px; }
.tp-mock-vc-grid { display: flex; gap: 14px; justify-content: center; flex: 1; align-items: center; }
.tp-mock-vc-avatar { text-align: center; color: #999; font-size: 0.65rem; }
.tp-mock-vc-circle { width: 90px; height: 90px; border-radius: 14px; background: #2a2a4a; display: flex; align-items: center; justify-content: center; font-size: 2.2rem; margin-bottom: 5px; }
.tp-mock-vc-you { border: 2px solid var(--brand); }
.tp-mock-vc-bar { display: flex; gap: 10px; justify-content: center; margin-top: 14px; }
.tp-mock-vc-btn { width: 32px; height: 32px; border-radius: 50%; background: #333; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; }
.tp-mock-vc-end { background: #dc2626; }

/* Certificate mockup */
.tp-mock-cert { padding: 22px; min-height: 260px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #fffbeb, #fef3c7); }
.tp-mock-cert-inner { border: 3px solid var(--brand); border-radius: 10px; padding: 24px 28px; text-align: center; width: 100%; background: #fff; }
.tp-mock-cert-icon { font-size: 2.2rem; margin-bottom: 8px; }
.tp-mock-cert-title { font-size: 1rem; font-weight: 700; color: var(--gray-900); }
.tp-mock-cert-sub { font-size: 0.72rem; color: var(--gray-500); margin-top: 3px; }
.tp-mock-cert-line { width: 50%; height: 2px; background: var(--brand); margin: 10px auto; opacity: 0.35; }
.tp-mock-cert-name { font-size: 0.8rem; color: var(--gray-400); font-style: italic; }

/* Floating cards */
.tp-float {
  position: absolute;
  background: #fff;
  border-radius: var(--radius);
  padding: 11px 14px;
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  gap: 10px;
  animation: tp-float 4s ease-in-out infinite;
  z-index: 2;
}
.tp-float-1 { top: -18px; right: -18px; }
.tp-float-2 { bottom: 55px; left: -28px; animation-delay: 1s; }
.tp-float-3 { bottom: -14px; right: 28px; animation-delay: 2s; }
.tp-float-icon { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; flex-shrink: 0; }
.tp-float-icon.i1 { background: #e0f2fe; }
.tp-float-icon.i2 { background: #fce7f3; }
.tp-float-icon.i3 { background: #d1fae5; }
.tp-float-val { font-size: 0.88rem; font-weight: 700; color: var(--gray-900); }
.tp-float-lbl { font-size: 0.65rem; color: var(--gray-500); }

/* ─── CONTENT SECTIONS ─── */
.tp-section {
  padding: 80px 40px;
  position: relative;
}
.tp-section.alt { background: ${sectionBg || "var(--gray-100)"}; }
.tp-section.dark {
  background: linear-gradient(135deg, var(--dark) 0%, var(--dark-2) 100%);
  color: #fff;
}
.tp-section-header {
  text-align: center;
  max-width: 650px;
  margin: 0 auto 48px;
}
.tp-section-title {
  font-family: var(--heading-font);
  font-size: clamp(1.5rem, 2.5vw, 2.2rem);
  font-weight: 800;
  color: var(--gray-900);
  margin-bottom: 16px;
  line-height: 1.25;
  letter-spacing: -0.01em;
  max-width: 580px;
  margin-left: auto;
  margin-right: auto;
}
.tp-section.dark .tp-section-title { color: #fff; }
.tp-section-subtitle {
  font-size: 1.05rem;
  color: var(--gray-500);
  line-height: 1.8;
  max-width: 560px;
  margin-left: auto;
  margin-right: auto;
}
.tp-section.dark .tp-section-subtitle { color: var(--gray-300); }
/* Left-align text blocks with more than 2 visual lines */
.tp-text-left { text-align: left !important; }
.tp-accent-line {
  width: 50px;
  height: 4px;
  background: var(--brand);
  border-radius: 2px;
  margin: 0 auto 20px;
}
.tp-section.dark .tp-accent-line { background: var(--brand-on-dark); }
/* Ensure SVG illustrations on dark sections use visible brand color */
.tp-section.dark .tp-illust svg *[stroke] { stroke: var(--brand-on-dark); }
.tp-section.dark .tp-illust svg *[fill]:not([fill="none"]):not([fill="white"]):not([fill="#fff"]):not([fill="#ffffff"]) { fill: var(--brand-on-dark); }

/* ─── BENEFITS GRID ─── */
.tp-benefits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  max-width: var(--container);
  margin: 0 auto;
}
.tp-benefit-card {
  background: var(--white);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius);
  padding: 28px 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.tp-benefit-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--brand);
}
.tp-benefit-num {
  width: 36px;
  height: 36px;
  background: var(--brand);
  color: #fff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 14px;
}
.tp-benefit-text {
  font-size: 0.95rem;
  color: var(--gray-700);
  line-height: 1.7;
  text-align: left;
}

/* ─── PROGRAM / STEPS ─── */
.tp-steps {
  max-width: 700px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}
.tp-steps::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--brand-15);
  border-radius: 2px;
  display: none; /* Hide timeline — badges are now pills, not circles */
}
.tp-step {
  display: flex;
  gap: 20px;
  padding: 20px 0;
  position: relative;
}
.tp-step-badge {
  min-width: 48px;
  height: auto;
  padding: 12px 16px;
  background: var(--brand);
  color: #fff;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  flex-shrink: 0;
  z-index: 1;
  box-shadow: 0 0 0 4px var(--white);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;
  line-height: 1.3;
}
.tp-section.alt .tp-step-badge { box-shadow: 0 0 0 6px var(--gray-100); }
.tp-step-content { flex: 1; padding-top: 10px; }
.tp-step-title {
  font-family: var(--heading-font);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--gray-900);
  margin-bottom: 4px;
}
.tp-step-desc { font-size: 0.92rem; color: var(--gray-500); line-height: 1.7; text-align: left; }

/* ─── ABOUT / AUTHOR ─── */
.tp-about {
  max-width: var(--container);
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 48px;
  align-items: center;
}
.tp-about-photo {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: var(--shadow-lg);
  border: 4px solid var(--white);
}
.tp-about-name {
  font-family: var(--heading-font);
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--gray-900);
  margin-bottom: 8px;
}
.tp-section.dark .tp-about-name { color: #fff; }
.tp-about-bio {
  font-size: 1rem;
  color: var(--gray-600);
  line-height: 1.8;
  text-align: left;
}
.tp-section.dark .tp-about-bio { color: var(--gray-300); }
.tp-about-proof {
  display: inline-block;
  margin-top: 16px;
  padding: 8px 18px;
  background: var(--brand-10);
  color: var(--brand);
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
}

/* ─── TESTIMONIALS ─── */
.tp-testimonials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  max-width: var(--container);
  margin: 0 auto;
}
.tp-testimonial-card {
  background: var(--white);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius);
  padding: 28px;
  position: relative;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.tp-testimonial-card::before {
  content: "\\201C";
  font-size: 3rem;
  color: var(--brand-25);
  position: absolute;
  top: 16px;
  left: 20px;
  line-height: 1;
  font-family: Georgia, serif;
}
.tp-testimonial-text {
  font-size: 0.95rem;
  color: var(--gray-600);
  line-height: 1.7;
  margin-bottom: 16px;
  padding-top: 20px;
  font-style: italic;
}
.tp-testimonial-author {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--gray-900);
}
.tp-testimonial-role {
  font-size: 0.78rem;
  color: var(--gray-400);
}

/* ─── FINAL CTA ─── */
.tp-final-cta {
  text-align: center;
  padding: 80px 24px;
  background: linear-gradient(135deg, var(--dark) 0%, #0f2847 100%);
  color: #fff;
  position: relative;
  overflow: hidden;
}
.tp-final-cta::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, ${p15} 0%, transparent 70%);
  pointer-events: none;
}
.tp-final-cta h2 {
  font-family: var(--heading-font);
  font-size: clamp(1.5rem, 2.5vw, 2.2rem);
  font-weight: 800;
  margin-bottom: 16px;
  position: relative;
}
.tp-final-cta p {
  font-size: 1.05rem;
  color: var(--gray-300);
  max-width: 600px;
  margin: 0 auto 32px;
  line-height: 1.7;
}
.tp-final-btn {
  display: inline-block;
  padding: 18px 40px;
  background: var(--brand);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 1.15rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 32px var(--brand-40);
  transition: transform 0.2s, box-shadow 0.2s;
  text-decoration: none;
  font-family: var(--heading-font);
  position: relative;
}
.tp-final-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 40px var(--brand-60);
}

/* ─── FOOTER ─── */
.tp-footer {
  background: var(--dark);
  text-align: center;
  padding: 36px 16px;
  font-size: 0.8rem;
  color: rgba(255,255,255,0.4);
  border-top: 1px solid rgba(255,255,255,0.06);
}
.tp-footer-logo { max-height: 32px; width: auto; margin: 0 auto 12px; }
.tp-footer-brand { font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.7); margin-bottom: 12px; }
.tp-footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; }
.tp-footer-links a { color: rgba(255,255,255,0.5); text-decoration: underline; font-size: 0.78rem; }
.tp-footer-links a:hover { color: rgba(255,255,255,0.8); }
.tp-footer-copy { margin-top: 12px; font-size: 0.72rem; }

/* ─── SALES-SPECIFIC ─── */
.tp-price-card {
  max-width: 480px;
  margin: 0 auto;
  background: var(--white);
  border: 2px solid var(--brand);
  border-radius: var(--radius-lg);
  padding: 40px;
  text-align: center;
  box-shadow: var(--shadow-xl);
}
.tp-price-old { font-size: 1.2rem; color: var(--gray-400); text-decoration: line-through; margin-bottom: 4px; }
.tp-price-amount { font-family: var(--heading-font); font-size: 3rem; font-weight: 900; color: var(--gray-900); }
.tp-price-note { font-size: 0.9rem; color: var(--gray-500); margin-top: 8px; }
.tp-guarantee-box {
  max-width: 700px;
  margin: 0 auto;
  background: var(--white);
  border: 2px solid var(--brand-15);
  border-radius: var(--radius);
  padding: 32px;
  text-align: center;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06);
}
.tp-guarantee-icon { font-size: 2.5rem; margin-bottom: 12px; }
.tp-faq-item {
  border: 1px solid var(--gray-200);
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 10px;
  background: var(--white);
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.tp-faq-q { font-weight: 700; font-size: 1rem; color: var(--gray-900); margin-bottom: 8px; }
.tp-faq-a { font-size: 0.92rem; color: var(--gray-600); line-height: 1.6; }

/* ─── INLINE ILLUSTRATIONS ─── */
.tp-illust {
  max-width: 500px;
  margin: 0 auto 32px;
  opacity: 0;
  animation: tp-fadeUp 0.8s ease 0.3s forwards;
}
.tp-illust svg { width: 100%; height: auto; }
.tp-illust-problem { max-width: 420px; margin-bottom: 28px; }
.tp-illust-solution { max-width: 420px; }
.tp-illust-transform { max-width: 520px; margin: 32px auto; }
.tp-illust-stats { max-width: 340px; margin: 24px auto 0; }
.tp-divider { max-width: 800px; margin: 0 auto; opacity: 0.5; }
.tp-benefit-icon-wrap { width: 44px; height: 44px; flex-shrink: 0; margin-bottom: 12px; }
.tp-benefit-icon-wrap svg { width: 100%; height: 100%; }

/* ─── RESPONSIVE ─── */
@media (max-width: 900px) {
  .tp-hero-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
  .tp-hero-right { order: -1; }
  .tp-visual { max-width: 380px; margin: 0 auto; }
  .tp-float { display: none; }
  .tp-hero { padding: 50px 20px !important; min-height: auto !important; }
  .tp-about { grid-template-columns: 1fr !important; text-align: center; }
  .tp-about-photo { margin: 0 auto 24px; width: 160px; height: 160px; }
  .tp-section { padding: 60px 24px; }
  /* Force inline grids to stack on tablet */
  [style*="grid-template-columns: repeat(2"] ,
  [style*="grid-template-columns: repeat(3"] ,
  [style*="grid-template-columns:repeat(2"] ,
  [style*="grid-template-columns:repeat(3"] {
    grid-template-columns: 1fr !important;
    max-width: 100% !important;
  }
}
/* ─── SHOWCASE NAV: tablet + mobile breakpoint ─── */
@media (max-width: 768px) {
  .tp-showcase-nav-links { display: none !important; }
  .tp-showcase-nav-cta { display: none !important; }
  .tp-nav-burger { display: flex !important; }
  .tp-nav-mobile-menu.open { display: flex !important; }
  .tp-showcase-nav-right { gap: 12px !important; }
}
@media (max-width: 520px) {
  .tp-hero h1 { font-size: 1.5rem !important; }
  .tp-hero h2 { font-size: 1.2rem !important; }
  .tp-section { padding: 40px 16px; }
  .tp-section-title { font-size: 1.3rem !important; }
  .tp-section-subtitle { font-size: 0.9rem !important; }
  .tp-container { padding: 0 16px; }
  .tp-mockup { max-width: 100%; }
  .tp-mock-sidebar { width: 90px; padding: 8px; font-size: 0.6rem; }
  .tp-mock-nav-item { font-size: 0.6rem; padding: 5px 6px; }
  .tp-benefits-grid { grid-template-columns: 1fr !important; }
  .tp-testimonials-grid { grid-template-columns: 1fr !important; }
  .tp-steps-timeline { grid-template-columns: 1fr !important; }
  .tp-price-card { padding: 24px 16px; }
  .tp-price-amount { font-size: 2.2rem !important; }
  .tp-final-cta { padding: 50px 20px !important; }
  .tp-final-cta h2 { font-size: 1.3rem !important; }
  .tp-final-btn { font-size: 0.95rem !important; padding: 14px 28px !important; }
  .tp-header-bar { font-size: 0.75rem; padding: 8px 12px; }
  .tp-faq-item { padding: 14px 16px; }
  .tp-guarantee-box { padding: 24px 16px; }
  /* Force ALL inline grids to single column on mobile */
  [style*="grid-template-columns"] {
    grid-template-columns: 1fr !important;
    max-width: 100% !important;
  }
  /* Ensure images don't overflow */
  img { max-width: 100% !important; height: auto !important; }
}

/* Hamburger button (hidden on desktop) */
.tp-nav-burger { display: none; align-items: center; justify-content: center; width: 40px; height: 40px; border: none; background: none; cursor: pointer; padding: 0; -webkit-tap-highlight-color: transparent; }
.tp-nav-burger svg { width: 22px; height: 22px; stroke: var(--gray-600); }
/* Mobile dropdown menu (hidden by default) */
.tp-nav-mobile-menu { display: none; flex-direction: column; gap: 4px; position: absolute; top: 100%; left: 0; right: 0; background: var(--white); border-bottom: 1px solid var(--gray-100); padding: 16px 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); z-index: 99; }
.tp-nav-mobile-menu a { display: block; padding: 12px 0; font-size: 1rem; color: var(--gray-700); text-decoration: none; font-weight: 500; border-bottom: 1px solid var(--gray-100); }
.tp-nav-mobile-menu a:last-child { border-bottom: none; }

/* Ensure all text in colored rows is readable */
.tp-header-bar, .tp-header-bar * { color: var(--brand-text); }
.tp-section.brand-bg { background: var(--brand); }
.tp-section.brand-bg, .tp-section.brand-bg * { color: var(--brand-text); }
.tp-section.brand-bg .tp-section-subtitle { color: var(--brand-text); opacity: 0.8; }
`;
}

// ─────────────── Visual / Mockup Builder ───────────────

function buildMockup(d: Record<string, any>): string {
  const type = safe(d.hero_visual_type || "saas_dashboard");
  const title = esc(safe(d.hero_visual_title || d.hero_title || ""));
  const subtitle = esc(safe(d.hero_visual_subtitle || ""));
  const items: string[] = Array.isArray(d.hero_visual_items) ? d.hero_visual_items.map((i: any) => safe(i)) : [];

  const bar = `<div class="tp-mock-bar"><span class="tp-mock-dot r"></span><span class="tp-mock-dot y"></span><span class="tp-mock-dot g"></span></div>`;

  let inner = "";

  if (type === "ebook_cover") {
    const chs = items.length > 0 ? items : ["Chapitre 1", "Chapitre 2", "Chapitre 3"];
    inner = `<div class="tp-mock-ebook">
      <div class="tp-mock-ebook-badge">GRATUIT</div>
      <div class="tp-mock-ebook-title">${title}</div>
      ${subtitle ? `<div class="tp-mock-ebook-sub">${subtitle}</div>` : ""}
      ${chs.slice(0, 5).map((c, i) => `<div class="tp-mock-ebook-ch"><span class="tp-mock-ebook-num">${i + 1}</span>${esc(c)}</div>`).join("")}
    </div>`;
  } else if (type === "video_call") {
    inner = `<div class="tp-mock-vc">
      <div class="tp-mock-vc-head">${title}</div>
      <div class="tp-mock-vc-grid">
        <div class="tp-mock-vc-avatar"><div class="tp-mock-vc-circle">&#128100;</div><span>Expert</span></div>
        <div class="tp-mock-vc-avatar"><div class="tp-mock-vc-circle tp-mock-vc-you">&#128100;</div><span>Vous</span></div>
      </div>
      <div class="tp-mock-vc-bar">
        <span class="tp-mock-vc-btn">&#127908;</span>
        <span class="tp-mock-vc-btn">&#127909;</span>
        <span class="tp-mock-vc-btn tp-mock-vc-end">&#128308;</span>
      </div>
    </div>`;
  } else if (type === "checklist") {
    const cks = items.length > 0 ? items : ["Etape 1", "Etape 2", "Etape 3"];
    inner = `<div class="tp-mock-checklist">
      <div class="tp-mock-h">${title}</div>
      ${subtitle ? `<div class="tp-mock-sub">${subtitle}</div>` : ""}
      ${cks.slice(0, 5).map((c, i) => `<div class="tp-mock-cl-item${i < 2 ? " done" : ""}"><span class="tp-mock-cl-chk">${i < 2 ? "&#10003;" : ""}</span><span>${esc(c)}</span></div>`).join("")}
    </div>`;
  } else if (type === "calendar") {
    const days = items.length > 0 ? items : ["Jour 1", "Jour 2", "Jour 3", "Jour 4", "Jour 5"];
    inner = `<div class="tp-mock-calendar">
      <div class="tp-mock-h">${title}</div>
      ${subtitle ? `<div class="tp-mock-sub">${subtitle}</div>` : ""}
      <div class="tp-mock-cal-grid">
        ${days.slice(0, 5).map((dd, i) => `<div class="tp-mock-cal-day${i < 2 ? " done" : i === 2 ? " cur" : ""}"><span class="tp-mock-cal-num">${i + 1}</span>${esc(dd)}</div>`).join("")}
      </div>
    </div>`;
  } else if (type === "chat_interface") {
    inner = `<div class="tp-mock-chat">
      <div class="tp-mock-chat-head">${title}</div>
      <div class="tp-mock-chat-msgs">
        <div class="tp-mock-chat-msg user">${items[0] ? esc(items[0]) : "Comment atteindre mes objectifs ?"}</div>
        <div class="tp-mock-chat-msg bot">${items[1] ? esc(items[1]) : "Voici 3 strat&#233;gies prouv&#233;es..."}</div>
        <div class="tp-mock-chat-typing"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  } else if (type === "certificate") {
    inner = `<div class="tp-mock-cert">
      <div class="tp-mock-cert-inner">
        <div class="tp-mock-cert-icon">&#127942;</div>
        <div class="tp-mock-cert-title">${title}</div>
        ${subtitle ? `<div class="tp-mock-cert-sub">${subtitle}</div>` : ""}
        <div class="tp-mock-cert-line"></div>
        <div class="tp-mock-cert-name">Votre nom ici</div>
      </div>
    </div>`;
  } else {
    // saas_dashboard (default)
    const navItems = items.length > 0 ? items : ["Dashboard", "Strat&#233;gie", "Contenu", "Calendrier"];
    inner = `<div class="tp-mock-body" style="display:flex">
      <div class="tp-mock-sidebar">
        ${navItems.slice(0, 5).map((it, i) => `<div class="tp-mock-nav-item${i === 0 ? " active" : ""}"><span class="tp-mock-nav-dot"></span>${esc(it)}</div>`).join("")}
      </div>
      <div class="tp-mock-main">
        <div class="tp-mock-h">${title}</div>
        ${subtitle ? `<div class="tp-mock-sub">${subtitle}</div>` : ""}
        <div class="tp-mock-prog-wrap">
          <div class="tp-mock-prog-head"><span>Progression</span><span class="tp-mock-prog-val">75%</span></div>
          <div class="tp-mock-prog-bar"><div class="tp-mock-prog-fill"></div></div>
        </div>
        <div class="tp-mock-task done"><span class="tp-mock-task-chk">&#10003;</span><span>Configur&#233;</span></div>
        <div class="tp-mock-task done"><span class="tp-mock-task-chk">&#10003;</span><span>Lanc&#233;</span></div>
        <div class="tp-mock-task"><span class="tp-mock-task-chk"></span><span>En cours...</span></div>
      </div>
    </div>`;
  }

  // Floating metric cards
  const metrics: Array<{ icon: string; value: string; label: string }> = Array.isArray(d.hero_visual_metrics) ? d.hero_visual_metrics : [];
  const floats = metrics.slice(0, 3).map((m, i) =>
    `<div class="tp-float tp-float-${i + 1}">
      <div class="tp-float-icon i${i + 1}">${esc(safe(m.icon || "&#10003;"))}</div>
      <div><div class="tp-float-val">${esc(safe(m.value))}</div><div class="tp-float-lbl">${esc(safe(m.label))}</div></div>
    </div>`
  ).join("\n");

  return `<div class="tp-visual" data-tipote-visual="1">
    <div class="tp-mockup">${bar}${inner}</div>
    ${floats}
    <div class="tp-visual-hint">Cliquez pour changer l&#8217;image</div>
  </div>`;
}

// ─────────────── Inline SVG Illustrations ───────────────
// Premium contextual illustrations for sales pages — abstract, brand-colored,
// designed to look like custom graphics (not stock/generic AI output).

/** Abstract "tangled lines" illustration for the problem/pain section */
function svgProblemIllustration(): string {
  return `<div class="tp-illust tp-illust-problem" aria-hidden="true">
  <svg viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M40 160C80 120 100 180 140 100S200 40 240 100S300 180 340 80" stroke="var(--brand-25)" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6"/>
    <path d="M40 140C90 100 110 160 150 90S210 30 250 90S310 160 360 70" stroke="var(--brand-40)" stroke-width="2" stroke-linecap="round" fill="none" stroke-dasharray="8 6" opacity="0.5"/>
    <circle cx="140" cy="100" r="6" fill="var(--brand)" opacity="0.7"/>
    <circle cx="240" cy="100" r="6" fill="var(--brand)" opacity="0.5"/>
    <circle cx="340" cy="80" r="4" fill="var(--brand)" opacity="0.3"/>
    <path d="M60 40L80 60M80 40L60 60" stroke="var(--brand-40)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M320 140L340 160M340 140L320 160" stroke="var(--brand-40)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M200 170L210 180M210 170L200 180" stroke="var(--brand-25)" stroke-width="2" stroke-linecap="round"/>
  </svg>
</div>`;
}

/** "Ascending path" illustration for solution/transformation section */
function svgSolutionIllustration(): string {
  return `<div class="tp-illust tp-illust-solution" aria-hidden="true">
  <svg viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 180C60 180 80 150 120 130S180 100 220 80S280 50 340 30" stroke="var(--brand)" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6"/>
    <path d="M20 180C60 180 80 150 120 130S180 100 220 80S280 50 340 30" stroke="url(#sol-grad)" stroke-width="3" stroke-linecap="round" fill="none"/>
    <defs><linearGradient id="sol-grad" x1="20" y1="180" x2="340" y2="30" gradientUnits="userSpaceOnUse"><stop stop-color="var(--brand)" stop-opacity="0.1"/><stop offset="1" stop-color="var(--brand)" stop-opacity="0.8"/></linearGradient></defs>
    <circle cx="120" cy="130" r="5" fill="var(--brand)" opacity="0.5"/>
    <circle cx="220" cy="80" r="6" fill="var(--brand)" opacity="0.7"/>
    <circle cx="340" cy="30" r="8" fill="var(--brand)" opacity="0.9"/>
    <path d="M330 20L340 30L350 20" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="90" y="155" width="60" height="8" rx="4" fill="var(--brand-15)"/>
    <rect x="90" y="155" width="30" height="8" rx="4" fill="var(--brand-40)"/>
    <rect x="190" y="105" width="60" height="8" rx="4" fill="var(--brand-15)"/>
    <rect x="190" y="105" width="45" height="8" rx="4" fill="var(--brand-40)"/>
    <rect x="310" y="55" width="60" height="8" rx="4" fill="var(--brand-15)"/>
    <rect x="310" y="55" width="55" height="8" rx="4" fill="var(--brand)"/>
  </svg>
</div>`;
}

/** Benefit icons — simple, abstract, brand-colored */
function svgBenefitIcon(index: number): string {
  const icons = [
    // Target/Goal
    `<svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="16" stroke="var(--brand)" stroke-width="2" opacity="0.3"/><circle cx="20" cy="20" r="10" stroke="var(--brand)" stroke-width="2" opacity="0.5"/><circle cx="20" cy="20" r="4" fill="var(--brand)"/></svg>`,
    // Upward chart
    `<svg viewBox="0 0 40 40" fill="none"><rect x="6" y="24" width="6" height="10" rx="2" fill="var(--brand)" opacity="0.3"/><rect x="16" y="16" width="6" height="18" rx="2" fill="var(--brand)" opacity="0.5"/><rect x="26" y="8" width="6" height="26" rx="2" fill="var(--brand)" opacity="0.8"/></svg>`,
    // Shield/Security
    `<svg viewBox="0 0 40 40" fill="none"><path d="M20 4L34 12V22C34 30 27.5 35 20 37C12.5 35 6 30 6 22V12L20 4Z" stroke="var(--brand)" stroke-width="2" fill="var(--brand-10)"/><path d="M14 20L18 24L26 16" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    // Lightning/Speed
    `<svg viewBox="0 0 40 40" fill="none"><path d="M22 4L10 22H18L16 36L30 18H22L22 4Z" fill="var(--brand)" opacity="0.7"/></svg>`,
    // Star/Quality
    `<svg viewBox="0 0 40 40" fill="none"><path d="M20 4L24 14H34L26 22L29 34L20 26L11 34L14 22L6 14H16L20 4Z" fill="var(--brand)" opacity="0.6"/></svg>`,
    // Infinity/Continuous
    `<svg viewBox="0 0 40 40" fill="none"><path d="M12 20C12 16 8 14 8 20S12 24 16 20L24 20C24 24 28 26 32 20S28 14 24 20L16 20" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7"/></svg>`,
  ];
  return icons[index % icons.length];
}

/** Decorative separator between sections */
function svgSectionDivider(): string {
  return `<div class="tp-divider" aria-hidden="true">
  <svg viewBox="0 0 1200 60" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:40px;display:block">
    <path d="M0 30C200 10 400 50 600 30S1000 10 1200 30" stroke="var(--brand-15)" stroke-width="1.5" fill="none"/>
    <circle cx="600" cy="30" r="3" fill="var(--brand-25)"/>
  </svg>
</div>`;
}

/** Before/After comparison visual for transformation sections */
function svgTransformationVisual(): string {
  return `<div class="tp-illust tp-illust-transform" aria-hidden="true">
  <svg viewBox="0 0 500 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="20" width="180" height="80" rx="12" fill="var(--gray-100)" stroke="var(--gray-200)" stroke-width="1.5"/>
    <rect x="30" y="40" width="80" height="6" rx="3" fill="var(--gray-300)"/>
    <rect x="30" y="54" width="60" height="6" rx="3" fill="var(--gray-200)"/>
    <rect x="30" y="68" width="100" height="6" rx="3" fill="var(--gray-200)"/>
    <path d="M220 60H280" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="6 4"/>
    <path d="M270 50L280 60L270 70" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="310" y="20" width="180" height="80" rx="12" fill="var(--brand-10)" stroke="var(--brand)" stroke-width="1.5"/>
    <rect x="330" y="40" width="80" height="6" rx="3" fill="var(--brand-40)"/>
    <rect x="330" y="54" width="60" height="6" rx="3" fill="var(--brand-25)"/>
    <rect x="330" y="68" width="100" height="6" rx="3" fill="var(--brand-25)"/>
    <circle cx="460" cy="35" r="10" fill="var(--brand)" opacity="0.8"/>
    <path d="M455 35L458 38L465 32" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</div>`;
}

/** Stats/metrics mini infographic */
function svgStatsVisual(metrics: Array<{ label: string; pct: number }>): string {
  if (metrics.length === 0) return "";
  const bars = metrics.slice(0, 3).map((m, i) => {
    const y = 20 + i * 35;
    const w = Math.max(20, Math.min(280, (m.pct / 100) * 280));
    const opacity = 0.5 + (m.pct / 100) * 0.5;
    return `<text x="10" y="${y}" fill="var(--gray-500)" font-size="11" font-family="var(--body-font)">${esc(m.label)}</text>
    <rect x="10" y="${y + 6}" width="280" height="10" rx="5" fill="var(--brand-10)"/>
    <rect x="10" y="${y + 6}" width="${w}" height="10" rx="5" fill="var(--brand)" opacity="${opacity}">
      <animate attributeName="width" from="0" to="${w}" dur="1.2s" fill="freeze" calcMode="spline" keySplines="0.25 0.1 0.25 1"/>
    </rect>`;
  }).join("\n");

  return `<div class="tp-illust tp-illust-stats" aria-hidden="true">
  <svg viewBox="0 0 300 ${20 + metrics.length * 35 + 10}" fill="none" xmlns="http://www.w3.org/2000/svg">
    ${bars}
  </svg>
</div>`;
}

// ─────────────── Section Builders ───────────────

function sectionHero(d: Record<string, any>, t: PageStrings): string {
  const title = esc(safe(d.hero_title || d.headline || ""));
  const subtitle = esc(safe(d.hero_subtitle || ""));
  const benefits: string[] = Array.isArray(d.benefits) ? d.benefits.filter((b: any) => typeof b === "string" && b.trim()) : [];
  const ctaText = esc(safe(d.cta_text || t.defaultCtaCapture));
  const ctaSub = esc(safe(d.cta_subtitle || ""));
  const privacyUrl = safe(d.legal_privacy_url || "");
  const socialProof = esc(safe(d.social_proof_text || ""));

  const bullets = benefits.slice(0, 5).map(b =>
    `<li><span class="tp-check">&#10003;</span><span data-editable="true">${esc(b)}</span></li>`
  ).join("\n");

  const visual = buildMockup(d);

  return `<section id="sc-hero" class="tp-hero">
  <div style="max-width:var(--container);margin:0 auto;position:relative;z-index:1;width:100%">
    <!-- Main promise ABOVE the two columns -->
    <div style="text-align:center;margin-bottom:48px;animation:tp-fadeUp 0.6s ease backwards">
      <h1 style="max-width:800px;margin:0 auto 16px;font-family:var(--heading-font);font-size:clamp(1.8rem,3.5vw,3rem);font-weight:800;line-height:1.12;color:#fff;letter-spacing:-0.02em">${title}</h1>
      ${subtitle ? `<p class="tp-hero-subtitle" style="max-width:650px;margin:0 auto;text-align:center">${subtitle}</p>` : ""}
    </div>
    <!-- Two-column layout: benefits + form | visual -->
    <div class="tp-hero-grid">
      <div class="tp-hero-left">
        ${bullets ? `<ul class="tp-hero-bullets">${bullets}</ul>` : ""}
        <form id="tipote-capture-form" class="tp-form">
          <input type="text" name="first_name" placeholder="${t.firstNamePlaceholder}">
          <input type="email" name="email" placeholder="${t.emailPlaceholder}" required>
          <label class="tp-form-legal">
            <input type="checkbox" required>
            <span>${t.privacyConsent.replace("{url}", privacyUrl || "#")}</span>
          </label>
          <button type="submit" class="tp-cta-btn">${ctaText}</button>
          ${ctaSub ? `<p class="tp-cta-sub">${ctaSub}</p>` : ""}
        </form>
        ${socialProof ? `<p data-editable="true" style="margin-top:20px;font-size:0.82rem;color:var(--gray-400);text-align:center">${socialProof}</p>` : ""}
      </div>
      <div class="tp-hero-right">${visual}</div>
    </div>
  </div>
</section>`;
}

function sectionHeroSales(d: Record<string, any>, t?: PageStrings): string {
  const title = esc(safe(d.hero_title || d.headline || ""));
  const subtitle = esc(safe(d.hero_subtitle || ""));
  const desc = esc(safe(d.hero_description || ""));
  const eyebrow = esc(safe(d.hero_eyebrow || ""));
  const ctaText = esc(safe(d.cta_text || (t || PAGE_I18N.fr).defaultCtaSales));
  const ctaSub = esc(safe(d.cta_subtitle || ""));
  const payUrl = safe(d.payment_url || d.cta_url || "#");

  return `<section id="sc-hero" class="tp-hero">
  <div style="max-width:var(--container);margin:0 auto;text-align:center;position:relative;z-index:1;padding:0 40px">
    ${eyebrow ? `<div data-editable="true" style="display:inline-block;padding:6px 16px;background:rgba(255,255,255,0.1);color:#fff;border-radius:20px;font-size:0.8rem;font-weight:600;margin-bottom:20px">${eyebrow}</div>` : ""}
    <h1 style="max-width:720px;margin:0 auto 20px">${title}</h1>
    ${subtitle ? `<p class="tp-hero-subtitle" style="max-width:580px;margin:0 auto 20px;color:var(--gray-300)">${subtitle}</p>` : ""}
    ${desc ? `<p data-editable="true" style="font-size:1rem;color:var(--gray-400);max-width:540px;margin:0 auto 32px;line-height:1.8">${desc}</p>` : ""}
    <a href="${esc(payUrl)}" class="tp-final-btn">${ctaText}</a>
    ${ctaSub ? `<p class="tp-cta-sub" data-editable="true" style="margin-top:12px">${ctaSub}</p>` : ""}
  </div>
</section>`;
}

function sectionBenefits(d: Record<string, any>, isSales: boolean, t?: PageStrings): string {
  const title = esc(safe(d.benefits_title || (isSales ? (t || PAGE_I18N.fr).benefitsTitle : "")));
  const items: string[] = Array.isArray(d.benefits) ? d.benefits.filter((b: any) => typeof b === "string" && b.trim()) : [];
  if (items.length === 0 && !title) return "";

  return `<section id="sc-benefits" class="tp-section alt">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div class="tp-benefits-grid">
      ${items.map((b, i) => `<div class="tp-benefit-card">
        <div class="tp-benefit-icon-wrap">${svgBenefitIcon(i)}</div>
        <div class="tp-benefit-num">${i + 1}</div>
        <p class="tp-benefit-text" data-editable="true">${esc(b)}</p>
      </div>`).join("\n")}
    </div>
  </div>
</section>`;
}

function sectionProgram(d: Record<string, any>): string {
  const title = esc(safe(d.program_title || ""));
  const items: Array<{ label?: string; title?: string; description?: string }> = Array.isArray(d.program_items) ? d.program_items : [];
  if (items.length === 0) return "";

  return `<section id="sc-program" class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div class="tp-steps">
      ${items.map((item) => `<div class="tp-step">
        <div class="tp-step-badge" data-editable="true">${esc(safe(item.label || ""))}</div>
        <div class="tp-step-content">
          <div class="tp-step-title" data-editable="true">${esc(safe(item.title || ""))}</div>
          <p class="tp-step-desc" data-editable="true">${esc(safe(item.description || ""))}</p>
        </div>
      </div>`).join("\n")}
    </div>
  </div>
</section>`;
}

function sectionProblem(d: Record<string, any>): string {
  const title = esc(safe(d.problem_title || ""));
  const desc = esc(safe(d.problem_description || ""));
  const bullets: string[] = Array.isArray(d.problem_bullets) ? d.problem_bullets.filter((b: any) => typeof b === "string" && b.trim()) : [];
  if (!title && !desc && bullets.length === 0) return "";

  return `<section id="sc-problem" class="tp-section dark">
  <div class="tp-container">
    <div class="tp-section-header">
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
      ${desc ? `<p class="tp-section-subtitle" style="color:var(--gray-300)">${desc}</p>` : ""}
    </div>
    ${bullets.length > 0 ? `<ul style="max-width:560px;margin:0 auto;list-style:none;padding:0">
      ${bullets.map(b => `<li data-editable="true" style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px">
        <span style="color:var(--brand-on-dark);font-size:1.2rem;flex-shrink:0;margin-top:2px">&#10005;</span>
        <span style="color:#fff;font-size:0.95rem;line-height:1.7">${esc(b)}</span>
      </li>`).join("")}
    </ul>` : ""}
  </div>
</section>`;
}

function sectionSolution(d: Record<string, any>): string {
  const title = esc(safe(d.solution_title || ""));
  const desc = esc(safe(d.solution_description || ""));
  const bullets: string[] = Array.isArray(d.solution_bullets) ? d.solution_bullets.filter((b: any) => typeof b === "string" && b.trim()) : [];
  if (!title && !desc) return "";

  return `<section id="sc-solution" class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
      ${desc ? `<p class="tp-section-subtitle" style="text-align:left;max-width:560px;margin:0 auto 24px;line-height:1.8">${desc}</p>` : ""}
    </div>
    ${bullets.length > 0 ? `<ul style="max-width:560px;margin:0 auto;list-style:none;padding:0">
      ${bullets.map(b => `<li data-editable="true" style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px">
        <span style="color:var(--brand);font-size:1.2rem;flex-shrink:0;margin-top:2px">&#10003;</span>
        <span style="color:var(--gray-700);font-size:0.95rem;line-height:1.7">${esc(b)}</span>
      </li>`).join("")}
    </ul>` : ""}
  </div>
</section>`;
}

function sectionAbout(d: Record<string, any>, t?: PageStrings): string {
  const title = esc(safe(d.about_title || ""));
  const name = esc(safe(d.about_name || ""));
  const bio = esc(safe(d.about_description || ""));
  const photo = safe(d.author_photo_url || d.about_img_url || d.brand_author_photo_url || "");
  const proof = esc(safe(d.social_proof_text || ""));
  if (!name && !bio) return "";

  const hasPhoto = !!photo;

  return `<section id="sc-about" class="tp-section dark">
  <div class="tp-container">
    ${title ? `<div class="tp-section-header"><h2 class="tp-section-title">${title}</h2></div>` : ""}
    <div class="tp-about"${!hasPhoto ? ' style="grid-template-columns:auto 1fr;text-align:left"' : ""}>
      ${hasPhoto
        ? `<img src="${esc(photo)}" alt="${name}" class="tp-about-photo" data-tipote-img-id="about-photo">`
        : `<div class="tp-about-photo tp-about-photo-placeholder" data-tipote-img-id="about-photo" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);cursor:pointer;border:2px dashed rgba(255,255,255,0.3)"><svg width="32" height="32" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></div>`}
      <div>
        ${name ? `<h3 class="tp-about-name">${name}</h3>` : ""}
        ${bio ? `<p class="tp-about-bio" data-editable="true">${bio}</p>` : ""}
        ${proof ? `<div class="tp-about-proof" data-editable="true">${proof}</div>` : ""}
      </div>
    </div>
  </div>
</section>`;
}

function sectionTestimonials(d: Record<string, any>): string {
  const title = esc(safe(d.testimonials_title || ""));
  const items: Array<{ content?: string; author_name?: string; author_role?: string }> = Array.isArray(d.testimonials) ? d.testimonials.filter((t: any) => t?.content) : [];
  if (items.length === 0) return "";

  return `<section id="sc-testimonials" class="tp-section alt">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div class="tp-testimonials-grid">
      ${items.map(t => `<div class="tp-testimonial-card">
        <p class="tp-testimonial-text" data-editable="true">${esc(safe(t.content))}</p>
        <div class="tp-testimonial-author" data-editable="true">${esc(safe(t.author_name))}</div>
        ${t.author_role ? `<div class="tp-testimonial-role" data-editable="true">${esc(safe(t.author_role))}</div>` : ""}
      </div>`).join("\n")}
    </div>
  </div>
</section>`;
}

function sectionPricing(d: Record<string, any>): string {
  const title = esc(safe(d.price_title || ""));
  const amount = esc(safe(d.price_amount || ""));
  const old = esc(safe(d.price_old || ""));
  const note = esc(safe(d.price_note || ""));
  const ctaText = esc(safe(d.cta_text || "Je rejoins maintenant"));
  const payUrl = safe(d.payment_url || d.cta_url || "#");

  // Multi-tier pricing
  const tiers: Array<{ label?: string; price?: string; period?: string; description?: string; features?: string[] }> =
    Array.isArray(d.pricing_tiers) ? d.pricing_tiers.filter((t: any) => t?.price) : [];

  if (tiers.length > 1) {
    const cols = tiers.length <= 3 ? tiers.length : 3;
    return `<section id="sc-pricing" class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px;max-width:${cols * 320}px;margin:0 auto">
      ${tiers.map((t, i) => {
        const isMiddle = tiers.length === 3 && i === 1;
        const highlight = isMiddle ? "border:2px solid var(--brand);transform:scale(1.03)" : "border:1px solid var(--gray-200)";
        const featuresHtml = Array.isArray(t.features) && t.features.length > 0
          ? `<ul style="list-style:none;padding:0;margin:16px 0 0;text-align:left">${t.features.map(f => `<li style="padding:4px 0;font-size:0.9rem;color:var(--gray-600)" data-editable="true">&#10003; ${esc(safe(f))}</li>`).join("")}</ul>`
          : (t.description ? `<p style="font-size:0.9rem;color:var(--gray-600);margin-top:12px;line-height:1.6" data-editable="true">${esc(safe(t.description))}</p>` : "");
        return `<div style="background:var(--white);border-radius:16px;padding:32px 24px;text-align:center;box-shadow:var(--shadow-md);${highlight}">
        ${t.label ? `<div style="font-family:var(--heading-font);font-weight:700;font-size:1.1rem;margin-bottom:8px;color:var(--gray-800)" data-editable="true">${esc(safe(t.label))}</div>` : ""}
        <div style="font-family:var(--heading-font);font-size:2.2rem;font-weight:900;color:var(--gray-900)" data-editable="true">${esc(safe(t.price))}</div>
        ${t.period ? `<div style="font-size:0.85rem;color:var(--gray-500);margin-top:4px" data-editable="true">${esc(safe(t.period))}</div>` : ""}
        ${featuresHtml}
        <a href="${esc(payUrl)}" class="tp-final-btn" style="display:block;margin-top:20px;font-size:0.95rem">${ctaText}</a>
      </div>`;
      }).join("\n      ")}
    </div>
  </div>
</section>`;
  }

  // Single price fallback
  if (!amount) return "";
  return `<section id="sc-pricing" class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div class="tp-price-card">
      ${old ? `<div class="tp-price-old" data-editable="true">${old}</div>` : ""}
      <div class="tp-price-amount" data-editable="true">${amount}</div>
      ${note ? `<div class="tp-price-note" data-editable="true">${note}</div>` : ""}
      <a href="${esc(payUrl)}" class="tp-final-btn" style="display:block;margin-top:28px">${ctaText}</a>
    </div>
  </div>
</section>`;
}

function sectionGuarantee(d: Record<string, any>): string {
  const title = esc(safe(d.guarantee_title || ""));
  const text = esc(safe(d.guarantee_text || ""));
  if (!title && !text) return "";

  return `<section id="sc-guarantee" class="tp-section alt">
  <div class="tp-container">
    <div class="tp-guarantee-box">
      <div class="tp-guarantee-icon">&#128170;</div>
      ${title ? `<h3 data-editable="true" style="font-family:var(--heading-font);font-size:1.3rem;font-weight:700;margin-bottom:12px">${title}</h3>` : ""}
      ${text ? `<p data-editable="true" style="color:var(--gray-600);line-height:1.8;text-align:left;max-width:540px;margin:0 auto">${text}</p>` : ""}
    </div>
  </div>
</section>`;
}

function sectionFaq(d: Record<string, any>): string {
  const title = esc(safe(d.faq_title || ""));
  const items: Array<{ question?: string; answer?: string }> = Array.isArray(d.faqs) ? d.faqs.filter((f: any) => f?.question && f?.answer) : [];
  if (items.length === 0) return "";

  return `<section id="sc-faq" class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div style="max-width:700px;margin:0 auto">
      ${items.map(f => `<div class="tp-faq-item">
        <div class="tp-faq-q" data-editable="true">${esc(safe(f.question))}</div>
        <div class="tp-faq-a" data-editable="true">${esc(safe(f.answer))}</div>
      </div>`).join("\n")}
    </div>
  </div>
</section>`;
}

function sectionFinalCta(d: Record<string, any>, isCapture: boolean, t?: PageStrings): string {
  const strings = t || PAGE_I18N.fr;
  const title = esc(safe(d.final_title || ""));
  const desc = esc(safe(d.final_description || ""));
  const ctaText = esc(safe(d.cta_text || (isCapture ? strings.defaultCtaCapture : strings.defaultCtaSales)));
  if (!title && !desc) return "";

  // For capture: button scrolls to hero form. For sales: links to payment.
  const href = isCapture ? "#tipote-capture-form" : safe(d.payment_url || d.cta_url || "#");

  return `<section id="sc-final-cta" class="tp-final-cta">
  ${title ? `<h2 data-editable="true">${title}</h2>` : ""}
  ${desc ? `<p data-editable="true">${desc}</p>` : ""}
  <a href="${esc(href)}" class="tp-final-btn" data-editable="true">${ctaText}</a>
</section>`;
}

function buildHeader(d: Record<string, any>): string {
  const text = safe(d.header_bar_text || d.hero_eyebrow || "");
  if (!text) return "";
  return `<div class="tp-header-bar"><span data-editable="true">${esc(text)}</span></div>`;
}

function buildFooter(d: Record<string, any>, t?: PageStrings): string {
  const strings = t || PAGE_I18N.fr;
  const logoUrl = safe(d.logo_image_url || "");
  const logoText = safe(d.logo_text || "");
  const footerText = safe(d.footer_text || "");
  const links: string[] = [];

  if (d.legal_mentions_url) links.push(`<a href="${esc(safe(d.legal_mentions_url))}" target="_blank" rel="noopener">Mentions l&#233;gales</a>`);
  if (d.legal_cgv_url) links.push(`<a href="${esc(safe(d.legal_cgv_url))}" target="_blank" rel="noopener">CGV</a>`);
  if (d.legal_privacy_url) links.push(`<a href="${esc(safe(d.legal_privacy_url))}" target="_blank" rel="noopener">${strings.footerPrivacy}</a>`);

  return `<footer class="tp-footer">
  ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" class="tp-footer-logo" data-tipote-img-id="footer-logo">` : (logoText ? `<div class="tp-footer-brand">${esc(logoText)}</div>` : "")}
  ${links.length > 0 ? `<div class="tp-footer-links">${links.join("")}</div>` : ""}
  ${footerText ? `<div class="tp-footer-copy">${esc(footerText)}</div>` : ""}
</footer>`;
}

// ─────────────── Scripts ───────────────

function buildScripts(): string {
  return `<script>
(function(){
  // Click-to-replace illustration
  var v=document.querySelector('.tp-visual[data-tipote-visual]');
  if(v){v.addEventListener('click',function(){
    var inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.style.display='none';
    inp.addEventListener('change',function(){
      var f=inp.files&&inp.files[0];if(!f)return;
      var r=new FileReader();r.onload=function(e){
        v.innerHTML='<img class="tp-user-img" src="'+e.target.result+'" alt="Illustration">';
        try{parent.postMessage('tipote:hero-image:changed','*');}catch(ex){}
      };r.readAsDataURL(f);
    });document.body.appendChild(inp);inp.click();document.body.removeChild(inp);
  });}

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click',function(e){
      var t=document.querySelector(a.getAttribute('href'));
      if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth',block:'start'});}
    });
  });
})();
</script>`;
}

// ─────────────── Font import ───────────────

function buildFontImport(font: string): string {
  if (!font) return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">`;
  const systemFonts = ["arial", "georgia", "times new roman", "courier new", "verdana", "tahoma"];
  if (systemFonts.includes(font.toLowerCase())) return "";
  const encoded = encodeURIComponent(font);
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=${encoded}:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`;
}

// ─────────────── Showcase Sections ───────────────

function sectionShowcaseNav(d: Record<string, any>, t?: PageStrings): string {
  const logoUrl = safe(d.logo_image_url || "");
  const logoText = esc(safe(d.logo_text || ""));
  const navItems: string[] = Array.isArray(d.nav_links) ? d.nav_links.filter((s: any) => typeof s === "string" && s.trim()) : [];
  const ctaText = esc(safe(d.cta_text || "Contact"));
  const ctaUrl = safe(d.cta_url || d.payment_url || "#sc-contact");

  const mobileLinks = navItems.map(item => `<a href="#sc-${esc(safe(item)).toLowerCase().replace(/\s+/g, "-")}">${esc(safe(item))}</a>`).join("");

  return `<nav style="position:sticky;position:-webkit-sticky;top:0;z-index:100;background:var(--white);border-bottom:1px solid var(--gray-100);padding:12px 0;position:relative">
  <div class="tp-container" style="display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:10px">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" style="height:36px;object-fit:contain" data-tipote-img-id="nav-logo">` : ""}
      ${logoText ? `<span style="font-family:var(--heading-font);font-weight:700;font-size:1.2rem;color:var(--gray-900)">${logoText}</span>` : ""}
    </div>
    <div class="tp-showcase-nav-right" style="display:flex;align-items:center;gap:24px">
      <div class="tp-showcase-nav-links" style="display:flex;align-items:center;gap:24px">
        ${navItems.map(item => `<a href="#sc-${esc(safe(item)).toLowerCase().replace(/\s+/g, "-")}" style="font-size:0.9rem;color:var(--gray-600);text-decoration:none;font-weight:500" data-editable="true">${esc(safe(item))}</a>`).join("")}
      </div>
      <button class="tp-nav-burger" aria-label="Menu" onclick="var m=this.closest('nav').querySelector('.tp-nav-mobile-menu');m.classList.toggle('open');">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <a href="${esc(ctaUrl)}" class="tp-showcase-nav-cta" style="background:var(--brand);color:var(--brand-text);padding:8px 20px;border-radius:var(--radius);font-size:0.9rem;font-weight:600;text-decoration:none;white-space:nowrap" data-editable="true">${ctaText}</a>
    </div>
  </div>
  <div class="tp-nav-mobile-menu">
    ${mobileLinks}
    <a href="${esc(ctaUrl)}" style="display:block;text-align:center;background:var(--brand);color:var(--brand-text);padding:12px 20px;border-radius:var(--radius);font-size:0.95rem;font-weight:600;text-decoration:none;margin-top:8px">${ctaText}</a>
  </div>
</nav>`;
}

function sectionShowcaseHero(d: Record<string, any>, t?: PageStrings): string {
  const strings = t || PAGE_I18N.fr;
  const eyebrow = esc(safe(d.hero_eyebrow || ""));
  const title = esc(safe(d.hero_title || ""));
  const subtitle = esc(safe(d.hero_subtitle || ""));
  const desc = esc(safe(d.hero_description || ""));
  const ctaText = esc(safe(d.cta_text || strings.discover));
  const ctaUrl = safe(d.cta_url || d.payment_url || "#sc-services");
  const secondaryCtaText = esc(safe(d.secondary_cta_text || ""));
  const secondaryCtaUrl = safe(d.secondary_cta_url || "#sc-contact");

  return `<section id="sc-hero" style="background:linear-gradient(135deg,var(--gray-900) 0%,#0f172a 100%);color:var(--white);padding:100px 0 80px;text-align:center;position:relative;overflow:hidden">
  <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:radial-gradient(ellipse at 50% 0%,var(--brand-25) 0%,transparent 70%);pointer-events:none"></div>
  <div class="tp-container" style="position:relative;z-index:1;max-width:800px">
    ${eyebrow ? `<div style="display:inline-block;background:var(--brand-15);color:var(--brand-on-dark);padding:6px 16px;border-radius:20px;font-size:0.85rem;font-weight:600;margin-bottom:20px" data-editable="true">${eyebrow}</div>` : ""}
    ${title ? `<h1 style="font-family:var(--heading-font);font-size:clamp(2rem,5vw,3.2rem);font-weight:900;line-height:1.15;margin-bottom:20px" data-editable="true">${title}</h1>` : ""}
    ${subtitle ? `<p style="font-size:1.2rem;color:var(--gray-300);max-width:640px;margin:0 auto 24px;line-height:1.7" data-editable="true">${subtitle}</p>` : ""}
    ${desc ? `<p style="font-size:1rem;color:var(--gray-400);max-width:580px;margin:0 auto 32px;line-height:1.7" data-editable="true">${desc}</p>` : ""}
    <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
      <a href="${esc(ctaUrl)}" class="tp-final-btn" data-editable="true">${ctaText}</a>
      ${secondaryCtaText ? `<a href="${esc(secondaryCtaUrl)}" style="display:inline-block;padding:14px 32px;border-radius:var(--radius);font-weight:600;font-size:1rem;border:2px solid var(--gray-600);color:var(--white);text-decoration:none" data-editable="true">${secondaryCtaText}</a>` : ""}
    </div>
  </div>
</section>`;
}

function sectionServices(d: Record<string, any>): string {
  const title = esc(safe(d.services_title || ""));
  const subtitle = esc(safe(d.services_subtitle || ""));
  const items: Array<{ icon?: string; title?: string; description?: string }> = Array.isArray(d.services) ? d.services.filter((s: any) => s?.title) : [];
  if (items.length === 0) return "";

  const cols = items.length <= 3 ? items.length : (items.length === 4 ? 2 : 3);

  return `<section id="sc-services" class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
      ${subtitle ? `<p style="color:var(--gray-500);max-width:600px;margin:0 auto;line-height:1.7" data-editable="true">${subtitle}</p>` : ""}
    </div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:28px;max-width:${cols * 380}px;margin:0 auto">
      ${items.map((s, i) => `<div style="background:var(--white);border:1px solid var(--gray-100);border-radius:var(--radius-lg);padding:32px 24px;text-align:center;box-shadow:var(--shadow-sm);transition:transform .2s,box-shadow .2s">
        ${s.icon ? `<div style="font-size:2.5rem;margin-bottom:16px" data-editable="true">${esc(safe(s.icon))}</div>` : `<div style="width:48px;height:48px;border-radius:12px;background:var(--brand-10);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">${svgBenefitIcon(i)}</div>`}
        <h3 style="font-family:var(--heading-font);font-size:1.15rem;font-weight:700;margin-bottom:10px;color:var(--gray-900)" data-editable="true">${esc(safe(s.title))}</h3>
        ${s.description ? `<p style="font-size:0.92rem;color:var(--gray-500);line-height:1.7" data-editable="true">${esc(safe(s.description))}</p>` : ""}
      </div>`).join("\n      ")}
    </div>
  </div>
</section>`;
}

function sectionKeyNumbers(d: Record<string, any>): string {
  const title = esc(safe(d.numbers_title || ""));
  const items: Array<{ value?: string; label?: string }> = Array.isArray(d.key_numbers) ? d.key_numbers.filter((n: any) => n?.value) : [];
  if (items.length === 0) return "";

  return `<section id="sc-numbers" class="tp-section alt">
  <div class="tp-container">
    ${title ? `<div class="tp-section-header"><h2 class="tp-section-title">${title}</h2></div>` : ""}
    <div style="display:flex;justify-content:center;gap:48px;flex-wrap:wrap">
      ${items.map(n => `<div style="text-align:center;min-width:140px">
        <div style="font-family:var(--heading-font);font-size:2.5rem;font-weight:900;color:var(--brand)" data-editable="true">${esc(safe(n.value))}</div>
        <div style="font-size:0.9rem;color:var(--gray-500);margin-top:4px" data-editable="true">${esc(safe(n.label))}</div>
      </div>`).join("\n      ")}
    </div>
  </div>
</section>`;
}

function sectionContact(d: Record<string, any>, t?: PageStrings): string {
  const strings = t || PAGE_I18N.fr;
  const title = esc(safe(d.contact_title || ""));
  const desc = esc(safe(d.contact_description || ""));
  const ctaText = esc(safe(d.contact_cta_text || d.cta_text || strings.contactCta));
  const ctaUrl = safe(d.contact_cta_url || d.cta_url || d.payment_url || "#");
  const email = esc(safe(d.contact_email || ""));
  const phone = esc(safe(d.contact_phone || ""));
  const address = esc(safe(d.contact_address || ""));

  if (!title && !desc && !email) return "";

  const infoItems: string[] = [];
  if (email) infoItems.push(`<div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.2rem">&#9993;</span><a href="mailto:${email}" style="color:var(--brand);text-decoration:none" data-editable="true">${email}</a></div>`);
  if (phone) infoItems.push(`<div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.2rem">&#9742;</span><span data-editable="true">${phone}</span></div>`);
  if (address) infoItems.push(`<div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.2rem">&#128205;</span><span data-editable="true">${address}</span></div>`);

  return `<section id="sc-contact" class="tp-section alt">
  <div class="tp-container" style="max-width:700px;text-align:center">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    ${desc ? `<p style="color:var(--gray-600);line-height:1.7;margin-bottom:28px" data-editable="true">${desc}</p>` : ""}
    <a href="${esc(ctaUrl)}" class="tp-final-btn" style="display:inline-block;margin-bottom:28px" data-editable="true">${ctaText}</a>
    ${infoItems.length > 0 ? `<div style="display:flex;flex-direction:column;gap:12px;align-items:center;font-size:0.95rem;color:var(--gray-600)">${infoItems.join("")}</div>` : ""}
  </div>
</section>`;
}

// ─────────────── Main Build Function ───────────────

export function buildPage(params: PageParams): string {
  const { pageType, contentData: d, brandTokens, locale } = params;
  // Normalize brand tokens — support ALL key formats:
  //   1. Flat:   { primary: "#abc" }                  (Chat IA iterate)
  //   2. Legacy: { "colors-primary": "#abc" }          (generate route)
  //   3. Nested: { colors: { primary: "#abc" } }       (FunnelForm preview)
  const primary =
    brandTokens?.primary ||
    brandTokens?.["colors-primary"] ||
    (brandTokens?.colors as any)?.primary ||
    "#2563eb";
  const accent =
    brandTokens?.accent ||
    brandTokens?.["colors-accent"] ||
    (brandTokens?.colors as any)?.accent ||
    primary;
  const font =
    brandTokens?.headingFont ||
    brandTokens?.["typography-heading"] ||
    (brandTokens?.typography as any)?.heading ||
    (brandTokens?.typography as any)?.fontFamily?.replace(/^'|'.*$/g, "") ||
    "";
  const heroBg = brandTokens?.heroBg || "";
  const sectionBg = brandTokens?.sectionBg || "";
  const isCapture = pageType === "capture";
  const isShowcase = pageType === "showcase";
  const lang = (locale || "fr").slice(0, 2);

  const t = getPageStrings(lang);
  const css = buildCSS(primary, accent, font, heroBg, sectionBg);
  const fonts = buildFontImport(font);
  const header = isShowcase ? "" : buildHeader(d);

  let sections = "";

  if (isShowcase) {
    // Showcase / site vitrine structure
    sections += sectionShowcaseNav(d, t);
    sections += sectionShowcaseHero(d, t);
    sections += sectionServices(d);
    sections += sectionKeyNumbers(d);
    sections += sectionBenefits(d, true, t);
    sections += sectionProgram(d);
    sections += sectionAbout(d, t);
    sections += sectionTestimonials(d);
    sections += sectionPricing(d);
    sections += sectionFaq(d);
    sections += sectionContact(d, t);
  } else if (isCapture) {
    sections += sectionHero(d, t);
    // Benefits are already shown as bullet points in the hero section,
    // so skip the separate benefits section to avoid duplication.
    // Only show program section if it has distinct content from benefits.
    sections += sectionProgram(d);
    sections += sectionAbout(d, t);
    sections += sectionTestimonials(d);
    sections += sectionFinalCta(d, true, t);
  } else {
    // Sales page structure
    sections += sectionHeroSales(d, t);
    sections += sectionProblem(d);
    sections += sectionSolution(d);
    sections += sectionBenefits(d, true, t);
    sections += sectionProgram(d);
    sections += sectionAbout(d, t);
    sections += sectionTestimonials(d);
    sections += sectionGuarantee(d);
    sections += sectionPricing(d);
    sections += sectionFaq(d);
    sections += sectionFinalCta(d, false, t);
  }

  const footer = buildFooter(d, t);
  const scripts = buildScripts();

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(safe(d.hero_title || "Page"))}</title>
${fonts}
<style>${css}</style>
</head>
<body>
${header}
${sections}
${footer}
${scripts}
</body>
</html>`;
}
