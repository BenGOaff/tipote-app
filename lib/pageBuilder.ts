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
  pageType: "capture" | "sales";
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

// ─────────────── CSS Generation ───────────────

function buildCSS(primary: string, accent: string, font: string): string {
  const p40 = hexToRgba(primary || "#2563eb", 0.4);
  const p25 = hexToRgba(primary || "#2563eb", 0.25);
  const p15 = hexToRgba(primary || "#2563eb", 0.15);
  const p10 = hexToRgba(primary || "#2563eb", 0.1);
  const p60 = hexToRgba(primary || "#2563eb", 0.6);
  const headingFont = font ? `'${font}', ` : "";

  return `
/* ═══ TIPOTE PAGE BUILDER — Premium Design System ═══ */
:root {
  --brand: ${primary || "#2563eb"};
  --brand-accent: ${accent || primary || "#2563eb"};
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
  color: #fff;
  text-align: center;
  padding: 10px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* ─── HERO SECTION (Capture) ─── */
.tp-hero {
  background: linear-gradient(135deg, var(--dark) 0%, var(--dark-2) 50%, #0f2847 100%);
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
  color: var(--brand);
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
  color: #fff;
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
  padding: 80px 24px;
  position: relative;
}
.tp-section.alt { background: var(--gray-50); }
.tp-section.dark {
  background: linear-gradient(135deg, var(--dark) 0%, var(--dark-2) 100%);
  color: #fff;
}
.tp-section-header {
  text-align: center;
  max-width: 700px;
  margin: 0 auto 48px;
}
.tp-section-title {
  font-family: var(--heading-font);
  font-size: clamp(1.5rem, 2.5vw, 2.2rem);
  font-weight: 800;
  color: var(--gray-900);
  margin-bottom: 12px;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
.tp-section.dark .tp-section-title { color: #fff; }
.tp-section-subtitle {
  font-size: 1.05rem;
  color: var(--gray-500);
  line-height: 1.7;
}
.tp-section.dark .tp-section-subtitle { color: var(--gray-300); }
.tp-accent-line {
  width: 50px;
  height: 4px;
  background: var(--brand);
  border-radius: 2px;
  margin: 0 auto 20px;
}

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
  line-height: 1.6;
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
.tp-section.alt .tp-step-badge { box-shadow: 0 0 0 6px var(--gray-50); }
.tp-step-content { flex: 1; padding-top: 10px; }
.tp-step-title {
  font-family: var(--heading-font);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--gray-900);
  margin-bottom: 4px;
}
.tp-step-desc { font-size: 0.9rem; color: var(--gray-500); line-height: 1.5; }

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
  background: var(--gray-50);
  border: 1px solid var(--gray-200);
  border-radius: var(--radius);
  padding: 32px;
  text-align: center;
}
.tp-guarantee-icon { font-size: 2.5rem; margin-bottom: 12px; }
.tp-faq-item {
  border: 1px solid var(--gray-200);
  border-radius: var(--radius);
  padding: 20px 24px;
  margin-bottom: 10px;
  background: var(--white);
}
.tp-faq-q { font-weight: 700; font-size: 1rem; color: var(--gray-900); margin-bottom: 8px; }
.tp-faq-a { font-size: 0.92rem; color: var(--gray-600); line-height: 1.6; }

/* ─── RESPONSIVE ─── */
@media (max-width: 900px) {
  .tp-hero-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
  .tp-hero-right { order: -1; }
  .tp-visual { max-width: 380px; margin: 0 auto; }
  .tp-float { display: none; }
  .tp-hero { padding: 50px 20px !important; min-height: auto !important; }
  .tp-about { grid-template-columns: 1fr; text-align: center; }
  .tp-about-photo { margin: 0 auto 24px; width: 160px; height: 160px; }
}
@media (max-width: 520px) {
  .tp-hero h1 { font-size: 1.5rem !important; }
  .tp-section { padding: 50px 16px; }
  .tp-mockup { max-width: 100%; }
  .tp-mock-sidebar { width: 110px; padding: 10px; }
  .tp-benefits-grid { grid-template-columns: 1fr; }
  .tp-testimonials-grid { grid-template-columns: 1fr; }
}
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

// ─────────────── Section Builders ───────────────

function sectionHero(d: Record<string, any>): string {
  const title = esc(safe(d.hero_title || d.headline || ""));
  const subtitle = esc(safe(d.hero_subtitle || ""));
  const benefits: string[] = Array.isArray(d.benefits) ? d.benefits.filter((b: any) => typeof b === "string" && b.trim()) : [];
  const ctaText = esc(safe(d.cta_text || "Je m&#039;inscris !"));
  const ctaSub = esc(safe(d.cta_subtitle || ""));
  const privacyUrl = safe(d.legal_privacy_url || "");

  const bullets = benefits.slice(0, 5).map(b =>
    `<li><span class="tp-check">&#10003;</span><span>${esc(b)}</span></li>`
  ).join("\n");

  const visual = buildMockup(d);

  return `<section class="tp-hero">
  <div class="tp-hero-grid">
    <div class="tp-hero-left">
      <h1>${title}</h1>
      ${subtitle ? `<p class="tp-hero-subtitle">${subtitle}</p>` : ""}
      ${bullets ? `<ul class="tp-hero-bullets">${bullets}</ul>` : ""}
      <form id="tipote-capture-form" class="tp-form">
        <input type="text" name="first_name" placeholder="Ton pr&#233;nom">
        <input type="email" name="email" placeholder="Ton adresse email" required>
        <label class="tp-form-legal">
          <input type="checkbox" required>
          <span>J&#039;accepte la <a href="${privacyUrl || "#"}" target="_blank" rel="noopener">politique de confidentialit&#233;</a> et de recevoir des emails.</span>
        </label>
        <button type="submit" class="tp-cta-btn">${ctaText}</button>
        ${ctaSub ? `<p class="tp-cta-sub">${ctaSub}</p>` : ""}
      </form>
    </div>
    <div class="tp-hero-right">${visual}</div>
  </div>
</section>`;
}

