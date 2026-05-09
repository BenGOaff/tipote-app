// lib/compta/ch_cantons.ts
//
// Configuration cantonale suisse pour le calendrier fiscal Tipote.
// Chacun des 26 cantons a ses propres dates butoir de déclaration
// d'impôt et son propre portail de soumission. On couvre :
//   • La date butoir "personne physique" (indépendants + particuliers)
//   • La date butoir "personne morale" (Sàrl/SA)
//   • L'URL du portail fiscal cantonal
//   • Le label du canton (FR/IT/DE selon zone linguistique)
//
// Les taux d'imposition (IBO cantonal/communal, IFD fédéral, IRPP
// cantonal) ne sont PAS modélisés ici — ils servent au calcul du
// montant à payer, pas aux dates butoir. L'user (ou son comptable)
// les connaît pour son canton.
//
// Sources : ch.ch, sites cantonaux officiels, FTA-AFC. Ces dates sont
// celles du droit ordinaire — chaque user peut demander une prolongation
// à son service des contributions cantonal (souvent gratuite jusqu'à
// septembre, payante ensuite). Le calendrier affiche les dates initiales
// et la description rappelle la possibilité de prolongation.

export interface ChCantonConfig {
  /** ISO 3166-2 CH-XX */
  code: string;
  /** Label long en français (langue par défaut Tipote). */
  label: string;
  /** Date butoir de la déclaration d'impôt PERSONNE PHYSIQUE
   *  (indépendants + particuliers). Format : { month, day }. */
  declarationDuePP: { month: number; day: number };
  /** Date butoir de la déclaration d'impôt PERSONNE MORALE
   *  (Sàrl/SA). Format : { month, day }. */
  declarationDuePM: { month: number; day: number };
  /** URL du portail fiscal cantonal — où l'user va déposer sa
   *  déclaration. */
  portalUrl: string;
}

export const CH_CANTON_CONFIGS: Record<string, ChCantonConfig> = {
  GE: {
    code: "GE",
    label: "Genève",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 3, day: 31 },
    portalUrl: "https://www.ge.ch/impots",
  },
  VD: {
    code: "VD",
    label: "Vaud",
    declarationDuePP: { month: 3, day: 15 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.vd.ch/themes/etat-droit-finances/impots",
  },
  VS: {
    code: "VS",
    label: "Valais",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.vs.ch/web/scc",
  },
  FR: {
    code: "FR",
    label: "Fribourg",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.fr.ch/scc",
  },
  NE: {
    code: "NE",
    label: "Neuchâtel",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.ne.ch/autorites/DFS/SCCO",
  },
  JU: {
    code: "JU",
    label: "Jura",
    declarationDuePP: { month: 4, day: 30 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.jura.ch/DFI/CTR.html",
  },
  BE: {
    code: "BE",
    label: "Berne",
    declarationDuePP: { month: 3, day: 15 },
    declarationDuePM: { month: 7, day: 31 },
    portalUrl: "https://www.taxme.ch/",
  },
  ZH: {
    code: "ZH",
    label: "Zurich",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 9, day: 30 },
    portalUrl: "https://www.zh.ch/de/steuern-finanzen.html",
  },
  BS: {
    code: "BS",
    label: "Bâle-Ville",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.steuerverwaltung.bs.ch/",
  },
  BL: {
    code: "BL",
    label: "Bâle-Campagne",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.baselland.ch/politik-und-behorden/direktionen/finanz-und-kirchendirektion/steuerverwaltung",
  },
  SO: {
    code: "SO",
    label: "Soleure",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://so.ch/verwaltung/finanzdepartement/steueramt/",
  },
  AG: {
    code: "AG",
    label: "Argovie",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 9, day: 30 },
    portalUrl: "https://www.ag.ch/de/dfr/steuern/steuern.jsp",
  },
  LU: {
    code: "LU",
    label: "Lucerne",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 9, day: 30 },
    portalUrl: "https://steuern.lu.ch/",
  },
  ZG: {
    code: "ZG",
    label: "Zoug",
    declarationDuePP: { month: 4, day: 30 },
    declarationDuePM: { month: 9, day: 30 },
    portalUrl: "https://www.zg.ch/behoerden/finanzdirektion/steuerverwaltung",
  },
  SZ: {
    code: "SZ",
    label: "Schwytz",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.sz.ch/behoerden/staatsverwaltung/finanzdepartement/steuerverwaltung.html/",
  },
  UR: {
    code: "UR",
    label: "Uri",
    declarationDuePP: { month: 4, day: 30 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.ur.ch/themen/2459",
  },
  OW: {
    code: "OW",
    label: "Obwald",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.ow.ch/de/verwaltung/dienstleistungen/?dienst_id=2693",
  },
  NW: {
    code: "NW",
    label: "Nidwald",
    declarationDuePP: { month: 4, day: 30 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.nw.ch/steuerverwaltung",
  },
  GL: {
    code: "GL",
    label: "Glaris",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.gl.ch/verwaltung/finanzen-und-gesundheit/steuern.html/426",
  },
  SH: {
    code: "SH",
    label: "Schaffhouse",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://sh.ch/CMS/Webseite/Kanton-Schaffhausen/Beh-rde/Verwaltung/Finanzdepartement/Kantonale-Steuerverwaltung-2096-DE.html",
  },
  AR: {
    code: "AR",
    label: "Appenzell Rh.-Ext.",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.ar.ch/verwaltung/departement-finanzen/steuerverwaltung/",
  },
  AI: {
    code: "AI",
    label: "Appenzell Rh.-Int.",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.ai.ch/themen/finanzen-und-steuern/steuerverwaltung",
  },
  SG: {
    code: "SG",
    label: "Saint-Gall",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 9, day: 30 },
    portalUrl: "https://www.sg.ch/steuern-finanzen.html",
  },
  GR: {
    code: "GR",
    label: "Grisons",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.gr.ch/DE/institutionen/verwaltung/dfg/stv/Seiten/Steuerverwaltung.aspx",
  },
  TG: {
    code: "TG",
    label: "Thurgovie",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 9, day: 30 },
    portalUrl: "https://steuerverwaltung.tg.ch/",
  },
  TI: {
    code: "TI",
    label: "Tessin",
    declarationDuePP: { month: 4, day: 30 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www4.ti.ch/dfe/dc/cosa-facciamo/persone-fisiche/",
  },
};

