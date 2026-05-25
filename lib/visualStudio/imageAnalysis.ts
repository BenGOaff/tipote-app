// Analyse d'image (client, gratuit) pour placer + colorer le texte du studio
// SANS deviner : on regarde l'image générée et on décide.
//
// Principe : on échantillonne l'image en petit (rapide), on compare la BANDE
// HAUTE et la BANDE BASSE → on met le bloc texte dans la plus "propre" (faible
// variance = peu de détail/sujet), et on choisit la couleur du texte selon la
// luminosité de cette bande (clair → texte foncé, foncé → texte clair) + le
// type de voile pour garantir le contraste.

export type TextPlacement = {
  anchor: "top" | "bottom";
  /** Couleur du corps de texte (titre/sous-titre), adaptée au fond. */
  textColor: string;
  /** Voile de contraste à appliquer sur la bande choisie. */
  scrim: "none" | "dark" | "light";
};

const FALLBACK: TextPlacement = { anchor: "bottom", textColor: "#ffffff", scrim: "dark" };

export async function analyzeForText(dataUrl: string): Promise<TextPlacement> {
  if (typeof document === "undefined") return FALLBACK;
  return new Promise<TextPlacement>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = 80;
        const H = 80;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(FALLBACK);
        ctx.drawImage(img, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);

        // Stats de luminance (0-255) sur une bande de lignes [y0, y1).
        const band = (y0: number, y1: number) => {
          let sum = 0;
          let sumSq = 0;
          let n = 0;
          for (let y = Math.floor(y0); y < Math.floor(y1); y++) {
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
              sum += lum;
              sumSq += lum * lum;
              n++;
            }
          }
          const mean = n ? sum / n : 128;
          const variance = n ? Math.max(0, sumSq / n - mean * mean) : 0;
          return { mean, variance };
        };

        const top = band(0, H * 0.42);
        const bottom = band(H * 0.58, H);
        // Bande la plus "propre" (variance faible) → on y met le texte.
        const anchor: "top" | "bottom" = top.variance <= bottom.variance ? "top" : "bottom";
        const chosen = anchor === "top" ? top : bottom;
        const isDark = chosen.mean < 130;

        resolve({
          anchor,
          textColor: isDark ? "#ffffff" : "#0f172a",
          scrim: isDark ? "dark" : "light",
        });
      } catch {
        resolve(FALLBACK);
      }
    };
    img.onerror = () => resolve(FALLBACK);
    img.src = dataUrl;
  });
}
