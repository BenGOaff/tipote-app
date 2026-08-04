// lib/quiz/funnelSignal.ts
//
// Ce qu'on a le droit de conclure d'un funnel, et sur QUELLE question.
//
// -- LA BOUCLE DE JOCELYNE (4 août 2026) --------------------------------
//
// "J'avais une question sur laquelle il y avait vraiment une chute. À
// chaque fois que je changeais quelque chose sur les conseils du robot,
// ça restait bloqué dessus. Reformuler les quatre réponses, reformuler la
// question, remettre les réponses dans un autre ordre : j'ai tout fait,
// j'attendais trois quatre nouvelles personnes, même problème. Il m'a
// carrément conseillé de l'enlever, je l'ai enlevée, et ça continue à
// bloquer au même endroit, la question 7."
//
// Et le lendemain, l'information qui tranche : "mon premier quiz a 15
// questions, et globalement tous les gens qui le commencent le
// terminent." Ce n'était donc pas la longueur. Elle avait raison sur
// toute la ligne, et le problème était chez nous.
//
// TROIS DÉFAUTS EMPILÉS, DU PLUS GRAVE AU MOINS GRAVE.
//
// 1. ON DÉSIGNAIT LA MAUVAISE QUESTION. `views` d'une étape = les
//    sessions qui ont AFFICHÉ cette question. Quelqu'un qui abandonne
//    entre la Q6 et la Q7 a donc vu la Q6 et jamais la Q7 : il s'est
//    arrêté SUR la Q6. Le bandeau, lui, annonçait "Question 7 fait perdre
//    X% des visiteurs, c'est le point chaud à reformuler en priorité".
//    Jocelyne a donc réécrit, réordonné puis supprimé une question que
//    les partants n'avaient jamais lue. Aucune de ses corrections ne
//    pouvait produire le moindre effet, et quand elle a supprimé la Q7,
//    l'ancienne Q8 a pris sa place et le bandeau a redésigné "la 7".
//    C'est exactement ce qu'elle décrit, à la lettre.
//
// 2. AUCUN SEUIL D'ÉCHANTILLON. L'alerte partait à 15% de perte, quel
//    que soit le nombre de personnes. Sur une étape atteinte par 8
//    visiteurs, UNE personne vaut 12,5%, DEUX valent 25%. Le bandeau
//    rouge pouvait donc désigner deux personnes. Sur la page Mes stats
//    c'était pire : le badge sortait dès 1% de perte, sans aucun seuil.
//    Et comme le pourcentage se calcule sur l'effectif de l'étape
//    précédente, qui fond à mesure qu'on avance, l'alerte DÉRIVE
//    mécaniquement vers la fin du quiz sans rien devoir au contenu.
//
// 3. ON NE DISAIT PAS CE QU'ON SAVAIT. Chaque étape porte `views` ET
//    `answers`. La différence est le renseignement le plus utile du
//    funnel : ceux qui ont vu la question sans jamais y répondre butent
//    SUR elle (trop intime, incompréhensible, ou blocage technique) ;
//    ceux qui ont répondu puis ne sont pas arrivés à la suivante sont
//    partis APRÈS, de fatigue. Les deux appellent des corrections
//    opposées, et on n'affichait ni l'un ni l'autre.
//
// Fonction pure, testée : le bandeau de l'analytics, le badge de Mes
// stats et le prompt de l'IA appellent la MÊME décision. Un écran qui
// recalcule dans son coin finit toujours par mentir (cf. AGENTS.md, cinq
// fois de suite).

/** Visiteurs nécessaires sur l'étape pour qu'un pourcentage cesse de
 *  sauter à chaque individu. À 20, une personne pèse 5 points : elle ne
 *  peut plus, à elle seule, déclencher le seuil de 15%. */
export const MIN_SAMPLE = 20;

/** Personnes parties, en valeur absolue. Sous 5, on commente des
 *  individus, pas un comportement. C'est ce seuil qui neutralise la
 *  dérive vers la fin du quiz : là où il ne reste qu'une poignée de
 *  visiteurs, 5 départs au même endroit n'arrivent pas par hasard. */
export const MIN_LOST = 5;

/** Perte, en %, à partir de laquelle une chute mérite d'être signalée.
 *  Inchangé : c'est le seuil historique, ce sont les deux autres qui
 *  manquaient. */
export const MIN_DROP_PCT = 15;

export type FunnelStepLike = {
  questionIndex: number;
  views: number;
  /** Sessions ayant VALIDÉ cette question. Absent sur un très vieux
   *  déploiement : on ne diagnostique alors pas la forme de la chute. */
  answers?: number;
  /** false = question sans aucun event (ajoutée après coup). */
  hasData?: boolean;
};

/**
 * Ce que la chute raconte :
 * - `on-question`  : ils ont vu la question et n'y ont jamais répondu.
 *   Elle bloque (trop intime, pas comprise, ou blocage technique).
 * - `after-answer` : ils ont répondu puis ne sont pas arrivés à la
 *   suivante. Ils sont partis de fatigue, pas à cause de la question.
 * - `unknown`      : pas de donnée de réponses, on ne devine pas.
 */
export type HotspotShape = "on-question" | "after-answer" | "unknown";

