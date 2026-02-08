// data/systemeTemplates.ts
// Source de vérité utilisée par "@/data/systemeTemplates"
// ⚠️ On garde les champs historiques (shareLink, imageUrl, etc.) et on ajoute layoutPath
// de façon rétro-compatible + sécurisée (optionnel), pour servir le VRAI layout.html via /api/templates/file/...

export type SystemeTemplate = {
  id: string; // ex: "capture-01" | "sale-01"
  name: string;
  type: "capture" | "sales";
  category: string[];
  description: string;
  imageUrl: string; // placeholder image in Tipote
  shareLink?: string | null; // optional link to Systeme.io

  /**
   * Chemin RELATIF depuis la racine du projet (process.cwd()).
   * Utilisé pour servir le VRAI layout.html via /api/templates/file/...
   * Optionnel pour rester compatible si un template n'a pas encore été migré.
   */
  layoutPath?: string;
};

export const captureTemplates: SystemeTemplate[] = [
  {
    id: "capture-01",
    name: "Capture Ads",
    type: "capture",
    category: ["Business", "Coaching"],
    description:
      "Parfait pour proposer un lead magnet, délivrer le lead magnet, puis segmenter ton audience avant de lui envoyer une offre adaptée.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/capture/capture-01/layout.html",
  },
  {
    id: "capture-02",
    name: "Capture 02 — Minimal",
    type: "capture",
    category: ["Business"],
    description: "Une page de capture simple, claire, rapide à personnaliser.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/capture/capture-02/layout.html",
  },
  {
    id: "capture-03",
    name: "Capture 03 — Feel Good",
    type: "capture",
    category: ["Coaching"],
    description: "Une capture chaleureuse avec focus sur la promesse et le CTA.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/capture/capture-03/layout.html",
  },
  {
    id: "capture-04",
    name: "Capture 04 — Simple Orange",
    type: "capture",
    category: ["Business"],
    description: "Une page punchy, idéale pub/lead magnet, conversion directe.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/capture/capture-04/layout.html",
  },
  {
    id: "capture-05",
    name: "Capture 05 — Up To Challenge",
    type: "capture",
    category: ["Coaching"],
    description: "Parfait pour challenges, inscriptions, mini-séries et freebies.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/capture/capture-05/layout.html",
  },
];

export const salesTemplates: SystemeTemplate[] = [
  {
    id: "sale-01",
    name: "Vente 01",
    type: "sales",
    category: ["Business", "Coaching"],
    description: "Page de vente structurée : promesse → preuve → offre → CTA.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-01/layout.html",
  },
  {
    id: "sale-02",
    name: "Vente 02",
    type: "sales",
    category: ["Business"],
    description: "Variante 02 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-02/layout.html",
  },
  {
    id: "sale-03",
    name: "Vente 03",
    type: "sales",
    category: ["Coaching"],
    description: "Variante 03 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-03/layout.html",
  },
  {
    id: "sale-04",
    name: "Vente 04",
    type: "sales",
    category: ["Business"],
    description: "Variante 04 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-04/layout.html",
  },
  {
    id: "sale-05",
    name: "Vente 05",
    type: "sales",
    category: ["Coaching"],
    description: "Variante 05 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-05/layout.html",
  },
  {
    id: "sale-06",
    name: "Vente 06",
    type: "sales",
    category: ["Business"],
    description: "Variante 06 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-06/layout.html",
  },
  {
    id: "sale-07",
    name: "Vente 07",
    type: "sales",
    category: ["Coaching"],
    description: "Variante 07 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-07/layout.html",
  },
  {
    id: "sale-08",
    name: "Vente 08",
    type: "sales",
    category: ["Business"],
    description: "Variante 08 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-08/layout.html",
  },
  {
    id: "sale-09",
    name: "Vente 09",
    type: "sales",
    category: ["Coaching"],
    description: "Variante 09 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-09/layout.html",
  },
  {
    id: "sale-10",
    name: "Vente 10",
    type: "sales",
    category: ["Business"],
    description: "Variante 10 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-10/layout.html",
  },
  {
    id: "sale-11",
    name: "Vente 11",
    type: "sales",
    category: ["Coaching"],
    description: "Variante 11 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-11/layout.html",
  },
  {
    id: "sale-12",
    name: "Vente 12",
    type: "sales",
    category: ["Business"],
    description: "Variante 12 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-12/layout.html",
  },
  {
    id: "sale-13",
    name: "Vente 13",
    type: "sales",
    category: ["Divers"],
    description: "Variante 13 pour page de vente.",
    imageUrl: "/window.svg",
    shareLink: null,
    layoutPath: "src/templates/vente/sale-13/layout.html",
  },
];
