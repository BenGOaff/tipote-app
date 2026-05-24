// Helper client : stocke un visuel (PNG) sur le pipeline self-host TUS et
// renvoie une URL de lecture signée. Branché sur la prop `upload` de
// <ImageStudio>. Côté client uniquement (tus-js-client + fetch cookies).
//
// Flux : 1) mint token (/api/visuals/upload-token), 2) upload résumable
// via tus, 3) URL signée (/api/visuals/playback-url).

import * as tus from "tus-js-client";

interface UploadTokenResponse {
  ok: boolean;
  error?: string;
  uploadUrl: string;
  token: string;
  storagePath: string;
}

export async function uploadVisual(blob: Blob): Promise<string> {
  const contentType = blob.type || "image/png";

  const tokenRes = await fetch("/api/visuals/upload-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ contentType }),
  });
  const tokenJson = (await tokenRes.json()) as UploadTokenResponse;
  if (!tokenRes.ok || !tokenJson.ok) {
    throw new Error(tokenJson.error || "Impossible de préparer l'upload du visuel.");
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: tokenJson.uploadUrl,
      retryDelays: [0, 3000, 5000, 10000],
      headers: { authorization: `Bearer ${tokenJson.token}` },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  const playbackRes = await fetch("/api/visuals/playback-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ path: tokenJson.storagePath }),
  });
  const playbackJson = (await playbackRes.json()) as { ok: boolean; signedUrl?: string; error?: string };
  if (!playbackRes.ok || !playbackJson.ok || !playbackJson.signedUrl) {
    throw new Error(playbackJson.error || "Visuel stocké mais URL de lecture indisponible.");
  }
  return playbackJson.signedUrl;
}
