// components/settings/legal/types.ts
// Types for the legal document generator

export type Country = "france" | "belgique" | "luxembourg" | "suisse" | "canada";

export type DocType = "mentions" | "cgv" | "privacy";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  mentions: "Mentions légales",
  cgv: "Conditions Générales de Vente",
  privacy: "Politique de confidentialité",
};

export const COUNTRY_LABELS: Record<Country, string> = {
  france: "France",
  belgique: "Belgique",
  luxembourg: "Luxembourg",
  suisse: "Suisse",
  canada: "Canada",
};

/* ------------------------------------------------------------------ */
/*  Form data — shared fields + country-specific                       */
/* ------------------------------------------------------------------ */

export type LegalFormData = {
  // ---- Country ----
  country: Country;

  // ---- 1.1 Identity ----
  structureType: string;      // Auto-entrepreneur, SAS, SARL, Sàrl, SA, SRL, etc.
  raisonSociale: string;
  nomCommercial: string;
  responsableName: string;    // Nom + Prénom du responsable légal
  responsableFunction: string;
  adresse: string;
  email: string;
  telephone: string;
  siteUrl: string;

  // ---- France-specific ----
  siren: string;
  rcsVille: string;
  rcsNumero: string;
  tvaIntra: string;
  capitalSocial: string;

  // ---- Belgique-specific ----
  bceName: string;            // N° BCE
  tvaBelgique: string;

  // ---- Luxembourg-specific ----
  rcslNumero: string;
  tvaLux: string;
  autorisationEtablissement: string;

  // ---- Suisse-specific ----
  ideNumero: string;
  tvaSuisse: string;

  // ---- Canada-specific ----
  province: string;
  bnNumero: string;
  neqNumero: string;
  responsableViePrivee: string;

  // ---- Hosting ----
  hebergeurNom: string;
  hebergeurAdresse: string;
  hebergeurTelephone: string;
  hebergeurUrl: string;

  // ---- 1.2 Activity ----
  activiteType: string;       // coach, formation, e-commerce, SaaS, etc.
  produitsDescription: string;
  publicVise: string;         // B2C / B2B / mix
  zoneGeo: string;

  // ---- 1.3 Payment ----
  modaliteCommande: string;
  moyensPaiement: string;
  devise: string;
  prestatairePaiement: string;

  // ---- Livraison (products physiques) ----
  produitsPhysiques: boolean;
  zonesLivrees: string;
  delaisLivraison: string;
  fraisLivraison: string;

  // ---- Rétractation ----
  retractationExclusions: string;
  politiqueRemboursement: string;

  // ---- 1.4 Data & Cookies ----
  donneesCollectees: string;
  outilsUtilises: string;    // GA, Pixel, Mailchimp, etc.
  finalitesTraitement: string;
  dureesConservation: string;
  emailRgpd: string;
  transfertsHorsUE: string;
};

export const DEFAULT_FORM_DATA: LegalFormData = {
  country: "france",
  structureType: "",
  raisonSociale: "",
  nomCommercial: "",
  responsableName: "",
  responsableFunction: "",
  adresse: "",
  email: "",
  telephone: "",
  siteUrl: "",
  siren: "",
  rcsVille: "",
  rcsNumero: "",
  tvaIntra: "",
  capitalSocial: "",
  bceName: "",
  tvaBelgique: "",
  rcslNumero: "",
  tvaLux: "",
  autorisationEtablissement: "",
  ideNumero: "",
  tvaSuisse: "",
  province: "",
  bnNumero: "",
  neqNumero: "",
  responsableViePrivee: "",
  hebergeurNom: "",
  hebergeurAdresse: "",
  hebergeurTelephone: "",
  hebergeurUrl: "",
  activiteType: "",
  produitsDescription: "",
  publicVise: "",
  zoneGeo: "",
  modaliteCommande: "",
  moyensPaiement: "",
  devise: "EUR",
  prestatairePaiement: "",
  produitsPhysiques: false,
  zonesLivrees: "",
  delaisLivraison: "",
  fraisLivraison: "",
  retractationExclusions: "",
  politiqueRemboursement: "",
  donneesCollectees: "",
  outilsUtilises: "",
  finalitesTraitement: "",
  dureesConservation: "",
  emailRgpd: "",
  transfertsHorsUE: "",
};
