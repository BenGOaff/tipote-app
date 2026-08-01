// lib/affiliate/contentSpace.ts
//
// Arborescence de l'espace Contenu de l'affilié. Le modèle mental est
// celui des projets Tiquiz (Mes projets -> quiz / sondages / popquiz) :
//
//   Contenu -> Promouvoir l'Atelier   -> emails · réseaux · articles · logos · générer
//           -> Promouvoir Tiquiz      -> emails · réseaux · articles · logos · générer
//
// Une seule source de vérité pour les slugs, les libellés et les liens
// trackés, partagée par les pages et le fil d'Ariane.

import { buildAffiliateLink } from "@/lib/affiliate/links";
import { getLinkPath } from "@/lib/affiliate/linkDestinations";

export const CONTENT_PRODUCTS = ["atelier", "tiquiz"] as const;
export type ContentProduct = (typeof CONTENT_PRODUCTS)[number];

export const CONTENT_SECTIONS = [
  "emails",
  "reseaux",
  "articles",
  "logos",
  "generer",
] as const;
export type ContentSection = (typeof CONTENT_SECTIONS)[number];

export function isContentProduct(v: string | undefined): v is ContentProduct {
  return !!v && (CONTENT_PRODUCTS as readonly string[]).includes(v);
}

/** Nom commercial du produit, jamais traduit (marques). */
export const PRODUCT_NAME: Record<ContentProduct, string> = {
  atelier: "L'Atelier du Quiz",
  tiquiz: "Tiquiz",
};

/** Taux de commission affiché sur les cartes de dossier. */
export const PRODUCT_RATE: Record<ContentProduct, string> = {
  atelier: "70%",
  tiquiz: "40%",
};

/** L'Atelier n'est vendu que sur le marché francophone. */
export const PRODUCT_FR_ONLY: Record<ContentProduct, boolean> = {
  atelier: true,
  tiquiz: false,
};

/** Lien tracké du produit, prêt à être injecté dans les contenus. */
export async function productAffiliateLink(
  product: ContentProduct,
  market: string,
  sa: string,
): Promise<string> {
  const path = await getLinkPath(
    product === "atelier" ? "atelier" : "tiquiz_main",
  );
  return buildAffiliateLink(market, path, sa);
}

export function contentHref(
  product: ContentProduct,
  section?: ContentSection,
): string {
  return section ? `/contenus/${product}/${section}` : `/contenus/${product}`;
}
