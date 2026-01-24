// lib/prompts/content/video.ts
// Prompt builder: Scripts Vidéo (Create -> type "video")
// Objectif: produire des scripts percutants, rythmés et adaptés aux formats courts OU longs,
// avec un contrôle STRICT de la durée via un objectif de mots basé sur 160 mots/min.
// ⚠️ Sortie attendue: texte brut uniquement (pas de markdown).

export type VideoPlatform = "youtube_long" | "youtube_shorts" | "tiktok" | "reel";

export type VideoDurationId = "30s" | "60s" | "3min" | "5min" | "10min" | "15min+";

export type VideoScriptPromptParams = {
  platform: VideoPlatform;
  subject: string;
  duration: VideoDurationId;

  // Optionnels (si l'API peut les injecter depuis business_profile/persona)
  audience?: string; // ex: "entrepreneurs débutants", "coachs", etc.
  tone?: string; // ex: "direct", "bienveillant", "punchy"
  objective?: string; // ex: "leads", "vente", "notoriété"
  language?: string; // défaut: fr

  // Override explicite si déjà calculé côté UI / API
  targetWordCount?: number;
};

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = typeof n === "number" ? n : Number(String(n ?? "").trim());
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function durationToSeconds(duration: VideoDurationId): number {
  switch (duration) {
    case "30s":
      return 30;
    case "60s":
      return 60;
    case "3min":
      return 3 * 60;
    case "5min":
      return 5 * 60;
    case "10min":
      return 10 * 60;
    case "15min+":
      // On fixe une base "15 min" (l'UI dit 15+). On reste strict pour la V1.
      return 15 * 60;
    default:
      return 5 * 60;
  }
}

export function computeTargetWordCount(duration: VideoDurationId, wordsPerMinute = 160): number {
  const seconds = durationToSeconds(duration);
  const minutes = seconds / 60;
  // 160 mots/min => 2.666... mots/sec
  const raw = minutes * wordsPerMinute;
  return clampInt(raw, 40, 4000, Math.round(raw));
}

function platformLabel(p: VideoPlatform): string {
  switch (p) {
    case "youtube_long":
      return "YouTube (long format)";
    case "youtube_shorts":
      return "YouTube Shorts";
    case "tiktok":
      return "TikTok";
    case "reel":
      return "Instagram Reels";
    default:
      return p;
  }
}

function durationLabel(d: VideoDurationId): string {
  switch (d) {
    case "30s":
      return "30 secondes";
    case "60s":
      return "1 minute";
    case "3min":
      return "3 minutes";
    case "5min":
      return "5 minutes";
    case "10min":
      return "10 minutes";
    case "15min+":
      return "15 minutes (base)";
    default:
      return d;
  }
}

function buildFormatSpec(platform: VideoPlatform): string {
  // On garde des règles claires, mais compatibles multi-formats.
  if (platform === "youtube_long") {
    return [
      "FORMAT LONG (YouTube):",
      "- Une intro ultra-courte (pas de blabla) + promesse.",
      "- Des chapitres / sections claires avec transitions.",
      "- Exemples concrets, mini-histoires, analogies.",
      "- Rythme: phrases courtes, relances, variations.",
      "- Conclusion: récap + CTA doux (commenter/s'abonner/voir ressource).",
    ].join("\n");
  }

  return [
    "FORMAT COURT (Shorts/TikTok/Reels):",
    "- Hook choc (1 à 3 secondes): question / statistique / promesse / tension.",
    "- Développement ultra-dense: 1 idée principale, pas de digression.",
    "- Pattern interrupts toutes les 2-4 phrases (surprise, twist, mini-contradiction, exemple).",
    "- Fin: payoff + CTA (like/comment/s'abonner) OU question ouverte.",
  ].join("\n");
}

