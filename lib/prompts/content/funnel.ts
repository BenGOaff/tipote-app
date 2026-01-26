// lib/prompts/content/funnel.ts
// Prompt builder funnels (page de capture / page de vente)
// Objectif: produire une page très conversion, directement copiable dans Systeme.io / Webflow / etc.
// ⚠️ Output attendu côté API: texte brut (pas de markdown)

import type { OfferPyramidContext } from "@/lib/prompts/content/offer";

export type FunnelPage = "capture" | "sales";
export type FunnelMode = "from_pyramid" | "from_scratch";

export type FunnelManualInput = {
  name: string | null;
  promise: string | null;
  target: string | null;
  price: string | null;
  urgency: string | null;
  guarantee: string | null;
};

export function buildFunnelPrompt(args: {
  page: FunnelPage;
  mode: FunnelMode;
  theme: string;
  offer: OfferPyramidContext | null;
  manual: FunnelManualInput | null;
  language?: "fr";
}) {
  const page = args.page;
  const mode = args.mode;
  const theme = (args.theme || "").trim() || (page === "sales" ? "Page de vente" : "Page de capture");

  const offer = args.offer as any;
  const manual = args.manual as any;

  const offerBlock =
    mode === "from_pyramid" && offer
      ? [
          "DONNÉES OFFRE (Pyramide Tipote) :",
          `Nom: ${offer?.name ?? ""}`.trim(),
          offer?.promise ? `Promesse: ${offer.promise}` : "",
          offer?.description ? `Description: ${offer.description}` : "",
          offer?.main_outcome ? `Résultat principal: ${offer.main_outcome}` : "",
          offer?.format ? `Format: ${offer.format}` : "",
          offer?.delivery ? `Delivery: ${offer.delivery}` : "",
          offer?.price_min || offer?.price_max
            ? `Prix: ${offer.price_min ?? ""}${offer.price_max ? ` - ${offer.price_max}` : ""}`
            : "",
          offer?.level ? `Niveau: ${offer.level}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          "DONNÉES OFFRE (Saisie manuelle) :",
          manual?.name ? `Nom: ${manual.name}` : "",
          manual?.promise ? `Promesse: ${manual.promise}` : "",
          manual?.target ? `Public cible: ${manual.target}` : "",
          manual?.price ? `Prix: ${manual.price}` : "",
          manual?.urgency ? `Urgence: ${manual.urgency}` : "",
          manual?.guarantee ? `Garantie: ${manual.guarantee}` : "",
        ]
          .filter(Boolean)
          .join("\n");

  const commonRules = [
    "RÈGLES DE SORTIE :",
    "- Retourne UNIQUEMENT le contenu final (texte prêt à copier).",
    "- Pas d'explication, pas de commentaires, pas de markdown.",
    "- Style: français naturel, orienté conversion, très concret.",
    "- Évite le blabla: chaque section doit apporter de la valeur.",
    "- Utilise des titres courts et puissants.",
    "- Écris en 'tu' par défaut, sauf si le contexte indique 'vous'.",
  ].join("\n");

  const captureSpec = [
    "OBJECTIF PAGE DE CAPTURE :",
    "- Maximiser le taux d'inscription (email).",
    "- Promesse claire, bénéfice immédiat, friction minimale.",
    "- CTA unique et répété (même action).",
    "",
    "STRUCTURE OBLIGATOIRE (dans cet ordre) :",
    "1) HERO",
    "   - Headline (1 phrase)",
    "   - Subheadline (1-2 phrases)",
    "   - 3 à 5 bénéfices (bullets)",
    "   - Bloc formulaire (texte du bouton + micro-copie)",
    "2) POUR QUI / PAS POUR QUI",
    "3) CE QUE TU VAS OBTENIR (contenu / modules / livrable)",
    "4) PREUVES (si rien: preuves génériques crédibles + mécanisme + résultat)",
    "5) FAQ (5 questions qui lèvent les objections)",
    "6) RAPPEL CTA (1 bloc final)",
    "",
    "CONTRAINTES :",
    "- Donne le texte EXACT des boutons CTA.",
    "- Ajoute une micro-copie de réassurance sous le CTA (ex: 'zéro spam').",
    "- Si aucun nom de lead magnet n'est donné, invente un nom court cohérent.",
  ].join("\n");

  const salesSpec = [
    "OBJECTIF PAGE DE VENTE :",
    "- Vendre l'offre. Transformer le scepticisme en décision.",
    "- Créer un désir clair + réduire le risque perçu.",
    "",
    "STRUCTURE OBLIGATOIRE (dans cet ordre) :",
    "1) HERO",
    "   - Headline (résultat + délai / mécanisme)",
    "   - Subheadline (pour qui + transformation)",
    "   - 3 preuves / crédibilité (ou alternatives si pas de preuve)",
    "   - Bloc CTA (bouton + micro-copie)",
    "2) LE PROBLÈME (empathie + coût caché)",
    "3) LA SOLUTION / MÉCANISME (ce qui rend l'approche différente)",
    "4) CE QUE TU OBTIENS (livrables, modules, format, support, bonus)",
    "5) POUR QUI / PAS POUR QUI",
    "6) PRIX + JUSTIFICATION + CE QUE ÇA REMPLACE",
    "7) URGENCE (si fournie) + CTA",
    "8) GARANTIE (si fournie) + réduction du risque",
    "9) OBJECTIONS / FAQ (7 questions)",
    "10) CTA FINAL (très direct)",
    "",
    "CONTRAINTES :",
    "- Donne le texte EXACT des boutons CTA.",
    "- Si le prix n'est pas fourni, propose 2 options de pricing cohérentes (standard / premium) et justifie.",
    "- Si urgence/garantie manquantes, propose une version soft et crédible (sans mensonge).",
  ].join("\n");

  const instruction = page === "sales" ? salesSpec : captureSpec;

  return [
    `TÂCHE : Rédige une ${page === "sales" ? "page de vente" : "page de capture"} ultra-convertissante.`,
    `THÈME: ${theme}`,
    "",
    offerBlock,
    "",
    "IMPORTANT :",
    "- Tu DOIS t'inspirer des ressources Tipote fournies dans le contexte (exemples de pages de capture / vente).",
    "- Adapte le copywriting au persona + business plan fournis dans le contexte.",
    "",
    instruction,
    "",
    commonRules,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}
