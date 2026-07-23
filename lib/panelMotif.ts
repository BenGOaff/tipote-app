// lib/panelMotif.ts
// Port fidele de l'algorithme `drawMotif` du mockup valide
// (scratchpad/quiz-redesign.html). Dessine un motif decoratif sur un
// <canvas> a partir d'une couleur de base : mesh, dots, waves, aurora,
// rings, grain. Fonctions pures cote client (appelees au mount + resize),
// sans dependance DOM au-dela du canvas fourni -> safe pour le SSR (jamais
// appelees au rendu serveur).

import type { PanelMotifKey } from "@/lib/quizBranding";

/** Eclaircit (+) ou assombrit (-) un hex de `amt` %. */
export function shade(hex: string, amt: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const f = amt / 100;
  const r = Math.max(0, Math.min(255, (n >> 16) + 255 * f));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + 255 * f));
  const b = Math.max(0, Math.min(255, (n & 255) + 255 * f));
  return "#" + (((r << 16) | (g << 8) | b) | 0).toString(16).padStart(6, "0");
}

/** hex/rgb -> rgba avec alpha. */
export function hexA(hex: string, a: number): string {
  if (hex[0] !== "#") return hex.replace(")", "," + a + ")").replace("rgb", "rgba");
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

/**
 * Dessine le motif `motif` (couleur de base `color`) sur le canvas `cv`.
 * Redimensionne le buffer du canvas a sa taille CSS courante. Portage
 * fidele du mockup.
 */
export function drawMotif(cv: HTMLCanvasElement, motif: PanelMotifKey, color: string): void {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const r = cv.getBoundingClientRect();
  const w = (cv.width = Math.max(2, r.width | 0));
  const h = (cv.height = Math.max(2, r.height | 0));
  const dark = shade(color, -32);
  const light = shade(color, 22);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  if (motif === "mesh" || motif === "aurora") {
    const pts: [number, number, number, string, number][] =
      motif === "mesh"
        ? [
            [0.78, 0.24, 0.55, "#ffffff", 0.22],
            [0.16, 0.82, 0.6, dark, 0.5],
            [0.5, 0.5, 0.4, light, 0.35],
          ]
        : [
            [0.2, 0.2, 0.5, "#ff9edb", 0.3],
            [0.85, 0.35, 0.55, "#7cf0ff", 0.28],
            [0.5, 0.9, 0.6, "#c6a5ff", 0.3],
          ];
    for (const [x, y, rr, c, a] of pts) {
      const rad = Math.max(w, h) * rr;
      const gr = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, rad);
      gr.addColorStop(0, hexA(c, a));
      gr.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x * w, y * h, rad, 0, 7);
      ctx.fill();
    }
  } else if (motif === "dots") {
    ctx.fillStyle = "rgba(255,255,255,.14)";
    for (let y = 22; y < h; y += 24)
      for (let x = 22; x < w; x += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, 7);
        ctx.fill();
      }
  } else if (motif === "waves") {
    ctx.strokeStyle = "rgba(255,255,255,.16)";
    ctx.lineWidth = 1.4;
    const cx = w * 0.15;
    const cy = h * 0.9;
    for (let i = 1; i < 16; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, i * Math.max(w, h) * 0.07, 0, 7);
      ctx.stroke();
    }
  } else if (motif === "rings") {
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 1.4;
    const cx = w * 0.72;
    const cy = h * 0.32;
    for (let i = 1; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, i * 20, 0, 7);
      ctx.stroke();
    }
  } else if (motif === "grain") {
    const im = ctx.getImageData(0, 0, w, h);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 40 - 20;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    ctx.putImageData(im, 0, 0);
  }
  ctx.restore();
}
