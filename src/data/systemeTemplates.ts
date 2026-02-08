// src/data/systemeTemplates.ts

export type SystemeTemplate = {
  id: string;
  name: string;
  description: string;
  type: "capture" | "sales";
  category: string[];
  imageUrl?: string;

  /**
   * Chemin RELATIF depuis la racine du projet (process.cwd()).
   * Utilisé pour servir le VRAI layout.html via /api/templates/file/...
   */
  layoutPath: string;
};

export const captureTemplates: SystemeTemplate[] = [
  {
    id: "capture-01",
    name: "Capture Ads",
    description:
      "Parfait pour proposer un lead magnet, délivrer le lead magnet, puis segmenter ton audience avant de lui envoyer une offre adaptée.",
    type: "capture",
    category: ["Business", "Coaching"],
    imageUrl: "/templates/capture-ads.png",
    layoutPath: "src/templates/capture/capture-01/layout.html",
  },
  {
    id: "capture-02",
    name: "Capture 02 — Minimal",
    description: "Une page de capture simple, claire, rapide à personnaliser.",
    type: "capture",
    category: ["Business"],
    imageUrl: "/templates/capture-minimal.png",
    layoutPath: "src/templates/capture/capture-02/layout.html",
  },
  {
    id: "capture-03",
    name: "Capture 03 — Feel Good",
    description: "Une capture chaleureuse avec focus sur la promesse et le CTA.",
    type: "capture",
    category: ["Coaching"],
    imageUrl: "/templates/capture-feelgood.png",
    layoutPath: "src/templates/capture/capture-03/layout.html",
  },
  {
    id: "capture-04",
    name: "Capture 04",
    description: "Variante 04 pour page de capture.",
    type: "capture",
    category: ["Business", "Coaching"],
    imageUrl: "/templates/capture-4.png",
    layoutPath: "src/templates/capture/capture-04/layout.html",
  },
  {
    id: "capture-05",
    name: "Capture 05",
    description: "Variante 05 pour page de capture.",
    type: "capture",
    category: ["Business"],
    imageUrl: "/templates/capture-5.png",
    layoutPath: "src/templates/capture/capture-05/layout.html",
  },
];

export const salesTemplates: SystemeTemplate[] = [
  {
    id: "sale-01",
    name: "Vente 01",
    description: "Page de vente structurée : promesse → preuve → offre → CTA.",
    type: "sales",
    category: ["Business", "Coaching"],
    imageUrl: "/templates/vente-1.png",
    layoutPath: "src/templates/vente/sale-01/layout.html",
  },
  {
    id: "sale-02",
    name: "Vente 02",
    description: "Variante 02 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-2.png",
    layoutPath: "src/templates/vente/sale-02/layout.html",
  },
  {
    id: "sale-03",
    name: "Vente 03",
    description: "Variante 03 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-3.png",
    layoutPath: "src/templates/vente/sale-03/layout.html",
  },
  {
    id: "sale-04",
    name: "Vente 04",
    description: "Variante 04 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-4.png",
    layoutPath: "src/templates/vente/sale-04/layout.html",
  },
  {
    id: "sale-05",
    name: "Vente 05",
    description: "Variante 05 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-5.png",
    layoutPath: "src/templates/vente/sale-05/layout.html",
  },
  {
    id: "sale-06",
    name: "Vente 06",
    description: "Variante 06 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-6.png",
    layoutPath: "src/templates/vente/sale-06/layout.html",
  },
  {
    id: "sale-07",
    name: "Vente 07",
    description: "Variante 07 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-7.png",
    layoutPath: "src/templates/vente/sale-07/layout.html",
  },
  {
    id: "sale-08",
    name: "Vente 08",
    description: "Variante 08 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-8.png",
    layoutPath: "src/templates/vente/sale-08/layout.html",
  },
  {
    id: "sale-09",
    name: "Vente 09",
    description: "Variante 09 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-9.png",
    layoutPath: "src/templates/vente/sale-09/layout.html",
  },
  {
    id: "sale-10",
    name: "Vente 10",
    description: "Variante 10 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-10.png",
    layoutPath: "src/templates/vente/sale-10/layout.html",
  },
  {
    id: "sale-11",
    name: "Vente 11",
    description: "Variante 11 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-11.png",
    layoutPath: "src/templates/vente/sale-11/layout.html",
  },
  {
    id: "sale-12",
    name: "Vente 12",
    description: "Variante 12 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-12.png",
    layoutPath: "src/templates/vente/sale-12/layout.html",
  },
  {
    id: "sale-13",
    name: "Vente 13",
    description: "Variante 13 pour page de vente.",
    type: "sales",
    category: ["Business"],
    imageUrl: "/templates/vente-13.png",
    layoutPath: "src/templates/vente/sale-13/layout.html",
  },
];
