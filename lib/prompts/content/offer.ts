// lib/prompts/content/offer.ts
// Génération d'offres Tipote :
// - Lead Magnet (gratuit)
// - Offre payante / formation
// Objectif : livrable final structuré, stratégique et actionnable
// Sortie : TEXTE BRUT (plain text), prêt à être utilisé

export type OfferType = "lead_magnet" | "paid_training";

export type SourceOffer = {
  id?: string;
  name?: string | null;
  level?: string | null;
  description?: string | null;
  promise?: string | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  price_min?: number | null;
  price_max?: number | null;
};

export type OfferPromptParams = {
  offerType: OfferType;

  theme: string; // sujet principal (ou angle si on part d’une pyramide)
  target?: string;

  // ✅ Nouveau: si présent, l’offre/lead magnet doit se baser dessus (pyramide)
  sourceOffer?: SourceOffer | null;

  language?: string; // défaut fr
};

function safe(s?: string) {
  return (s ?? "").trim();
}

function compact(v: unknown) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function formatSourceOffer(o: SourceOffer | null | undefined) {
  if (!o) return "";
  const lines: string[] = [];
  const id = compact(o.id);
  if (id) lines.push(`id: ${id}`);
  const name = compact(o.name);
  if (name) lines.push(`name: ${name}`);
  const level = compact(o.level);
  if (level) lines.push(`level: ${level}`);
  const promise = compact(o.promise);
  if (promise) lines.push(`promise: ${promise}`);
  const outcome = compact(o.main_outcome);
  if (outcome) lines.push(`main_outcome: ${outcome}`);
  const format = compact(o.format);
  if (format) lines.push(`format: ${format}`);
  const delivery = compact(o.delivery);
  if (delivery) lines.push(`delivery: ${delivery}`);
  const desc = compact(o.description);
  if (desc) lines.push(`description: ${desc}`);
  if (typeof o.price_min === "number" || typeof o.price_max === "number") {
    lines.push(`price_range: ${typeof o.price_min === "number" ? o.price_min : "?"} - ${typeof o.price_max === "number" ? o.price_max : "?"}`);
  }
  return lines.join("\n");
}

