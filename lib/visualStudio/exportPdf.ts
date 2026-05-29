// Export PDF d'un carrousel (posts "document" LinkedIn).
//
// LinkedIn accepte les carrousels sous forme de PDF multi-pages : 1 slide =
// 1 page, au ratio exact du visuel. On construit le PDF côté client à partir
// des PNG déjà rendus par le canvas (mêmes pixels que le téléchargement PNG),
// donc zéro divergence de rendu. jspdf est importé dynamiquement pour ne pas
// alourdir le bundle du studio.

import type { StudioResult } from "./types";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Assemble les slides (dans l'ordre) en un seul PDF, 1 slide par page, à la
 * dimension pixel exacte du visuel. Renvoie un Blob PDF.
 */
export async function carouselToPdf(results: StudioResult[]): Promise<Blob> {
  if (!results.length) throw new Error("Aucune slide à exporter");
  const { jsPDF } = await import("jspdf");

  const first = results[0];
  const orientation = first.width >= first.height ? "landscape" : "portrait";
  // Unité = pixels → la page colle au PNG (pas de mise à l'échelle/marge).
  const pdf = new jsPDF({ unit: "px", format: [first.width, first.height], orientation });

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (i > 0) {
      const o = r.width >= r.height ? "landscape" : "portrait";
      pdf.addPage([r.width, r.height], o);
    }
    const dataUrl = await blobToDataUrl(r.blob);
    pdf.addImage(dataUrl, "PNG", 0, 0, r.width, r.height, undefined, "FAST");
  }

  return pdf.output("blob");
}
