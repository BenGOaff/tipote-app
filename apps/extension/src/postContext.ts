// Extraction propre du contexte d'un post (texte + image principale)
// pour l'IA. Béné 13 juin 2026 : sur Facebook/Instagram, l'innerText
// brut de l'ancêtre du composer contient TOUT (légende noyée dans les
// commentaires existants, barres de réactions, timestamps, compteurs,
// "Voir plus de commentaires"...). Le modèle recevait de la soupe et
// sortait des commentaires plats ou hors-sujet.
//
// Deux leviers :
//   1. cleanPostText : retire le bruit UI évident (mots d'action,
//      timestamps, compteurs), dédoublonne, cappe court pour rester sur
//      la légende (en tête du post) plutôt que la masse de commentaires.
//   2. extractMainImageUrl : trouve la VRAIE image du post (la plus
//      grande, pas un avatar/emoji/icône) -> envoyée au backend pour la
//      vision. Sur les réseaux visuels c'est LE signal fiable : Claude
//      commente ce que montre la photo, pas du texte parasite.

// Lignes 100% UI à jeter (match exact, insensible casse). Une légende
// "J'aime beaucoup cette photo" n'est PAS jetée (pas un match exact).
const NOISE_LINE_RE = new RegExp(
  "^(" +
    [
      "j'aime", "j'aime\\s*!", "like", "gefällt mir", "me gusta", "mi piace", "gosto", "أعجبني",
      "répondre", "reply", "responder", "rispondi", "antworten", "رد",
      "partager", "share", "compartir", "condividi", "teilen", "partilhar", "مشاركة",
      "commenter", "comment", "kommentieren", "comentar", "commenta", "تعليق",
      "voir plus de commentaires", "view (more|all)( \\d+)? comments", "afficher plus de commentaires",
      "voir plus", "see more", "afficher plus", "mehr anzeigen", "ver más", "ver mais",
      "voir la traduction", "see translation", "traduire", "translate",
      "tous les commentaires", "most relevant", "les plus pertinents",
      "aimé par", "liked by", "le gusta a", "suivre", "follow", "s'abonner", "abonné",
      "sponsorisé", "sponsored", "suggéré pour vous", "suggested for you", "en vedette",
      "tipote", "modifié", "edited", "·",
    ].join("|") +
    ")\\s*$",
  "i",
);

// Timestamp seul : "8 h", "2 j", "1 sem", "3d", "5h", "il y a 2 h"...
const TIMESTAMP_RE = /^(il y a\s*)?\d+\s*(s|sec|min|m|h|hr|hrs|hours?|j|d|day|days|sem|w|wk|week|weeks|mois|mo|an|y|yr|years?|ans)\.?$/i;
// Compteur seul (réactions/vues) : "1,2 k", "324", "12 K", "5.4M"...
const COUNT_RE = /^[\d\s.,]+\s*[kKmM]?$/;

export function cleanPostText(raw: string): string {
  const lines = (raw || "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (NOISE_LINE_RE.test(line)) continue;
    if (TIMESTAMP_RE.test(line)) continue;
    if (COUNT_RE.test(line) && line.length <= 8) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue; // dédoublonne (noms/commentaires répétés)
    seen.add(key);
    out.push(line);
    if (out.join(" ").length > 800) break; // cappe : on reste sur la légende
  }
  return out.join("\n").trim();
}

/** URL de l'image de contenu la plus grande du post (exclut
 *  avatars/emojis/icônes/réactions). Renvoyée pour la vision IA. */
export function extractMainImageUrl(post: HTMLElement): string | null {
  let best: { url: string; area: number } | null = null;
  const imgs = Array.from(post.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imgs) {
    const src = img.currentSrc || img.src || "";
    if (!/^https:\/\//i.test(src)) continue;
    // Exclut emojis, stickers, icônes de réaction, SVG, sprites.
    if (/emoji|sticker|reaction|\/rsrc\.php|\.svg(\?|$)|static\.xx\.fbcdn/i.test(src)) continue;
    const w = img.naturalWidth || img.clientWidth || 0;
    const h = img.naturalHeight || img.clientHeight || 0;
    if (w < 200 || h < 200) continue; // skip avatars / vignettes
    const area = w * h;
    if (!best || area > best.area) best = { url: src, area };
  }
  return best?.url ?? null;
}

export interface PostContext {
  text: string;
  imageUrl: string | null;
}

/** Conteneur du POST en remontant le DOM SANS limite de profondeur.
 *
 *  Deux pièges réglés ici :
 *
 *  1. PROFONDEUR. Le walk-up à profondeur fixe (12-15) ECHOUAIT sur
 *     Facebook : le composer y est enfoui 20-30 niveaux sous le post ->
 *     findParentPost renvoyait null -> content length 0 -> commentaires
 *     hors-sujet (drame Béné 14 juin 2026, confirmé par les logs FB
 *     "content length = 0"). On remonte ici jusqu'à la racine.
 *
 *  2. IMBRICATION. Sur FB/IG, chaque COMMENTAIRE est lui aussi un
 *     [role="article"], IMBRIQUE dans l'article du post. Un simple
 *     closest() renverrait l'article le plus PROCHE = le commentaire
 *     quand on repond sous un commentaire -> on commenterait le mauvais
 *     texte. On garde donc le PLUS EXTERNE des articles : le post
 *     enveloppe toujours ses commentaires, donc l'article le plus haut
 *     dans la chaine d'ancetres = le post (la colonne du feed est
 *     role="feed", jamais "article", donc pas de sur-capture).
 *
 *  X : un tweet n'imbrique pas ses reponses (siblings), le plus externe
 *  reste donc le tweet pertinent ; le modal de reponse tombe sur le
 *  fallback [role="dialog"] (qui contient le tweet d'origine). */
export function closestPostContainer(composer: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = composer.parentElement;
  let outermost: HTMLElement | null = null;
  while (node) {
    if (
      node.matches('[role="article"], article, [data-testid="tweet"]') &&
      (node.innerText || "").trim().length > 0
    ) {
      outermost = node; // on continue : on veut le plus haut
    }
    node = node.parentElement;
  }
  if (outermost) return outermost;
  const dialog = composer.closest('[role="dialog"]') as HTMLElement | null;
  if (dialog && (dialog.innerText || "").trim().length > 0) return dialog;
  return null;
}

export function extractPostContext(
  post: HTMLElement | null,
  composer: HTMLElement,
): PostContext {
  if (!post) return { text: "", imageUrl: null };
  const editorText =
    composer instanceof HTMLTextAreaElement
      ? composer.value
      : composer.innerText || "";
  // On retire le texte du composer du brut avant nettoyage.
  let raw = post.innerText || "";
  if (editorText.trim() && raw.includes(editorText)) {
    raw = raw.replace(editorText, " ");
  }
  return {
    text: cleanPostText(raw),
    imageUrl: extractMainImageUrl(post),
  };
}
