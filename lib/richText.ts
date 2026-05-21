// Sanitizer + helpers for rich text fields (intro, results, etc.).
// Works on both server (SSR) and browser — isomorphic-dompurify picks the
// right DOMPurify instance automatically.

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "b", "strong", "i", "em", "u", "s",
  "a", "img",
  "ul", "ol", "li",
  "blockquote", "code", "pre",
  "h1", "h2", "h3", "h4",
  "span", "div",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",
  "src", "alt", "title",
  "style",
  "class",
];

// Propriétés CSS qu'on RETIRE des `style="..."` collés par l'user
// (typiquement quand il copie/colle depuis Notion ou Google Docs). Le
// design system Tipote contrôle ces propriétés au niveau du composant —
// laisser passer un `font-size: 14px` inline fait sauter le titre
// responsive du visiteur mobile (cf. report Adeline 21 mai 2026 :
// titre minuscule en mobile alors que le composant a `text-4xl sm:text-5xl`).
//
// On garde par contre : color, background, text-align, font-weight,
// text-decoration — propriétés que l'user veut légitimement personnaliser.
const STRIPPED_CSS_PROPS = new Set([
  "font-size", "font-family", "line-height", "letter-spacing",
  "word-spacing", "font-stretch",
]);

// Hook DOMPurify enregistré une seule fois au load du module. S'applique
// à toutes les sanitisations suivantes (server + client).
let _hookInstalled = false;
function installStyleStripperHook(): void {
  if (_hookInstalled) return;
  _hookInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node: Element, data: { attrName: string; attrValue: string }) => {
    if (data.attrName !== "style" || typeof data.attrValue !== "string") return;
    const filtered = data.attrValue
      .split(";")
      .map((decl) => decl.trim())
      .filter((decl) => {
        if (!decl) return false;
        const colonIdx = decl.indexOf(":");
        if (colonIdx < 0) return false;
        const prop = decl.slice(0, colonIdx).trim().toLowerCase();
        return !STRIPPED_CSS_PROPS.has(prop);
      })
      .join("; ");
    data.attrValue = filtered;
  });
}

const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:|\/)/i;

export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return "";
  installStyleStripperHook();
  const clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Force links to open safely
    ADD_ATTR: ["target"],
  });
  return typeof clean === "string" ? clean : String(clean);
}

// Tight-check for URLs pasted into the <a> / <img> dialogs
export function isSafeUrl(url: string): boolean {
  return SAFE_URL_RE.test(url.trim());
}

// Strip all HTML tags AND decode HTML entities — used for short previews,
// OpenGraph metadata, navigator.share titles, etc. Le précédent stripHtml
// laissait `&nbsp;`, `&amp;`, `&#39;`… visibles en clair dans les aperçus
// de partage (cf. rapport iMessage Tiquiz, 16 mai 2026) parce qu'on rend
// la sortie comme texte JSX et non comme HTML — les entités ne sont
// alors jamais décodées par le browser.
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, "")
    // Entités nommées les plus fréquentes du contentEditable (le browser
    // insère systématiquement `&nbsp;` à la place des espaces protégés).
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Décimales / hex (ex. &#39; pour l'apostrophe droite).
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    // &amp; en dernier, sinon on double-decode `&amp;nbsp;`.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
