// lib/generateurs/markdown.ts
//
// LE CONTENU GÉNÉRÉ S'AFFICHE, IL NE SE LIT PAS EN MARKDOWN BRUT.
//
// -- POURQUOI CE FICHIER ----------------------------------------------
//
// Les générateurs rendent du Markdown : c'est ce qui se copie-colle dans
// Systeme.io, dans un document, dans un post. Mais montrer `## Titre` et
// `**gras**` à l'écran, c'est la même faute que le JSON brut affiché à
// des élèves le 3 août : on montre notre format de travail au lieu du
// livrable, et la créatrice croit que c'est cassé.
//
// L'écran affiche donc le rendu, ET garde le Markdown copiable à côté :
// c'est LUI qu'elle colle ailleurs, pas le HTML.
//
// -- SANS DOM, DONC TESTABLE ------------------------------------------
//
// La conversion tourne dans le navigateur, mais une règle enfermée dans
// un composant React n'est pas testée, et c'est exactement là que les
// bugs s'installent (règle du 1er août). Tout se fait sur le texte.
//
// -- ET LE HTML PRODUIT EST SÛR ---------------------------------------
//
// Ce texte vient d'un modèle de langue, donc d'ailleurs, et il finit
// dans un `dangerouslySetInnerHTML`. Tout est échappé AVANT d'ajouter la
// moindre balise, guillemets compris (sans eux, un lien peut refermer
// l'attribut `href` et poser un gestionnaire d'événement). Et un `href`
// qui n'est pas http, https ou mailto n'est pas rendu comme un lien :
// `javascript:` en est un.
//
// Porté de l'Atelier (`lib/bonus/markdownHtml.ts`), moitié aller
// seulement : Tiquiz n'édite pas encore le résultat en place.

function echapper(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Une adresse qu'on accepte de rendre cliquable. */
function lienSur(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href.trim());
}

/** Le style en ligne : gras, italique, code, liens. */
function enLigne(texte: string): string {
  return echapper(texte)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (tout, libelle: string, href: string) =>
      lienSur(href)
        ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${libelle}</a>`
        : tout,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Le Markdown d'un morceau généré, rendu en HTML.
 *
 * Couvre EXACTEMENT ce que le socle autorise le modèle à produire :
 * titres, gras, italique, listes, paragraphes. Le reste est aplati en
 * texte, jamais perdu : un contenu à moitié affiché serait pire qu'un
 * contenu brut.
 */
export function markdownVersHtml(markdown: string): string {
  const lignes = String(markdown ?? "").replace(/\r/g, "").split("\n");
  const sortie: string[] = [];
  let para: string[] = [];
  let puces: string[] = [];

  const viderPara = () => {
    if (para.length) {
      sortie.push(`<p>${enLigne(para.join(" "))}</p>`);
      para = [];
    }
  };
  const viderListe = () => {
    if (puces.length) {
      sortie.push(`<ul>${puces.map((b) => `<li>${enLigne(b)}</li>`).join("")}</ul>`);
      puces = [];
    }
  };
  const viderTout = () => {
    viderPara();
    viderListe();
  };

  for (const brute of lignes) {
    const ligne = brute.trimEnd();

    // Un filet horizontal est du bruit visuel dans une carte : le
    // rythme vient déjà des titres.
    if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(ligne)) {
      viderTout();
      continue;
    }

    const titre = ligne.trim().match(/^(#{1,4})\s+(.*)$/);
    if (titre && titre[2].trim()) {
      viderTout();
      // Jamais de `h1` : le titre du morceau est déjà affiché au dessus,
      // et deux titres de même niveau se disputent l'oeil.
      const niveau = Math.min(titre[1].length + 1, 5);
      sortie.push(`<h${niveau}>${enLigne(titre[2].trim())}</h${niveau}>`);
      continue;
    }

    const puce = ligne.match(/^\s*[-*•]\s+(.*)$/);
    if (puce) {
      viderPara();
      puces.push(puce[1].trim());
      continue;
    }

    // Une liste numérotée reste une liste : la rendre en paragraphe
    // recollerait "1. ... 2. ..." sur une seule ligne.
    const numero = ligne.match(/^\s*\d{1,2}[.)]\s+(.*)$/);
    if (numero) {
      viderPara();
      puces.push(numero[1].trim());
      continue;
    }

    if (!ligne.trim()) {
      viderTout();
      continue;
    }
    viderListe();
    para.push(ligne.trim());
  }

  viderTout();
  return sortie.join("");
}
