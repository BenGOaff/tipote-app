// lib/affiliate/markdownLite.ts
//
// Markdown léger, converti sans dépendance, pour deux usages :
//   - toHtml()  : affichage + copie riche (titres, gras et listes
//                 survivent au collage dans Systeme.io, Notion, Google
//                 Docs, WordPress)
//   - toPlain() : copie brute pour LinkedIn, Instagram, X, qui
//                 n'acceptent aucune mise en forme et afficheraient les
//                 astérisques et les dièses tels quels.
//
// Le kit affilié (emails, posts) n'utilise que du gras et des
// paragraphes. Le rédacteur IA, lui, produit aussi des TITRES et des
// LISTES quand on lui demande un article : sans ça, l'affilié voyait
// littéralement "## Mon sous-titre" à l'écran et le copiait tel quel
// (retour Béné, 1er août 2026). Les deux niveaux de titre et les puces
// sont donc gérés ici, pas ailleurs.
//
// Jumeau de lib/markdownLite.ts côté Atelier : toute évolution se porte
// des deux côtés.

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/** Mise en forme intra-ligne : gras. Appliqué APRÈS l'échappement. */
function inline(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.+)$/;
const NUMBER_RE = /^\d+[.)]\s+(.+)$/;

/**
 * Convertit un bloc (paragraphe séparé par une ligne vide) en HTML.
 * Un bloc est soit un titre, soit une liste, soit un paragraphe.
 */
function blockToHtml(block: string): string {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  // Titre seul sur son bloc. `#` -> h1 (le titre de l'article),
  // `##` -> h2, et tout ce qui est plus profond retombe sur h3 : au-delà,
  // ça ne se distingue plus visuellement et ça n'aide personne.
  if (lines.length === 1) {
    const h = lines[0].match(HEADING_RE);
    if (h) {
      const level = Math.min(h[1].length, 3);
      return `<h${level}>${inline(escapeHtml(h[2].trim()))}</h${level}>`;
    }
  }

  // Liste : le bloc entier doit être des puces (ou des numéros), sinon
  // c'est un paragraphe qui contient un tiret et on n'y touche pas.
  if (lines.every((l) => BULLET_RE.test(l))) {
    const items = lines
      .map((l) => `<li>${inline(escapeHtml(l.match(BULLET_RE)![1]))}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }
  if (lines.every((l) => NUMBER_RE.test(l))) {
    const items = lines
      .map((l) => `<li>${inline(escapeHtml(l.match(NUMBER_RE)![1]))}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  }

  // Paragraphe. Les titres collés au texte (sans ligne vide) sont quand
  // même sortis en titre : le modèle oublie parfois la ligne vide, et
  // afficher "## Titre" en plein paragraphe serait pire.
  const html = lines
    .map((l) => {
      const h = l.match(HEADING_RE);
      if (h) {
        const level = Math.min(h[1].length, 3);
        return `</p><h${level}>${inline(escapeHtml(h[2].trim()))}</h${level}><p>`;
      }
      return inline(escapeHtml(l));
    })
    .join("<br />");
  return `<p>${html}</p>`.replace(/<p><\/p>/g, "");
}

/** Markdown léger -> HTML. Titres, gras, listes, paragraphes. */
export function toHtml(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map(blockToHtml)
    .filter(Boolean)
    .join("\n");
}

/**
 * Retire les marqueurs de mise en forme, garde la structure. Le texte
 * doit pouvoir être collé tel quel dans LinkedIn sans qu'on y voie un
 * seul dièse ni une seule étoile.
 */
export function toPlain(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const h = trimmed.match(HEADING_RE);
      if (h) return h[2].trim();
      const b = trimmed.match(BULLET_RE);
      if (b) return `- ${b[1]}`;
      return line;
    })
    .join("\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

/** Remplace les variables du kit par les valeurs de l'affilié. */
export function resolveVars(
  text: string,
  vars: { affiliateLink: string; name: string },
): string {
  return text
    .replaceAll("{AFFILIATE_LINK}", vars.affiliateLink)
    .replaceAll("{NAME}", vars.name);
}
