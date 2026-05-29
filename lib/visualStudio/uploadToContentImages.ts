// lib/visualStudio/uploadToContentImages.ts
//
// Uploader du Studio visuel CÔTÉ TIPOTE. Contrairement à l'affilié (pipeline
// TUS → URL signée 2 h), ici on stocke dans le bucket PUBLIC `content-images`
// via /api/upload/image, EXACTEMENT comme ImageUploader. C'est indispensable :
// le pipeline de publication n8n récupère l'image par son URL PUBLIQUE des
// jours plus tard (post programmé) — une URL signée qui expire casserait la
// publication différée.
//
// Branché sur la prop `upload` de <ImageStudio>. Renvoie { url, path } : l'URL
// publique durable (affichage + n8n) et le chemin (suppression éventuelle).

import type { StudioFormatId } from "@/lib/visualStudio/types";

/** Fabrique un uploader lié à un contentId (le post/article courant) pour que
 *  les visuels atterrissent sous {user}/{contentId}/… comme les autres images.
 *  Si pas encore d'id (brouillon non sauvé), on tombe sur "drafts" côté API. */
export function makeContentImageUploader(contentId?: string) {
  return async function uploadToContentImages(
    blob: Blob,
    meta: { format: StudioFormatId; width: number; height: number },
  ): Promise<{ url: string; path: string }> {
    const fd = new FormData();
    const ext = blob.type === "image/jpeg" ? "jpg" : "png";
    const filename = `studio-${meta.format.replace(":", "x")}-${Date.now()}.${ext}`;
    // Le bucket n'accepte que png/jpeg/gif → on force un nom cohérent avec le type.
    fd.append("file", new File([blob], filename, { type: blob.type || "image/png" }));
    if (contentId) fd.append("contentId", contentId);

    const res = await fetch("/api/upload/image", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      path?: string;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.url || !json.path) {
      throw new Error(json.error || "Échec de l'upload du visuel.");
    }
    return { url: json.url, path: json.path };
  };
}
