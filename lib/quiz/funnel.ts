// lib/quiz/funnel.ts
//
// Source de vérité du funnel par question : la liste ACTUELLE des
// questions du quiz, jamais les events seuls.
//
// Drame Adeline, 1er août 2026. Elle supprime la 10e question de son
// quiz. Les events historiques de `quiz_question_events` gardent leur
// `question_index = 9`, et la RPC `quiz_question_funnel_detail` liste
// les index PRÉSENTS DANS LES EVENTS (`SELECT DISTINCT question_index
// FROM evs`). Résultat : une "Question 10" fantôme, avec 33 vues et une
// "pire chute : 59% Q9 -> Q10" qui pointe une question qui n'existe
// plus, et un "restés jusqu'au bout : 33 / 86" calculé sur elle.
//
// Même famille de bug que la distribution par résultat (cf. AGENTS.md) :
// un snapshot d'événements confronté à une structure vivante. Même
// remède : on SEED sur la structure actuelle, et ce qui ne s'y rattache
// plus est exclu, silencieusement mais compté (`removedQuestions`) pour
// que l'interface puisse le dire honnêtement.
//
// Depuis le 1er août 2026, la RPC fait mieux que ça : les events portent
// `question_id` et la RPC traduit cet id en POSITION ACTUELLE. Une
// question déplacée, ou une question supprimée AU MILIEU, ne décale donc
// plus l'historique postérieur (cf. supabase/migrations/
// 20260801_question_identity.sql et lib/quiz/questionIdentity.ts). Les
// events écrits AVANT ce chantier n'ont pas d'id : ils restent lus par
// leur index, ce que ce module borne aux questions vivantes.
//
// La RPC renvoie une LIGNE SENTINELLE `question_index = -1` dont `views`
// porte le nombre de questions distinctes présentes dans l'historique
// mais absentes du quiz d'aujourd'hui. On la lit ici et on la transforme
// en `removedQuestions`, pour que l'UI puisse le dire honnêtement au lieu
// de faire disparaître des chiffres sans explication.

export type RawFunnelRow = {
  question_index: number;
  views: number | string;
  answers?: number | string;
};

export type LiveFunnelStep = {
  questionIndex: number;
  views: number;
  answers: number;
  /** Perte en % vs la dernière question qui avait de la donnée. */
  dropFromPrevious: number;
  /** false = aucune donnée d'event pour cette question (jamais atteinte,
   *  ou question ajoutée après coup). L'UI doit afficher un tiret, pas 0. */
  hasData: boolean;
};

export type LiveFunnel = {
  steps: LiveFunnelStep[];
  /** Nombre d'index d'events qui ne correspondent plus à aucune question. */
  removedQuestions: number;
};

/**
 * Recale un funnel brut (issu de la RPC) sur les questions existantes.
 *
 * @param rows           lignes de la RPC, un objet par index vu dans les events
 * @param questionCount  nombre de questions ACTUELLES du quiz
 *
 * Si `questionCount <= 0` (liste inconnue : erreur de lecture, quiz sans
 * questions chargées), on renvoie les lignes telles quelles : mieux vaut
 * la donnée brute qu'un écran vide.
 */
export function buildLiveFunnel(rows: RawFunnelRow[], questionCount: number): LiveFunnel {
  const byIndex = new Map<number, RawFunnelRow>();
  let removedQuestions = 0;

  for (const row of rows) {
    const idx = Number(row.question_index);
    if (!Number.isInteger(idx)) continue;
    // Ligne sentinelle de la RPC : `views` = nombre de questions de
    // l'historique qui n'existent plus dans le quiz actuel.
    if (idx === -1) {
      removedQuestions += Math.max(0, Number(row.views) || 0);
      continue;
    }
    if (idx < 0) continue;
    if (questionCount > 0 && idx >= questionCount) {
      // Repli pour une base dont la migration n'est pas encore appliquée :
      // la RPC renvoie alors des index bruts, y compris ceux des questions
      // supprimées. On les compte ici plutôt que de les afficher.
      removedQuestions += 1;
      continue;
    }
    byIndex.set(idx, row);
  }

  if (questionCount <= 0) {
    // Pas de structure de référence : on garde l'ordre des events.
    const sorted = [...byIndex.entries()].sort((a, b) => a[0] - b[0]);
    let prev = 0;
    const steps = sorted.map(([idx, row], i) => {
      const views = Number(row.views) || 0;
      const drop = i === 0 || prev <= 0 ? 0 : Math.max(0, Math.round(((prev - views) / prev) * 1000) / 10);
      prev = views;
      return {
        questionIndex: idx,
        views,
        answers: Number(row.answers ?? 0) || 0,
        dropFromPrevious: drop,
        hasData: true,
      };
    });
    return { steps, removedQuestions };
  }

  const steps: LiveFunnelStep[] = [];
  // `prev` = dernière valeur CONNUE. Une question sans donnée ne casse pas
  // la chaîne : la chute suivante se calcule sur la dernière vraie valeur,
  // sinon un trou ferait apparaître une chute de 100% puis une remontée.
  let prev: number | null = null;

  for (let idx = 0; idx < questionCount; idx++) {
    const row = byIndex.get(idx);
    if (!row) {
      steps.push({
        questionIndex: idx,
        views: 0,
        answers: 0,
        dropFromPrevious: 0,
        hasData: false,
      });
      continue;
    }
    const views = Number(row.views) || 0;
    const drop =
      prev === null || prev <= 0
        ? 0
        : Math.max(0, Math.round(((prev - views) / prev) * 1000) / 10);
    steps.push({
      questionIndex: idx,
      views,
      answers: Number(row.answers ?? 0) || 0,
      dropFromPrevious: drop,
      hasData: true,
    });
    prev = views;
  }

  return { steps, removedQuestions };
}

/** Nombre de visiteurs arrivés à la DERNIÈRE question qui a de la donnée.
 *  C'est ça, "restés jusqu'au bout" : pas la dernière ligne du tableau si
 *  elle est vide, et surtout pas une question supprimée. */
export function reachedLastQuestion(steps: LiveFunnelStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]!.hasData) return steps[i]!.views;
  }
  return 0;
}
