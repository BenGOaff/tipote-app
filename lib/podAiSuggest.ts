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
import { resolveAnthropicModel } from "@/lib/anthropicModel";
import { COMMENT_TONES, type CommentTone } from "@/lib/podBoost";
import { NATURAL_WRITING_BLOCK } from "@/lib/prompts/quiz/system";
import { sanitizeAiText } from "@/lib/aiTextSanitizer";

export type CommentSuggestions = Record<CommentTone, string>;

/** Cap de longueur du post envoyé au modèle. On ne "tronque" plus à
 *  1500 (un post LinkedIn riche dépasse souvent ça et perdait son
 *  contexte, retour Béné 18 juin 2026) : 8000 caractères couvrent la
 *  quasi-totalité des posts réels. C'est un simple garde-fou anti-abus,
 *  pas une troncature de confort. */
const MAX_POST_CHARS = 8000;

/** Garde-fou anti-abus sur la longueur d'UN commentaire généré. Ce n'est
 *  PAS une troncature de confort (Béné 18 juin 2026 : "un commentaire peut
 *  faire 3 mots comme 400 mots selon la valeur à apporter, on n'impose
 *  rien"). 3000 caractères couvrent largement un paragraphe développé sans
 *  jamais couper un commentaire naturel. */
const MAX_COMMENT_CHARS = 3000;

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
  disagree: "Intéressant, mais je vois les choses différemment : le contexte joue beaucoup ici.",
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

/** Brief par ton, injecté dans la consigne "Génère…". On ne décrit QUE
 *  les tons demandés (cf. `tones`) pour ne pas gaspiller de tokens à
 *  générer des commentaires que l'user n'a pas demandés (Béné 18 juin
 *  2026 : "si l'user clique 'je suis d'accord' on ne génère QUE celui-là"). */
const TONE_BRIEFS: Record<CommentTone, string> = {
  agree: `"agree" : tu appuies sincèrement le propos avec UN détail concret ou un ressenti vrai. Jamais lèche-bottes, jamais "excellent post".`,
  disagree: `"disagree" : tu ouvres l'échange en nuançant, sans arrogance ni condescendance. Tu prends position depuis TON vécu, sans laisser croire que tu fais le même métier que l'auteur.`,
  add_value: `"add_value" : tu complètes avec UNE remarque utile que l'auteur n'a pas évoquée. Pas de redite déguisée.`,
  ask_question: `"ask_question" : UNE question simple et sincère, celle qu'un vrai humain curieux poserait après avoir lu le post. Ancrée dans le post, sans jargon, jamais une question d'interview trop pointue.`,
};

/** Few-shot par ton : illustrent le TON et la STRUCTURE, domaine-neutre.
 *  On n'injecte que les exemples des tons demandés. Ils sont volontairement
 *  SPONTANÉS, écrits vite, comme un vrai commentaire tapé sur le pouce :
 *  jamais construits comme un article, un email ou un post (Béné 18 juin
 *  2026). disagree/ask_question évitent aussi de laisser croire qu'on
 *  exerce le même métier que l'auteur. */
const TONE_FEWSHOT: Record<CommentTone, string> = {
  agree: `agree (appui spontané, ton parlé) :
- "Ah ouais, complètement. C'est souvent le petit truc qu'on néglige qui change tout en fait."
- "Pareil pour moi, c'est pas évident au début mais une fois l'habitude prise on voit que ça marche."`,
  disagree: `disagree (désaccord posé, spontané, sans prétendre faire le même métier) :
- "Mmh, perso je le vis pas comme ça, chez moi c'est plutôt l'inverse qui s'est passé."
- "Pas convaincu sur ce point honnêtement, j'ai souvent vu le contraire. Après ça dépend peut-être du contexte."`,
  add_value: `add_value (apport spontané, balancé comme à l'oral, jamais en mode article) :
- "Un truc qui m'a aidé : commencer par le plus simple avant d'ajouter du compliqué. Bizarrement ça marche mieux."
- "J'ajoute juste un truc, ça marche carrément mieux quand c'est préparé en amont plutôt qu'à chaud. Je m'en suis rendu compte un peu tard mais ça change tout."`,
  ask_question: `ask_question (question simple et sincère, comme à l'oral) :
- "Ça t'a pris combien de temps avant de voir une vraie différence ?"
- "Curieux, c'était quoi le plus dur au début ?"`,
};

