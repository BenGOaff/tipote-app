// lib/quiz/funnelCohort.ts
//
// ON N'ADDITIONNE JAMAIS DES GENS QUI N'ONT PAS RÉPONDU AU MÊME QUIZ.
//
// -- POURQUOI (Jocelyne, 4 août 2026, dernière couche) ------------------
//
// Prouvé sur ses données. Dans UNE SEULE semaine, sur un seul quiz :
// 9 sessions ont atteint la 9e question, 8 sessions ont plafonné à la 8e.
// Les secondes n'ont pas abandonné : la 9e question n'existait plus quand
// elles sont passées. Le graphique affichait pourtant une marche à cet
// endroit, et cette marche n'a jamais été produite par un visiteur.
//
// C'est général, et c'est vicieux : **toute modification de structure
// fabrique une fausse chute à l'endroit modifié**, et elle persiste tant
// que les anciennes sessions n'ont pas vieilli. Donc quelqu'un qui
// améliore son quiz voit une chute apparaître là où il vient de
// travailler, ce qui l'envoie corriger encore, ce qui fabrique une
// nouvelle chute. Jocelyne a tourné trois semaines dans cette boucle.
//
// Les deux correctifs précédents ne pouvaient pas l'attraper :
// `buildLiveFunnel` écarte les questions DISPARUES (drame Adeline) et
// `readFunnelSignal` exige un échantillon (drame Jocelyne du matin).
// Aucun des deux ne sait qu'une session a répondu à une AUTRE version.
//
// -- CE QU'ON AFFICHE (arbitrage Béné, 4 août 2026) --------------------
//
// Deux lectures côte à côte, jamais une seule :
//   - la COMPARABLE : les gens passés depuis la dernière modification ;
//   - le TOTAL : tout le monde, en disant combien ont vu une autre version.
//
// Béné a écarté l'option "cohorte propre uniquement" pour une raison qui
// n'est pas technique : elle punit exactement le bon comportement. On
// modifie son quiz un mardi, et le mardi soir l'écran ne montre plus rien.
// Quelqu'un qui vient de travailler deux heures mérite mieux que "reviens
// plus tard".
//
// **Le diagnostic, lui, ne se calcule QUE sur la cohorte comparable.**
// Le total est là pour le volume, jamais pour désigner une question.

/** Une étape de funnel, réduite à ce dont ce module a besoin. */
export type CohortStep = { views: number; hasData?: boolean };

/**
 * La structure a-t-elle changé entre deux enregistrements ?
 *
 * `before` : les ids des questions, dans l'ordre, tels qu'ils étaient.
 * `after`  : les ids dans le nouvel ordre, `null` pour une question neuve.
 *
 * On répond oui pour une AJOUTÉE, une SUPPRIMÉE, et aussi une DÉPLACÉE :
 * changer l'ordre change la position de tout ce qui suit, donc l'historique
 * d'avant ne se compare plus à celui d'après.
 *
 * Réécrire le texte d'une question ne compte PAS comme un changement de
 * structure : la question reste la même, à la même place, et son historique
 * reste comparable. C'est même exactement ce qu'on veut pouvoir mesurer.
 */
export function structureChanged(before: string[], after: (string | null)[]): boolean {
  // Une question neuve : les positions suivantes bougent forcément.
  if (after.some((id) => !id)) return true;
  // Une disparue.
  if (before.length !== after.length) return true;
  // Un déplacement.
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) return true;
  }
  return false;
}

/**
 * Depuis quand lire la cohorte comparable.
 *
 * On prend la PLUS RÉCENTE des deux bornes : la période choisie à l'écran
 * (7 / 30 / 90 jours) et la dernière modification de structure. Prendre la
 * plus ancienne laisserait rentrer les sessions d'une autre version, ce
 * qui est précisément le bug.
 *
 * `null` en sortie = aucune borne, donc "depuis toujours". C'est le repli
 * quand la colonne n'existe pas encore en base ou n'a jamais été remplie
 * (quiz jamais modifié depuis le déploiement) : on retombe alors sur le
 * comportement d'avant, jamais sur un écran vide.
 */
export function resolveCohortSince(
  periodSince: string | null | undefined,
  structureChangedAt: string | null | undefined,
): string | null {
  const a = validTime(periodSince);
  const b = validTime(structureChangedAt);
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

function validTime(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? raw : null;
}

export type FunnelCohort = {
  /** Personnes entrées dans le quiz DEPUIS la dernière modification. */
  comparable: number;
  /** Personnes entrées depuis le début (ou depuis la période choisie). */
  total: number;
  /**
   * Celles qui ont répondu à une AUTRE version. C'est ce nombre qui
   * justifie la séparation à l'écran : sans lui, deux chiffres différents
   * pour "la même chose" passent pour un bug.
   */
  stale: number;
  /**
   * Vrai quand la séparation ne sert à rien : structure jamais modifiée,
   * ou personne n'est passé avant. L'UI n'affiche alors qu'un seul chiffre,
   * comme avant.
   */
  singleVersion: boolean;
};

/**
 * Compare les deux lectures.
 *
 * On se base sur la PREMIÈRE étape qui porte de la donnée : c'est le
 * nombre de personnes entrées dans le quiz, donc le seul dénominateur
 * commun aux deux cohortes.
 *
 * `stale` ne peut pas être négatif. Il le deviendrait si la cohorte
 * comparable comptait plus de monde que le total, ce qui n'a pas de sens
 * mais reste possible sur deux requêtes prises à un instant différent.
 */
export function summarizeFunnelCohort(
  comparableSteps: CohortStep[],
  totalSteps: CohortStep[],
): FunnelCohort {
  const comparable = entryCount(comparableSteps);
  const total = entryCount(totalSteps);
  const stale = Math.max(0, total - comparable);
  return { comparable, total, stale, singleVersion: stale === 0 };
}

function entryCount(steps: CohortStep[]): number {
  for (const s of steps) {
    if (s.hasData === false) continue;
    return Math.max(0, Number(s.views) || 0);
  }
  return 0;
}
