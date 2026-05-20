// lib/clientFaviconUpload.ts
//
// Browser-side helper used by the favicon picker in the Custom Domains
// tab. Takes an arbitrary user-supplied file and returns a Blob ready
// to upload to Supabase storage:
//
//   - SVG  → kept as-is. Modern browsers render <link rel="icon"
//            type="image/svg+xml"> at any size.
//   - ICO  → kept as-is. Native favicon format.
//   - PNG / JPG / WEBP / GIF → rendered on a 256×256 canvas and exported
//            as PNG. The aspect ratio is preserved on a transparent
//            background, so a non-square upload becomes a centered
//            square favicon instead of being squashed.
//
// We do this client-side to avoid pulling sharp into the Next.js server
// bundle — the API route is already a thin pass-through to Supabase
// storage, no image processing on the server.

export type PreparedFavicon = {
  blob: Blob;
  /** File extension to use in the storage path (no leading dot). */
  ext: string;
  /** MIME type (for the upload contentType). */
  contentType: string;
};

const TARGET_SIZE = 256;
const RASTER_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function prepareFaviconForUpload(file: File): Promise<PreparedFavicon> {
  const name = file.name.toLowerCase();
  const isSvg = file.type === "image/svg+xml" || name.endsWith(".svg");
  const isIco = file.type === "image/x-icon" || file.type === "image/vnd.microsoft.icon" || name.endsWith(".ico");

  if (isSvg) {
    return { blob: file, ext: "svg", contentType: "image/svg+xml" };
  }
  if (isIco) {
    return { blob: file, ext: "ico", contentType: "image/x-icon" };
  }
  if (RASTER_MIMES.has(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    const blob = await resizeRasterTo256(file);
    return { blob, ext: "png", contentType: "image/png" };
  }
  throw new Error("Format non supporté. Utilise PNG, JPG, WEBP, GIF, SVG ou ICO.");
}

async function resizeRasterTo256(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non disponible");

    // Center the image on a transparent square. Preserve aspect ratio
    // by fitting the longest side to 256px (letterboxing the other axis).
    const ratio = Math.min(TARGET_SIZE / img.width, TARGET_SIZE / img.height);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const dx = Math.round((TARGET_SIZE - w) / 2);
    const dy = Math.round((TARGET_SIZE - h) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, TARGET_SIZE, TARGET_SIZE);
    ctx.drawImage(img, dx, dy, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Export PNG impossible");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = url;
  });
}