function buildPrompt(args: {
  contentExcerpt: string | null;
  language: string;
  commenter?: CommenterContext;
  /** Tons à générer. Défaut : les 4 (fan-out pod). En on-demand,
   *  l'extension n'en demande qu'UN (celui sur lequel l'user a cliqué). */
  tones?: CommentTone[];
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
  /** true si une image du post est jointe au message (vision). Sur les
   *  réseaux visuels, le commentaire doit réagir à CE QUE MONTRE
   *  l'image, pas inventer (Béné 13 juin 2026). */
  hasImage?: boolean;
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

  // Tons demandés (validés en amont). Défaut = les 4 (fan-out pod).
  const wanted = args.tones && args.tones.length ? args.tones : [...COMMENT_TONES];
  const multi = wanted.length > 1;
  const cmt = multi ? "les commentaires" : "le commentaire";

  const indicationsBlock = indications
    ? `\n### Indication EXPRESSE du commenter (priorité haute, à respecter)\n\n"${indications.slice(0, 400)}"\n`
    : "";

  // Consigne de langue. matchPostLanguage = on suit la langue du post
  // (la plus sûre, évite les commentaires FR sur post EN). Sinon langue
  // forcée par nom.
  const languageInstruction = args.matchPostLanguage
    ? hasContent
      ? `dans EXACTEMENT la même langue que le post (détecte-la depuis son contenu : post en anglais -> en anglais, en espagnol -> en espagnol, en chinois -> en chinois, etc.)`
      : args.hasImage
        ? `dans la langue du texte visible sur l'image si elle en contient ; sinon en ${language}`
        : `dans la langue ${language}`
    : `en ${language} (langue imposée par le commenter, même si le post est dans une autre langue)`;

  // Bloc langue DÉDIÉ et prioritaire. La consigne inline ne suffisait pas :
  // tout le system prompt + les few-shot étant rédigés en français, le
  // modèle retombait en français même sur un post EN/ZH/ES (retour Béné
  // 18 juin 2026 : "elle ne s'adapte pas à la langue du post"). On hisse
  // la règle de langue au rang de contrainte absolue et on précise
  // explicitement que le français qui l'entoure n'est QUE du style.
  const languageRuleBlock = `### RÈGLE DE LANGUE (ABSOLUE, PRIORITAIRE SUR TOUT LE RESTE)

- Tu rédiges ${cmt} ${languageInstruction}.
- Détecte la langue depuis le CONTENU RÉEL du post, jamais depuis cette consigne (elle est en français par convention interne).
- Les règles, exemples et libellés ci-dessous sont en français UNIQUEMENT pour illustrer le style : ils ne doivent JAMAIS influencer la langue de ta sortie.
- Post en anglais -> réponse 100% en anglais. Post en chinois -> 100% en chinois. Espagnol -> espagnol. Et ainsi de suite pour TOUTE langue.
- Ne mélange jamais deux langues.
`;

  // Few-shot : on n'injecte que les exemples des tons demandés (cf.
  // TONE_FEWSHOT). Domaine-neutre pour ne pas contaminer vers le jargon
  // B2B (drame Béné 13 juin 2026).
  const fewShotBlock = `\n### Exemples de TON et de STRUCTURE (français pour l'exemple uniquement : NE PAS recopier, NE PAS transposer le sujet, ne pas en hériter la langue)

${wanted.map((tone) => TONE_FEWSHOT[tone]).join("\n\n")}
`;

  const network = (args.network ?? "").toLowerCase();
  const networkLine =
    network && network !== "linkedin"
      ? `\n- Réseau : ${network}. Le registre est plus personnel et spontané que LinkedIn (souvent des posts photo, perso, lifestyle). Pas de jargon pro, pas de posture "expert".`
      : "";

  // Consigne "Génère…" adaptée au nombre de tons demandés. On ne décrit
  // QUE les tons demandés : si l'user a cliqué "je suis d'accord", on ne
  // génère pas les 3 autres (économie de tokens, Béné 18 juin 2026).
  const generateLine = multi
    ? `Génère ${wanted.length} suggestions de commentaire (sans hashtag${allowEmojis ? "" : ", sans emoji"}) ${languageInstruction}, une pour chacun des tons suivants :`
    : `Génère UN SEUL commentaire (sans hashtag${allowEmojis ? "" : ", sans emoji"}) ${languageInstruction}, pour le ton suivant :`;

  const jsonShape = `{\n${wanted.map((tone) => `  "${tone}": "…"`).join(",\n")}\n}`;

  const system = `Tu es un assistant qui aide à commenter rapidement un post sur les réseaux sociaux, comme si TU étais le commenter.

${languageRuleBlock}
${generateLine}

${wanted.map((tone) => `- ${TONE_BRIEFS[tone]}`).join("\n")}

### RÈGLE ABSOLUE : le sujet du commentaire = le sujet DU POST

- Le commentaire porte sur CE QUE RACONTE LE POST, rien d'autre. Tu réagis à SON sujet, pas au tien.
- Le métier / domaine du commenter (ci-dessous s'il est renseigné) sert UNIQUEMENT à choisir un angle crédible QUAND le sujet du post s'y prête. Si le post n'a aucun rapport avec ce métier, tu n'en parles PAS.
- Tu peux t'appuyer sur TON expérience, ta niche ou ton persona pour réagir, mais sans JAMAIS laisser croire que tu exerces le même métier que l'auteur, ni inventer une clientèle ou une activité que tu n'as pas. Reste honnête sur qui tu es : un freelance ne dit pas "les freelances que j'accompagne" s'il n'accompagne personne.
- INTERDICTION ABSOLUE de ramener le post à un sujet business/marketing/vente/génération de leads s'il ne parle pas de ça. Un post photo se commente comme un post photo, un post cuisine comme un post cuisine.${networkLine}
${contextBlock}${indicationsBlock}
${NATURAL_WRITING_BLOCK}

### Empathie + ressort humain (léger, jamais vendeur)

- Mets-toi VRAIMENT à la place de la personne : reconnais son effort, son émotion ou sa situation avant de réagir.
- Tu peux t'appuyer sur UN ressort humain qui sonne vrai (curiosité sincère, expérience partagée, sentiment d'appartenance, une émotion). JAMAIS de ressort commercial (rareté, urgence, promo, peur de rater, prix).

### Longueur (libre, tu t'adaptes, tu n'imposes rien)

- AUCUNE longueur imposée. Ça peut aller de 3 mots à un vrai paragraphe (plusieurs phrases), selon la valeur que tu as réellement à apporter.
- Court quand une réaction brève et sincère suffit. Plus développé seulement quand tu as un vrai apport (un exemple, une nuance, un retour d'expérience utile) qui mérite d'être détaillé.
- Jamais de remplissage pour faire long, jamais de coupe artificielle pour faire court. La longueur doit sembler naturelle, comme un humain qui écrit ce qu'il a à dire, ni plus ni moins.

### Règles de style

- Le commentaire sonne comme écrit PAR le commenter à la première personne, jamais comme une IA.
- Ça doit sonner SPONTANÉ, tapé vite, comme un commentaire qu'on laisse sur le pouce. Jamais construit comme un article de blog, un email ou même un post. Apporter de la valeur, oui, mais sans jamais perdre ce côté écrit sur le moment.
- Pas de "En effet", "Tout à fait", "Effectivement", "Très intéressant", "Merci pour le partage", "Belle réflexion" : formules creuses à bannir.
- Pas d'introduction inutile : on attaque DIRECTEMENT le fond.${multi ? "\n- Varie la longueur et l'angle des commentaires." : ""}
${fewShotBlock}
Tu réponds UNIQUEMENT par un JSON strict de cette forme exacte (pas de markdown, pas de \`\`\`, pas de texte avant ni après) :

${jsonShape}`;

  // Verbe d'action du message user, calé sur les tons demandés.
  const genVerb = multi
    ? `Génère les ${wanted.length} commentaires`
    : `Génère uniquement le commentaire de type "${wanted[0]}"`;
  const post = args.contentExcerpt?.slice(0, MAX_POST_CHARS) ?? "";

  // Construction du message user selon ce qu'on a : image (vision),
  // texte (légende), les deux, ou rien.
  let userMsg: string;
  if (args.hasImage && hasContent) {
    userMsg = `Une image du post est jointe ci-dessus. Légende / texte du post :

"""
${post}
"""

${genVerb} en réagissant À CE QUE MONTRE L'IMAGE et à la légende ensemble. Reste ancré dans ce post précis.

Rappel langue : rédige ${cmt} ${languageInstruction} (la langue du post ci-dessus).`;
  } else if (args.hasImage) {
    userMsg = `Une image du post est jointe ci-dessus (le post n'a pas de texte, c'est une publication visuelle). ${genVerb} en réagissant SINCÈREMENT À CE QUE MONTRE L'IMAGE (la scène, l'ambiance, un détail). Reste naturel, chaleureux, jamais business/marketing. Rebondis sur un élément concret de l'image, pas une généralité.`;
  } else if (hasContent) {
    userMsg = `Voici le post à commenter :

"""
${post}
"""

${genVerb} maintenant, EN RÉAGISSANT À CE POST PRÉCIS (son sujet, pas un autre).

Rappel langue : rédige ${cmt} ${languageInstruction} (la langue du post ci-dessus).`;
  } else {
    userMsg = `Le post ne contient pas de texte lisible (c'est probablement une image ou une vidéo, ex: une photo). ${genVerb} : ${multi ? "des réactions courtes" : "une réaction courte"}, chaleureuse${multi ? "s" : ""} et universelle${multi ? "s" : ""} qui conviennent à un post visuel, dans la langue ${language}. Reste léger et bienveillant. N'invente PAS de sujet, et SURTOUT PAS de contenu business/marketing/vente.`;
  }

  return { system, user: userMsg };
}

/** Parse la réponse Claude (JSON strict normalement). Robuste aux
 *  cas où Claude wrap quand même en markdown malgré la consigne.
 *  `wanted` = les tons attendus (on ne valide QUE ceux-là). */
function parseSuggestions(
  rawResponse: string,
  wanted: CommentTone[],
): Partial<CommentSuggestions> | null {
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
    const out: Partial<CommentSuggestions> = {};
    for (const k of wanted) {
      const v = parsed[k];
      if (typeof v === "string" && v.trim().length > 0) {
        // sanitizeAiText : strip em-dash, decorative emojis, double spaces.
        // Bene 7 juin 2026 : aucun em-dash ne doit survivre dans les
        // commentaires generes (signature LLM #1 qui ruine la credibilite).
        // Cap = garde-fou anti-abus seulement (PAS une troncature de
        // confort) : la longueur est libre et adaptative (Béné 18 juin 2026).
        out[k] = sanitizeAiText(v).slice(0, MAX_COMMENT_CHARS);
      } else {
        return null;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** Fallback statique restreint aux tons demandés. */
function fallbackFor(wanted: CommentTone[]): Partial<CommentSuggestions> {
  const out: Partial<CommentSuggestions> = {};
  for (const t of wanted) out[t] = FALLBACK_SUGGESTIONS[t];
  return out;
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
  /** Tons à générer. Défaut = les 4 (fan-out pod). En on-demand,
   *  l'extension n'en demande qu'UN (économie de tokens). */
  tones?: CommentTone[];
  /** Free-form user-supplied hint for this generation (regenerate flow). */
  indications?: string | null;
  /** true = suivre la langue du post ; false = forcer `language`. */
  matchPostLanguage?: boolean;
  /** Réseau (linkedin, facebook, instagram...) pour adapter le registre. */
  network?: string | null;
  /** Image du post (base64) pour la vision : Claude commente ce qu'elle
   *  montre. Crucial sur les réseaux visuels (FB/IG). */
  image?: { media_type: string; data: string } | null;
}): Promise<Partial<CommentSuggestions>> {
  // Tons validés : on ignore les valeurs inconnues, et on retombe sur les
  // 4 si rien de valide n'est demandé.
  const wanted = (args.tones ?? []).filter((t): t is CommentTone =>
    (COMMENT_TONES as readonly string[]).includes(t),
  );
  const tones = wanted.length ? wanted : [...COMMENT_TONES];

  let apiKey: string;
  try {
    apiKey = getClaudeApiKey();
  } catch (err) {
    console.warn("[podAiSuggest] no API key, returning fallback", err);
    return fallbackFor(tones);
  }

  const { system, user } = buildPrompt({ ...args, tones, hasImage: !!args.image });

  try {
    const text = await callClaude({
      apiKey,
      // Rédaction de commentaires = "contenu" : on prend TOUJOURS le
      // meilleur modèle Claude dispo (Opus 4.8), pas le Sonnet par défaut
      // (Béné 18 juin 2026 : "Claude dernier modèle pour la rédaction,
      // toujours"). Override possible via TIPOTE_COMMENT_MODEL.
      model: resolveAnthropicModel(process.env.TIPOTE_COMMENT_MODEL, "opus"),
      system,
      user,
      images: args.image ? [args.image] : undefined,
      // Longueur de commentaire libre (jusqu'à un paragraphe développé) :
      // on laisse de la marge pour ne jamais couper une sortie longue,
      // surtout en fan-out (4 commentaires d'un coup).
      maxTokens: 3000,
      // NB : Opus 4.7+ a retiré `temperature` de l'API Messages — callClaude
      // ne l'envoie pas pour ces modèles. Cette valeur ne s'applique donc
      // QUE si TIPOTE_COMMENT_MODEL pointe un modèle plus ancien (Sonnet…).
      temperature: 0.8,
      // Opus est un peu plus lent à streamer le 1er token : on laisse une
      // marge d'idle un peu plus large que sur Sonnet.
      idleTimeoutMs: args.image ? 40_000 : 30_000,
    });
    const parsed = parseSuggestions(text, tones);
    if (parsed) return parsed;
    console.warn("[podAiSuggest] failed to parse Claude response, fallback", text.slice(0, 200));
    return fallbackFor(tones);
  } catch (err) {
    console.warn("[podAiSuggest] Claude call failed, fallback", err);
    return fallbackFor(tones);
  }
}