function buildOutputStructure(platform: VideoPlatform): string {
  // Texte brut, lisible, sans markdown.
  if (platform === "youtube_long") {
    return [
      "SORTIE ATTENDUE (texte brut):",
      "1) TITRES (3 options) - style YouTube, orienté CTR.",
      "2) HOOK (1-2 phrases).",
      "3) SCRIPT COMPLET (avec repères de timing approximatifs par section).",
      "4) CTA FINAL (1-2 phrases).",
      "5) BONUS (optionnel): idées B-roll / texte à l'écran / musique (1-3 lignes).",
    ].join("\n");
  }

  return [
    "SORTIE ATTENDUE (texte brut):",
    "1) TITRES (3 options) + 1 variante avec emoji/hashtag si pertinent.",
    "2) HOOK (1-2 phrases maximum).",
    "3) SCRIPT COMPLET (phrases très courtes, rythmées).",
    "4) CTA FINAL (1 phrase) + question d'engagement.",
    "5) BONUS (optionnel): 3 hashtags + 1 idée de mise en scène (1 ligne).",
  ].join("\n");
}

export function buildVideoScriptPrompt(params: VideoScriptPromptParams): string {
  const lang = (params.language || "fr").trim() || "fr";
  const subject = String(params.subject || "").trim();

  const targetWords =
    typeof params.targetWordCount === "number" && Number.isFinite(params.targetWordCount)
      ? clampInt(params.targetWordCount, 40, 4000, computeTargetWordCount(params.duration))
      : computeTargetWordCount(params.duration);

  const tone = String(params.tone || "").trim();
  const audience = String(params.audience || "").trim();
  const objective = String(params.objective || "").trim();

  const hardTimingRules = [
    "CONTRAINTE DE DURÉE (OBLIGATOIRE):",
    `- Débit: 160 mots / minute.`,
    `- Durée demandée: ${durationLabel(params.duration)}.`,
    `- Le script (partie "SCRIPT COMPLET" uniquement) doit contenir EXACTEMENT ${targetWords} mots (tolérance maximale ±5%).`,
    "- Ajuste et réécris si nécessaire jusqu'à respecter cette contrainte.",
    "- N'écris PAS de disclaimer, PAS d'excuse, PAS d'explication.",
    "- Texte brut uniquement (pas de markdown).",
  ].join("\n");

  const creativeRules = [
    "RÈGLES CRÉATIVES (viralité + rétention):",
    "- Tu écris comme un créateur expert: clair, punchy, concret.",
    "- Tu maximises la rétention: phrases courtes, ruptures de rythme, exemples, mini-twists.",
    "- Tu évites les généralités: tu donnes des détails, des chiffres, des images mentales.",
    "- Tu fais 1 idée principale, une progression logique, et une fin satisfaisante.",
    "- Tu ajoutes 2-3 \"pattern interrupts\" (surprise, contradiction, mini-histoire, analogie).",
    "- CTA: naturel et non pushy.",
  ].join("\n");

  const context = [
    "CONTEXTE:",
    `- Plateforme: ${platformLabel(params.platform)}.`,
    audience ? `- Audience cible: ${audience}.` : "- Audience cible: (si non précisé) entrepreneurs francophones.",
    tone ? `- Ton: ${tone}.` : "- Ton: direct, bienveillant, dynamique.",
    objective ? `- Objectif: ${objective}.` : "- Objectif: engagement + crédibilité + conversion douce.",
    `- Sujet: ${subject}.`,
  ].join("\n");

  const systemStyle = [
    "INSTRUCTIONS DE STYLE:",
    `- Langue: ${lang} (si fr: français naturel, pas trop scolaire).`,
    "- Voix: 2e personne (\"tu\") sauf si le sujet impose autrement.",
    "- Interdits: phrases trop longues, jargon inutile, blabla d'intro, moralisation.",
  ].join("\n");

  const formatSpec = buildFormatSpec(params.platform);
  const outputStructure = buildOutputStructure(params.platform);

  // Important: on garde le prompt compact, mais très directif.
  return [
    "Tu es un scriptwriter expert en vidéos virales (Shorts/TikTok/Reels) et en YouTube long format.",
    "Ton objectif: écrire un script ultra engageant qui maximise la rétention et l'action.",
    "",
    context,
    "",
    hardTimingRules,
    "",
    systemStyle,
    "",
    creativeRules,
    "",
    formatSpec,
    "",
    outputStructure,
    "",
    "IMPORTANT:",
    "- Le script doit être immédiatement enregistrable (voix off ou face cam).",
    "- Pas de listes à puces dans le SCRIPT COMPLET (autorisé dans BONUS uniquement).",
    "- Dans le SCRIPT COMPLET: une phrase par ligne pour faciliter la lecture.",
    "",
    "Génère maintenant.",
  ].join("\n");
}
