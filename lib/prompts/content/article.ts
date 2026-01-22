// lib/prompts/content/article.ts
// Builder prompt Article de blog (FR) — SEO + copywriting humain
// V1 : 2 étapes obligatoires
// 1) plan (à valider par l'user)
// 2) rédaction complète (avec mots-clés en gras)

export type ArticleObjective = "traffic_seo" | "authority" | "emails" | "sales";

export type ArticleStep = "plan" | "write";

export type ArticlePromptParams = {
  step: ArticleStep;

  // Obligatoire
  subject: string; // thème / idée / mot-clé large
  objective: ArticleObjective;

  // SEO
  primaryKeyword?: string; // mot-clé principal (optionnel)
  secondaryKeywords?: string[]; // secondaires / longue traîne (optionnel)

  // Sources (optionnel) : l'user colle des URLs
  links?: string[];

  // CTA (optionnel)
  ctaText?: string | null;
  ctaLink?: string | null;

  // Étape 2 : plan validé (obligatoire pour write)
  approvedPlan?: string | null;
};

function clean(s: unknown, max = 1200) {
  const x = typeof s === "string" ? s.trim() : "";
  if (!x) return "";
  return x.length > max ? x.slice(0, max) : x;
}

function normalizeKeywords(list?: string[]) {
  return (list ?? [])
    .map((x) => clean(x, 120))
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 24);
}

