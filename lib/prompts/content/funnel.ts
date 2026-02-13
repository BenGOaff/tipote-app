// lib/prompts/content/funnel.ts
// Funnel prompts: capture / sales pages
// - Legacy output: plain text
// - Premium output: JSON contentData that must fit a template schema (slot lock)
//
// NOTE: The global context (persona, business profile, plan, Tipote Knowledge snippets)
// is injected in /app/api/content/generate/route.ts

export type FunnelPage = "capture" | "sales";
export type FunnelMode = "from_offer" | "from_existing" | "from_scratch";

export type FunnelOfferContext = {
  id: string;
  name: string | null;
  level: string | null;
  description: string | null;
  promise: string | null;
  price_min: any;
  price_max: any;
  main_outcome: string | null;
  format: string | null;
  delivery: string | null;
  is_flagship?: boolean | null;
  updated_at?: string | null;
};

export type FunnelManual = {
  name?: string | null;
  promise?: string | null;
  target?: string | null;
  price?: string | null;
  urgency?: string | null;
  guarantee?: string | null;
};

export type FunnelPromptParams = {
  page: FunnelPage;
  mode: FunnelMode;
  theme: string;

  offer: FunnelOfferContext | null;
  manual: FunnelManual | null;

  // Premium template mode
  outputFormat?: "text" | "contentData_json";
  templateKind?: "capture" | "vente";
  templateId?: string;
  templateSchemaPrompt?: string;

  language?: string;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function oneLine(s: string): string {
  return safeString(s).replace(/\s+/g, " ").trim();
}

function buildPremiumJsonPrompt(params: FunnelPromptParams): string {
  const lines: string[] = [];

  lines.push("OBJECTIF :");
  lines.push("- Tu es un copywriter direct-response senior.");
  lines.push("- Tu dois remplir un template de page (capture/vente) SANS AUCUNE dérive visuelle.");
  lines.push("- Tu dois produire UNIQUEMENT un objet JSON (pas de texte autour).");
  lines.push("- Le JSON doit correspondre strictement au schéma fourni (clés, types, nombres d'items, longueurs).");
  lines.push("- Le texte DOIT être adapté à l'offre et au thème, et être lisible, concret, très premium.");
  lines.push(
    '- Utilise activement les extraits "Tipote Knowledge" fournis dans le contexte (si présents) pour améliorer les titres, promesses, preuves et bénéfices.',
  );
  lines.push("");

  lines.push("RÈGLES CRITIQUES :");
  lines.push("- Ne mets PAS de markdown.");
  lines.push("- Pas d'emoji.");
  lines.push("- Pas de retours à la ligne dans les strings (une ligne par champ).");
  lines.push("- Ne mets pas de guillemets typographiques. Utilise \" si nécessaire.");
  lines.push("- Si une info est inconnue, reste générique et plausible, sans inventer un prix ou une garantie.");
  lines.push("- Chaque titre/promo doit être clair, spécifique et orienté résultat.");
  lines.push("");

  lines.push("CONTRAINTE DE SORTIE :");
  lines.push("- Sortie = 1 seul objet JSON valide.");
  lines.push("");

  if (params.page === "capture") {
    lines.push("TYPE DE PAGE : CAPTURE");
    lines.push("- Objectif: convertir en inscription/email.");
    lines.push("- Promesse claire + bénéfices + preuve + CTA simple.");
  } else {
    lines.push("TYPE DE PAGE : VENTE");
    lines.push("- Objectif: convertir en achat.");
    lines.push("- Promesse + mécanisme + preuve + objections + offre + urgence/garantie + CTA.");
  }
  lines.push("");

  if ((params.mode === "from_offer" || params.mode === "from_existing") && params.offer) {
    lines.push("OFFRE (source) :");
    lines.push(oneLine(JSON.stringify(params.offer)));
    lines.push("");
  }

  if (params.mode === "from_scratch" && params.manual) {
    lines.push("OFFRE (manual) :");
    lines.push(oneLine(JSON.stringify(params.manual)));
    lines.push("");
  }

  lines.push("SCHÉMA TEMPLATE À RESPECTER :");
  lines.push(params.templateSchemaPrompt || "");
  lines.push("");

  lines.push("IMPORTANT :");
  lines.push("- Respecte maxLength / minItems / maxItems / itemMaxLength.");
  lines.push("- Remplis tous les champs requis.");
  lines.push("- Si un champ est optionnel mais utile, remplis-le quand même.");
  lines.push("- Ne commente pas. Ne t'excuse pas. JSON uniquement.");

  return lines.join("\n");
}

function buildLegacyTextPrompt(params: FunnelPromptParams): string {
  const lines: string[] = [];

  const pageName = params.page === "capture" ? "Page de capture" : "Page de vente";

  lines.push(`${pageName} — Copywriting premium.`);
  lines.push("IMPORTANT: Retourne uniquement le contenu final, sans explication, sans markdown.");
  lines.push("");

  if ((params.mode === "from_offer" || params.mode === "from_existing") && params.offer) {
    lines.push("Offre (source):");
    lines.push(JSON.stringify(params.offer, null, 0));
    lines.push("");
  }

  if (params.mode === "from_scratch" && params.manual) {
    lines.push("Offre (manual):");
    lines.push(JSON.stringify(params.manual, null, 0));
    lines.push("");
  }

  lines.push("Contraintes:");
  lines.push("- Texte concret, orienté résultat.");
  lines.push("- Promesse claire, bénéfices, preuves, CTA.");
  if (params.page === "sales") {
    lines.push("- Traite objections + garantie + urgence si pertinent.");
  }
  lines.push("");
  lines.push("Thème / brief:");
  lines.push(params.theme || "Funnel");

  return lines.join("\n");
}

export function buildFunnelPrompt(params: FunnelPromptParams): string {
  const outputFormat = params.outputFormat || "text";

  if (outputFormat === "contentData_json" && params.templateSchemaPrompt) {
    return buildPremiumJsonPrompt(params);
  }

  return buildLegacyTextPrompt(params);
}