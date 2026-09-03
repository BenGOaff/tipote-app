// lib/bonus/markdownHtml.ts
//
// LE PONT ENTRE LE DOCUMENT ET L'ÉDITEUR.
//
// -- POURQUOI (Béné, 5 août 2026) -------------------------------------
//
// "Quand on veut modifier un truc dans le générateur de bonus, on tombe
// sur le markdown au lieu d'un bel éditeur alors qu'on l'a partout cet
// éditeur. C'est moche."
//
// Elle a raison, et la cause n'est pas un oubli de style : le document
// généré VIT en markdown. C'est lui qui est découpé en sections
// (`lib/bonus/document.ts`), c'est lui que l'écran affiche et c'est lui
// que le PDF imprime. Éditer, c'était donc forcément éditer le markdown,
// et on le montrait tel quel dans un `<textarea>`.
//
// -- CE QUE CE MODULE DÉCIDE ------------------------------------------
//
// Il traduit dans les DEUX SENS entre le markdown du document et le HTML
// de `RichTextEditor` (l'éditeur de l'Atelier, celui de l'admin des
// jours). Le markdown reste la source de vérité : rien d'autre ne bouge,
// ni le rendu, ni le PDF, ni les tests qui les figent.
//
// -- POURQUOI SANS DOM ------------------------------------------------
//
// La conversion tourne dans le navigateur, mais elle doit être TESTABLE,
// et le runner de tests de ce repo n'a pas de DOM. Une règle métier
// enfermée dans un composant React n'est pas testée, donc c'est
// exactement là que les bugs s'installent. Tout se fait donc sur le
// texte, en fonctions pures.
//
// -- LA CONTRAINTE QUI GOUVERNE TOUT ----------------------------------
//
// L'éditeur ne doit jamais produire quelque chose que le rendu ne sait
// pas afficher, sinon la créatrice met un mot en italique et voit des
// astérisques chez son visiteur. Les balises couvertes ici sont donc
// EXACTEMENT celles que `inline()` sait rendre : gras, italique, code,
// liens. Le reste est aplati en texte, jamais perdu.

// Un jeton de la zone privee d'Unicode : impossible a taper, donc
// impossible a confondre avec du texte ecrit par la creatrice.
const CODE_MARK = "\uE000";

/** Ce que la barre d'outils peut produire, et rien d'autre. */
const BLOCK_TAGS = "p|div|h1|h2|h3|h4|h5|h6|li|ul|ol|blockquote|section|article";