function sectionHeroSales(d: Record<string, any>): string {
  const title = esc(safe(d.hero_title || d.headline || ""));
  const subtitle = esc(safe(d.hero_subtitle || ""));
  const desc = esc(safe(d.hero_description || ""));
  const eyebrow = esc(safe(d.hero_eyebrow || ""));
  const ctaText = esc(safe(d.cta_text || "Je rejoins maintenant"));
  const ctaSub = esc(safe(d.cta_subtitle || ""));
  const payUrl = safe(d.payment_url || d.cta_url || "#");

  return `<section class="tp-hero">
  <div style="max-width:var(--container);margin:0 auto;text-align:center;position:relative;z-index:1">
    ${eyebrow ? `<div style="display:inline-block;padding:6px 16px;background:var(--brand-15);color:var(--brand);border-radius:20px;font-size:0.8rem;font-weight:600;margin-bottom:20px">${eyebrow}</div>` : ""}
    <h1 style="max-width:800px;margin:0 auto 20px">${title}</h1>
    ${subtitle ? `<p class="tp-hero-subtitle" style="max-width:650px;margin:0 auto 20px">${subtitle}</p>` : ""}
    ${desc ? `<p style="font-size:1rem;color:var(--gray-400);max-width:600px;margin:0 auto 32px;line-height:1.7">${desc}</p>` : ""}
    <a href="${esc(payUrl)}" class="tp-final-btn">${ctaText}</a>
    ${ctaSub ? `<p class="tp-cta-sub" style="margin-top:12px">${ctaSub}</p>` : ""}
  </div>
</section>`;
}

function sectionBenefits(d: Record<string, any>, isSales: boolean): string {
  const title = esc(safe(d.benefits_title || (isSales ? "Ce que vous allez obtenir" : "")));
  const items: string[] = Array.isArray(d.benefits) ? d.benefits.filter((b: any) => typeof b === "string" && b.trim()) : [];
  if (items.length === 0 && !title) return "";

  return `<section class="tp-section alt">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div class="tp-benefits-grid">
      ${items.map((b, i) => `<div class="tp-benefit-card">
        <div class="tp-benefit-num">${i + 1}</div>
        <p class="tp-benefit-text">${esc(b)}</p>
      </div>`).join("\n")}
    </div>
  </div>
</section>`;
}

