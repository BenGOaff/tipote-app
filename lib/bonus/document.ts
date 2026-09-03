// lib/bonus/document.ts
//
// CE QUE LE GÉNÉRATEUR REND, TRANSFORMÉ EN DOCUMENT LISIBLE.
//
// -- POURQUOI (retour Béné, 5 août 2026) ------------------------------
//
// "Dis donc t'as fait aucun effort sur la présentation des longs blocs
// de texte ! Genre : des cases, des couleurs, des blocs séparés, une
// logique, facile à lire et comprendre, visuellement agréable."
//
// Elle a raison. On rendait le markdown avec `toHtml`, qui sait faire
// des titres, du gras et des listes, et rien d'autre. Résultat à
// l'écran : un mur, avec des "---" affichés littéralement et des titres
// qui ne se distinguaient pas d'un paragraphe.
//
// -- CE QUE CE FICHIER DÉCIDE, ET POURQUOI IL EST ICI -----------------
//
// Il traduit le markdown en STRUCTURE : un document, des sections, et
// dans chaque section des blocs typés (paragraphe, liste, étapes
// numérotées, encart). L'écran et le PDF lisent le MÊME modèle.
//
// C'est la règle du repo : une logique enfermée dans un composant React
// n'est pas testable, donc elle n'est pas testée, donc c'est exactement
// là que les bugs s'installent. Et deux mises en forme écrites
// séparément (une pour l'écran, une pour le PDF) finiraient par ne plus
// se ressembler, comme l'aperçu de l'éditeur et le viewer avant qu'on
// les force à appeler la même fonction.

/** Un morceau de contenu dans une section. */
export type DocBlock =
  | { kind: "para"; text: string }
  /** Une liste à puces. */
  | { kind: "list"; items: string[] }
  /** Des étapes numérotées, ou des jours. Le numéro est extrait pour
   *  pouvoir le poser dans une pastille au lieu de le laisser dans le
   *  texte. */
  | { kind: "steps"; items: { label: string; text: string }[] }
  /** Un bloc de code, rendu tel quel et copiable d'un bouton.
   *
   *  Il existe pour le PROMPT à donner à Claude ou ChatGPT (retour Béné,
   *  5 août 2026). Un prompt qu'on doit reconstituer en recopiant six
   *  paragraphes n'est pas un prompt, c'est un exercice : il lui faut son
   *  cadre, sa police à chasse fixe et son bouton Copier. */
  | { kind: "code"; text: string }
  /** Un sous-titre `###` : il ouvre un bloc a lui, avec son contenu. */
  | { kind: "sub"; title: string; blocks: DocBlock[] };

export type DocSection = {
  title: string;
  blocks: DocBlock[];
};

export type BonusDoc = {
  /** Le `#` de tête, s'il existe. */
  title: string | null;
  /** Ce qui précède la première section : une phrase d'accroche. */
  lead: DocBlock[];
  sections: DocSection[];
};

const H = /^(#{1,4})\s+(.*)$/;
const BULLET = /^[-*•]\s+(.*)$/;
/** "1." "2)" mais aussi "Jour 1." et "**Jour 1.**", que le modèle produit
 *  spontanément quand il écrit un plan. */
const NUMBERED = /^\*{0,2}((?:jour|étape|semaine|day)?\s*\d+)\s*[.):]\*{0,2}\s*(.*)$/i;
const RULE = /^\s*(-{3,}|_{3,}|\*{3,})\s*$/;

/**
 * Découpe le markdown en document.
 *
 * Tolérant par construction : un modèle oublie une ligne vide, colle un
 * titre au paragraphe suivant, ou pose des `---` un peu partout. Rien de
 * tout ça ne doit produire un écran cassé, donc rien de tout ça ne jette.
 */
