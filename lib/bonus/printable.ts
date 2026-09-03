// lib/bonus/printable.ts
//
// LE MÊME DOCUMENT, EN PAGE IMPRIMABLE.
//
// "Téléchargeable en pdf aussi." (Béné, 5 août 2026)
//
// Il lit `BonusDoc`, exactement comme l'écran. Repartir du markdown ici
// produirait deux mises en forme qui finiraient par diverger : c'est le
// défaut que ce repo corrige en boucle depuis juin (l'aperçu de
// l'éditeur contre le viewer, quatre fois de suite).
//
// Aucune dépendance ajoutée : on écrit une page autonome et on laisse le
// navigateur imprimer. Une bibliothèque de PDF coûterait un paquet dans
// le `package-lock`, et `npm ci` casse en prod si le lock n'est pas
// commité avec (cf. le process de déploiement dans AGENTS.md).

// Imports RELATIFS entre voisins : le runner de tests de ce repo ne
// resout pas l'alias `@/` (contrairement a celui de Tiquiz, qui a son
// register-alias). Un import de TYPE passait parce qu'il est efface a la
// compilation ; un import de valeur, non.
import type { BonusDoc, DocBlock } from "./document.ts";
import { sectionAccent } from "./accents.ts";
// LA MISE EN FORME EN LIGNE VIT DANS `document.ts`, en un seul
// exemplaire : deux copies avaient deja diverge sur l'echappement du
// guillemet, et c'est une regle de securite.
import { inline } from "./document.ts";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `n` est l'index de la section : il donne sa couleur au bloc, la MEME
 *  que celle de l'ecran (cf. lib/bonus/accents.ts). */
function block(b: DocBlock, n: number): string {
  if (b.kind === "para") return `<p>${inline(b.text, "impression")}</p>`;
  if (b.kind === "list") {
    return `<ul class="a${n}">${b.items.map((i) => `<li>${inline(i, "impression")}</li>`).join("")}</ul>`;
  }
  if (b.kind === "steps") {
    return `<div class="steps">${b.items
      .map(
        (i) =>
          `<div class="step"><span class="badge a${n}">${esc(i.label)}</span><div>${inline(i.text, "impression")}</div></div>`,
      )
      .join("")}</div>`;
  }
  // Le prompt garde ses retours a la ligne et sa police a chasse fixe :
  // imprime en paragraphe, il n'est plus copiable a l'oeil.
  if (b.kind === "code") return `<pre class="code">${esc(b.text)}</pre>`;
  return `<div class="sub a${n}"><p class="subtitle">${esc(b.title)}</p>${b.blocks
    .map((x) => block(x, n))
    .join("")}</div>`;
}

/**
 * La page complète, prête à imprimer.
 *
 * `accent` reçoit la couleur de marque : le PDF ressemble à l'écran,
 * sans qu'on ait à la redéclarer ici.
 */
export function buildPrintableHtml(
  doc: BonusDoc,
  opts: { title: string; accent?: string; footer?: string } = { title: "Bonus" },
): string {
  const accent = opts.accent && /^#[0-9a-f]{3,8}$/i.test(opts.accent) ? opts.accent : "#5D6CDB";

  // Une regle par accent, generee a partir du MEME module que l'ecran.
  // Ecrire les couleurs ici a la main, c'est se garantir qu'un jour le
  // PDF sera vert la ou l'ecran est violet.
  const palette = doc.sections
    .map((_, i) => {
      const a = sectionAccent(i);
      return (
        `section.a${i} { border-color: ${a.hex}33; }` +
        `section.a${i} > h2 { color: ${a.hex}; }` +
        `section.a${i} > h2 .num { background: ${a.hex}; }` +
        `.a${i} .badge, .badge.a${i} { background: ${a.hex}1a; color: ${a.hex}; }` +
        `ul.a${i} li::marker { color: ${a.hex}; }` +
        `.sub.a${i} { border-left-color: ${a.hex}66; }`
      );
    })
    .join("\n  ");

  const sections = doc.sections
    .map(
      (s, i) => `
    <section class="a${i}">
      <h2><span class="num">${i + 1}</span>${esc(s.title)}</h2>
      ${s.blocks.map((b) => block(b, i)).join("")}
    </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font: 11.5pt/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1c1c28; max-width: 175mm; margin: 0 auto; padding: 0;
  }
  h1 { font-size: 19pt; line-height: 1.25; margin: 0 0 6mm; }
  .lead { color: #4a4a5a; margin: 0 0 8mm; }
  /* Une section ne se coupe pas en deux pages si elle tient : un titre
     seul en bas de page est ce qui rend un PDF penible a lire. */
  section { border: 1px solid #e3e3ee; border-radius: 10px; padding: 5mm 6mm; margin: 0 0 5mm; break-inside: avoid; }
  h2 { font-size: 12.5pt; margin: 0 0 3mm; display: flex; align-items: center; gap: 3mm; }
  .num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 6mm; height: 6mm; border-radius: 50%; background: ${accent};
    color: #fff; font-size: 8.5pt; flex: 0 0 auto;
  }
  /* Le bandeau de titre, aux couleurs de l'Atelier. */
  .cover { background: ${accent}; color: #fff; border-radius: 8px; padding: 6mm; margin: 0 0 6mm; }
  .cover h1 { margin: 0; color: #fff; }
  ${palette}
  p { margin: 0 0 2.5mm; }
  ul { margin: 0 0 2.5mm; padding-left: 5mm; }
  li { margin: 0 0 1.2mm; }
  .steps { display: flex; flex-direction: column; gap: 2.5mm; margin-bottom: 2.5mm; }
  .step { display: flex; gap: 3mm; break-inside: avoid; }
  .badge {
    flex: 0 0 auto; background: ${accent}1a; color: ${accent};
    border-radius: 4px; padding: 0.6mm 2mm; font-size: 8.5pt; font-weight: 600;
  }
  .code {
    white-space: pre-wrap; word-break: break-word;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 8.5pt; line-height: 1.45; background: #f5f5fa;
    border: 1px solid #e3e3ee; border-radius: 6px; padding: 3mm; margin: 0 0 2.5mm;
  }
  .sub { border-left: 2px solid ${accent}40; padding-left: 3mm; margin: 0 0 2.5mm; }
  .subtitle { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #6a6a80; margin: 0 0 1.5mm; }
  strong { font-weight: 650; }
  footer { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid #e3e3ee; font-size: 8.5pt; color: #8a8a9c; }
</style></head>
<body>
  <div class="cover"><h1>${esc(opts.title)}</h1></div>
  ${doc.lead.length > 0 ? `<div class="lead">${doc.lead.map((b) => block(b, 0)).join("")}</div>` : ""}
  ${sections}
  ${opts.footer ? `<footer>${esc(opts.footer)}</footer>` : ""}
</body></html>`;
}