function sectionProgram(d: Record<string, any>): string {
  const title = esc(safe(d.program_title || ""));
  const items: Array<{ label?: string; title?: string; description?: string }> = Array.isArray(d.program_items) ? d.program_items : [];
  if (items.length === 0) return "";

  return `<section class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div class="tp-steps">
      ${items.map((item) => `<div class="tp-step">
        <div class="tp-step-badge">${esc(safe(item.label || ""))}</div>
        <div class="tp-step-content">
          <div class="tp-step-title">${esc(safe(item.title || ""))}</div>
          <p class="tp-step-desc">${esc(safe(item.description || ""))}</p>
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

  return `<section class="tp-section dark">
  <div class="tp-container">
    <div class="tp-section-header">
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
      ${desc ? `<p class="tp-section-subtitle">${desc}</p>` : ""}
    </div>
    ${bullets.length > 0 ? `<div style="max-width:600px;margin:0 auto">
      ${bullets.map(b => `<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:14px">
        <span style="color:var(--brand);font-size:1.2rem;flex-shrink:0">&#10005;</span>
        <span style="color:var(--gray-300);font-size:0.95rem;line-height:1.6">${esc(b)}</span>
      </div>`).join("")}
    </div>` : ""}
  </div>
</section>`;
}

function sectionSolution(d: Record<string, any>): string {
  const title = esc(safe(d.solution_title || ""));
  const desc = esc(safe(d.solution_description || ""));
  if (!title && !desc) return "";

  return `<section class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
      ${desc ? `<p class="tp-section-subtitle">${desc}</p>` : ""}
    </div>
  </div>
</section>`;
}

function sectionAbout(d: Record<string, any>): string {
  const title = esc(safe(d.about_title || ""));
  const name = esc(safe(d.about_name || ""));
  const bio = esc(safe(d.about_description || ""));
  const photo = safe(d.author_photo_url || d.about_img_url || d.brand_author_photo_url || "");
  const proof = esc(safe(d.social_proof_text || ""));
  if (!name && !bio) return "";

  const hasPhoto = !!photo;

  return `<section class="tp-section dark">
  <div class="tp-container">
    ${title ? `<div class="tp-section-header"><h2 class="tp-section-title">${title}</h2></div>` : ""}
    <div class="tp-about"${!hasPhoto ? ' style="grid-template-columns:1fr;text-align:center"' : ""}>
      ${hasPhoto ? `<img src="${esc(photo)}" alt="${name}" class="tp-about-photo">` : ""}
      <div>
        ${name ? `<h3 class="tp-about-name">${name}</h3>` : ""}
        ${bio ? `<p class="tp-about-bio">${bio}</p>` : ""}
        ${proof ? `<div class="tp-about-proof">${proof}</div>` : ""}
      </div>
    </div>
  </div>
</section>`;
}

function sectionTestimonials(d: Record<string, any>): string {
  const title = esc(safe(d.testimonials_title || ""));
  const items: Array<{ content?: string; author_name?: string; author_role?: string }> = Array.isArray(d.testimonials) ? d.testimonials.filter((t: any) => t?.content) : [];
  if (items.length === 0) return "";

  return `<section class="tp-section alt">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div class="tp-testimonials-grid">
      ${items.map(t => `<div class="tp-testimonial-card">
        <p class="tp-testimonial-text">${esc(safe(t.content))}</p>
        <div class="tp-testimonial-author">${esc(safe(t.author_name))}</div>
        ${t.author_role ? `<div class="tp-testimonial-role">${esc(safe(t.author_role))}</div>` : ""}
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
  if (!amount) return "";

  return `<section class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div class="tp-price-card">
      ${old ? `<div class="tp-price-old">${old}</div>` : ""}
      <div class="tp-price-amount">${amount}</div>
      ${note ? `<div class="tp-price-note">${note}</div>` : ""}
      <a href="${esc(payUrl)}" class="tp-final-btn" style="display:block;margin-top:28px">${ctaText}</a>
    </div>
  </div>
</section>`;
}

function sectionGuarantee(d: Record<string, any>): string {
  const title = esc(safe(d.guarantee_title || ""));
  const text = esc(safe(d.guarantee_text || ""));
  if (!title && !text) return "";

  return `<section class="tp-section alt">
  <div class="tp-container">
    <div class="tp-guarantee-box">
      <div class="tp-guarantee-icon">&#128170;</div>
      ${title ? `<h3 style="font-family:var(--heading-font);font-size:1.3rem;font-weight:700;margin-bottom:12px">${title}</h3>` : ""}
      ${text ? `<p style="color:var(--gray-600);line-height:1.7">${text}</p>` : ""}
    </div>
  </div>
</section>`;
}