export type FunnelHotspot = {
  /** La question sur laquelle ils se sont ARRÊTÉS : la dernière qu'ils
   *  aient vue. C'est elle qu'il faut regarder, et c'est la correction
   *  la plus importante de ce module. */
  questionIndex: number;
  /** Celle qu'ils n'ont jamais atteinte. Sert à la phrase, jamais au
   *  diagnostic : personne ne peut être rebuté par un texte non lu. */
  neverReachedIndex: number;
  /** Perte en % des visiteurs de la question. */
  dropPct: number;
  /** Perte en personnes. C'est ce chiffre qui empêche de confondre une
   *  tendance avec deux visiteurs. */
  lost: number;
  /** Visiteurs présents sur la question. */
  sample: number;
  shape: HotspotShape;
  /** Vus sans réponse : ils butent sur la question. */
  stuck: number;
  /** Ont répondu puis sont partis : fatigue. */
  leftAfter: number;
};

export type FunnelSignal = {
  /**
   * - `no-data` : rien à lire (aucune étape suivie).
   * - `too-few` : de la donnée, mais pas assez pour conclure.
   * - `steady`  : assez de monde, aucune chute anormale. Bonne nouvelle.
   * - `hotspot` : une vraie chute, et on peut la nommer.
   */
  kind: "no-data" | "too-few" | "steady" | "hotspot";
  /** Le plus gros effectif observé sur une étape. Sert à dire où elle en
   *  est ("tu en es à 8, il en faut 20"). */
  bestSample: number;
  /** Ce qu'il faut atteindre pour que la lecture tienne (= MIN_SAMPLE). */
  needed: number;
  /** Dernière question (index) jusqu'à laquelle la lecture est fiable,
   *  -1 si aucune. Au delà, l'effectif est trop mince pour conclure. */
  readableUntil: number;
  hotspot: FunnelHotspot | null;
};

/** Diagnostic de la forme d'une chute. `prev` est la question sur
 *  laquelle ils se sont arrêtés, `nextViews` l'effectif de la suivante. */
function diagnoseShape(
  prev: FunnelStepLike,
  nextViews: number,
): { shape: HotspotShape; stuck: number; leftAfter: number } {
  const answers = typeof prev.answers === "number" ? prev.answers : null;
  if (answers === null || answers <= 0) {
    // Pas de donnée de réponses (vieux déploiement, ou personne n'a
    // jamais validé cette question) : on ne devine pas.
    return { shape: "unknown", stuck: 0, leftAfter: 0 };
  }
  const stuck = Math.max(0, prev.views - answers);
  const leftAfter = Math.max(0, answers - nextViews);
  if (stuck === 0 && leftAfter === 0) return { shape: "unknown", stuck, leftAfter };
  return { shape: stuck >= leftAfter ? "on-question" : "after-answer", stuck, leftAfter };
}

/**
 * Dit ce qu'on a le droit de conclure d'un funnel.
 *
 * @param steps étapes issues de `buildLiveFunnel` (déjà recalées sur les
 *              questions ACTUELLES du quiz).
 */
export function readFunnelSignal(steps: readonly FunnelStepLike[]): FunnelSignal {
  const tracked = steps.filter((s) => s.hasData !== false);
  if (tracked.length === 0) {
    return { kind: "no-data", bestSample: 0, needed: MIN_SAMPLE, readableUntil: -1, hotspot: null };
  }

  let bestSample = tracked[0]!.views;
  let readableUntil = tracked[0]!.views >= MIN_SAMPLE ? tracked[0]!.questionIndex : -1;
  let hotspot: FunnelHotspot | null = null;

  for (let i = 1; i < tracked.length; i++) {
    const prev = tracked[i - 1]!;
    const cur = tracked[i]!;
    const sample = prev.views;
    if (sample > bestSample) bestSample = sample;
    if (cur.views >= MIN_SAMPLE) readableUntil = cur.questionIndex;

    if (sample < MIN_SAMPLE) continue;
    const lost = sample - cur.views;
    if (lost < MIN_LOST) continue;
    const dropPct = Math.round((lost / sample) * 1000) / 10;
    if (dropPct < MIN_DROP_PCT) continue;

    if (!hotspot || dropPct > hotspot.dropPct) {
      hotspot = {
        // La question qu'ils ont VUE en dernier, jamais la suivante.
        questionIndex: prev.questionIndex,
        neverReachedIndex: cur.questionIndex,
        dropPct,
        lost,
        sample,
        ...diagnoseShape(prev, cur.views),
      };
    }
  }

  if (hotspot) {
    return { kind: "hotspot", bestSample, needed: MIN_SAMPLE, readableUntil, hotspot };
  }
  // Assez de monde quelque part, mais aucune chute anormale : c'est un
  // verdict positif, pas une absence de verdict.
  if (bestSample >= MIN_SAMPLE) {
    return { kind: "steady", bestSample, needed: MIN_SAMPLE, readableUntil, hotspot: null };
  }
  return { kind: "too-few", bestSample, needed: MIN_SAMPLE, readableUntil, hotspot: null };
}

/**
 * Ce que PERD une question, pour l'affichage ligne à ligne.
 *
 * Attribué à la question elle-même (ceux qui l'ont vue et ne sont pas
 * arrivés à la suivante), et jamais à la suivante : c'est la même
 * correction que le hotspot. On rend TOUJOURS le nombre de personnes
 * avec le pourcentage, sinon "-25%" laisse croire à une tendance là où
 * il n'y a que deux visiteurs.
 *
 * @param position rang dans la liste des étapes SUIVIES (hasData).
 */
export function stepLoss(
  steps: readonly FunnelStepLike[],
  position: number,
): { pct: number; lost: number; sample: number } | null {
  const tracked = steps.filter((s) => s.hasData !== false);
  if (position < 0 || position >= tracked.length - 1) return null;
  const sample = tracked[position]!.views;
  const lost = sample - tracked[position + 1]!.views;
  if (sample <= 0 || lost <= 0) return null;
  return { pct: Math.round((lost / sample) * 1000) / 10, lost, sample };
}
