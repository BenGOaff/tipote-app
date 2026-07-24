// lib/brandPalette.ts
// Generateur de palette harmonieuse a partir d'une couleur de marque.
// 100% deterministe (math couleur, AUCUN LLM), garantit des hex valides et
// un contraste lisible. A partir d'une seule couleur, on derive 5 swatches :
//   1. la couleur de marque elle-meme
//   2. une teinte claire (candidat fond)
//   3. une version foncee (candidat texte, lisible sur fond clair)
//   4. un accent complementaire (rotation de teinte)
//   5. un neutre assorti (faible saturation)
// Utilise par le bouton "Generer une palette depuis ma couleur de marque".

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((hex || "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr: h = (gg - bb) / d + (gg < bb ? 6 : 0); break;
      case gg: h = (bb - rr) / d + 2; break;
      default: h = (rr - gg) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

const FALLBACK = { r: 93, g: 108, b: 219 }; // #5D6CDB (primaire par defaut)

export function generateBrandPalette(baseHex: string): string[] {
  const rgb = hexToRgb(baseHex) ?? FALLBACK;
  const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const base = rgbToHex(rgb.r, rgb.g, rgb.b);
  const light = hslToHex(h, clamp(s * 0.55, 0, 0.5), 0.93);
  const dark = hslToHex(h, clamp(s + 0.1, 0, 1), 0.22);
  const accent = hslToHex(h + 150, clamp(Math.max(s, 0.55), 0, 1), 0.5);
  const neutral = hslToHex(h, 0.12, 0.62);
  const out = [base, light, dark, accent, neutral].map((c) => c.toLowerCase());
  // Dedup en preservant l'ordre (2 derivees peuvent coincider sur un gris).
  return Array.from(new Set(out)).slice(0, 5);
}
