// Analyse d'image (client, gratuit) pour placer + colorer le texte du studio
// SANS deviner : on regarde l'image générée et on décide.
//
// Principe : on échantillonne l'image en petit (rapide), on compare la BANDE
// HAUTE et la BANDE BASSE → on met le bloc texte dans la plus "propre" (faible
// variance = peu de détail/sujet), et on choisit la couleur du texte selon la
// luminosité de cette bande (clair → texte foncé, foncé → texte clair) + le
// type de voile pour garantir le contraste.

export type TextPlacement = {
  anchor: "top" | "center" | "bottom";
  /** Couleur du corps de texte (titre/sous-titre), adaptée au fond. */
  textColor: string;
  /** Voile de contraste à appliquer sur la bande choisie. */
  scrim: "none" | "dark" | "light";
  /** Côté NETTEMENT plus clair de la bande texte → on y renforce le voile
   *  (voile horizontal adaptatif) pour un contraste homogène sur tout le
   *  texte, sans devoir bicolorer le texte. "none" = fond équilibré. */
  brighterSide: "left" | "right" | "none";
};

const FALLBACK: TextPlacement = { anchor: "bottom", textColor: "#ffffff", scrim: "dark", brighterSide: "none" };

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

        // Stats de luminance (0-255) sur une bande de lignes [y0, y1), avec
        // moyennes gauche/droite pour détecter un déséquilibre horizontal.
        const band = (y0: number, y1: number) => {
          let sum = 0;
          let sumSq = 0;
          let n = 0;
          let lSum = 0;
          let lN = 0;
          let rSum = 0;
          let rN = 0;
          for (let y = Math.floor(y0); y < Math.floor(y1); y++) {
            for (let x = 0; x < W; x++) {
              const i = (y * W + x) * 4;
              const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
              sum += lum;
              sumSq += lum * lum;
              n++;
              if (x < W / 2) { lSum += lum; lN++; } else { rSum += lum; rN++; }
            }
          }
          const mean = n ? sum / n : 128;
          const variance = n ? Math.max(0, sumSq / n - mean * mean) : 0;
          return { mean, variance, leftMean: lN ? lSum / lN : mean, rightMean: rN ? rSum / rN : mean };
        };

        const top = band(0, H * 0.42);
        const bottom = band(H * 0.58, H);
        const mid = band(H * 0.30, H * 0.70);
        const cleanerAnchor: "top" | "bottom" = top.variance <= bottom.variance ? "top" : "bottom";
        // Sujet marqué d'un côté (photo de personne, horizon…) → une bande est
        // bien plus "chargée" que l'autre : on place le texte dans la bande
        // PROPRE. Fond UNIFORME (spatial, abstrait, dégradé) → pas de sujet à
        // éviter : on CENTRE verticalement, sinon le texte se tasse en haut et
        // le bas reste vide (déséquilibre du spatial signalé par Béné).
        const vDiff = Math.abs(top.variance - bottom.variance);
        const vMax = Math.max(top.variance, bottom.variance, 1);
        const anchor: "top" | "center" | "bottom" = vDiff / vMax > 0.4 ? cleanerAnchor : "center";
        // Bande réellement occupée par le texte → sert au choix couleur/voile.
        const region = anchor === "center" ? mid : anchor === "top" ? top : bottom;
        const std = Math.sqrt(region.variance);

        // Texte FONCÉ uniquement si le fond est VRAIMENT clair ET uniforme
        // (vrai fond minimal blanc/pastel). Sinon — fond sombre OU ambigu /
        // dégradé (une moitié sombre, une moitié claire) — on prend texte
        // BLANC + voile sombre : combo lisible quasi partout.
        const trulyLight = region.mean > 175 && std < 55;

        // Déséquilibre gauche/droite marqué → voile horizontal du côté clair.
        let brighterSide: "left" | "right" | "none" = "none";
        if (!trulyLight && Math.abs(region.rightMean - region.leftMean) >= 38) {
          brighterSide = region.rightMean > region.leftMean ? "right" : "left";
        }

        resolve(
          trulyLight
            ? { anchor, textColor: "#0f172a", scrim: "light", brighterSide: "none" }
            : { anchor, textColor: "#ffffff", scrim: "dark", brighterSide },
        );
      } catch {
        resolve(FALLBACK);
      }
    };
    img.onerror = () => resolve(FALLBACK);
    img.src = dataUrl;
  });
}
