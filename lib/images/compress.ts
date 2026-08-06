// lib/images/compress.ts
//
// LA COMPRESSION À L'ENVOI. Vit dans le navigateur : l'image est
// allégée AVANT de partir, donc l'attente au téléversement diminue
// aussi, et Supabase ne stocke jamais le fichier de 1,8 Mo.
//
// Les bornes et les règles sont dans `lib/images/budgets.ts`, partagées
// avec le service des images. Ce fichier ne décide rien, il exécute.
//
// -- FAIL-OPEN, TOUJOURS ----------------------------------------------
//
// À la moindre difficulté (format exotique, image corrompue, navigateur
// sans WebP, canvas indisponible, mémoire insuffisante), on rend le
// FICHIER D'ORIGINE. Une image un peu lourde qui s'affiche vaut
// infiniment mieux qu'un téléversement qui échoue : la créatrice ne
// saurait pas quoi faire de l'erreur, et elle a raison, ce n'est pas
// son problème.
//
// -- L'ORIENTATION EXIF N'EST PAS UN DÉTAIL ---------------------------
//
// Une photo prise au téléphone est très souvent stockée à l'horizontale
// avec une étiquette "tourne-moi de 90 degrés". Le navigateur applique
// l'étiquette à l'affichage, mais un canvas dessine les pixels BRUTS.
// Sans `imageOrientation: "from-image"`, toutes les photos verticales
// prises au téléphone repartiraient couchées, et la créatrice
// conclurait que la fonction a cassé ses images.

import {
  MAX_EDGE,
  WEBP_QUALITY,
  keepEncoded,
  kindForPath,
  passThrough,
  targetSize,
} from "./budgets";

/** Ce qu'il faut envoyer : le contenu, et l'extension qui va avec. */
export interface PreparedUpload {
  blob: Blob;
  ext: string;
  /** Vrai quand on a effectivement allégé (utile pour les tests et les logs). */
  compressed: boolean;
}

/** L'extension d'un type MIME, pour que le chemin de stockage ne mente pas. */
function extFor(mime: string, fallback: string): string {
  const m = String(mime ?? "").toLowerCase().split(";")[0].trim();
  if (m === "image/webp") return "webp";
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/gif") return "gif";
  if (m === "image/svg+xml") return "svg";
  if (m === "image/avif") return "avif";
  return fallback;
}

/** L'extension du nom de fichier d'origine, nettoyée. */
function extFromName(name: string): string {
  const raw = String(name ?? "").split(".").pop() ?? "";
  const clean = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean.length >= 1 && clean.length <= 8 ? clean : "png";
}

/** Le navigateur sait-il produire du WebP ? (tous depuis 2020, mais on vérifie.) */
function supportsWebp(): boolean {
  try {
    const c = document.createElement("canvas");
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Prépare un fichier pour le téléversement.
 *
 * `storagePath` sert uniquement à connaître le CONTEXTE (le dossier
 * décide de la borne, cf. `kindForPath`). L'appelant passe le chemin
 * qu'il s'apprête à utiliser, sans son extension finale : celle-ci est
 * justement ce que cette fonction renvoie.
 *
 * Ne lève jamais.
 */
export async function prepareUpload(
  // `Blob` et pas `File` : le studio visuel envoie un blob produit par un
  // canvas, sans nom de fichier. Il a exactement le meme besoin, et le
  // laisser de cote serait le seul point d'envoi non couvert, donc celui
  // par lequel le probleme reviendrait.
  file: Blob & { name?: string },
  storagePath: string,
): Promise<PreparedUpload> {
  const original: PreparedUpload = {
    blob: file,
    ext: file.name ? extFromName(file.name) : extFor(file.type, "png"),
    compressed: false,
  };

  try {
    if (passThrough(file.type)) return original;
    if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
      return original;
    }
    if (!supportsWebp()) return original;

    // `from-image` applique l'orientation EXIF : sans ça, les photos
    // prises au téléphone repartiraient couchées.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const kind = kindForPath(storagePath);
    const size = targetSize(bitmap.width, bitmap.height, MAX_EDGE[kind]);
    const width = size?.width ?? bitmap.width;
    const height = size?.height ?? bitmap.height;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return original;
    }
    // Le rééchantillonnage de qualité : sans ça, réduire une photo
    // produit un crénelage que l'oeil voit tout de suite sur les
    // lignes fines.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await toBlob(canvas, "image/webp", WEBP_QUALITY / 100);
    // Libère la mémoire du canvas tout de suite : une créatrice qui
    // téléverse dix photos d'affilée sur un téléphone n'en a pas de
    // trop.
    canvas.width = 0;
    canvas.height = 0;

    if (!blob || !keepEncoded(file.size, blob.size)) return original;
    return { blob, ext: extFor(blob.type || "image/webp", "webp"), compressed: true };
  } catch {
    return original;
  }
}
