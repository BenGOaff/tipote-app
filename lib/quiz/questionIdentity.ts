// lib/quiz/questionIdentity.ts
//
// Identité stable des questions : source unique de vérité pour relier une
// donnée historique (event de funnel, réponse d'un lead) à une question
// ACTUELLE du quiz.
//
// Pourquoi ça existe (drame Adeline, 1er août 2026). Les données de
// tracking et les réponses des leads ne connaissaient la question que par
// sa POSITION (`question_index`). Supprimer la 10e question faisait
// apparaître une "Question 10" fantôme ; supprimer ou insérer une question
// AU MILIEU décalait silencieusement tout l'historique postérieur, et les
// chiffres devenaient faux sans que rien ne le signale.
//
// La correction complète tient en trois pièces, et les trois sont
// nécessaires :
//   1. `quiz_questions.id` est DURABLE. Le PATCH /api/quiz/[quizId] met à
//      jour les lignes existantes au lieu de tout supprimer puis
//      réinsérer, donc l'id d'une question survit à chaque sauvegarde.
//   2. Ce qui est écrit porte l'id : `quiz_question_events.question_id` et
//      `quiz_leads.answers[].question_id`.
//   3. Tout lecteur traduit cet id en POSITION ACTUELLE via ce module, et
//      ne retombe sur l'index que pour l'historique antérieur au chantier.
//
// Règle de lecture, dans cet ordre :
//   - `question_id` connu      -> position actuelle (suit renommage,
//                                 réordonnancement, insertion au milieu) ;
//   - `question_id` inconnu    -> la question a été supprimée : on EXCLUT
//                                 (jamais de bucket "ancienne question") ;
//   - pas d'id (legacy)        -> on garde l'index tant qu'il désigne une
//                                 question vivante, sinon on exclut.
//
// Fail-open : si on ne connaît pas la structure actuelle (lecture
// impossible, 0 question chargée), on renvoie l'index tel quel. Mieux vaut
// la donnée brute qu'un écran vide.

export type QuestionIdentityLike = {
  id?: string | null;
};

export type AnswerIdentityLike = {
  question_id?: string | null;
  question_index?: number | null;
};

/**
 * Map `question_id` -> position 0-based dans la liste ACTUELLE.
 * `questions` doit être trié par `sort_order` (l'ordre d'affichage).
 */
export function buildQuestionPositions(
  questions: ReadonlyArray<QuestionIdentityLike> | null | undefined,
): Map<string, number> {
  const positions = new Map<string, number>();
  if (!Array.isArray(questions)) return positions;
  questions.forEach((q, i) => {
    const id = typeof q?.id === "string" ? q.id : null;
    // Premier gagnant : un id dupliqué (ne devrait pas arriver, la colonne
    // est PK) ne doit pas faire glisser la position.
    if (id && !positions.has(id)) positions.set(id, i);
  });
  return positions;
}

/**
 * Position ACTUELLE d'une donnée historique, ou `null` si elle ne
 * correspond plus à aucune question vivante.
 *
 * @param questionCount nombre de questions actuelles. 0 = structure
 *                      inconnue -> on renvoie l'index brut (fail-open).
 */
export function resolveQuestionPosition(
  ref: AnswerIdentityLike | null | undefined,
  positions: Map<string, number>,
  questionCount: number,
): number | null {
  if (!ref) return null;

  const id = typeof ref.question_id === "string" && ref.question_id ? ref.question_id : null;
  if (id) {
    const pos = positions.get(id);
    // Id connu : la position actuelle fait foi, même après un
    // réordonnancement. Id inconnu : question supprimée, on exclut.
    return pos === undefined ? null : pos;
  }

  const idx = Number(ref.question_index);
  if (!Number.isInteger(idx) || idx < 0) return null;
  // Structure inconnue : on ne peut rien vérifier, on garde l'index.
  if (questionCount <= 0) return idx;
  return idx < questionCount ? idx : null;
}

/**
 * Construit la Map `position actuelle -> réponse` pour un répondant.
 * Remplace l'indexation naïve par `question_index`, qui attribuait les
 * réponses postérieures à la mauvaise question après une suppression au
 * milieu.
 */
export function indexAnswersByPosition<T extends AnswerIdentityLike>(
  answers: ReadonlyArray<T> | null | undefined,
  positions: Map<string, number>,
  questionCount: number,
): Map<number, T> {
  const byPos = new Map<number, T>();
  if (!Array.isArray(answers)) return byPos;
  for (const a of answers) {
    const pos = resolveQuestionPosition(a, positions, questionCount);
    if (pos === null) continue;
    // Une réponse portant un id gagne sur une réponse legacy qui tomberait
    // sur la même position (cas d'un lead hybride, en théorie impossible).
    if (byPos.has(pos) && !a?.question_id) continue;
    byPos.set(pos, a);
  }
  return byPos;
}
