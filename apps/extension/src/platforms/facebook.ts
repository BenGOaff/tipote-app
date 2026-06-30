// Adapter Facebook (facebook.com + m.facebook.com desktop).
//
// FB utilise Lexical (Meta) pour les composers en 2024+. Le DOM est
// très obfusqué (classes hashées), donc on cible via `[role="textbox"]
// [contenteditable="true"]` + aria-label.
//
// Particularité FB : le feed contient potentiellement plusieurs dizaines
// de composers (un par post visible) — notre MutationObserver doit
// gérer beaucoup d'éléments. On cap à 1 trigger par composer via
// l'attribut `data-tipote-injected`.
//
// PAS de auto-action sur FB. L'extension ne fait QUE de l'aide à la
// rédaction : suggère 4 commentaires IA, l'user clique pour insérer,
// l'user publie via le bouton natif FB. Aucun risque de ban.

import type { PlatformAdapter } from "./types";

const COMMENT_ARIA_PATTERNS = [
  // FR
  "écrire un commentaire",
  "commenter",
  // EN
  "write a comment",
  "comment",
  // ES
  "escribe un comentario",
  "comentar",
  // PT
  "escrever um comentário",
  "comentário",
  // DE
  "kommentar schreiben",
  "kommentar",
  // IT
  "scrivi un commento",
  "commenta",
  // AR
  "اكتب تعليقًا",
  "تعليق",
];

const POST_ARIA_PATTERNS = [
  // FR
  "que voulez-vous dire",
  "exprimez-vous",
  // EN
  "what's on your mind",
  "create a post",
  // ES
  "qué estás pensando",
  // PT
  "no que está a pensar",
  "no que você está pensando",
  // DE
  "was machst du gerade",
  // IT
  "a cosa stai pensando",
];

function matchesAria(el: HTMLElement, patterns: string[]): boolean {
  const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
  if (!ariaLabel) return false;
  return patterns.some((p) => ariaLabel.includes(p));
}

function isComposerEl(el: HTMLElement): boolean {
  if (!el.matches('[role="textbox"][contenteditable="true"]')) return false;
  return matchesAria(el, COMMENT_ARIA_PATTERNS);
}

function isPostComposerEl(el: HTMLElement): boolean {
  if (!el.matches('[role="textbox"][contenteditable="true"]')) return false;
  return matchesAria(el, POST_ARIA_PATTERNS);
}

/** Texte "utile" d'un noeud = son innerText moins celui du composer
 *  (le commentaire en cours de saisie ne fait pas partie du post). */
function usefulTextLen(node: HTMLElement, composer: HTMLElement): number {
  const text = (node.innerText || "").trim();
  const editorText = (composer.innerText || "").trim();
  return text.length - editorText.length;
}

/** Page "post unique" (permalink, photo, story, groupe/posts) : le
 *  composer de commentaire n'est PAS imbrique dans l'article du post,
 *  donc la remontee DOM ne le trouve pas. Sur ces pages il n'y a qu'un
 *  post principal, on peut donc le retrouver par un scan global sans
 *  risque de se tromper de post (contrairement au fil). */
function isSinglePostPage(): boolean {
  const u = location.href;
  return /\/permalink\/|\/posts\/|\/photo|\/photos\/|story_fbid=|[?&]fbid=|\/groups\/[^/]+\/(permalink|posts)\//i.test(u);
}

/** Article (ou <article>) le plus riche en texte sous `root`, en excluant
 *  la zone du composer. = le post principal quand `root` ne contient
 *  qu'un post (page "post unique" ou fenetre/modal). */
function richestArticleIn(root: ParentNode, composer: HTMLElement): HTMLElement | null {
  const articles = Array.from(root.querySelectorAll<HTMLElement>('[role="article"], article'));
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const art of articles) {
    if (art.contains(composer)) continue; // jamais la zone du composer
    const len = (art.innerText || "").trim().length;
    if (len > bestLen) { bestLen = len; best = art; }
  }
  return best && bestLen > 30 ? best : null;
}

/** Fenetre/modal FB : un post ouvert "dans une fenetre" (theater
 *  permalink, photo, post du fil ouvert en grand) est rendu dans un
 *  [role="dialog"] / [aria-modal="true"]. */
function enclosingDialog(composer: HTMLElement): HTMLElement | null {
  return composer.closest<HTMLElement>('[role="dialog"], [aria-modal="true"]');
}

