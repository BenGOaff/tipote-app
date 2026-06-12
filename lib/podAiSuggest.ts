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
//
// Personnalisation v2 (Béné, 21 mai 2026) : injection du contexte
// commenter (headline LinkedIn, ton de voix, audience cible, expressions
// perso) pour que les suggestions sonnent comme l'utilisateur, pas
// comme un GPT-4 générique. Cf. business_profiles + pod_linkedin_profiles.

import { callClaude, getClaudeApiKey } from "@/lib/claude";
import type { CommentTone } from "@/lib/podBoost";
import { NATURAL_WRITING_BLOCK } from "@/lib/prompts/quiz/system";
import { sanitizeAiText } from "@/lib/aiTextSanitizer";

export type CommentSuggestions = Record<CommentTone, string>;

/** Profil du commenter (NOT l'auteur du post). Injecté dans le prompt
 *  pour que les suggestions matchent SA voix. Tous les champs sont
 *  optionnels : si absent on le saute simplement dans le prompt. */
export type CommenterContext = {
  /** Nom complet, ex: "Béné Goaff". Sert au prompt à parler à la
   *  première personne crédible. */
  fullName?: string | null;
  /** Headline LinkedIn de l'user, ex: "B2B SaaS Growth Consultant —
   *  helps founders scale to $1M ARR". Donne au modèle le métier et
   *  le positionnement → ton crédible. */
  headline?: string | null;
  /** Ton de voix libre, ex: "warm, direct, with self-deprecating
   *  humor. Tutoiement systématique. Pas de jargon corporate." */
  toneOfVoice?: string | null;
  /** Catégorie ton (legacy auto_comment_style_ton) : amical /
   *  professionnel / provocateur / storytelling / humoristique / sérieux. */
  styleCategory?: string | null;
  /** Audience cible, ex: "Founders SaaS B2B early stage". Permet à
   *  Claude d'adapter le vocabulaire et les exemples. */
  targetAudience?: string | null;
  /** Objectifs business de l'user (auto_comment_objectifs), ex:
   *  ["éduquer", "construire communauté"]. */
  objectives?: string[] | null;
  /** Mots-clés / expressions / emojis perso (auto_comment_langage). */
  langage?: {
    keywords?: string[];
    expressions?: string[];
    emojis?: string[];
  } | null;
  /** Tutoiement / vouvoiement (Béné 12 juin 2026, réglable depuis le
   *  popup de l'extension). "auto" ou absent = on laisse le modèle
   *  suivre le registre du post. */
  addressForm?: "auto" | "tu" | "vous" | null;
  /** Domaine d'expertise déclaré (ex: "marketing digital", "yoga
   *  prénatal") : ancre la crédibilité des commentaires. */
  domain?: string | null;
};

const FALLBACK_SUGGESTIONS: CommentSuggestions = {
  agree: "Très juste, c'est exactement ce qu'on observe sur le terrain.",
  disagree: "Intéressant, mais je vois les choses différemment — le contexte joue beaucoup ici.",
  add_value: "À compléter : ça fonctionne particulièrement bien quand on l'applique en amont.",
  ask_question: "Question : comment tu adaptes ça quand l'équipe n'est pas encore alignée ?",
};

/** Compose un bloc de contexte commenter à injecter dans le system
 *  prompt. Retourne vide si aucune info perso. */
function formatCommenterContext(ctx: CommenterContext | undefined): string {
  if (!ctx) return "";
  const lines: string[] = [];

  if (ctx.headline?.trim()) {
    lines.push(`Tu commentes en tant que **${ctx.fullName ?? "un professionnel"}** — "${ctx.headline.trim()}".`);
  } else if (ctx.fullName?.trim()) {
    lines.push(`Tu commentes en tant que **${ctx.fullName.trim()}**.`);
  }

  if (ctx.targetAudience?.trim()) {
    lines.push(`Audience cible de ce commenter : ${ctx.targetAudience.trim()}.`);
  }

  if (ctx.toneOfVoice?.trim()) {
    lines.push(`Ton de voix attendu : ${ctx.toneOfVoice.trim()}`);
  }

  if (ctx.styleCategory?.trim() && ctx.styleCategory !== "professionnel") {
    // "professionnel" = défaut, on l'omet pour éviter de redire des
    // banalités au modèle.
    lines.push(`Style général : ${ctx.styleCategory.trim()}.`);
  }

  if (ctx.domain?.trim()) {
    lines.push(`Domaine d'expertise du commenter : ${ctx.domain.trim()}. Les commentaires doivent sonner crédibles venant de ce domaine.`);
  }

  if (ctx.addressForm === "tu") {
    lines.push(`Adresse-toi à l'auteur du post en le TUTOYANT (ou registre informel équivalent dans la langue du post).`);
  } else if (ctx.addressForm === "vous") {
    lines.push(`Adresse-toi à l'auteur du post en le VOUVOYANT (ou registre formel équivalent dans la langue du post).`);
  }

  if (ctx.objectives && ctx.objectives.length > 0) {
    lines.push(`Objectifs business du commenter (à servir discrètement, jamais commercial direct) : ${ctx.objectives.join(", ")}.`);
  }

  const lang = ctx.langage;
  if (lang) {
    if (lang.expressions && lang.expressions.length > 0) {
      lines.push(`Expressions et tournures qu'utilise naturellement le commenter (pioche-en 0 ou 1 par commentaire MAX, jamais toutes les 4) : ${lang.expressions.slice(0, 10).join(" / ")}.`);
    }
    if (lang.keywords && lang.keywords.length > 0) {
      lines.push(`Mots-clés métier du commenter (à utiliser quand pertinent) : ${lang.keywords.slice(0, 10).join(", ")}.`);
    }
    if (lang.emojis && lang.emojis.length > 0) {
      // L'instruction "pas d'emoji" du system prompt est forte, on
      // n'autorise des emojis QUE si le user les a explicitement listés.
      lines.push(`Le commenter utilise occasionnellement ces emojis : ${lang.emojis.slice(0, 5).join(" ")} — tu peux en mettre 0 ou 1 par commentaire, jamais plus.`);
    }
  }

  if (lines.length === 0) return "";

  return `\n### Contexte du commenter (à respecter scrupuleusement)\n\n${lines.join("\n")}\n`;
}

