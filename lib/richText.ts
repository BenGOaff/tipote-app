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

// Propriétés CSS qu'on RETIRE inconditionnellement des `style="..."`.
// Drame Bene 8 juin 2026 : la taille de police PAR MOT (spans avec
// font-size / --fs-m / --fs-d inseres par une ancienne version de la
// toolbar) cassait le rendu - mots a tailles aleatoires. Decision : la
// taille par mot dans un titre rich-text est non fiable (les SaaS
// premium ne le font jamais). On STRIP toute taille inline ici, ce qui
// nettoie aussi les contenus deja sauvegardes au moment du rendu.
//
// La taille FIELD-LEVEL (1 taille par device pour TOUT le champ) est
// portee par un wrapper dedie .rt-field-fs avec --rt-fs-m / --rt-fs-d
// (cf. plus bas).
const STRIPPED_CSS_PROPS = new Set([
  "font-size", "font-family", "line-height", "letter-spacing",
  "word-spacing", "font-stretch",
]);

// Sur les <img>, on autorise une largeur en % ou en px (drame Christelle
// 8 juin 2026 : le GIF d'intro n'avait aucun contrôle de taille). Les
// autres elements gardent leur comportement responsive du design system.
const IMG_WIDTH_RE = /^\d{1,3}(?:\.\d+)?%$|^\d{1,4}px$/i;

// Taille de police FIELD-LEVEL, INDEPENDANTE mobile/desktop (drame Bene
// 8 juin 2026). Un seul wrapper <div class="rt-field-fs"
// style="--rt-fs-m: Xpx; --rt-fs-d: Ypx"> par champ, UNE taille par
// device pour tout le bloc (jamais par mot -> rendu fiable). On
// whiteliste la classe `rt-field-fs` et les valeurs --rt-fs-m/--rt-fs-d.
const FIELD_FS_CLASS = "rt-field-fs";
const FIELD_ALLOWED_SIZES = new Set([
  "14px", "16px", "18px", "20px", "24px", "28px", "32px", "40px", "48px", "56px", "64px",
]);

// Hook DOMPurify enregistré une seule fois au load du module. S'applique
// à toutes les sanitisations suivantes (server + client).
let _hookInstalled = false;
function installStyleStripperHook(): void {
  if (_hookInstalled) return;
  _hookInstalled = true;

  // Hook 1 : nettoie la classe legacy de l'ancien systeme font-size par
  // mot (`rt-fs`, sans le suffixe `-field`). Garde `rt-field-fs` (nouveau
  // systeme) et toute autre classe legitime.
  DOMPurify.addHook("uponSanitizeAttribute", (_node: Element, data: { attrName: string; attrValue: string }) => {
    if (data.attrName !== "class" || typeof data.attrValue !== "string") return;
    const kept = data.attrValue
      .split(/\s+/)
      .filter((c) => c && c !== "rt-fs");
    data.attrValue = kept.join(" ");
  });

  // Hook 2 : filtre les declarations `style`. Strip les proprietes
  // interdites + toutes les CSS custom properties EXCEPT --rt-fs-m /
  // --rt-fs-d sur le wrapper .rt-field-fs.
  DOMPurify.addHook("uponSanitizeAttribute", (node: Element, data: { attrName: string; attrValue: string }) => {
    if (data.attrName !== "style" || typeof data.attrValue !== "string") return;
    const isImg = node?.tagName?.toLowerCase?.() === "img";
    const filtered = data.attrValue
      .split(";")
      .map((decl) => decl.trim())
      .filter((decl) => {
        if (!decl) return false;
        const colonIdx = decl.indexOf(":");
        if (colonIdx < 0) return false;
        const prop = decl.slice(0, colonIdx).trim().toLowerCase();
        const value = decl.slice(colonIdx + 1).trim().toLowerCase();
        if (STRIPPED_CSS_PROPS.has(prop)) return false;
        // --rt-fs-m / --rt-fs-d : tailles FIELD-LEVEL mobile/desktop.
        // Acceptees UNIQUEMENT sur le wrapper .rt-field-fs et UNIQUEMENT
        // pour les tailles curees.
        if (prop === "--rt-fs-m" || prop === "--rt-fs-d") {
          const onWrapper = (node as Element)?.classList?.contains?.(FIELD_FS_CLASS);
          return onWrapper && FIELD_ALLOWED_SIZES.has(value);
        }
        // Toute autre CSS custom property strippee (--fs-m, --fs-d de
        // l'ancien systeme par mot + noise de paste Notion/Docs).
        if (prop.startsWith("--")) return false;
        // width / height sur <img> : on tolere des unites explicites
        // (px / %) pour permettre le redimensionnement utilisateur du
        // GIF d'intro. Sur les autres elements on strip pour preserver
        // le responsive.
        if ((prop === "width" || prop === "height") && isImg) {
          return value === "auto" || IMG_WIDTH_RE.test(value);
        }
        if (prop === "width" || prop === "height") return false;
        // max-width / max-height : on garde la valeur "100%" classique
        // (sans elle, les images sortent du container responsive).
        if (prop === "max-width" || prop === "max-height") {
          return value === "100%" || value === "none" || IMG_WIDTH_RE.test(value);
        }
        return true;
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
