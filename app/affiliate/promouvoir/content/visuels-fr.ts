// app/affiliate/promouvoir/content/visuels-fr.ts
//
// Métadonnées des 18 visuels promo Tiquiz (8 singles + 10 slides
// carrousel). Servis depuis public/affiliate-assets/visuels/.
// Format : PNG 1080×1350.

export type VisualAsset = {
  id: string;
  title: string;
  path: string;
  format: string;
  usage: string;
};

export const VISUELS_FR: { singles: VisualAsset[]; carrousel: VisualAsset[] } = {
  singles: [
    {
      id: "single-01",
      title: "Annonce de lancement",
      path: "/affiliate-assets/visuels/singles/single-01-annonce.png",
      format: "PNG 1080×1350",
      usage: "Post J1 — Annonce Tiquiz live",
    },
    {
      id: "single-02",
      title: "Ce que ton Typeform ne fera jamais",
      path: "/affiliate-assets/visuels/singles/single-02-benefices.png",
      format: "PNG 1080×1350",
      usage: "Post J2 — Cascade de bénéfices",
    },
    {
      id: "single-03",
      title: "Cas Linda — 0,6 % → 4,2 %",
      path: "/affiliate-assets/visuels/singles/single-03-linda.png",
      format: "PNG 1080×1350",
      usage: "Post J3 — Cas persona miroir",
    },
    {
      id: "single-04",
      title: "Démo : crée un quiz en 4 minutes",
      path: "/affiliate-assets/visuels/singles/single-04-demo.png",
      format: "PNG 1080×1350",
      usage: "Post J4 — Démo (single alternatif au carrousel)",
    },
    {
      id: "single-05",
      title: "FAQ : les 4 trucs qu'on me redemande",
      path: "/affiliate-assets/visuels/singles/single-05-faq.png",
      format: "PNG 1080×1350",
      usage: "Post J5 — FAQ / objections",
    },
    {
      id: "single-06",
      title: "Prix : 450 € vs 4 200 € sur 5 ans",
      path: "/affiliate-assets/visuels/singles/single-06-prix.png",
      format: "PNG 1080×1350",
      usage: "Post J6 — Comparaison tarifs",
    },
    {
      id: "single-07",
      title: "J-1",
      path: "/affiliate-assets/visuels/singles/single-07-jmoins1.png",
      format: "PNG 1080×1350",
      usage: "Post J7 — Urgence",
    },
    {
      id: "single-08",
      title: "À minuit, c'est terminé",
      path: "/affiliate-assets/visuels/singles/single-08-dernier-jour.png",
      format: "PNG 1080×1350",
      usage: "Post J8 — Dernier jour de focus",
    },
  ],
  carrousel: [
    {
      id: "slide-01",
      title: "Cover — Segmente ta liste en 4 minutes",
      path: "/affiliate-assets/visuels/carrousel/slide-01-cover.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 1/10",
    },
    {
      id: "slide-02",
      title: "Le problème",
      path: "/affiliate-assets/visuels/carrousel/slide-02-probleme.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 2/10",
    },
    {
      id: "slide-03",
      title: "La cause",
      path: "/affiliate-assets/visuels/carrousel/slide-03-cause.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 3/10",
    },
    {
      id: "slide-04",
      title: "La solution",
      path: "/affiliate-assets/visuels/carrousel/slide-04-solution.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 4/10",
    },
    {
      id: "slide-05",
      title: "Étape 1",
      path: "/affiliate-assets/visuels/carrousel/slide-05-etape1.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 5/10",
    },
    {
      id: "slide-06",
      title: "Étape 2",
      path: "/affiliate-assets/visuels/carrousel/slide-06-etape2.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 6/10",
    },
    {
      id: "slide-07",
      title: "Étape 3",
      path: "/affiliate-assets/visuels/carrousel/slide-07-etape3.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 7/10",
    },
    {
      id: "slide-08",
      title: "Étape 4",
      path: "/affiliate-assets/visuels/carrousel/slide-08-etape4.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 8/10",
    },
    {
      id: "slide-09",
      title: "Résultat",
      path: "/affiliate-assets/visuels/carrousel/slide-09-resultat.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 9/10",
    },
    {
      id: "slide-10",
      title: "CTA final",
      path: "/affiliate-assets/visuels/carrousel/slide-10-cta.png",
      format: "PNG 1080×1350",
      usage: "Carrousel J4 — Slide 10/10",
    },
  ],
};
