// lib/resultCard.ts
// Genere une carte de resultat partageable (image) cote client, sans
// dependance ni endpoint serveur. Sert la viralite : le visiteur telecharge
// ou partage "Je suis [profil]" sur ses reseaux, ce qui ramene du trafic
// vers le quiz du createur.
//
// SSR-safe : renvoie null si document indisponible. Le logo est charge en
// crossOrigin anonymous ; s'il echoue (CORS), on le saute sans casser la carte.

export type ResultCardOptions = {
  primaryColor: string;
  logoUrl: string | null;
  label: string; // ex. "Mon resultat"
  resultTitle: string; // titre du profil (texte brut, deja nettoye)
  quizTitle: string; // titre du quiz (texte brut)
  footer?: string | null; // ex. nom de marque / site
};

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Coupe un texte en lignes qui tiennent dans maxWidth pour la police courante.
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateResultCard(opts: ResultCardOptions): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Fond : primaire plein avec un leger degrade pour la profondeur.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, opts.primaryColor);
  grad.addColorStop(1, shade(opts.primaryColor, -18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const pad = 96;
  const contentW = W - pad * 2;
  ctx.textAlign = "center";

  // Logo (optionnel).
  let topY = 150;
  if (opts.logoUrl) {
    const logo = await loadImage(opts.logoUrl);
    if (logo && logo.width > 0) {
      const maxH = 130;
      const ratio = logo.width / logo.height;
      const h = Math.min(maxH, logo.height);
      const w = h * ratio;
      ctx.drawImage(logo, (W - w) / 2, topY, w, h);
      topY += h + 40;
    }
  }

  // Label ("Mon resultat").
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(opts.label.toUpperCase(), W / 2, 560);

  // Titre du profil (gros, gras, blanc, sur plusieurs lignes).
  ctx.fillStyle = "#ffffff";
  const titleSize = opts.resultTitle.length > 34 ? 84 : 104;
  ctx.font = `800 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const lines = wrapLines(ctx, opts.resultTitle, contentW);
  const lineH = titleSize * 1.16;
  let y = 660;
  for (const line of lines.slice(0, 4)) {
    ctx.fillText(line, W / 2, y);
    y += lineH;
  }

  // Titre du quiz (plus petit, en bas).
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "500 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const quizLines = wrapLines(ctx, opts.quizTitle, contentW);
  let qy = H - 240;
  for (const line of quizLines.slice(0, 2)) {
    ctx.fillText(line, W / 2, qy);
    qy += 52;
  }

  // Footer (marque / site).
  if (opts.footer) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "600 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(opts.footer, W / 2, H - 96);
  }

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png", 0.92),
  );
}

// Assombrit/eclaircit un hex de `amt` pourcents (negatif = plus sombre).
function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  const f = amt / 100;
  const r = Math.round(Math.min(255, Math.max(0, (num >> 16) + 255 * f)));
  const g = Math.round(Math.min(255, Math.max(0, ((num >> 8) & 0xff) + 255 * f)));
  const b = Math.round(Math.min(255, Math.max(0, (num & 0xff) + 255 * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
