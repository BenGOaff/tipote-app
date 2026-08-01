// lib/affiliate/brandKits.ts
//
// Logos et visuels de marque mis à disposition des affiliés, servis depuis
// public/affiliate-assets/<produit>/brand/. Un affilié qui parle du produit
// a besoin du bon logo, pas d'une capture d'écran floue trouvée sur Google.

import type { ContentProduct } from "./contentSpace";

export type BrandAsset = {
  id: string;
  /** Clé i18n du libellé, résolue côté page. */
  labelKey:
    | "logo_full"
    | "logo_dark_bg"
    | "logo_icon"
    | "cover"
    | "mockup"
    | "mockup_white";
  file: string;
  format: "SVG" | "PNG";
  /** Fond conseillé pour l'aperçu (les logos clairs ont besoin de contraste). */
  preview: "light" | "dark";
};

export const BRAND_KITS: Record<ContentProduct, BrandAsset[]> = {
  atelier: [
    {
      id: "atelier-logo-svg",
      labelKey: "logo_full",
      file: "/affiliate-assets/atelier/brand/logo-atelier-du-quiz.svg",
      format: "SVG",
      preview: "light",
    },
    {
      id: "atelier-logo-png",
      labelKey: "logo_full",
      file: "/affiliate-assets/atelier/brand/logo-atelier-du-quiz.png",
      format: "PNG",
      preview: "light",
    },
    {
      id: "atelier-logo-dark",
      labelKey: "logo_dark_bg",
      file: "/affiliate-assets/atelier/brand/logo-atelier-du-quiz-fond-fonce.svg",
      format: "SVG",
      preview: "dark",
    },
    {
      id: "atelier-icon-svg",
      labelKey: "logo_icon",
      file: "/affiliate-assets/atelier/brand/logo-icone.svg",
      format: "SVG",
      preview: "light",
    },
    {
      id: "atelier-icon-png",
      labelKey: "logo_icon",
      file: "/affiliate-assets/atelier/brand/logo-icone.png",
      format: "PNG",
      preview: "light",
    },
    {
      id: "atelier-cover",
      labelKey: "cover",
      file: "/affiliate-assets/atelier/brand/jaquette-atelier-du-quiz.png",
      format: "PNG",
      preview: "light",
    },
    {
      id: "atelier-mockup",
      labelKey: "mockup",
      file: "/affiliate-assets/atelier/brand/mockup-atelier-du-quiz.png",
      format: "PNG",
      preview: "light",
    },
    {
      id: "atelier-mockup-white",
      labelKey: "mockup_white",
      file: "/affiliate-assets/atelier/brand/mockup-atelier-du-quiz-fond-blanc.png",
      format: "PNG",
      preview: "light",
    },
  ],
  tiquiz: [
    {
      id: "tiquiz-logo",
      labelKey: "logo_full",
      file: "/affiliate-assets/tiquiz/brand/tiquiz-logo.png",
      format: "PNG",
      preview: "light",
    },
    {
      id: "tiquiz-icon",
      labelKey: "logo_icon",
      file: "/affiliate-assets/tiquiz/brand/tiquiz-icone.png",
      format: "PNG",
      preview: "light",
    },
  ],
};