export function buildOfferPrompt(params: OfferPromptParams): string {
  const lang = safe(params.language) || "fr";
  const theme = safe(params.theme);
  const target = safe(params.target);
  const hasSource = Boolean(params.sourceOffer && (params.sourceOffer.name || params.sourceOffer.promise || params.sourceOffer.description));
  const sourceBlock = hasSource ? formatSourceOffer(params.sourceOffer) : "";

  const baseContext = [
    "Tu es Tipote, expert en marketing digital, création d'offres et pédagogie business.",
    "Tu aides des entrepreneurs à créer des offres désirables, utiles et vendables.",
    "Tu écris en français clair, structuré, orienté valeur et résultats.",
    "Tu ne mentionnes jamais que tu es une IA.",
    "Tu rends un livrable FINAL, directement exploitable.",
    "Format de sortie : TEXTE BRUT (plain text).",
    "Interdit : markdown, emojis excessifs, disclaimers, blabla inutile.",
    "",
    "RÈGLE CRITIQUE : si une 'SOURCE PYRAMIDE' est fournie, tu dois t'y ALIGNER :",
    "- même public cible (ou compatible)",
    "- même promesse / résultat (ou version améliorée cohérente)",
    "- respecter format, delivery, et fourchette de prix si disponibles",
    "- le nouveau livrable doit 'fit' parfaitement dans la pyramide (lead magnet -> prépare l'offre payante, etc.)",
  ].join("\n");

  const audienceContext = [
    "CONTEXTE UTILISATEUR (à exploiter intelligemment) :",
    "- Tu tiens compte du persona client idéal (douleurs, désirs, objections).",
    "- Tu exploites le business profile et le business plan si disponibles.",
    "- Tu utilises les ressources Tipote Knowledge comme source d'expertise.",
    target ? `- Cible explicitement mentionnée : ${target}` : "- Cible : déduite du persona.",
  ].join("\n");

  const sourceContext = hasSource
    ? [
        "SOURCE PYRAMIDE (BASE À UTILISER) :",
        sourceBlock,
        "",
        "CONSIGNES D'ADAPTATION :",
        "- Tu peux améliorer, préciser et renforcer la structure, MAIS sans contredire la source.",
        "- Si le thème fourni est un angle, utilise-le pour mieux positionner la source (sans changer la promesse).",
        "- Si une info source manque, complète intelligemment à partir du persona / business plan.",
      ].join("\n")
    : [
        "SOURCE PYRAMIDE : AUCUNE",
        "=> Tu crées l'offre à partir de zéro en t'appuyant sur le persona + business plan + knowledge.",
      ].join("\n");

  if (params.offerType === "lead_magnet") {
    return [
      baseContext,
      "",
      audienceContext,
      "",
      sourceContext,
      "",
      "MISSION :",
      "Créer un LEAD MAGNET irrésistible dont l'objectif principal est de capter des emails.",
      "Il doit résoudre un problème précis, douloureux et immédiat pour la cible.",
      "S'il y a une SOURCE PYRAMIDE, le lead magnet doit être cohérent avec le lead magnet attendu dans cette pyramide (nom, but, contenu, résultat).",
      "",
      "ANGLE / THÈME (si fourni) :",
      theme,
      "",
      "STRUCTURE ATTENDUE (OBLIGATOIRE) :",
      "1) TITRE PRINCIPAL (ultra spécifique, bénéfice clair)",
      "2) PROMESSE PRINCIPALE (quick win mesurable)",
      "3) PROBLÈME CIBLÉ (douleur + conséquence + erreur fréquente)",
      "4) FORMAT RECOMMANDÉ (1 seul format + justification)",
      "5) CONTENU DÉTAILLÉ (sections + frameworks + exemples + templates/checklists si pertinent)",
      "6) CTA D'OPT-IN (simple, non agressif, orienté bénéfice)",
      "7) LIEN NATUREL VERS OFFRE PAYANTE (phrase/pont logique + prochaine étape)",
      "8) CONSEILS D'UTILISATION MARKETING (page capture, DM, bio, pub, séquence email courte)",
      "",
      "IMPORTANT :",
      "- Rapide à consommer, pas un roman.",
      "- Donne un résultat immédiat.",
      "- Prépare la vente derrière (sans vendre agressivement).",
      "",
      "Génère maintenant le livrable complet.",
    ].join("\n");
  }

  return [
    baseContext,
    "",
    audienceContext,
    "",
    sourceContext,
    "",
    "MISSION :",
    "Créer une OFFRE PAYANTE / FORMATION à forte valeur perçue.",
    "Elle doit résoudre un problème D.U.R (Douloureux, Urgent, Reconnu).",
    "S'il y a une SOURCE PYRAMIDE (middle ticket, high ticket, etc.), tu dois t'y aligner : format, contenu, public, prix, promesse.",
    "",
    "ANGLE / THÈME (si fourni) :",
    theme,
    "",
    "STRUCTURE ATTENDUE (OBLIGATOIRE) :",
    "1) NOM DE L'OFFRE (orienté transformation, cohérent avec la pyramide)",
    "2) PROMESSE CENTRALE (résultat final concret)",
    "3) PROBLÈME D.U.R RÉSOLU (douleur/urgence/preuve que c'est reconnu)",
    "4) À QUI / PAS POUR QUI (ciblage net)",
    "5) STRUCTURE DU PROGRAMME (8 à 15 modules, chaque module: objectif + résultat concret + livrable/exercice)",
    "6) MÉTHODE (frameworks, étapes, pourquoi ça marche)",
    "7) BÉNÉFICES (tangibles + intangibles)",
    "8) POSITIONNEMENT (différenciation, pourquoi toi, pourquoi maintenant)",
    "9) LIVRAISON & FORMAT (asynchrone, live, hybride, durée, support, communauté...)",
    "10) PRIX RECOMMANDÉ (cohérent avec la pyramide si source fournie + justification rapide)",
    "11) BONUS (optionnels mais pertinents, pas du remplissage)",
    "12) OBJECTIONS & RÉPONSES (3 à 7 objections typiques + réponses courtes)",
    "",
    "IMPORTANT :",
    "- Zéro remplissage : concret, actionnable, structuré.",
    "- Donne l'impression d'un produit premium et très guidé.",
    "",
    "Génère maintenant l'offre complète.",
  ].join("\n");
}