export function parseBonusDoc(markdown: string): BonusDoc {
  const lines = String(markdown ?? "").replace(/\r/g, "").split("\n");

  let title: string | null = null;
  const lead: DocBlock[] = [];
  const sections: DocSection[] = [];

  // Le tampon courant : où atterrissent les lignes qu'on lit.
  let current: DocBlock[] = lead;
  let sub: DocBlock[] | null = null;
  let buffer: string[] = [];
  // Dans une clôture ```, on ne parse plus RIEN : un prompt contient des
  // tirets, des dièses et des chiffres, qui deviendraient sinon des
  // listes, des titres et des étapes.
  let code: string[] | null = null;

  const target = () => sub ?? current;

  function flush() {
    if (buffer.length === 0) return;
    const block = buildBlock(buffer);
    if (block) target().push(block);
    buffer = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trimStart().startsWith("```")) {
      if (code === null) {
        flush();
        code = [];
      } else {
        const text = code.join("\n").replace(/^\n+|\n+$/g, "");
        if (text) target().push({ kind: "code", text });
        code = null;
      }
      continue;
    }
    if (code !== null) {
      // Verbatim : l'indentation d'un prompt fait partie du prompt.
      code.push(raw.replace(/\r/g, ""));
      continue;
    }

    // Les filets horizontaux sont du bruit : les sections sont déjà
    // séparées visuellement, et un "---" affiché littéralement est ce
    // qu'on voyait à l'écran.
    if (RULE.test(line)) {
      flush();
      continue;
    }

    const h = line.trim().match(H);
    if (h) {
      flush();
      const level = h[1].length;
      const text = h[2].trim();
      if (!text) continue;
      if (level === 1 && title === null && sections.length === 0) {
        title = text;
        continue;
      }
      if (level <= 2) {
        sub = null;
        sections.push({ title: text, blocks: [] });
        current = sections[sections.length - 1].blocks;
        continue;
      }
      // Un sous-titre ouvre un bloc à lui dans la section courante.
      sub = [];
      current.push({ kind: "sub", title: text, blocks: sub });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }
    buffer.push(line.trim());
  }
  // Une clôture jamais refermée (le modèle oublie le ``` final) ne doit
  // pas avaler la fin du document en silence.
  if (code !== null) {
    const text = code.join("\n").replace(/^\n+|\n+$/g, "");
    if (text) target().push({ kind: "code", text });
  }
  flush();

  return { title, lead, sections };
}

/** Transforme un paquet de lignes contiguës en UN bloc. */
function buildBlock(lines: string[]): DocBlock | null {
  if (lines.length === 0) return null;

  if (lines.every((l) => BULLET.test(l))) {
    return { kind: "list", items: lines.map((l) => l.match(BULLET)![1].trim()) };
  }

  // Étapes : il en faut au moins DEUX. Une seule ligne qui commence par
  // un chiffre est une phrase, pas un plan.
  if (lines.length >= 2 && lines.every((l) => NUMBERED.test(l))) {
    return {
      kind: "steps",
      items: lines.map((l) => {
        const m = l.match(NUMBERED)!;
        return { label: m[1].trim(), text: m[2].trim() };
      }),
    };
  }

  return { kind: "para", text: lines.join(" ") };
}

/**
 * Le document porte-t-il des sections ?
 *
 * 🚨 LE RENDU NE BRANCHE PLUS SUR CETTE FONCTION, ET NE DOIT PLUS.
 *
 * Béné, 3 septembre 2026 : "les users doivent voir en beau, bien mis en
 * forme." Un repli "pas de section -> rendu simple" a existé jusque là,
 * et il rendait le texte TEL QUEL : le gras ressortait en `**mot**`, un
 * lien en `[texte](url)`, et une LISTE DISPARAISSAIT. `BonusDocument`
 * rend déjà `doc.lead` avec le même moteur que les sections : il n'y a
 * rien à replier.
 *
 * Ce prédicat ne sert plus qu'à DIRE, dans un test, que le parseur
 * n'invente pas de structure là où il n'y en a pas.
 */
export function hasStructure(doc: BonusDoc): boolean {
  return doc.sections.length > 0;
}

