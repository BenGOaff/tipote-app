// lib/quiz/insights.ts (Tipote)
//
// Analyse IA STRATÉGIQUE d'un quiz ou d'un sondage : au-dela du detail
// des reponses (survey/analysis.ts), on donne a Claude le FUNNEL complet
// (visites, completion, capture), la distribution par profil de resultat,
// le drop-off par question et la distribution des reponses, pour produire
// un compte-rendu exploitable pour capter et vendre plus.
//
// Porte de Tiquiz, adapte au modele Tipote : leads dans la table `leads`
// (source='quiz', source_id=quizId, exported_sio), reponses de sondage
// dans quiz_leads (via aggregateSurvey). Appel Claude direct (tier opus).

import { resolveAnthropicModel } from "@/lib/anthropicModel";
import { buildClaudeMessageBody } from "@/lib/claudeRequest";
import { sanitizeAiText } from "@/lib/aiTextSanitizer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { stripHtml } from "@/lib/richText";
import { buildLiveFunnel } from "@/lib/quiz/funnel";
import { readFunnelSignal, type FunnelSignal, type FunnelStepLike } from "@/lib/quiz/funnelSignal";
import {
  readTrafficSource,
  renderTrafficForPrompt,
  sanitizeVisitMeta,
  type TrafficReading,
} from "@/lib/quiz/trafficSource";
import {
  biggestLeak,
  buildFullFunnel,
  renderFullFunnelVerdict,
  type FullFunnelStep,
} from "@/lib/quiz/fullFunnel";
import { aggregateSurvey, type AggregatedQuestion } from "@/lib/survey/analysis";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

export const INSIGHTS_MIN_LEADS = 5;
export const INSIGHTS_MIN_VIEWS = 20;

function getClaudeApiKey(): string {
  return (
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    ""
  );
}
function getAnalysisModel(): string {
  return resolveAnthropicModel(process.env.TIPOTE_SURVEY_AI_MODEL || process.env.ANTHROPIC_MODEL, "opus");
}

export interface QuizInsightsAggregate {
  title: string;
  mode: "quiz" | "survey";
  metrics: {
    views: number;
    viewsReliable: boolean;
    /** Clics sur le bouton de depart. La marche entre l'arrivee et la
     *  premiere question, la plus grosse de tout le parcours chez
     *  Jocelyne, et la seule qu'on ne montrait pas. */
    starts: number;
    completions: number;
    completionRate: number | null;
    leads: number;
    captureRate: number | null;
    exportedSio: number;
  };
  resultDistribution: { title: string; count: number; pct: number }[];
  funnel: { index: number; text: string; views: number; answers: number; dropPct: number }[];
  /** Verdict partage avec l'ecran de stats : ce qu'on a le droit de
   *  conclure, et sur QUELLE question (cf. lib/quiz/funnelSignal.ts).
   *  Sans lui, l'IA relisait les pourcentages bruts et prescrivait une
   *  reformulation sur trois visiteurs, en designant qui plus est la
   *  question suivante (drame Jocelyne, 4 aout 2026). */
  funnelSignal: FunnelSignal;
  /** Le parcours ENTIER : arrivee -> demarrage -> questions -> email.
   *  Le funnel par question ne montrait que le milieu, soit 14% du
   *  probleme chez Jocelyne (cf. lib/quiz/fullFunnel.ts). */
  fullFunnel: FullFunnelStep[];
  /** La marche qui perd le plus de MONDE, en personnes. C'est elle qui
   *  impose la priorite du rapport, l'IA n'a pas le droit d'en choisir
   *  une autre. */
  worstLeak: FullFunnelStep | null;
  /** D'ou viennent les visiteurs. Sans ca, l'IA ne peut pas distinguer
   *  "ta page decoit" de "ce ne sont pas les bonnes personnes", et les
   *  deux produisent exactement le meme chiffre. */
  traffic: TrafficReading;
  questions: AggregatedQuestion[];
  totalAnswered: number;
}

