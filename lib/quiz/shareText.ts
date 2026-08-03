// lib/quiz/shareText.ts
//
// LE TEXTE QU'UN VISITEUR COLLE DANS UN RÉSEAU SOCIAL.
//
// Béné, 3 août 2026, capture Threads à l'appui : le partage sortait
//
//   <div class="rt-field-fs" style="--rt-fs-d: 18px">Ce quiz permet
//   vraiment d'identifier la difficulté ... vraiment parlants&nbsp;!</div>
//
// La cause tient en une phrase : `share_message` est un champ RICHE
// (l'éditeur y met des balises et des `&nbsp;`), et le viewer le passait
// TEL QUEL à `navigator.share`, aux sharers et au presse-papier.
//
// Le plus instructif est que la moitié serveur, elle, était CORRECTE :
// la carte d'aperçu du lien (les balises `og:`) appelait `stripHtml`
// depuis mai. Sur la capture de Béné, l'aperçu du bas est propre et le
// texte du haut est du HTML brut. **Deux endroits calculaient la même
// chose, un seul avait été corrigé** : exactement la mécanique du
// "problème qui revient" documentée pour l'alignement, le score, les
// réseaux de partage et la disposition des réponses.
//
// D'où ce fichier : une fonction, testée, appelée par le viewer ET par
// les métadonnées. Personne ne recompose de texte de partage ailleurs.

import { stripHtml } from "../richText.ts";

/**
 * Un champ riche transformé en UNE ligne de texte brut.
 *
 * `stripHtml` retire les balises, décode les entités et écrase les
 * blancs. On ajoute le retrait des sauts de ligne : dans un tweet ou un
 * post Threads, un texte sur cinq lignes pousse le lien hors de vue.
 */
export function toShareLine(raw: string | null | undefined): string {
  return stripHtml(raw).replace(/\s*\n+\s*/g, " ").trim();
}

/**
 * Le texte de partage d'un quiz.
 *
 * Ordre : le message écrit par la créatrice, sinon la phrase par défaut
 * de la langue du quiz, construite avec le titre.
 *
 * Le TITRE est nettoyé lui aussi, et ce n'était pas le cas non plus : la
 * phrase par défaut fait `Je viens de faire le quiz "<titre>"`, donc un
 * titre riche (le cas de tous les quiz, l'éditeur est du WYSIWYG)
 * injectait ses balises dans le partage de qui n'avait rien écrit. Le
 * repli était donc cassé pour tout le monde, en silence.
 */
export function buildShareText(
  rawMessage: string | null | undefined,
  rawTitle: string | null | undefined,
  defaultMessage: (plainTitle: string) => string,
): string {
  const message = toShareLine(rawMessage);
  if (message) return message;
  return toShareLine(defaultMessage(toShareLine(rawTitle)));
}

/**
 * Les SEULS paramètres d'URL qui veulent dire quelque chose pour la
 * personne qui reçoit le lien.
 *
 * `rp` désigne le profil obtenu : c'est du contenu, il reste. Tout le
 * reste (`utm_*`, `fbclid`, `gclid`, `igshid`...) décrit comment le
 * PRÉCÉDENT visiteur est arrivé.
 *
 * LISTE BLANCHE ASSUMÉE, alors que ce dépôt les proscrit d'habitude, et
 * la raison compte : ici, oublier un paramètre le fait DISPARAÎTRE du
 * lien partagé, ce qui est le comportement voulu par défaut. Une liste
 * noire, elle, laisserait passer le prochain identifiant publicitaire
 * inventé par une régie, et le bug reviendrait exactement comme
 * aujourd'hui.
 */
const SHARE_QUERY_KEEP = new Set(["rp"]);

/**
 * L'URL qu'on partage vraiment.
 *
 * Sur la capture de Béné, le lien partagé faisait cinq lignes :
 *
 *   .../neuro-atypie-quiz?utm_source=ig&utm_medium=social
 *   &utm_content=link_in_bio&fbclid=PAZXh0bgNhZW0CMTEAAc3J0YwZhcHBfaWQ...
 *
 * Elle avait ouvert le quiz depuis une publicité Instagram, donc son
 * `window.location.href` portait le suivi de campagne, et le partage le
 * recopiait tel quel. Deux dégâts : c'est illisible, et ça attribue les
 * nouveaux visiteurs à une campagne qui n'est pas la leur.
 *
 * Une URL illisible n'est pas qu'un défaut d'esthétique : elle a l'air
 * d'un lien piégé, donc on clique moins.
 */
export function cleanShareUrl(href: string | null | undefined): string {
  const raw = String(href ?? "").trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Fail-open : une URL qu'on ne sait pas lire est rendue telle quelle.
    // Mieux vaut un lien moche qu'un lien absent.
    return raw;
  }
  const kept = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (SHARE_QUERY_KEEP.has(key.toLowerCase()) && value) kept.set(key, value);
  });
  const query = kept.toString();
  // Le fragment aussi : il ne sert qu'a la navigation interne de celui
  // qui partage.
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
}