/** Le texte brut d'un document, pour la copie et pour les tests. */
export function docToPlain(doc: BonusDoc): string {
  const out: string[] = [];
  if (doc.title) out.push(doc.title, "");
  pushBlocks(doc.lead, out, "");
  for (const s of doc.sections) {
    out.push("", s.title, "");
    pushBlocks(s.blocks, out, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function pushBlocks(blocks: DocBlock[], out: string[], indent: string) {
  for (const b of blocks) {
    if (b.kind === "para") out.push(indent + b.text);
    if (b.kind === "list") for (const it of b.items) out.push(`${indent}- ${it}`);
    if (b.kind === "steps") for (const it of b.items) out.push(`${indent}${it.label}. ${it.text}`);
    if (b.kind === "code") out.push(b.text);
    if (b.kind === "sub") {
      out.push("", indent + b.title);
      pushBlocks(b.blocks, out, indent);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// LA MISE EN FORME EN LIGNE, ÉCRITE UNE SEULE FOIS
// ─────────────────────────────────────────────────────────────────────
//
// Béné, 3 septembre 2026 : "je veux exactement la même chose sur
// l'atelier et sur tiquiz. Pareil. Ni plus, ni moins."
//
// -- CE QUE LA MESURE A TROUVÉ ----------------------------------------
//
// Cette règle vivait en DEUX copies, `inline()` dans
// components/BonusDocument.tsx et `inline()` dans lib/bonus/printable.ts,
// et le commentaire du second annonçait "la MEME mise en forme qu'a
// l'ecran". Elles avaient déjà divergé : l'écran n'échappait pas le
// guillemet double, l'impression si.
//
// Le pire est que c'est une règle de SÉCURITÉ : ce texte vient d'un
// modèle, donc d'ailleurs, et il finit dans un `innerHTML`. Une copie
// qui prend du retard sur l'autre, c'est une porte ouverte d'un seul
// côté, et personne pour le dire.
//
// -- ET UNE RÈGLE ENFERMÉE DANS UN COMPOSANT N'EST PAS TESTÉE ---------
//
// C'est la règle du 1er août, et c'est la vraie raison de ce
// déplacement : `inline()` vivait dans un `.tsx`, donc le runner de
// tests ne pouvait pas le charger, donc rien ne vérifiait qu'un
// `javascript:` était refusé.

/** Où le HTML produit va s'afficher. PARAMÈTRE, jamais deviné. */
export type CibleInline = "ecran" | "impression";

/**
 * Échappe le texte, PUIS remet la mise en forme.
 *
 * L'ordre n'est pas négociable : remettre la mise en forme d'abord
 * laisserait passer une balise écrite par le modèle.
 *
 * Le gras, l'italique, le code et les liens, et rien d'autre : la liste
 * doit rester alignée sur `lib/bonus/markdownHtml.ts`, sinon la
 * créatrice met un mot en italique dans l'éditeur et voit des
 * astérisques chez son visiteur.
 *
 * `cible` décide du seul écart légitime entre les deux rendus : à
 * l'écran un lien ouvre un onglet (un visiteur ne doit jamais perdre la
 * page), sur une feuille imprimée ça ne veut rien dire.
 */
export function inline(text: string, cible: CibleInline): string {
  const safe = String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const onglet = cible === "ecran" ? ' target="_blank" rel="noopener noreferrer"' : "";
  return safe
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => {
      // Un lien écrit par un modèle finit dans un `href` : `javascript:`
      // et `data:` n'ont rien à y faire.
      const url = urlSure(href);
      return url ? `<a href="${url}"${onglet}>${label}</a>` : m;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** `null` si le schéma n'est pas de ceux qu'on accepte d'ouvrir. */
export function urlSure(href: string): string | null {
  const u = String(href ?? "").trim();
  // Le guillemet est DÉJÀ échappé par `inline` ; on le refait ici pour
  // que la fonction reste sûre si quelqu'un l'appelle seule.
  return /^(https?:\/\/|mailto:|\/)/i.test(u) ? u.replace(/"/g, "&quot;") : null;
}