export interface QuizInsightsResult {
  summary: string;
  funnel: string;
  audience: string;
  /**
   * LA chose a faire maintenant, une seule.
   *
   * Retour Bene, 4 aout 2026 : "le coach n'est pas focus, il donne trop
   * d'infos trop compliquees d'un coup. Il doit donner la bonne info au
   * bon moment pour guider, pas assommer avec toute sa connaissance."
   *
   * Le rapport du 3 aout a Jocelyne alignait 5 ameliorations + 5 actions.
   * La premiere etait la bonne (la fuite avant la question 1). Elle a
   * travaille la deuxieme pendant trois semaines, sur trois personnes.
   * Dix conseils dans une reponse, ce n'est pas de la generosite : c'est
   * un tri qu'on lui demande de faire a notre place.
   */
  priority: { title: string; why: string; how: string } | null;
  /** Le reste, explicitement POUR PLUS TARD (2-3 puces maxi). */
  improvements: string[];
  /** Actions a l'imperatif pour vendre/capter plus (2-3 maxi). */
  actions: string[];
  stats_at_generation: { views: number; leads: number; completions: number };
  model: string;
  generated_at: string;
}

/** Agrege tout ce dont l'IA a besoin. `userId` scope la securite. */
export async function aggregateQuizInsights(
  quizId: string,
  userId: string,
): Promise<QuizInsightsAggregate | null> {
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id, title, mode, views_count, starts_count, completions_count")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== userId) return null;

  const mode = (String(quiz.mode ?? "quiz") === "survey" ? "survey" : "quiz") as "quiz" | "survey";

  // ── Leads (lifetime) + export SIO : table `leads` (modele Tipote) ──
  const [{ count: leadsCount }, { count: exportedCount }] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "quiz")
      .eq("source_id", quizId),
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", "quiz")
      .eq("source_id", quizId)
      .eq("exported_sio", true),
  ]);
  const leads = leadsCount ?? 0;
  const exported = exportedCount ?? 0;

  // ── Vues + completions : max(compteur denormalise, quiz_events) ──
  const [viewsEv, startsEv, completesEv] = await Promise.all([
    supabaseAdmin
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId)
      .eq("event_type", "view"),
    supabaseAdmin
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId)
      .eq("event_type", "start"),
    supabaseAdmin
      .from("quiz_events")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizId)
      .eq("event_type", "complete"),
  ]);
  const trackedViews = Math.max((quiz.views_count as number) ?? 0, viewsEv.error ? 0 : viewsEv.count ?? 0);
  const starts = Math.max((quiz.starts_count as number) ?? 0, startsEv.error ? 0 : startsEv.count ?? 0);
  const completions = Math.max((quiz.completions_count as number) ?? 0, completesEv.error ? 0 : completesEv.count ?? 0);

  const viewsReliable = trackedViews >= leads;
  const views = Math.max(trackedViews, leads);
  const captureRate = viewsReliable && views > 0 ? Math.round((leads / views) * 1000) / 10 : null;
  const completionRate = viewsReliable && views > 0 ? Math.round((completions / views) * 1000) / 10 : null;

  // ── Distribution par resultat (regle CLAUDE.md, quiz uniquement) ──
  const resultDistribution: { title: string; count: number; pct: number }[] = [];
  if (mode === "quiz") {
    const [byResultRes, currentRes] = await Promise.all([
      supabaseAdmin.rpc("quiz_leads_by_result", { p_user_id: userId, p_quiz_id: quizId, p_since: null }),
      supabaseAdmin.from("quiz_results").select("id, title").eq("quiz_id", quizId),
    ]);
    const byResultRows = (byResultRes.data ?? []) as {
      result_id: string | null;
      result_title: string | null;
      n: number;
    }[];
    const currentResults = (currentRes.data ?? []) as { id: string; title: string | null }[];
    const currentTitleById = new Map(currentResults.map((r) => [r.id, (r.title ?? "").trim()]));
    const currentTitles = new Set(currentResults.map((r) => (r.title ?? "").trim()).filter(Boolean));

    const NO_RESULT = "__no_result__";
    const byResult = new Map<string, { count: number; snapshotTitle: string | null }>();
    for (const r of byResultRows) {
      const key = r.result_id ?? NO_RESULT;
      const b = byResult.get(key) ?? { count: 0, snapshotTitle: null };
      b.count += Number(r.n);
      if (!b.snapshotTitle && r.result_title?.trim()) b.snapshotTitle = r.result_title.trim();
      byResult.set(key, b);
    }
    const byTitle = new Map<string, number>();
    for (const t of currentTitles) byTitle.set(t, 0);
    for (const [key, b] of byResult) {
      const live = key !== NO_RESULT ? currentTitleById.get(key) : undefined;
      if (live && currentTitles.has(live)) byTitle.set(live, (byTitle.get(live) ?? 0) + b.count);
      else if (b.snapshotTitle && currentTitles.has(b.snapshotTitle))
        byTitle.set(b.snapshotTitle, (byTitle.get(b.snapshotTitle) ?? 0) + b.count);
    }
    let matched = 0;
    for (const v of byTitle.values()) matched += v;
    for (const [title, count] of byTitle.entries())
      resultDistribution.push({
        title,
        count,
        pct: matched > 0 ? Math.round((count / matched) * 1000) / 10 : 0,
      });
    resultDistribution.sort((a, b) => b.count - a.count);
  }

  // ── Drop-off par question ──
  const funnel: QuizInsightsAggregate["funnel"] = [];
  let liveSteps: FunnelStepLike[] = [];
  let funnelSignal: FunnelSignal = {
    kind: "no-data",
    bestSample: 0,
    needed: 0,
    readableUntil: -1,
    hotspot: null,
  };
  try {
    const { data: funnelRows } = await supabaseAdmin.rpc("quiz_question_funnel_detail", {
      p_quiz_id: quizId,
      p_since: null,
    });
    const rows = (funnelRows ?? []) as { question_index: number; views: number; answers: number }[];
    const { data: qRows } = await supabaseAdmin
      .from("quiz_questions")
      .select("question_text, sort_order")
      .eq("quiz_id", quizId)
      .order("sort_order", { ascending: true });
    const texts = (qRows ?? []).map((q) =>
      stripHtml(String((q as { question_text?: string }).question_text ?? "")).trim(),
    );
    // Recalage sur les questions vivantes : une question supprimée ne doit
    // pas se retrouver dans le diagnostic de l'IA (cf. lib/quiz/funnel.ts).
    const { steps } = buildLiveFunnel(rows, texts.length);
    funnelSignal = readFunnelSignal(steps);
    liveSteps = steps;
    for (const step of steps) {
      if (!step.hasData) continue;
      funnel.push({
        index: step.questionIndex,
        text: texts[step.questionIndex] || `Question ${step.questionIndex + 1}`,
        views: step.views,
        answers: step.answers,
        dropPct: step.dropFromPrevious,
      });
    }
  } catch {
    // RPC absente : funnel vide, non bloquant.
  }

  // ── Le parcours ENTIER (arrivee -> demarrage -> questions -> email) ──
  //
  // Le funnel par question commence a la Q1 et s'arrete a la derniere :
  // chez Jocelyne, il montrait 14% du probleme. Les deux marches
  // manquantes etaient en base depuis toujours, on ne les mettait juste
  // pas dans la meme image.
  const fullFunnel = buildFullFunnel({
    views,
    starts,
    questions: liveSteps,
    leads,
    viewsReliable,
  });
  const worstLeak = biggestLeak(fullFunnel);

  // ── D'ou viennent-ils ? ──
  // Fenetre sur les dernieres vues : la provenance change a chaque
  // publication, un cumul melangerait des campagnes sans rapport.
  const trafficRes = await supabaseAdmin
    .from("quiz_events")
    .select("meta")
    .eq("quiz_id", quizId)
    .eq("event_type", "view")
    .not("meta", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  const traffic = readTrafficSource(
    (trafficRes.error ? [] : trafficRes.data ?? []).map((r) =>
      sanitizeVisitMeta((r as { meta?: unknown }).meta),
    ),
  );

  const survey = await aggregateSurvey(quizId, userId);

  return {
    title: stripHtml(String(quiz.title ?? "")).trim() || "Sans titre",
    mode,
    metrics: { views, viewsReliable, starts, completions, completionRate, leads, captureRate, exportedSio: exported },
    resultDistribution,
    funnel,
    funnelSignal,
    fullFunnel,
    worstLeak,
    traffic,
    questions: survey?.questions ?? [],
    totalAnswered: survey?.totalResponses ?? 0,
  };
}

