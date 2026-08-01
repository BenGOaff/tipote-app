// lib/affiliate/markdownLite.ts
//
// Le kit affilié est écrit en markdown léger : du gras `**...**` et des
// paragraphes séparés par une ligne vide. Rien d'autre. On convertit sans
// dépendance pour deux usages :
//   - toHtml()  : affichage + copie riche (le gras survit au collage dans
//                 Systeme.io, Notion, Google Docs)
//   - toPlain() : copie brute pour LinkedIn, Instagram, X, qui n'acceptent
//                 aucune mise en forme et afficheraient les astérisques.

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/** `**gras**` -> `<strong>`, lignes vides -> paragraphes, sauts simples -> <br>. */
export function toHtml(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map((block) => {
      const html = escapeHtml(block.trim())
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br />");
      return html ? `<p>${html}</p>` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Retire les marqueurs de gras, garde la structure des paragraphes. */
export function toPlain(markdown: string): string {
  return markdown.replace(/\*\*([^*]+)\*\*/g, "$1");
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