function normalizeLinks(list?: string[]) {
  return (list ?? [])
    .map((x) => clean(x, 800))
    .map((x) => x.replace(/\s+/g, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function objectiveLabel(o: ArticleObjective) {
  if (o === "traffic_seo") return "Trafic SEO";
  if (o === "authority") return "Autorité";
  if (o === "emails") return "Emails";
  return "Ventes";
}

export function buildArticlePrompt(params: ArticlePromptParams): string {
  const step = params.step;

  const subject = clean(params.subject, 240);
  const objective = params.objective;

  const primaryKeyword = clean(params.primaryKeyword, 120);
  const secondaryKeywords = normalizeKeywords(params.secondaryKeywords);

  const links = normalizeLinks(params.links);

  const ctaText = clean(params.ctaText, 220);
  const ctaLink = clean(params.ctaLink, 800);

  const approvedPlan = clean(params.approvedPlan, 8000);

  const lines: string[] = [];

  // Persona/plan/knowledge sont injectés côté API → on y fait référence explicitement
  lines.push("Tu es un rédacteur web senior francophone (copywriting + SEO).");
  lines.push("Tu écris comme un humain : fluide, vivant, simple, sans jargon inutile.");
  lines.push("Tu utilises le persona + business profile + business plan + ressources internes fournis dans le contexte.");
  lines.push("Objectif: produire un article très utile, très lisible, et optimisé SEO.");
  lines.push("");

  // IMPORTANT: l'user veut des mots-clés en gras → on autorise **uniquement** pour ça
  lines.push("Règles de format:");
  lines.push("- Texte en français.");
  lines.push("- Mets un espace blanc (ligne vide) après chaque paragraphe.");
  lines.push("- Tu peux utiliser des intertitres clairs (ex: 'Partie 1 — ...').");
  lines.push("- Tu n'utilises PAS de markdown, sauf UNE exception: tu mets les mots-clés SEO en gras avec **mot clé**.");
  lines.push("- Ne mets jamais d'autres éléments markdown (pas de #, pas de listes numérotées '1.', pas de tableaux).");
  lines.push("");

  lines.push(`Sujet: ${subject}`);
  lines.push(`Objectif (1 seul choix): ${objectiveLabel(objective)}`);
  lines.push("");

  if (primaryKeyword) {
    lines.push("Mot-clé principal (à mettre en gras dans l'article):");
    lines.push(primaryKeyword);
    lines.push("");
  }

  if (secondaryKeywords.length) {
    lines.push("Mots-clés secondaires / longue traîne (à mettre en gras quand utilisés):");
    lines.push(secondaryKeywords.join(", "));
    lines.push("");
  } else {
    lines.push("Mots-clés secondaires / longue traîne: non fournis (tu peux en proposer, mais tu les mettras aussi en gras quand utilisés).");
    lines.push("");
  }

  if (links.length) {
    lines.push("Liens à placer (si pertinent, sans inventer):");
    links.forEach((u) => lines.push(u));
    lines.push("");
  } else {
    lines.push("Liens à placer: aucun fourni.");
    lines.push("");
  }

  if (ctaText || ctaLink) {
    lines.push("CTA (si fourni) à intégrer naturellement en fin d'article:");
    if (ctaText) lines.push(`CTA texte: ${ctaText}`);
    if (ctaLink) lines.push(`CTA lien: ${ctaLink}`);
    lines.push("");
  } else {
    lines.push("CTA: non fourni. Propose un CTA cohérent avec l'objectif choisi (sans email).");
    lines.push("");
  }

  if (step === "plan") {
    lines.push("TA MISSION (ETAPE 1 — PLAN UNIQUEMENT):");
    lines.push("- Tu ne rédiges PAS l'article.");
    lines.push("- Tu proposes un plan optimisé SEO pour viser le top 3 + featured snippet.");
    lines.push("- Tu proposes une structure claire et une promesse forte.");
    lines.push("");
    lines.push("Sortie attendue (dans cet ordre):");
    lines.push("1) Titre SEO (max 70 caractères)");
    lines.push("2) Chemin d'URL (slug) optimisé SEO");
    lines.push("3) Meta description (max 160 caractères)");
    lines.push("4) Promesse/angle en 1 phrase");
    lines.push("5) Plan détaillé:");
    lines.push("   - Introduction (objectif de l'intro + hook)");
    lines.push("   - 3 à 6 parties (pour chaque partie: titre + 3 à 6 bullets ultra concrètes)");
    lines.push("   - Conclusion (le message final + CTA)");
    lines.push("   - FAQ (5 à 8 questions type Google)");
    lines.push("6) Google Snippet target:");
    lines.push("   - Propose un bloc réponse de 40 à 60 mots (définition/étapes) pour viser le snippet.");
    lines.push("7) Liste de mots-clés (séparés par des virgules, sans guillemets):");
    lines.push("   - Inclure mot-clé principal + longue traîne + variantes.");
    lines.push("");
    lines.push("Important:");
    lines.push("- N'invente aucune source.");
    lines.push("- Si des liens sont fournis, tu peux dire où les placer (ex: Partie 2).");
    lines.push("- Mets en gras **uniquement** les mots-clés (dans la liste).");
    return lines.join("\n");
  }

  // step === "write"
  lines.push("TA MISSION (ETAPE 2 — REDACTION COMPLETE):");
  lines.push("- Tu rédiges l'article complet à partir du plan validé ci-dessous.");
  lines.push("- Tu respectes strictement les volumes minimums:");
  lines.push("  - Introduction: 150 mots minimum");
  lines.push("  - 3 à 6 parties: 200 mots minimum chacune");
  lines.push("  - Conclusion: 200 mots minimum");
  lines.push("  - FAQ: 300 mots minimum au total");
  lines.push("- Tu mets en gras **tous** les mots-clés SEO quand tu les utilises (principal + secondaires + longue traîne).");
  lines.push("- Tu gardes un style conversationnel, amical, mais pro et crédible.");
  lines.push("- Lisibilité niveau 5e. Beaucoup d'exemples concrets. Pas de remplissage.");
  lines.push("");
  lines.push("PLAN VALIDE (à suivre, sans dériver):");
  lines.push(approvedPlan || "AUCUN PLAN FOURNI (ERREUR): tu dois refuser et demander le plan validé.");
  lines.push("");
  lines.push("Sortie attendue:");
  lines.push("- Donne l'article complet (intro -> parties -> conclusion -> FAQ).");
  lines.push("- Termine par un CTA clair adapté à l'objectif (pas d'email).");
  lines.push("- Ajoute à la fin (après la FAQ), ces éléments:");
  lines.push("  * Titre final (<= 70 caractères)");
  lines.push("  * Chemin d'URL");
  lines.push("  * Meta description (<= 160 caractères)");
  lines.push("  * Description blog (<= 200 caractères)");
  lines.push("  * Liste de mots-clés (virgules, sans guillemets)");
  return lines.join("\n");
}