export function markdownToEditorHtml(markdown: string): string {
  const lines = String(markdown ?? "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let code: string[] | null = null;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineToHtml(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (bullets.length) {
      out.push(`<ul>${bullets.map((b) => `<li>${inlineToHtml(b)}</li>`).join("")}</ul>`);
      bullets = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Le prompt à copier garde ses retours à la ligne et ses dièses : il
    // ne doit surtout pas être relu comme du markdown.
    if (line.trimStart().startsWith("```")) {
      if (code === null) {
        flushAll();
        code = [];
      } else {
        out.push(`<pre>${escapeHtml(code.join("\n"))}</pre>`);
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(raw);
      continue;
    }

    // Les filets horizontaux sont du bruit : `parseBonusDoc` les jette
    // déjà, les garder ici les ferait réapparaître à la sauvegarde.
    if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      flushAll();
      continue;
    }

    const h = line.trim().match(/^(#{1,4})\s+(.*)$/);
    if (h && h[2].trim()) {
      flushAll();
      const level = Math.min(h[1].length, 4);
      out.push(`<h${level}>${inlineToHtml(h[2].trim())}</h${level}>`);
      continue;
    }

    const b = line.match(/^\s*[-*•]\s+(.*)$/);
    if (b) {
      flushPara();
      bullets.push(b[1].trim());
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }
    flushList();
    para.push(line.trim());
  }

  if (code !== null && code.length) out.push(`<pre>${escapeHtml(code.join("\n"))}</pre>`);
  flushAll();
  return out.join("");
}

export function editorHtmlToMarkdown(html: string): string {
  let s = String(html ?? "");

  // 1. Le code sort du jeu AVANT tout le reste : son contenu ne doit
  //    subir aucune des transformations qui suivent.
  const blocks: string[] = [];
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => {
    blocks.push(decodeEntities(stripTags(String(inner).replace(/<br\s*\/?>/gi, "\n"))));
    return `\n\n${CODE_MARK}${blocks.length - 1}${CODE_MARK}\n\n`;
  });

  // 2. Les listes numérotées gardent leur numéro : un plan en 7 jours
  //    qui redevient une liste à puces perd ce qui le rend lisible.
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let n = 0;
    const items = String(inner)
      .split(/<li[^>]*>/i)
      .slice(1)
      .map((it) => `\n${++n}. ${it.replace(/<\/li>[\s\S]*$/i, "")}`);
    return `\n${items.join("")}\n`;
  });
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_m, inner: string) => {
    const items = String(inner)
      .split(/<li[^>]*>/i)
      .slice(1)
      .map((it) => `\n- ${it.replace(/<\/li>[\s\S]*$/i, "")}`);
    return `\n${items.join("")}\n`;
  });

  // 3. Les titres, du plus profond au plus court : sans cet ordre, `h1`
  //    attraperait aussi `h1` dans `h11`... et surtout `<h2>` avant
  //    `<h3>` laisserait le mauvais nombre de dièses.
  for (const level of [4, 3, 2, 1]) {
    s = s.replace(
      new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi"),
      (_m, inner: string) => `\n\n${"#".repeat(level)} ${collapse(inner)}\n\n`,
    );
  }

  // 4. Le style en ligne, EXACTEMENT ce que `inline()` sait rendre.
  s = s.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) =>
    `[${collapse(text)}](${String(href).trim()})`,
  );
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => wrap(inner, "**"));
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => wrap(inner, "*"));
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner) => wrap(inner, "`"));

  // 5. Ce qui reste : chaque bloc devient un saut de ligne.
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(new RegExp(`</(?:${BLOCK_TAGS})>`, "gi"), "\n\n");
  s = s.replace(new RegExp(`<(?:${BLOCK_TAGS})[^>]*>`, "gi"), "\n");
  s = stripTags(s);
  s = decodeEntities(s);

  // 6. On remet le code, et on nettoie les lignes vides en trop.
  s = s.replace(new RegExp(`${CODE_MARK}(\\d+)${CODE_MARK}`, "g"), (_m, i) =>
    "```\n" + blocks[Number(i)] + "\n```",
  );
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Le style en ligne du markdown, vers le HTML de l'éditeur. */
function inlineToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * Entoure un texte de ses marqueurs, sans marquer du vide.
 *
 * `execCommand` laisse régulièrement des balises vides derrière lui
 * (`<strong></strong>` après une suppression). Sans ce garde, elles
 * ressortiraient en `****` au milieu d'une phrase.
 */
function wrap(inner: string, mark: string): string {
  const text = collapse(inner);
  if (!text.trim()) return "";
  // L'espace de bord ne peut pas vivre DANS les marqueurs : `** mot**`
  // n'est pas du gras, c'est deux astérisques et un mot.
  const left = text.match(/^\s*/)?.[0] ?? "";
  const right = text.match(/\s*$/)?.[0] ?? "";
  return `${left}${mark}${text.trim()}${mark}${right}`;
}

function collapse(html: string): string {
  return decodeEntities(stripTags(String(html).replace(/<br\s*\/?>/gi, " "))).replace(/\s+/g, " ").trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeEntities(s: string): string {
  return String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    // En dernier : sinon `&amp;lt;` deviendrait `<`.
    .replace(/&amp;/g, "&");
}