/** Sur FB, le post est plus haut dans le DOM (~5-10 niveaux). On
 *  remonte jusqu'a un ancetre avec un texte consequent. Heuristique
 *  identique a LinkedIn mais avec un cap plus large (FB a tendance a
 *  enrouler les posts dans plus de wrappers).
 *
 *  Drame Bene (permalink / groupes, juin 2026) : "post illisible" alors
 *  qu'il y a du texte. Trois causes corrigees ici :
 *   1. On retournait le 1er [role=article] rencontre MEME vide (= le
 *      wrapper du commentaire), d'ou text=0. On ne s'arrete plus sur un
 *      article sans texte, on continue de remonter.
 *   2. Sur les pages "post unique" (permalink/photo/story), le composer
 *      n'est pas un descendant de l'article du post -> la remontee
 *      echoue. Repli : on prend l'article le plus riche de la page.
 *   3. Drame Monique (juin 2026) : un post OUVERT DANS UNE FENETRE (modal
 *      [role=dialog]) garde l'URL du fil (isSinglePostPage = faux) et son
 *      composer est si profondement imbrique que la remontee n'atteint
 *      pas le post -> "post illisible" sur les publications courtes en
 *      fenetre. Repli scope au dialog (qui ne contient QU'UN post). */
function findParentPost(composer: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = composer.parentElement;
  let depth = 0;
  let articleFallback: HTMLElement | null = null;
  while (node && depth < 20) {
    const otherText = usefulTextLen(node, composer);
    if (otherText > 80) return node;
    // Article = signal fort sur FB. Mais un article SANS texte utile est
    // un wrapper de commentaire (pas le post) : on le garde en repli mais
    // on continue de remonter pour trouver le vrai post.
    if (node.tagName === "ARTICLE" || node.getAttribute("role") === "article") {
      if (otherText > 0 && !articleFallback) articleFallback = node;
    }
    node = node.parentElement;
    depth++;
  }
  if (articleFallback) return articleFallback;

  // Repli page "post unique" : aucun ancetre lisible trouve. On prend le
  // [role=article] (ou <article>) le plus riche en texte = le post
  // principal. Volontairement limite a ces pages pour ne JAMAIS prendre
  // le mauvais post dans un fil. (Chemin existant, inchange.)
  if (isSinglePostPage()) {
    const best = richestArticleIn(document, composer);
    if (best) return best;
    // Dernier repli : conteneur principal de la page (contient le post +
    // les commentaires) ; extractPostContext nettoiera le bruit.
    const main = document.querySelector<HTMLElement>('[role="main"]');
    if (main && (main.innerText || "").trim().length > 30) return main;
  }

  // Repli FENETRE/MODAL (drame Monique) : independant de l'URL, en DERNIER
  // recours (les chemins ci-dessus, qui marchent deja, gardent la priorite).
  // Couvre le cas casse : un post ouvert dans une fenetre depuis le fil
  // (URL "/", donc isSinglePostPage = faux) dont le composer est trop
  // profondement imbrique pour que la remontee atteigne le post.
  // On NE prend PAS "l'article le plus riche" ici : dans une fenetre FB le
  // post n'est souvent PAS un [role=article] alors que chaque COMMENTAIRE
  // l'est -> prendre le plus riche risquerait de commenter un commentaire.
  // On retourne le dialog entier : la legende du post est rendue AVANT les
  // commentaires et cleanPostText garde la tete (cap 800), donc le post
  // ressort en premier.
  const dialog = enclosingDialog(composer);
  if (dialog && (dialog.innerText || "").trim().length > 30) {
    return dialog;
  }
  return null;
}

/** Lexical editor (FB). execCommand("insertText") fonctionne sur Lexical
 *  via le browser native behavior (Lexical écoute beforeinput +
 *  contentEditable). Fallback InputEvent en plus si execCommand fail. */
function fillEditor(composer: HTMLElement, text: string): void {
  composer.focus();
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(composer);
    sel.addRange(range);
  }
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }
  if (!inserted) {
    const beforeEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    });
    composer.dispatchEvent(beforeEvent);
    if (!beforeEvent.defaultPrevented) {
      composer.textContent = text;
    }
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }));
  }
}

export const facebookAdapter: PlatformAdapter = {
  id: "facebook",
  hosts: ["facebook.com"],
  isComposer: isComposerEl,
  isPostComposer: isPostComposerEl,
  findParentPost,
  fillEditor,
};
