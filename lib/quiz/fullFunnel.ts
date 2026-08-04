// lib/quiz/fullFunnel.ts
//
// Le parcours ENTIER d'un visiteur, de son arrivée jusqu'à son email.
//
// -- POURQUOI (audit du quiz de Jocelyne, 4 août 2026) -----------------
//
// Elle a passé trois semaines à réparer une question qui n'avait rien.
// Ses vrais chiffres, une fois sortis :
//
//     142 arrivent  ->  ~66 commencent  ->  55 terminent  ->  55 laissent
//                                                              leur email
//
// Elle perdait donc environ la MOITIÉ de ses visiteurs avant même la
// première question, et huit fois moins sur l'ensemble de ses huit
// questions. Or la carte "funnel par question" commence à la question 1,
// et s'arrête à la dernière. **On lui montrait 14% de son problème**, et
// c'est dans ces 14% qu'elle a cherché.
//
// Ce n'est pas un défaut de calcul, c'est un défaut de cadrage : on avait
// les deux marches manquantes en base depuis toujours (les événements
// `view`, `start` et `complete`, et le compte de leads), on ne les
// mettait simplement pas dans la même image que les questions.
//
// -- CE QUE CE MODULE DÉCIDE ------------------------------------------
//
// Il assemble les trois sources en UNE liste d'étapes comparables, pour
// que la plus grosse fuite se voie, où qu'elle soit. Les seuils de
// lecture restent ceux de `funnelSignal.ts` : ce n'est pas parce qu'on
// élargit le cadre qu'on a le droit de conclure sur trois personnes.

import {
  MIN_LOST,
  MIN_SAMPLE,
  MIN_DROP_PCT,
  type FunnelStepLike,
} from "@/lib/quiz/funnelSignal";

export type FullFunnelStage =
  /** Ils ont ouvert le quiz. */
  | "arrival"
  /** Ils ont cliqué sur le bouton de départ. */
  | "start"
  /** Une question du quiz. */
  | "question"
  /** Ils ont laissé leur email. */
  | "capture";

export type FullFunnelStep = {
  stage: FullFunnelStage;
  /** Position de la question, seulement pour `stage === "question"`. */
  questionIndex: number | null;
  /** Personnes arrivées jusque là. */
  people: number;
  /** Perte vers l'étape suivante, en personnes. null sur la dernière. */
  lost: number | null;
  lostPct: number | null;
  /** true quand la perte mérite d'être regardée (mêmes seuils que le
   *  funnel par question : jamais de verdict sur une poignée de gens). */
  notable: boolean;
};

export type FullFunnelInput = {
  /** Vues trackées. Peut être 0 sur un quiz antérieur au tracking. */
  views: number;
  /** Démarrages. Peut être 0 pour la même raison. */
  starts: number;
  /** Étapes par question, déjà recalées sur les questions vivantes. */
  questions: readonly FunnelStepLike[];
  /** Leads captés. */
  leads: number;
  /** false quand les vues sont incomplètes : on n'affiche alors pas la
   *  marche d'arrivée plutôt que d'inventer une fuite. */
  viewsReliable: boolean;
};

/**
 * Assemble le parcours complet.
 *
 * Règles de prudence, dans l'ordre :
 * - une marche dont on n'a pas la donnée est ABSENTE, jamais à zéro
 *   (même règle que `hasData` sur les questions) ;
 * - une marche qui REMONTE (plus de gens qu'à l'étape d'avant) est
 *   gardée telle quelle, sans perte : ça arrive quand deux compteurs
 *   n'ont pas la même histoire, et l'inventer serait pire ;
 * - `notable` reprend les seuils de `funnelSignal.ts`.
 */
export function buildFullFunnel(input: FullFunnelInput): FullFunnelStep[] {
  const steps: Omit<FullFunnelStep, "lost" | "lostPct" | "notable">[] = [];

  if (input.viewsReliable && input.views > 0) {
    steps.push({ stage: "arrival", questionIndex: null, people: input.views });
  }
  // Le démarrage n'est affiché que s'il apporte quelque chose : sans vues
  // fiables, "X ont commencé" tout seul n'a pas de dénominateur.
  if (input.starts > 0) {
    steps.push({ stage: "start", questionIndex: null, people: input.starts });
  }
  for (const q of input.questions) {
    if (q.hasData === false) continue;
    steps.push({ stage: "question", questionIndex: q.questionIndex, people: q.views });
  }
  if (input.leads > 0) {
    steps.push({ stage: "capture", questionIndex: null, people: input.leads });
  }

  return steps.map((s, i) => {
    const next = steps[i + 1];
    if (!next) {
      return { ...s, lost: null, lostPct: null, notable: false };
    }
    const lost = s.people - next.people;
    if (lost <= 0 || s.people <= 0) {
      return { ...s, lost: 0, lostPct: 0, notable: false };
    }
    const lostPct = Math.round((lost / s.people) * 1000) / 10;
    return {
      ...s,
      lost,
      lostPct,
      notable: s.people >= MIN_SAMPLE && lost >= MIN_LOST && lostPct >= MIN_DROP_PCT,
    };
  });
}

