// lib/quiz/partageImages.ts
//
// LES IMAGES D'UN QUIZ PARTAGÉ DOIVENT SURVIVRE AU MÉNAGE DE CELUI QUI
// L'A ENVOYÉ.
//
// Le bucket `public-assets` est en lecture publique : une copie qui
// garderait les URL de l'expéditeur AFFICHERAIT tout, tout de suite, et
// ça marcherait très bien. Jusqu'au jour où il fait le ménage dans son
// stockage, ou supprime son compte : les images disparaissent alors du
// quiz de son client, sans que personne n'ait rien touché chez lui.
// C'est le pire genre de panne, celle qui arrive des mois après le
// dernier changement.
//
// On RECOPIE donc chaque fichier dans le dossier du nouveau
// propriétaire. La RLS le permet sans clé de service : la lecture est
// publique, et l'écriture est autorisée dès que le 2e segment du chemin
// vaut son `auth.uid()` (migration 014).
//
// -- ON NE CHERCHE PAS DANS UNE LISTE DE COLONNES ----------------------
//
// Les images ne vivent pas que dans `cover_image_url`. Elles sont aussi
// dans `options[].image_url` (JSONB), dans `beat_media` (JSONB), dans le
// logo, l'image de fond, le panneau du split, le bonus... et la prochaine
// arrivera dans une colonne que personne n'aura pensé à ajouter ici.
//
// Une liste blanche de colonnes oublie toujours la suivante : c'est la
// mécanique exacte du "problème qui revient" (typographie française,
// 3 août). On reconnaît donc une image à sa FORME (une URL de notre
// bucket public), n'importe où dans la ligne, aussi profond soit-elle.

/** Le morceau d'URL qui désigne un objet public de notre bucket. */
export const PREFIXE_PUBLIC_ASSETS = "/storage/v1/object/public/public-assets/";

/**
 * Le chemin DANS le bucket, extrait d'une URL publique Supabase.
 * `null` dès que ce n'est pas une de nos images : une URL Unsplash, un
 * GIF Giphy ou une image hébergée ailleurs continuent de fonctionner
 * pour tout le monde, on n'y touche pas.
 */
export function cheminDepuisUrl(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const i = valeur.indexOf(PREFIXE_PUBLIC_ASSETS);
  if (i < 0) return null;
  // La query (`?t=...`) et l'ancre ne font pas partie du chemin de
  // l'objet : les garder ferait chercher un fichier qui n'existe pas.
  const brut = valeur.slice(i + PREFIXE_PUBLIC_ASSETS.length).split(/[?#]/)[0];
  const chemin = decodeURIComponent(brut).trim();
  if (!chemin || chemin.includes("..")) return null;
  return chemin;
}

/**
 * Le chemin que le MÊME fichier aura chez le nouveau propriétaire :
 * `<sujet>/<son uid>/<fichier>`.
 *
 * `null` si le chemin n'a pas cette forme. C'est un refus VOLONTAIRE :
 * la RLS n'accepte l'écriture que si le 2e segment vaut son `auth.uid()`,
 * donc fabriquer un chemin d'une autre forme ne produirait qu'un échec
 * de copie. L'appelant garde alors l'URL d'origine, qui s'affiche.
 */
export function cheminPourInstallateur(chemin: string, uid: string): string | null {
  const bouts = chemin.split("/");
  if (bouts.length < 3) return null;
  if (!uid.trim()) return null;
  bouts[1] = uid;
  return bouts.join("/");
}

/**
 * Tous les chemins d'images de NOTRE bucket présents dans une valeur,
 * si profondément soient-ils enfouis. Sans doublon : deux profils qui
 * partagent la même illustration ne la copient qu'une fois.
 */
export function collecterImages(valeur: unknown, vus = new Set<string>()): Set<string> {
  if (typeof valeur === "string") {
    const c = cheminDepuisUrl(valeur);
    if (c) vus.add(c);
    return vus;
  }
  if (Array.isArray(valeur)) {
    for (const v of valeur) collecterImages(v, vus);
    return vus;
  }
  if (valeur && typeof valeur === "object") {
    for (const v of Object.values(valeur as Record<string, unknown>)) {
      collecterImages(v, vus);
    }
  }
  return vus;
}

/**
 * Réécrit, partout dans la valeur, les URL des images qui ont VRAIMENT
 * été recopiées.
 *
 * Une image absente de la table de correspondance garde son URL
 * d'origine. C'est le repli voulu : une image qui s'affiche encore vaut
 * mieux qu'un carré vide, et l'écran d'installation dit combien de
 * fichiers n'ont pas pu être recopiés.
 */
export function reecrireImages<T>(valeur: T, correspondance: Map<string, string>): T {
  if (correspondance.size === 0) return valeur;
  if (typeof valeur === "string") {
    const c = cheminDepuisUrl(valeur);
    if (!c) return valeur;
    const neuf = correspondance.get(c);
    if (!neuf) return valeur;
    // On remplace la TRANCHE BRUTE telle qu'elle apparaît dans l'URL, pas
    // une version ré-encodée par nous : un fichier accentué peut être
    // écrit encodé ou non selon qui a fabriqué l'URL, et re-fabriquer la
    // chaîne à remplacer ferait rater le remplacement en silence.
    const debut = valeur.indexOf(PREFIXE_PUBLIC_ASSETS) + PREFIXE_PUBLIC_ASSETS.length;
    const reste = valeur.slice(debut);
    const finRelative = reste.search(/[?#]/);
    const brut = finRelative < 0 ? reste : reste.slice(0, finRelative);
    const remplacant = brut === encodeChemin(c) ? encodeChemin(neuf) : neuf;
    return (valeur.slice(0, debut) +
      remplacant +
      valeur.slice(debut + brut.length)) as unknown as T;
  }
  if (Array.isArray(valeur)) {
    return valeur.map((v) => reecrireImages(v, correspondance)) as unknown as T;
  }
  if (valeur && typeof valeur === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) {
      out[k] = reecrireImages(v, correspondance);
    }
    return out as unknown as T;
  }
  return valeur;
}

/** L'encodage tel qu'il apparaît dans une URL Supabase : chaque segment
 *  est encodé, les `/` restent des séparateurs. */
function encodeChemin(chemin: string): string {
  return chemin.split("/").map(encodeURIComponent).join("/");
}
