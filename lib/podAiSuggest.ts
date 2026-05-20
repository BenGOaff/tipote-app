// Génération IA des 4 suggestions de commentaires LinkedIn dans les 4
// tons agree / disagree / add_value / ask_question. Service partagé entre :
//   - le fan-out (lib/podBoostService) : pré-génère les suggestions pour
//     chaque task d'engagement quand un pod-mate publie
//   - l'endpoint /api/pod/ai-suggest : appelé on-demand par l'extension
//     quand l'utilisateur ouvre le badge sur un post HORS pod (mode
//     "quick comment Kawaak" demandé par Béné, 19 mai 2026)
//
// On retourne toujours la même forme JSON pour que l'extension n'ait
// qu'un format à parser. Si Claude renvoie du JSON malformé, on tombe
// sur les fallbacks génériques (l'UX reste viable, juste moins ciblé).

import { callClaude, getClaudeApiKey } from "@/lib/claude";
import type { CommentTone } from "@/lib/podBoost";

export type CommentSuggestions = Record<CommentTone, string>;

const FALLBACK_SUGGESTIONS: CommentSuggestions = {
  agree: "Très juste, c'est exactement ce qu'on observe sur le terrain.",
  disagree: "Intéressant, mais je vois les choses différemment — le contexte joue beaucoup ici.",
  add_value: "À compléter : ça fonctionne particulièrement bien quand on l'applique en amont.",
  ask_question: "Question : comment tu adaptes ça quand l'équipe n'est pas encore alignée ?",
};

function buildPrompt(args: {
  contentExcerpt: string | null;
  language: string;
}): { system: string; user: string } {
  // Langue par nom complet — Claude écrit naturellement dans la bonne
  // langue quand on lui passe le nom (vs un code ISO qu'il interprète
  // parfois bizarrement).
  const languageMap: Record<string, string> = {
    fr: "français",
    en: "English",
    es: "español",
    it: "italiano",
    pt: "português",
    de: "Deutsch",
    nl: "Nederlands",
    ar: "العربية",
  };
  const language = languageMap[args.language] ?? "français";

  const system = `Tu es un assistant qui aide à commenter rapidement des posts LinkedIn.
Tu génères 4 suggestions de commentaire courtes (max 280 caractères chacune, sans emoji, sans hashtag) dans la langue du post (${language}), une pour chacun des tons suivants :

- "agree": appuie le propos avec un détail concret tiré de l'expérience ; jamais lèche-bottes
- "disagree": ouvre un débat constructif ; jamais agressif ni condescendant
- "add_value": complète le propos avec une nuance utile ou un point manqué
- "ask_question": relance la conversation par une question précise et engageante

Style attendu : naturel, professionnel, percutant. Pas de "Excellent article !" ni de formules creuses. Pas de "merci pour le partage". Va droit au sujet.

Tu réponds UNIQUEMENT par un JSON strict de cette forme exacte (pas de markdown, pas de \`\`\`, pas de texte avant ni après) :

{
  "agree": "…",
  "disagree": "…",
  "add_value": "…",
  "ask_question": "…"
}`;

  const userMsg = args.contentExcerpt
    ? `Voici le post à commenter :

"""
${args.contentExcerpt.slice(0, 1500)}
"""

Génère les 4 commentaires maintenant.`
    : `Tu n'as pas le contenu du post — génère 4 commentaires génériques mais crédibles dans la langue ${language}, qui marcheraient sur un post LinkedIn standard de type expérience pro / leçon apprise.`;

  return { system, user: userMsg };
}

/** Parse la réponse Claude (JSON strict normalement). Robuste aux
 *  cas où Claude wrap quand même en markdown malgré la consigne. */
function parseSuggestions(rawResponse: string): CommentSuggestions | null {
  let cleaned = rawResponse.trim();
  // Strip markdown fences si Claude en a ajouté.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // Cherche le premier { ... } qui balance.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const json = cleaned.slice(start, end + 1);

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const keys: CommentTone[] = ["agree", "disagree", "add_value", "ask_question"];
    const out: Partial<CommentSuggestions> = {};
    for (const k of keys) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim().length > 0) {
        // Trim + cap à 280 chars (limite LinkedIn confortable)
        out[k] = v.trim().slice(0, 280);
      } else {
        return null;
      }
    }
    return out as CommentSuggestions;
  } catch {
    return null;
  }
}

/** Génère les 4 suggestions pour un post LinkedIn donné. Retourne
 *  toujours quelque chose d'exploitable — fallback statique si l'API
 *  Anthropic est indisponible ou que la réponse est malformée. */
export async function generateSuggestions(args: {
  contentExcerpt: string | null;
  language: string;
}): Promise<CommentSuggestions> {
  let apiKey: string;
  try {
    apiKey = getClaudeApiKey();
  } catch (err) {
    console.warn("[podAiSuggest] no API key, returning fallback", err);
    return FALLBACK_SUGGESTIONS;
  }

  const { system, user } = buildPrompt(args);

  try {
    const text = await callClaude({
      apiKey,
      system,
      user,
      // Suggestions = 4 × ~280 chars max, donc 1500 tokens largement
      // assez. On garde une marge pour le JSON wrapper.
      maxTokens: 2000,
      temperature: 0.8, // un peu créatif pour éviter les commentaires plats
      idleTimeoutMs: 20_000,
    });
    const parsed = parseSuggestions(text);
    if (parsed) return parsed;
    console.warn("[podAiSuggest] failed to parse Claude response, fallback", text.slice(0, 200));
    return FALLBACK_SUGGESTIONS;
  } catch (err) {
    console.warn("[podAiSuggest] Claude call failed, fallback", err);
    return FALLBACK_SUGGESTIONS;
  }
}
