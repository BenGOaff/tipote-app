// lib/images/budgets.ts
//
// COMBIEN DE PIXELS UNE IMAGE A-T-ELLE BESOIN D'AVOIR. Une seule
// réponse, partagée par les deux moitiés du dispositif :
//
//   1. la COMPRESSION À L'ENVOI (lib/images/compress.ts), qui allège
//      tout ce qui sera téléversé demain ;
//   2. le SERVICE DES IMAGES (app/img/[...path]/route.ts), qui allège
//      au passage tout ce qui est déjà en ligne aujourd'hui.
//
// Les deux doivent décider PAREIL, sinon une image compressée à
// l'envoi serait recompressée au service, ou l'inverse. C'est la même
// règle que partout ailleurs dans ce repo : quand deux endroits
// recalculent une décision au lieu d'appeler la même fonction, ils
// finissent toujours par diverger.
//
// -- POURQUOI (Béné, 6 août 2026) -------------------------------------
//
// Mesure sur son quiz `clients-perdus` : 19 images, 30 Mo au total,
// 1,76 Mo de moyenne. Une image de réponse fait 1536 x 1024 pixels pour
// 1,8 Mo, et elle est affichée dans une carte de 300 pixels de large.
//
// Deux conséquences, et la deuxième est la plus chère :
// - le quota Supabase (5 Go) partait en une soixantaine de visiteurs ;
// - une visiteuse venue d'une publicité attendait 30 Mo avant de voir
//   le quiz. Sur mobile, la plupart ferment avant.
//
// -- "SANS PERDRE LA QUALITÉ" (sa condition, mot pour mot) ------------
//
// Les bornes ci-dessous ne sont pas des compromis, ce sont des marges.
// Un écran haute densité affiche 2 pixels d'image par pixel de mise en
// page : une carte de réponse de 300 points a besoin de 600 pixels, une
// image de contenu pleine largeur (672 points) en demande 1344. La
// borne "contenu" est à 1600, donc au dessus du besoin réel même sur
// les écrans les plus fins.
//
// Autrement dit, ce qui est retiré ce sont des pixels que l'écran ne
// peut PAS afficher. Rien de ce qu'elle voit ne change.
//
// Trois garde-fous complètent ça, et ils sont dans le code appelant :
// on n'AGRANDIT jamais une image plus petite que sa borne ; on garde
// l'ORIGINAL si le résultat est plus lourd ; et on garde l'original à
// la moindre erreur.

/** Le contexte d'affichage, qui décide de la borne. */
export type ImageKind = "cover" | "content" | "og" | "logo";

/**
 * La largeur (ou hauteur) maximale, en pixels, par contexte.
 *
 * - `cover` : fond plein écran et panneau latéral. Le plus large des
 *   usages, d'où la borne la plus haute.
 * - `content` : réponses, questions, contenu riche, bonus. Jamais plus
 *   large que la colonne de lecture.
 * - `og` : l'aperçu des réseaux sociaux. 1200 x 630 est LA spécification
 *   de Facebook et de X, en demander plus ne sert à rien.
 * - `logo` : affiché en 64 points de haut. 900 est déjà très large.
 */
export const MAX_EDGE: Record<ImageKind, number> = {
  cover: 2400,
  content: 1600,
  og: 1200,
  logo: 900,
};

/**
 * La qualité WebP, sur 100.
 *
 * 92 est le niveau dit "visuellement sans perte" : au dessus, le poids
 * grimpe vite sans qu'aucun oeil ne suive. En dessous de 85, les
 * aplats de couleur commencent à se marbrer, et une créatrice le verra
 * sur un dégradé de marque.
 */
export const WEBP_QUALITY = 92;

/** Les dossiers de stockage, et le contexte auquel ils correspondent. */
const KIND_BY_FOLDER: Record<string, ImageKind> = {
  "quiz-backgrounds": "cover",
  "quiz-panel": "cover",
  og: "og",
  logos: "logo",
};

/**
 * Le contexte d'une image, déduit de son dossier de stockage.
 *
 * Le dossier EST le contexte (`quiz-options/`, `og/`, `logos/`...),
 * c'est la convention du bucket depuis le début. S'en servir évite de
 * passer un paramètre de plus à chacun des vingt-six appels d'envoi,
 * et surtout ça donne au service des images la même information sans
 * qu'il ait à deviner quoi que ce soit.
 *
 * Dossier inconnu (un nouveau dossier ajouté demain) -> `content`,
 * la borne la plus prudente des trois grandes.
 */
export function kindForPath(path: string): ImageKind {
  const folder = String(path ?? "").replace(/^\/+/, "").split("/")[0] ?? "";
  return KIND_BY_FOLDER[folder] ?? "content";
}

/**
 * Les types d'images qu'on ne touche JAMAIS.
 *
 * - `image/gif` : le ré-encodage perdrait l'animation. Béné utilise des
 *   GIF animés dans les quiz, c'est une fonctionnalité annoncée.
 * - `image/svg+xml` : c'est du vectoriel, donc déjà minuscule et net à
 *   toutes les tailles. Le passer dans un canvas le transformerait en
 *   pixels, ce qui serait une perte de qualité, exactement ce qu'on
 *   s'interdit.
 * - tout ce qui n'est pas une image : on ne devine pas.
 */
export function passThrough(mime: string): boolean {
  const m = String(mime ?? "").toLowerCase().split(";")[0].trim();
  if (!m.startsWith("image/")) return true;
  return m === "image/gif" || m === "image/svg+xml" || m === "image/avif";
}

/**
 * Les dimensions de sortie, ou `null` quand il n'y a rien à redimensionner.
 *
 * `null` n'est pas un échec : c'est une image déjà à la bonne taille.
 * Le format peut quand même être converti par l'appelant.
 *
 * ON N'AGRANDIT JAMAIS. Une image de 400 pixels reste à 400 : la
 * gonfler à 1600 ne rajouterait aucun détail, seulement du poids et du
 * flou.
 */
export function targetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } | null {
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  const max = Math.round(Number(maxEdge) || 0);
  if (w <= 0 || h <= 0 || max <= 0) return null;

  const longest = Math.max(w, h);
  if (longest <= max) return null;

  const ratio = max / longest;
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
  };
}

/**
 * Garde-t-on le résultat, ou l'original ?
 *
 * Une photo déjà compressée au maximum, une capture d'écran en aplats,
 * un tout petit fichier : le ré-encodage peut sortir PLUS LOURD que ce
 * qu'on lui a donné. Dans ce cas on rend l'original, sans discuter.
 *
 * La marge de 5% évite de remplacer un fichier par un autre pour
 * gagner trois octets : chaque conversion est un risque (couleurs,
 * transparence, métadonnées), elle doit rapporter quelque chose.
 */
export function keepEncoded(originalBytes: number, encodedBytes: number): boolean {
  const o = Number(originalBytes) || 0;
  const e = Number(encodedBytes) || 0;
  if (o <= 0 || e <= 0) return false;
  return e < o * 0.95;
}