function sectionFaq(d: Record<string, any>): string {
  const title = esc(safe(d.faq_title || ""));
  const items: Array<{ question?: string; answer?: string }> = Array.isArray(d.faqs) ? d.faqs.filter((f: any) => f?.question && f?.answer) : [];
  if (items.length === 0) return "";

  return `<section class="tp-section">
  <div class="tp-container">
    <div class="tp-section-header">
      <div class="tp-accent-line"></div>
      ${title ? `<h2 class="tp-section-title">${title}</h2>` : ""}
    </div>
    <div style="max-width:700px;margin:0 auto">
      ${items.map(f => `<div class="tp-faq-item">
        <div class="tp-faq-q">${esc(safe(f.question))}</div>
        <div class="tp-faq-a">${esc(safe(f.answer))}</div>
      </div>`).join("\n")}
    </div>
  </div>
</section>`;
}

function sectionFinalCta(d: Record<string, any>, isCapture: boolean): string {
  const title = esc(safe(d.final_title || ""));
  const desc = esc(safe(d.final_description || ""));
  const ctaText = esc(safe(d.cta_text || (isCapture ? "Je m&#039;inscris !" : "Je rejoins maintenant")));
  if (!title && !desc) return "";

  // For capture: button scrolls to hero form. For sales: links to payment.
  const href = isCapture ? "#tipote-capture-form" : safe(d.payment_url || d.cta_url || "#");

  return `<section class="tp-final-cta">
  ${title ? `<h2>${title}</h2>` : ""}
  ${desc ? `<p>${desc}</p>` : ""}
  <a href="${esc(href)}" class="tp-final-btn">${ctaText}</a>
</section>`;
}

function buildHeader(d: Record<string, any>): string {
  const text = safe(d.header_bar_text || d.hero_eyebrow || "");
  if (!text) return "";
  return `<div class="tp-header-bar">${esc(text)}</div>`;
}

function buildFooter(d: Record<string, any>): string {
  const logoUrl = safe(d.logo_image_url || "");
  const logoText = safe(d.logo_text || "");
  const footerText = safe(d.footer_text || "");
  const links: string[] = [];

  if (d.legal_mentions_url) links.push(`<a href="${esc(safe(d.legal_mentions_url))}" target="_blank" rel="noopener">Mentions l&#233;gales</a>`);
  if (d.legal_cgv_url) links.push(`<a href="${esc(safe(d.legal_cgv_url))}" target="_blank" rel="noopener">CGV</a>`);
  if (d.legal_privacy_url) links.push(`<a href="${esc(safe(d.legal_privacy_url))}" target="_blank" rel="noopener">Politique de confidentialit&#233;</a>`);

  return `<footer class="tp-footer">
  ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" class="tp-footer-logo">` : (logoText ? `<div class="tp-footer-brand">${esc(logoText)}</div>` : "")}
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

// ─────────────── Main Build Function ───────────────

export function buildPage(params: PageParams): string {
  const { pageType, contentData: d, brandTokens, locale } = params;
  const primary = brandTokens?.["colors-primary"] || "#2563eb";
  const accent = brandTokens?.["colors-accent"] || primary;
  const font = brandTokens?.["typography-heading"] || "";
  const isCapture = pageType === "capture";
  const lang = (locale || "fr").slice(0, 2);

  const css = buildCSS(primary, accent, font);
  const fonts = buildFontImport(font);
  const header = buildHeader(d);

  let sections = "";

  if (isCapture) {
    sections += sectionHero(d);
    // Benefits are already shown as bullet points in the hero section,
    // so skip the separate benefits section to avoid duplication.
    // Only show program section if it has distinct content from benefits.
    sections += sectionProgram(d);
    sections += sectionAbout(d);
    sections += sectionTestimonials(d);
    sections += sectionFinalCta(d, true);
  } else {
    // Sales page structure
    sections += sectionHeroSales(d);
    sections += sectionProblem(d);
    sections += sectionSolution(d);
    sections += sectionBenefits(d, true);
    sections += sectionProgram(d);
    sections += sectionAbout(d);
    sections += sectionTestimonials(d);
    sections += sectionGuarantee(d);
    sections += sectionPricing(d);
    sections += sectionFaq(d);
    sections += sectionFinalCta(d, false);
  }

  const footer = buildFooter(d);
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
