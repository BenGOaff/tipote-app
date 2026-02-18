// lib/prompts/content/article.ts
// Builder prompt Article de blog (FR) — SEO + copywriting humain
// V2 : robustesse anti-troncature + SEO lock + marqueur FIN

export type ArticleObjective = "traffic_seo" | "authority" | "emails" | "sales";
export type ArticleStep = "plan" | "write";

export type ArticlePromptParams = {
  step: ArticleStep;

  // Obligatoire
  subject: string;
  objective: ArticleObjective;
  language?: string;

  // SEO
  primaryKeyword?: string;
  secondaryKeywords?: string[];

  // Sources (optionnel)
  links?: string[];

  // CTA (optionnel)
  ctaText?: string | null;
  ctaLink?: string | null;

  // Étape 2 : plan validé (obligatoire pour write)
  approvedPlan?: string | null;

  /**
   * Optionnel (fortement recommandé):
   * Tu peux passer ici les éléments SEO issus du plan (stockés côté app),
   * pour éviter qu'ils "disparaissent" à l'étape write.
   */
  planSeoPack?: {
    title?: string | null;
    slug?: string | null;
    metaDescription?: string | null;
    blogDescription?: string | null;
    snippet40_60?: string | null;
    keywordList?: string | null; // virgules
  } | null;
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

  const approvedPlan = clean(params.approvedPlan, 12000);

  const seoPack = params.planSeoPack ?? null;
  const seoTitle = clean(seoPack?.title, 140);
  const seoSlug = clean(seoPack?.slug, 240);
  const seoMeta = clean(seoPack?.metaDescription, 240);
  const seoBlogDesc = clean(seoPack?.blogDescription, 260);
  const seoSnippet = clean(seoPack?.snippet40_60, 600);
  const seoKeywordList = clean(seoPack?.keywordList, 2000);

  const lines: string[] = [];

  const language = clean(params.language, 20) || "fr";

  lines.push("Tu es un rédacteur web senior expert en copywriting et SEO.");
  lines.push("Tu écris comme un humain : fluide, vivant, concret, sans jargon inutile.");
  lines.push("Tu utilises le persona + business profile + business plan + ressources internes fournis dans le contexte.");
  lines.push("Objectif: produire un article très utile, très lisible, et optimisé SEO.");
  lines.push(`LANGUE OBLIGATOIRE: ${language}. Tu dois écrire TOUT l'article dans cette langue.`);
  lines.push("");

  // Format rules
  lines.push("Règles de format (STRICT):");
  lines.push(`- Texte en ${language}.`);
  lines.push("- Mets UNE ligne vide après chaque paragraphe.");
  lines.push("- Intertitres autorisés (ex: 'Partie 1 — ...').");
  lines.push("- Tu n'utilises PAS de markdown, sauf UNE exception: tu mets les mots-clés SEO en gras avec **mot clé**.");
  lines.push("- Ne mets jamais d'autres éléments markdown (pas de #, pas de listes numérotées '1.', pas de tableaux).");
  lines.push("- Évite les listes à puces. Si nécessaire, maximum 6 puces et format '•' (pas de markdown).");
  lines.push("");

  // Anti-troncature
  lines.push("Règles ANTI-TRONCATURE (CRUCIAL):");
  lines.push("- Tu dois terminer l'article à 100% (aucune phrase incomplète).");
  lines.push("- Ne termine JAMAIS par un mot de transition (ex: 'Ensuite', 'Enfin', 'Pour terminer') sans finir l'idée.");
  lines.push("- Si tu sens que tu approches d'une limite de longueur, tu RÉSUMES intelligemment les derniers paragraphes,");
  lines.push("  mais tu livres quand même: Conclusion + FAQ + Bloc SEO final + le marqueur FIN.");
  lines.push("- La dernière ligne de ta réponse doit être EXACTEMENT: <<<END_ARTICLE>>>");
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
    lines.push("- Termine toujours par la ligne: <<<END_ARTICLE>>>");
    return lines.join("\n");
  }

  // step === "write"
  lines.push("TA MISSION (ETAPE 2 — REDACTION COMPLETE):");
  lines.push("- Tu rédiges l'article complet à partir du plan validé ci-dessous.");
  lines.push("- Tu respectes strictement les volumes minimums:");
  lines.push("  - Introduction: 150 mots minimum");
  lines.push("  - 3 à 6 parties: 200 mots minimum chacune");
  lines.push("  - Chaque partie doit contenir au moins un élément concret quand c’est pertinent : exemple, mini-cas réel, mini-liste d’actions, ou micro-script. Évite la mécanique; privilégie ce qui sert le lecteur.");
  lines.push("  - Conclusion: 200 mots minimum");
  lines.push("  - FAQ: 300 mots minimum au total");
  lines.push("- FAQ : réponses courtes, claires, orientées intention (informationnelle → transactionnelle soft).");
  lines.push("- Tu mets en gras **tous** les mots-clés SEO quand tu les utilises (principal + secondaires + longue traîne).");
  lines.push("- Style conversationnel, amical, pro et crédible. Lisibilité niveau 5e. Beaucoup d'exemples. Zéro remplissage.");
  lines.push("- Snippet : doit être réutilisable tel quel.");
  lines.push("");

  lines.push("PLAN VALIDE (à suivre, sans dériver):");
  lines.push(approvedPlan || "AUCUN PLAN FOURNI (ERREUR): tu dois refuser et demander le plan validé.");
  lines.push("");

  // SEO lock: on réinjecte les éléments du plan si tu les as stockés.
  // Sinon, au minimum, on force le modèle à les re-générer à la fin.
  lines.push("SEO LOCK (TRÈS IMPORTANT):");
  if (seoTitle || seoSlug || seoMeta || seoKeywordList || seoSnippet || seoBlogDesc) {
    lines.push("- Les éléments ci-dessous sont la vérité de référence (ne les oublie pas).");
    if (seoTitle) lines.push(`- Titre SEO (référence): ${seoTitle}`);
    if (seoSlug) lines.push(`- Slug (référence): ${seoSlug}`);
    if (seoMeta) lines.push(`- Meta description (référence): ${seoMeta}`);
    if (seoBlogDesc) lines.push(`- Description blog (référence): ${seoBlogDesc}`);
    if (seoSnippet) lines.push(`- Snippet cible 40-60 mots (référence): ${seoSnippet}`);
    if (seoKeywordList) lines.push(`- Liste mots-clés (référence): ${seoKeywordList}`);
  } else {
    lines.push("- Aucun pack SEO fourni: tu dois RECRÉER ces éléments à la fin en cohérence avec le plan.");
  }
  lines.push("");

  lines.push("Sortie attendue (FORMAT STRICT):");
  lines.push("A) Article complet (intro -> parties -> conclusion -> FAQ).");
  lines.push("B) Puis un bloc final 'SEO' (sur lignes séparées, pas de markdown) :");
  lines.push("   Titre final: ...");
  lines.push("   Slug: ...");
  lines.push("   Meta description: ...");
  lines.push("   Description blog: ...");
  lines.push("   Google Snippet (40-60 mots): ...");
  lines.push("   Liste de mots-clés: ...");
  lines.push("C) Puis DERNIÈRE LIGNE: <<<END_ARTICLE>>>");
  return lines.join("\n");
}