function buildPrompt(args: {
  contentExcerpt: string | null;
  language: string;
  commenter?: CommenterContext;
  /** Indication libre saisie par l'user au moment de la regénération.
   *  Ex: "plus court", "moins formel", "parle de mon expérience en B2B".
   *  Injectée en fin de system prompt avec un poids fort. */
  indications?: string | null;
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
  const contextBlock = formatCommenterContext(args.commenter);
  const allowEmojis = !!args.commenter?.langage?.emojis?.length;
  const indications = args.indications?.trim();

  const indicationsBlock = indications
    ? `\n### Indication EXPRESSE du commenter (priorité haute, à respecter)\n\n"${indications.slice(0, 400)}"\n`
    : "";

  // Few-shot examples ground the 4 tons in concrete, "human" patterns.
  // Choisis volontairement courts + spécifiques (un détail, un chiffre,
  // une situation) pour rompre avec le style "assistant générique" que
  // Claude produit par défaut.
  const fewShotBlock = `\n### Exemples de tonalité attendue (à NE PAS recopier, juste pour le ton)

agree (appui personnel, concret) :
- "Vu pareil chez nos clients SaaS — dès qu'on coupe le call de découverte, le NPS dérape. Pas une coïncidence."
- "100% — j'ai testé l'inverse 6 mois, on a perdu 2 deals high-ticket avant de revenir au format long."

disagree (débat ouvert, posture nette) :
- "Pas si sûr — on a vu l'inverse sur l'audit Q3 : les équipes les + structurées sont aussi celles qui sortent le moins de prod. Le cadre tue parfois la traction."
- "Pas convaincu que le canal soit la cause. Chez nous c'est le brief avant le canal qui change tout."

add_value (apport spécifique non-redondant) :
- "Un point qu'on rate souvent : la qualif passe AUSSI par les objections sur le pricing. Si elles arrivent tard, le funnel est cassé en amont."
- "Petite nuance qui a tout changé pour moi : faire la review d'offre AVANT la review produit, sinon on optimise un truc que personne veut acheter."

ask_question (question précise ancrée dans le post) :
- "Quand tu dis "petit comité", ça représente combien de personnes dans tes process ?"
- "Tu mesures comment l'impact de ce changement de cadence sur le revenu net, hors signal vanity ?"
`;

  const system = `Tu es un assistant qui aide à commenter rapidement des posts LinkedIn — comme si TU étais le commenter.

Génère 4 suggestions de commentaire courtes (max 280 caractères chacune, sans hashtag${allowEmojis ? "" : ", sans emoji"}) dans la langue du post (${language}), une pour chacun des tons :

- "agree": appuie le propos avec UN détail concret tiré de l'expérience (chiffre, situation, contre-exemple raté). Jamais lèche-bottes, jamais "excellent article".
- "disagree": ouvre un débat constructif. Tu prends position nettement mais sans arrogance ni condescendance. Apporte UN angle ou UN fait qui complique le propos.
- "add_value": complète le propos avec UNE nuance utile que l'auteur n'a pas évoquée. Pas de redite déguisée.
- "ask_question": question précise et ancrée dans LE contenu du post (cite ou paraphrase un élément). Pas de question vague "et toi tu fais comment ?".
${contextBlock}${indicationsBlock}
${NATURAL_WRITING_BLOCK}

### Règles spécifiques aux commentaires LinkedIn

- Le commentaire doit sonner comme écrit PAR le commenter à la première personne, pas par un assistant IA.
- Pas de "En effet", "Tout à fait", "Effectivement", "Article très intéressant", "Merci pour le partage", "Belle réflexion" — formules creuses à bannir.
- Pas d'introduction inutile : on attaque DIRECTEMENT le fond.
- Si le commenter a un métier / une audience listés ci-dessus, place UN détail concret ancré dans son expérience (ex: "chez nos clients SaaS B2B", "en accompagnement coaching") quand c'est naturel — jamais forcé.
- Pour "ask_question" : ta question doit montrer que tu as LU le post. Cite un élément spécifique ou paraphrase une phrase clé.
- Varie la longueur des 4 commentaires (pas tous au même format).
${fewShotBlock}
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
        // sanitizeAiText : strip em-dash, decorative emojis, double spaces.
        // Bene 7 juin 2026 : aucun em-dash ne doit survivre dans les
        // commentaires generes (signature LLM #1 qui ruine la credibilite).
        // Trim + cap à 280 chars (limite LinkedIn confortable)
        out[k] = sanitizeAiText(v).slice(0, 280);
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
 *  Anthropic est indisponible ou que la réponse est malformée.
 *
 *  Passe `commenter` pour personnaliser fortement les suggestions (ton,
 *  métier, audience, expressions perso). Sans ce contexte, le résultat
 *  reste correct mais générique — l'extension le fait toujours quand
 *  l'API endpoint le permet. */
export async function generateSuggestions(args: {
  contentExcerpt: string | null;
  language: string;
  commenter?: CommenterContext;
  /** Free-form user-supplied hint for this generation (regenerate flow). */
  indications?: string | null;
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