/**
 * La marche qui perd le plus de MONDE, en valeur absolue.
 *
 * En valeur absolue, et pas en pourcentage : c'est toute la leçon du cas
 * Jocelyne. En pourcentage, une étape de fin de parcours où il ne reste
 * que six personnes peut afficher 17% et passer devant un écran d'accueil
 * qui perd la moitié de 142 visiteurs. Le pourcentage dit l'intensité, le
 * nombre de personnes dit l'enjeu, et c'est l'enjeu qui décide de ce
 * qu'on va corriger en premier.
 */
export function biggestLeak(steps: readonly FullFunnelStep[]): FullFunnelStep | null {
  let best: FullFunnelStep | null = null;
  for (const s of steps) {
    if (!s.notable || s.lost === null) continue;
    if (!best || s.lost > (best.lost ?? 0)) best = s;
  }
  return best;
}

/**
 * Le même parcours, écrit pour nos IA.
 *
 * Ce texte vit ICI et pas dans le prompt, parce qu'un prompt est du code
 * (cf. `tests/logic/quiz-prompt.test.mts`) et que celui-ci porte une
 * contrainte qu'on ne peut pas se permettre de perdre en le retouchant :
 * la marche prioritaire est CALCULÉE, le modèle n'a pas le droit d'en
 * choisir une autre.
 *
 * À un modèle qui reçoit un tableau de pourcentages et pour consigne
 * "nomme la fuite prioritaire", il reste toujours un maximum à nommer, et
 * ce maximum est presque toujours une étape de fin de parcours : il n'y
 * reste que quelques personnes, donc le moindre départ y pèse lourd en
 * pourcentage et rien du tout en enjeu. C'est exactement ce qui a envoyé
 * Jocelyne réécrire des questions pendant trois semaines pendant que la
 * moitié de ses visiteurs repartaient de l'écran d'accueil.
 */
export function renderFullFunnelVerdict(steps: readonly FullFunnelStep[]): string {
  if (steps.length === 0) return "";
  const lines = ["PARCOURS COMPLET (de l'arrivee a l'email) :"];
  for (const s of steps) {
    const perte =
      s.lost === null
        ? ""
        : s.lost === 0
          ? "  (aucune perte)"
          : `  -> ${s.lost} partent ensuite (${s.lostPct}%)`;
    lines.push(`- ${stageLabel(s)} : ${s.people}${perte}`);
  }
  lines.push("");

  const leak = biggestLeak(steps);
  if (!leak) {
    lines.push(
      "VERDICT DU PARCOURS (calcule, non negociable) :",
      "- Aucune marche ne perd assez de monde pour etre designee comme LA fuite. Ne fabrique pas un point de fuite : cherche les gains ailleurs (amener plus de monde, offre par profil, sequence email).",
    );
    return lines.join("\n");
  }

  const ou =
    leak.stage === "arrival"
      ? "L'ECRAN D'ACCUEIL. Ils ouvrent le quiz et repartent sans jamais cliquer sur commencer."
      : leak.stage === "start"
        ? "L'ENTREE DANS LE QUIZ. Ils cliquent sur commencer mais n'arrivent pas a la premiere question."
        : leak.stage === "capture"
          ? "L'ECRAN DE CAPTURE. Ils finissent le quiz et ne laissent pas leur email."
          : `LA QUESTION ${(leak.questionIndex ?? 0) + 1}.`;

  lines.push(
    "VERDICT DU PARCOURS (calcule, non negociable) :",
    `- LA plus grosse fuite du quiz : ${ou} ${leak.lost} personnes perdues sur ${leak.people} (${leak.lostPct}%).`,
    "- C'est CETTE marche qui devient la priorite du rapport. Tu n'as pas le droit d'en designer une autre, meme si une etape plus loin affiche un pourcentage superieur : une etape de fin de parcours porte sur beaucoup moins de monde, donc son pourcentage est spectaculaire et son enjeu minuscule.",
    "- Raisonne en NOMBRE DE PERSONNES quand tu chiffres le gain attendu, pas seulement en pourcentage.",
  );
  if (leak.stage === "arrival" || leak.stage === "start") {
    lines.push(
      "- Une fuite a l'entree ne se corrige PAS dans les questions. Elle se joue sur la promesse (titre, sous-titre), sur ce qu'on gagne a repondre, sur la duree annoncee, sur la visibilite du bouton, sur le temps de chargement, et sur l'accord entre ce qu'on a promis la ou le lien est publie et ce que le visiteur trouve en arrivant. Ne propose aucune modification de question a ce titre.",
    );
  }
  return lines.join("\n");
}

function stageLabel(s: FullFunnelStep): string {
  if (s.stage === "arrival") return "Arrivent sur le quiz";
  if (s.stage === "start") return "Cliquent sur commencer";
  if (s.stage === "capture") return "Laissent leur email";
  return `Q${(s.questionIndex ?? 0) + 1}`;
}
