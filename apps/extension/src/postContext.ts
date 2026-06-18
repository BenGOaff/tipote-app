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

// ─── Traduction automatique réseau (Béné 18 juin 2026) ────────────────
// FB/LinkedIn/X/IG affichent souvent une traduction auto du post (ex. un
// post EN affiché en FR). On scrape le texte VISIBLE = la traduction, donc
// sans garde-fou le modèle répond dans la langue de la traduction, pas
// celle d'origine. La plupart des réseaux affichent un marqueur du type
// "Traduit de l'anglais" / "Translated from English" : on en déduit la
// langue d'origine pour forcer la réponse dans CETTE langue.

/** Nom de langue (dans les UI FR/EN/ES/IT/PT/DE) -> code ISO 2 lettres. */
const LANG_NAME_TO_CODE: Record<string, string> = {
  anglais: "en", english: "en", "inglés": "en", ingles: "en", inglese: "en", "inglês": "en", englisch: "en", englischen: "en",
  "français": "fr", francais: "fr", french: "fr", "francés": "fr", frances: "fr", francese: "fr", "francês": "fr", "französisch": "fr", "französischen": "fr",
  espagnol: "es", spanish: "es", "español": "es", espanol: "es", spagnolo: "es", espanhol: "es", spanisch: "es", spanischen: "es",
  allemand: "de", german: "de", "alemán": "de", aleman: "de", tedesco: "de", "alemão": "de", deutsch: "de", deutschen: "de",
  italien: "it", italian: "it", italiano: "it", italienisch: "it", italienischen: "it",
  portugais: "pt", portuguese: "pt", "portugués": "pt", portugues: "pt", portoghese: "pt", "português": "pt", portugiesisch: "pt",
  "néerlandais": "nl", neerlandais: "nl", dutch: "nl", nederlands: "nl", "holandés": "nl",
  arabe: "ar", arabic: "ar", "árabe": "ar", arabo: "ar",
  chinois: "zh", chinese: "zh", chino: "zh", cinese: "zh", "chinês": "zh", chinesisch: "zh",
  russe: "ru", russian: "ru", ruso: "ru", russo: "ru",
  japonais: "ja", japanese: "ja", "japonés": "ja", giapponese: "ja",
};

// "Traduit de l'anglais", "Translated from English", "Traducido del inglés",
// "Tradotto dall'inglese", "Traduzido do inglês", "Aus dem Englischen übersetzt".
const TRANSLATED_FROM_RE =
  /(?:traduit\s+(?:de\s+l['’]|du\s+|de\s+)|translated\s+from\s+|traducido\s+del?\s+|tradotto\s+dall['’]?\s*|traduzido\s+do\s+|aus\s+dem\s+)([\p{L}]+)/iu;

// Marqueurs "il y a une traduction" SANS langue source explicite (on ne
// peut alors pas déduire l'origine, mais on nettoie la ligne du contenu).
const TRANSLATION_MARKER_RE = new RegExp(
  "^(" +
    [
      "voir l['’]original", "see original", "ver original", "mostra(?:r)? originale?", "original anzeigen", "ver o original",
      "traduit automatiquement", "translated automatically", "traduction automatique", "automatically translated",
      "traduit de .*", "translated from .*", "traducido del? .*", "tradotto dall.*", "traduzido do .*", "aus dem .* übersetzt",
      "vu que vous préférez le .*", "because you prefer .*",
    ].join("|") +
    ")\\s*$",
  "i",
);

/** Déduit la langue d'origine d'un post auto-traduit par le réseau, à
 *  partir du marqueur "Traduit de X". Retourne un code ISO 2 lettres ou
 *  null si aucun marqueur exploitable n'est trouvé. */
export function detectTranslatedFromLang(post: HTMLElement | null): string | null {
  if (!post) return null;
  const txt = (post.innerText || "").slice(0, 4000);
  const m = txt.match(TRANSLATED_FROM_RE);
  if (!m) return null;
  const word = m[1].toLowerCase();
  return (
    LANG_NAME_TO_CODE[word] ??
    // Fallback : retire une flexion finale (DE "Englischen" -> "englisch").
    LANG_NAME_TO_CODE[word.replace(/(?:en|e|n)$/u, "")] ??
    null
  );
}

export function cleanPostText(raw: string): string {
  const lines = (raw || "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (NOISE_LINE_RE.test(line)) continue;
    if (TRANSLATION_MARKER_RE.test(line)) continue;
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
  /** Langue d'origine si le réseau affiche une traduction auto du post
   *  (ex. post EN affiché en FR -> "en"). null sinon. */
  translatedFromLang: string | null;
}

export function extractPostContext(
  post: HTMLElement | null,
  composer: HTMLElement,
): PostContext {
  if (!post) return { text: "", imageUrl: null, translatedFromLang: null };
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
    translatedFromLang: detectTranslatedFromLang(post),
  };
}