/** Récupère la config d'un canton à partir de son code, avec
 *  fallback "fédéral générique" si l'user n'a pas renseigné son
 *  canton. Le fallback affiche 31 mars (date la plus courante)
 *  + URL ch.ch comme portail générique. */
export function getCantonConfig(code: string | null): ChCantonConfig {
  if (code && CH_CANTON_CONFIGS[code]) return CH_CANTON_CONFIGS[code];
  return {
    code: "—",
    label: "(canton non précisé)",
    declarationDuePP: { month: 3, day: 31 },
    declarationDuePM: { month: 6, day: 30 },
    portalUrl: "https://www.ch.ch/fr/impots/declarer-ses-impots/",
  };
}

/** Liste des cantons triée FR puis DE pour le sélecteur. Les
 *  cantons romands d'abord (cible Tipote francophone), puis les
 *  alémaniques par ordre alpha, puis le Tessin (italophone). */
export const CH_CANTONS_ORDERED: ReadonlyArray<ChCantonConfig> = [
  CH_CANTON_CONFIGS.GE,
  CH_CANTON_CONFIGS.VD,
  CH_CANTON_CONFIGS.VS,
  CH_CANTON_CONFIGS.FR,
  CH_CANTON_CONFIGS.NE,
  CH_CANTON_CONFIGS.JU,
  CH_CANTON_CONFIGS.BE,
  CH_CANTON_CONFIGS.ZH,
  CH_CANTON_CONFIGS.BS,
  CH_CANTON_CONFIGS.BL,
  CH_CANTON_CONFIGS.SO,
  CH_CANTON_CONFIGS.AG,
  CH_CANTON_CONFIGS.LU,
  CH_CANTON_CONFIGS.ZG,
  CH_CANTON_CONFIGS.SZ,
  CH_CANTON_CONFIGS.UR,
  CH_CANTON_CONFIGS.OW,
  CH_CANTON_CONFIGS.NW,
  CH_CANTON_CONFIGS.GL,
  CH_CANTON_CONFIGS.SH,
  CH_CANTON_CONFIGS.AR,
  CH_CANTON_CONFIGS.AI,
  CH_CANTON_CONFIGS.SG,
  CH_CANTON_CONFIGS.GR,
  CH_CANTON_CONFIGS.TG,
  CH_CANTON_CONFIGS.TI,
];
