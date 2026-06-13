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
    lines.push(`Domaine / métier du commenter : ${ctx.domain.trim()}. C'est SON expertise, à utiliser UNIQUEMENT comme angle crédible quand le sujet du post s'y prête. Ne ramène jamais de force le post à ce métier.`);
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
  /** true = répondre dans la MÊME langue que le post (Claude la détecte
   *  depuis le contenu). false = forcer la langue `language`. Béné
   *  13 juin 2026 : avant, l'extension envoyait navigator.language
   *  comme "langue du post", ce qui sortait des commentaires FR sur des
   *  posts EN. On laisse maintenant le modèle suivre le post. */
  matchPostLanguage?: boolean;
  /** Réseau social (linkedin, facebook, instagram, threads, x...) pour
   *  adapter le registre. Les posts FB/IG sont souvent visuels et
   *  personnels, pas pro/B2B comme LinkedIn. */
  network?: string | null;
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
  const hasContent = !!args.contentExcerpt?.trim();

  const indicationsBlock = indications
    ? `\n### Indication EXPRESSE du commenter (priorité haute, à respecter)\n\n"${indications.slice(0, 400)}"\n`
    : "";

  // Consigne de langue. matchPostLanguage = on suit la langue du post
  // (la plus sûre, évite les commentaires FR sur post EN). Sinon langue
  // forcée par nom.
  const languageInstruction = args.matchPostLanguage
    ? hasContent
      ? `dans EXACTEMENT la même langue que le post ci-dessous (détecte-la depuis son contenu : post en anglais -> commentaires en anglais, en espagnol -> en espagnol, etc.)`
      : `dans la langue ${language}`
    : `en ${language} (langue imposée par le commenter, même si le post est dans une autre langue)`;

  // Few-shot DOMAINE-NEUTRE : ils illustrent la STRUCTURE et le ton
  // humain (un détail concret, une posture, une nuance, une question
  // précise) SANS vocabulaire business. Les anciens exemples 100% SaaS/
  // vente contaminaient tous les commentaires vers le jargon B2B, même
  // pour un photographe (drame Béné 13 juin 2026).
  const fewShotBlock = `\n### Exemples de TON et de STRUCTURE (à NE PAS recopier ni transposer le sujet, juste pour le style)

agree (appui personnel, concret) :
- "Pareil de mon côté, j'ai mis du temps à m'y mettre mais une fois pris le pli ça change vraiment tout."
- "Tellement vrai. C'est souvent le détail qui paraît anodin qui fait toute la différence au final."

disagree (posture nette, sans arrogance) :
- "Je le vis différemment honnêtement : chez moi c'est l'inverse qui s'est produit, et ça m'a surpris."
- "Pas convaincu sur ce point précis, j'ai souvent constaté le contraire dans la pratique."

add_value (apport spécifique non-redondant) :
- "Un truc qu'on oublie souvent : ça marche bien mieux quand on le prépare en amont plutôt qu'à chaud."
- "Petite nuance qui a tout changé pour moi : commencer par le plus simple avant d'ajouter de la complexité."

ask_question (question précise ancrée dans le post) :
- "Quand tu dis ça, tu penses à quel cas précisément ?"
- "Curieux de savoir comment tu gères ça quand le contexte change en cours de route."
`;

  const network = (args.network ?? "").toLowerCase();
  const networkLine =
    network && network !== "linkedin"
      ? `\n- Réseau : ${network}. Le registre est plus personnel et spontané que LinkedIn (souvent des posts photo, perso, lifestyle). Pas de jargon pro, pas de posture "expert".`
      : "";

  const system = `Tu es un assistant qui aide à commenter rapidement un post sur les réseaux sociaux — comme si TU étais le commenter.

Génère 4 suggestions de commentaire courtes (max 280 caractères chacune, sans hashtag${allowEmojis ? "" : ", sans emoji"}) ${languageInstruction}, une pour chacun des tons :

- "agree": appuie le propos avec UN détail concret. Jamais lèche-bottes, jamais "excellent post".
- "disagree": ouvre un échange. Tu prends position sans arrogance ni condescendance. Apporte UN angle qui nuance.
- "add_value": complète avec UNE remarque utile que l'auteur n'a pas évoquée. Pas de redite déguisée.
- "ask_question": question précise et ancrée dans LE contenu du post. Pas de question vague.

### RÈGLE ABSOLUE — le sujet du commentaire = le sujet DU POST

- Le commentaire porte sur CE QUE RACONTE LE POST, rien d'autre. Tu réagis à SON sujet, pas au tien.
- Le métier / domaine du commenter (ci-dessous s'il est renseigné) sert UNIQUEMENT à choisir un angle crédible QUAND le sujet du post s'y prête. Si le post n'a aucun rapport avec ce métier, tu n'en parles PAS.
- INTERDICTION ABSOLUE de ramener le post à un sujet business/marketing/vente/génération de leads si le post ne parle pas de ça. Un post photo se commente comme un post photo, un post cuisine comme un post cuisine.${networkLine}
${contextBlock}${indicationsBlock}
${NATURAL_WRITING_BLOCK}

### Règles de style

- Le commentaire sonne comme écrit PAR le commenter à la première personne, pas par une IA.
- Pas de "En effet", "Tout à fait", "Effectivement", "Très intéressant", "Merci pour le partage", "Belle réflexion" — formules creuses à bannir.
- Pas d'introduction inutile : on attaque DIRECTEMENT le fond.
- Pour "ask_question" : ta question doit montrer que tu as LU le post. Cite ou paraphrase un élément précis.
- Varie la longueur des 4 commentaires.
${fewShotBlock}
Tu réponds UNIQUEMENT par un JSON strict de cette forme exacte (pas de markdown, pas de \`\`\`, pas de texte avant ni après) :

{
  "agree": "…",
  "disagree": "…",
  "add_value": "…",
  "ask_question": "…"
}`;

  const userMsg = hasContent
    ? `Voici le post à commenter :

"""
${args.contentExcerpt!.slice(0, 1500)}
"""

Génère les 4 commentaires maintenant, EN RÉAGISSANT À CE POST PRÉCIS (son sujet, pas un autre).`
    : `Le post ne contient pas de texte lisible (c'est probablement une image ou une vidéo, ex: une photo). Génère 4 réactions COURTES, chaleureuses et universelles qui conviennent à un post visuel, dans la langue ${language}. Reste léger et bienveillant. NE invente PAS de sujet, et SURTOUT PAS de contenu business/marketing/vente. Une réaction d'appréciation sincère, une réaction qui apporte une touche perso, un petit complément, une question légère et ouverte sur ce que montre le post.`;

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
  /** true = suivre la langue du post ; false = forcer `language`. */
  matchPostLanguage?: boolean;
  /** Réseau (linkedin, facebook, instagram...) pour adapter le registre. */
  network?: string | null;
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