/**
 * Traduit le verdict du funnel en une consigne que l'IA ne peut pas
 * contourner. On ne lui donne PAS le choix de designer une question : on
 * lui dit laquelle, ou on lui dit qu'il n'y a rien a designer.
 *
 * C'est la lecon du drame Jocelyne (4 aout 2026) : a un modele qui recoit
 * une liste de pourcentages et pour consigne "nomme le point de fuite
 * prioritaire", il reste toujours un maximum a nommer, meme sur trois
 * visiteurs. La retenue ne s'obtient pas en la demandant, elle s'obtient
 * en calculant le verdict AVANT.
 */
function renderFunnelVerdict(s: QuizInsightsAggregate["funnelSignal"]): string {
  if (s.kind === "hotspot" && s.hotspot) {
    const h = s.hotspot;
    const forme =
      h.shape === "on-question"
        ? `Ils VOIENT la Q${h.questionIndex + 1} et n'y repondent pas (${h.stuck} personnes) : c'est cette question qui bloque (trop intime, pas comprise, ou probleme technique).`
        : h.shape === "after-answer"
          ? `Ils REPONDENT a la Q${h.questionIndex + 1} puis s'arretent (${h.leftAfter} personnes) : la question passe bien, c'est la longueur ou ce qui vient apres qui les perd. Ne propose PAS de la reformuler.`
          : "";
    return [
      "VERDICT DU FUNNEL (calcule, a reprendre tel quel) :",
      `- Point de fuite : la question ${h.questionIndex + 1}. ${h.lost} personnes sur ${h.sample} s'y arretent (${h.dropPct}%).`,
      `- Ne parle JAMAIS de la question ${h.neverReachedIndex + 1} a ce sujet : les partants ne l'ont jamais affichee, ils ne peuvent pas avoir ete rebutes par un texte qu'ils n'ont pas lu.`,
      forme,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (s.kind === "steady") {
    return [
      "VERDICT DU FUNNEL (calcule, a reprendre tel quel) :",
      "- Aucun decrochage anormal. Le parcours des questions tient la route : dis-le, et cherche les gains AILLEURS (trafic, promesse d'entree, capture, offre par profil).",
    ].join("\n");
  }
  return [
    "VERDICT DU FUNNEL (calcule, a reprendre tel quel) :",
    `- PAS ASSEZ DE DONNEES pour designer une question. Le maximum atteint sur une etape est de ${s.bestSample} visiteurs, il en faut environ ${s.needed}.`,
    "- INTERDIT : nommer une question a corriger, parler de 'point de fuite', ou commenter un pourcentage de perte par question. Sur une poignee de visiteurs, une seule personne fait bouger un pourcentage de 12 points : ce serait de l'invention.",
    "- Dis-le franchement, explique en une phrase pourquoi, et oriente vers ce qui se joue AVANT : amener plus de monde sur le quiz.",
  ].join("\n");
}

function renderAggregateForPrompt(a: QuizInsightsAggregate): string {
  const m = a.metrics;
  const lines: string[] = [
    `${a.mode === "survey" ? "Sondage" : "Quiz"} : "${a.title}"`,
    "",
    "CHIFFRES (cumul depuis le debut) :",
    `- Vues${m.viewsReliable ? "" : " (partiellement trackees, taux a interpreter avec prudence)"} : ${m.views}`,
    ...(m.starts > 0 ? [`- Ont clique sur commencer : ${m.starts}`] : []),
    `- Completions : ${m.completions}${m.completionRate !== null ? ` (${m.completionRate}% des vues)` : ""}`,
    `- Leads captures : ${m.leads}${m.captureRate !== null ? ` (taux de capture ${m.captureRate}% des vues)` : " (taux de capture non fiable : vues incompletes)"}`,
    `- Leads exportes vers Systeme.io : ${m.exportedSio}`,
    "",
  ];
  if (a.resultDistribution.length > 0) {
    lines.push("PROFILS DE RESULTAT (repartition des leads) :");
    for (const r of a.resultDistribution) lines.push(`- ${r.title} : ${r.pct}% (${r.count})`);
    lines.push("");
  }
  // Le parcours entier AVANT le detail par question : c'est le cadrage
  // qui manquait, et il doit etre lu en premier.
  const parcours = renderFullFunnelVerdict(a.fullFunnel);
  if (parcours) {
    lines.push(parcours, "");
  }

  // Juste apres le parcours, parce que c'est la question suivante :
  // "et alors, c'est la page ou l'audience ?".
  lines.push(renderTrafficForPrompt(a.traffic), "");

  if (a.funnel.length > 0) {
    lines.push("DROP-OFF PAR QUESTION (sessions atteignant chaque question) :");
    for (const f of a.funnel)
      lines.push(`- Q${f.index + 1} ${f.text} : ${f.views} vues, ${f.answers} reponses`);
    lines.push("");
    lines.push(renderFunnelVerdict(a.funnelSignal));
    lines.push("");
  }
  if (a.questions.length > 0) {
    lines.push(`DISTRIBUTION DES REPONSES (${a.totalAnswered} participants ayant repondu) :`);
    for (const q of a.questions) {
      lines.push(`Q${q.index + 1}. ${q.text}  [${q.answeredCount}/${a.totalAnswered} ont repondu]`);
      for (const o of q.options) lines.push(`   - ${o.text} : ${o.pct}% (${o.count})`);
      if (q.average !== null && q.average !== undefined) lines.push(`   (note moyenne : ${q.average})`);
      if (q.textCount && q.textCount > 0) {
        const samples = (q.textSamples ?? []).slice(0, 12).map((s) => `"${s}"`).join(", ");
        lines.push(`   ${q.textCount} reponses libres. Echantillon : ${samples}`);
      }
    }
  }
  return lines.join("\n");
}

/** Appelle Claude (Opus) pour l'analyse strategique structuree. */
export async function generateQuizInsights(aggregate: QuizInsightsAggregate): Promise<QuizInsightsResult> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new Error("Claude API key missing");
  const model = getAnalysisModel();

  const system = [
    "Tu es un stratege d'acquisition qui aide un createur a tirer le maximum de son quiz (ou sondage) pour CAPTER et VENDRE plus.",
    "Tu t'appuies sur les bonnes pratiques d'un quiz lead-magnet : un quiz est une machine a leads (viser 20 a 50% de capture, pas 2% comme un PDF), on capture au pic de curiosite, chaque profil de resultat est un segment que l'on peut adresser avec une offre dediee, et on ameliore en continu en lisant le funnel (le point de fuite unique a corriger en priorite).",
    "Tu reponds en francais, ton direct et concret, tutoiement. Aucune formule d'introduction, aucun remplissage : chaque phrase est actionnable ou revelatrice.",
    "Tu te bases UNIQUEMENT sur les chiffres fournis, sans jamais inventer de donnees.",
    "REGLES de lecture des chiffres :",
    "- Un taux de capture sous ~10% = fuite a corriger (capture mal placee, promesse du resultat trop faible). 20%+ = bon, 40%+ = excellent.",
    "- UNE FUITE A L'ENTREE A DEUX CAUSES POSSIBLES, ET ELLES DONNENT LE MEME CHIFFRE : soit l'ecran d'accueil decoit, soit ce ne sont pas les bonnes personnes qui arrivent dessus. Tu ne tranches JAMAIS sans le bloc PROVENANCE DES VISITEURS. Quand il ne permet pas de trancher, tu dis les deux causes et tu proposes de les distinguer (etiqueter les liens avec utm_source, comparer les sources). Prescrire une reecriture de promesse sur un trafic hors sujet ne peut rien produire, et la creatrice en conclura que nos conseils ne servent a rien.",
    "- LE PARCOURS ENTIER PASSE AVANT LES QUESTIONS. Le quiz commence a l'ecran d'accueil, pas a la question 1. Le bloc VERDICT DU PARCOURS est CALCULE et non negociable : la marche qu'il designe EST la priorite du rapport. Une creatrice peut passer des semaines a reecrire des questions pendant que la moitie de ses visiteurs repartent avant d'en lire une seule.",
    "- LE FUNNEL PAR QUESTION : tu suis le bloc VERDICT DU FUNNEL a la lettre. Il est CALCULE, il n'est pas negociable, et il prime sur ta propre lecture des chiffres bruts. S'il dit qu'il n'y a pas assez de donnees, tu ne nommes AUCUNE question, meme si un pourcentage te saute aux yeux.",
    "- Perdre des gens en cours de quiz est NORMAL et SAIN : ceux qui s'arretent sont d'abord les visiteurs non qualifies, et le quiz fait son travail en les filtrant. Aucun quiz ne vise 100% de completion. Ne presente jamais un abandon comme une faute de la creatrice, ni un taux de completion imparfait comme un probleme a corriger.",
    "- PROTOCOLE DE MESURE, a rappeler des que tu proposes de modifier le quiz : UNE SEULE modification a la fois, puis attendre au moins 20 a 30 nouvelles reponses avant de juger. Enchainer plusieurs changements (le texte, les reponses, l'ordre) rend l'effet de chacun illisible, et juger sur 3 ou 4 personnes ne mesure que le hasard.",
    "- LE PARTAGE N'EST PAS UN LEVIER UNIVERSEL. Sur un sujet intime ou stigmatisant (sante, sante mentale, neuroatypie, argent, poids, sexualite, famille, echec), partager publiquement revient a s'exposer : un taux de partage bas n'y est ni un defaut du quiz ni un cadeau trop faible. Ne recommande pas d'augmenter le partage dans ce cas, propose plutot l'envoi a UNE personne (message prive, email), les groupes fermes, ou concentre-toi sur d'autres leviers.",
    "- Un profil de resultat sur-represente peut signaler une cible reelle a exploiter (offre dediee) OU un quiz mal equilibre : tranche selon le contexte.",
    "- Si les vues sont partiellement trackees, ne conclus pas sur le taux de capture, concentre-toi sur les leads et les profils.",
    "- Ne dis JAMAIS qu'une question est vide si des reponses sont indiquees.",
    "TON ROLE EST PEDAGOGIQUE, PAS ENCYCLOPEDIQUE. Tu ne deverses pas tout ce que tu sais : tu donnes la bonne information au bon moment. Une creatrice n'appliquera JAMAIS dix conseils, elle en appliquera un, et si tu ne choisis pas lequel, elle choisira au hasard, souvent le plus facile plutot que le plus rentable. Choisir a sa place, c'est ton travail.",
    "Tu designes donc UNE priorite unique, celle qui rapporte le plus par rapport a l'effort qu'elle demande, et tu la traites a fond : ce que c'est, pourquoi ca compte CHEZ ELLE avec ses chiffres, et comment s'y prendre concretement. Le reste passe apres, et tu le dis.",
    "Tu reponds STRICTEMENT en JSON valide, sans texte autour, au format :",
    '{ "summary": string, "funnel": string, "audience": string, "priority": { "title": string, "why": string, "how": string }, "improvements": string[], "actions": string[] }',
    "- summary : 2 a 4 phrases, le diagnostic global honnete (ce qui marche, ce qui coince). Commence par ce qui MARCHE quand quelque chose marche : une creatrice qui se croit nulle ne corrige rien.",
    "- funnel : 2 a 4 phrases sur le parcours ENTIER (arrivee -> demarrage -> questions -> email), ou on perd des gens et pourquoi. Cite les marches dans l'ordre pour qu'elle voie ou ca se joue vraiment.",
    "- audience : 2 a 4 phrases sur le profil des visiteurs deduit des resultats et des reponses (qui ils sont, ce qu'ils veulent). Si aucune donnee de profil, dis-le et propose comment en obtenir.",
    "- priority.title : LA seule chose a faire maintenant, en une phrase a l'imperatif. Elle porte OBLIGATOIREMENT sur la marche designee par le VERDICT DU PARCOURS quand il en designe une. Corriger une etape qui perd la moitie des visiteurs rapporte toujours plus : corriger une etape qui perd la moitie des visiteurs rapporte toujours plus que peaufiner une question qui en perd trois.",
    "- priority.why : 1 a 2 phrases, avec SES chiffres a elle, pour qu'elle voie l'enjeu. Donne le gain attendu en nombre de personnes, pas seulement en pourcentage.",
    "- priority.how : 2 a 4 phrases tres concretes sur la maniere de s'y prendre. Termine TOUJOURS en rappelant de ne changer que cette chose la, puis d'attendre 20 a 30 nouvelles reponses avant de juger.",
    "- improvements : 2 a 3 MAXIMUM, et uniquement ce qui vaut la peine APRES la priorite. Jamais un doublon de la priorite. Si tu n'as que la priorite a dire, renvoie un tableau vide : c'est un bon rapport, pas un rapport incomplet.",
    "- actions : 2 a 3 MAXIMUM, a l'imperatif, sur ce qui se joue APRES le quiz (offre par profil, sequence email, relance). Tableau vide si rien de solide a proposer.",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: controller.signal,
      body: JSON.stringify(
        buildClaudeMessageBody({
          model,
          max_tokens: 2000,
          temperature: 0.4,
          system,
          messages: [{ role: "user", content: renderAggregateForPrompt(aggregate) }],
        }),
      ),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { content?: Array<{ text?: string }> };
  const raw = (json.content ?? []).map((c) => c.text ?? "").join("").trim();
  const parsed = parseInsightsJson(raw);

  return {
    ...parsed,
    stats_at_generation: {
      views: aggregate.metrics.views,
      leads: aggregate.metrics.leads,
      completions: aggregate.metrics.completions,
    },
    model,
    generated_at: new Date().toISOString(),
  };
}

function parseInsightsJson(raw: string): {
  summary: string;
  funnel: string;
  audience: string;
  priority: { title: string; why: string; how: string } | null;
  improvements: string[];
  actions: string[];
} {
  let jsonStr = raw.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  if (!jsonStr.startsWith("{")) {
    const s = jsonStr.indexOf("{");
    const e = jsonStr.lastIndexOf("}");
    if (s >= 0 && e > s) jsonStr = jsonStr.slice(s, e + 1);
  }
  // Plafond a 3 cote CODE, pas seulement dans la consigne : un modele
  // qui deborde ne doit pas pouvoir re-assommer la creatrice.
  const MAX_SECONDARY = 3;
  const toArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => sanitizeAiText(String(x).trim())).filter(Boolean).slice(0, MAX_SECONDARY)
      : [];
  const toStr = (v: unknown): string => (typeof v === "string" ? sanitizeAiText(v.trim()) : "");
  try {
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    const p = (obj.priority ?? null) as Record<string, unknown> | null;
    const priority =
      p && typeof p === "object" && toStr(p.title)
        ? { title: toStr(p.title), why: toStr(p.why), how: toStr(p.how) }
        : null;
    return {
      summary: toStr(obj.summary),
      funnel: toStr(obj.funnel),
      audience: toStr(obj.audience),
      priority,
      improvements: toArr(obj.improvements),
      actions: toArr(obj.actions),
    };
  } catch {
    return {
      summary: sanitizeAiText(raw.slice(0, 800)),
      funnel: "",
      audience: "",
      priority: null,
      improvements: [],
      actions: [],
    };
  }
}
