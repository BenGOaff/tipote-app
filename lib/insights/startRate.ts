// lib/insights/startRate.ts
//
// LA PREUVE QU'ELLE A DÉJÀ : combien de gens cliquent sur "commencer",
// d'un de ses quiz à l'autre.
//
// -- POURQUOI (Jocelyne, 5 août 2026) ---------------------------------
//
// La veille, on avait fini par établir que sa vraie fuite était l'écran
// d'accueil : la moitié de ses visiteurs repartaient sans voir une
// question. Le message qui l'a fait bouger n'était pourtant pas celui
// là, c'était le suivant :
//
//     "sur ton quiz TDAH, 8 personnes sur 10 commencent le quiz, contre
//      5 sur 10 sur celui-ci."
//
// La différence entre les deux phrases est toute la différence entre un
// reproche et une piste. La première dit qu'elle a un problème. La
// seconde prouve qu'il est rattrapable, et par elle, puisqu'elle l'a
// déjà fait une fois. Personne ne retravaille une page d'accueil sur la
// foi d'un pourcentage ; on la retravaille quand on sait que 80% est
// atteignable parce qu'on l'a atteint.
//
// Aucune de nos deux IA ne pouvait la produire :
//   - l'analyse par quiz ne voit qu'UN quiz ;
//   - l'analyse globale les voit tous, mais ne lisait pas `starts_count`.
//     Elle avait les vues, les complétions et les leads. Jamais les
//     démarrages, donc jamais le seul chiffre qui parle de l'accueil.
//
// -- POURQUOI C'EST CALCULÉ ICI, ET PAS DEMANDÉ AU MODÈLE -------------
//
// Même raison que `funnelSignal` et `fullFunnel` : à un modèle qui
// reçoit une liste de taux et pour consigne "compare", il reste toujours
// deux nombres différents à comparer, même sur six visiteurs de chaque
// côté. La retenue ne s'obtient pas en la demandant, elle s'obtient en
// calculant le verdict avant, et en ne lui donnant que ce qu'il a le
// droit de dire.

import { MIN_SAMPLE } from "@/lib/quiz/funnelSignal";

/** Écart minimal, en POINTS, pour qu'une différence vaille d'être dite.
 *  En dessous, deux quiz ne sont pas "meilleur" et "moins bon" : ils
 *  sont pareils, et désigner un gagnant enverrait retravailler une page
 *  qui n'a rien. Même esprit que `MIN_DROP_PCT` sur le funnel. */
export const MIN_GAP_POINTS = 15;

/** Un projet tel que l'agrégat le connaît. */
export type StartRateProject = {
  title: string;
  mode: "quiz" | "survey";
  views: number;
  starts: number;
  /** false quand les vues sont incomplètes : aucun taux n'a de sens. */
  viewsReliable: boolean;
};

/** Un projet dont le taux de démarrage est LISIBLE. */
export type RatedProject = {
  title: string;
  views: number;
  starts: number;
  /** starts / views, en %, une décimale. */
  rate: number;
};

export type StartRateComparison =
  /** Aucun projet ne porte un taux lisible. */
  | { kind: "no-data"; rates: [] }
  /** Un seul : on peut le dire, on ne peut comparer à rien. */
  | { kind: "single"; rates: [RatedProject] }
  /** Plusieurs, mais aucun écart notable : ils se valent. */
  | { kind: "even"; rates: RatedProject[] }
  /** Plusieurs, et un écart qui mérite d'être nommé. */
  | {
      kind: "gap";
      rates: RatedProject[];
      best: RatedProject;
      worst: RatedProject;
      /** best.rate - worst.rate, en points. */
      gapPoints: number;
    };

/**
 * Le taux de démarrage d'un projet, ou null s'il n'est pas lisible.
 *
 * Les quatre exclusions, et chacune évite une phrase fausse :
 *
 * - un SONDAGE n'est pas comparable à un quiz. L'écran d'accueil y fait
 *   un autre travail (on répond pour aider, pas pour savoir quelque
 *   chose sur soi), et mettre les deux dans le même classement ferait
 *   désigner un "meilleur" qui ne joue pas le même match ;
 * - des VUES INCOMPLÈTES donnent un taux au dénominateur faux. C'est
 *   déjà la règle partout ailleurs ;
 * - MOINS DE `MIN_SAMPLE` VUES : sur 8 visiteurs, une personne pèse
 *   12 points, donc l'écart de 15 points se franchit tout seul. C'est
 *   exactement le défaut qui a coûté trois semaines à Jocelyne, dans
 *   l'autre sens ;
 * - ZÉRO DÉMARRAGE sur un quiz qui a des vues, ou PLUS de démarrages que
 *   de vues : ce n'est pas un taux de 0% ni de 130%, c'est du suivi
 *   absent ou deux compteurs qui n'ont pas la même histoire (un quiz
 *   antérieur au tracking, par exemple). Afficher 0% ferait désigner
 *   comme catastrophique un quiz dont on ne sait simplement rien.
 */
export function startRateOf(p: StartRateProject): RatedProject | null {
  if (p.mode !== "quiz") return null;
  if (!p.viewsReliable) return null;
  if (p.views < MIN_SAMPLE) return null;
  if (p.starts <= 0 || p.starts > p.views) return null;
  return {
    title: p.title,
    views: p.views,
    starts: p.starts,
    rate: Math.round((p.starts / p.views) * 1000) / 10,
  };
}

/**
 * Compare les quiz d'un même créateur entre eux.
 *
 * Entre EUX, et jamais à une moyenne : on n'a pas le droit de comparer
 * quelqu'un à d'autres créateurs (cf. `lib/prompts/evidence.ts`), mais
 * comparer ses propres quiz est un constat, pas une invention. C'est
 * même la seule comparaison honnête dont on dispose.
 */
export function compareStartRates(projects: readonly StartRateProject[]): StartRateComparison {
  const rates: RatedProject[] = [];
  for (const p of projects) {
    const r = startRateOf(p);
    if (r) rates.push(r);
  }
  rates.sort((a, b) => b.rate - a.rate);

  if (rates.length === 0) return { kind: "no-data", rates: [] };
  if (rates.length === 1) return { kind: "single", rates: [rates[0]] };

  const best = rates[0];
  const worst = rates[rates.length - 1];
  const gapPoints = Math.round((best.rate - worst.rate) * 10) / 10;
  if (gapPoints < MIN_GAP_POINTS) return { kind: "even", rates };
  return { kind: "gap", rates, best, worst, gapPoints };
}

/**
 * Le même verdict, écrit pour nos IA.
 *
 * `focusTitle` sert le rapport d'UN quiz : c'est là que la phrase a le
 * plus de valeur, parce que la créatrice est en train de regarder
 * précisément l'écran dont on lui dit qu'il est rattrapable.
 */
export function renderStartRateVerdict(
  c: StartRateComparison,
  focusTitle?: string | null,
): string {
  const head = "TAUX DE DEMARRAGE (combien de ceux qui arrivent cliquent sur commencer) :";

  if (c.kind === "no-data") {
    return [
      head,
      `- Aucun de ses quiz n'en a un de lisible (il faut au moins ${MIN_SAMPLE} vues fiables et des demarrages traces).`,
      "- INTERDIT de comparer ses quiz entre eux, ou d'affirmer que l'un demarre mieux qu'un autre.",
    ].join("\n");
  }

  const lines = [head, ...c.rates.map((r) => `- "${r.title}" : ${r.rate}% (${r.starts} sur ${r.views})`)];

  if (c.kind === "single") {
    lines.push(
      "- Un seul quiz mesurable : tu ne le compares a RIEN. Pas a une moyenne, pas a un autre createur, pas a un ordre de grandeur que tu aurais en tete.",
    );
    return lines.join("\n");
  }

  if (c.kind === "even") {
    lines.push(
      `- Ses quiz demarrent tous a peu pres pareil (moins de ${MIN_GAP_POINTS} points d'ecart). Ne designe ni meilleur ni moins bon : sur cet ecart la, ce n'est pas le contenu qui parle.`,
    );
    return lines.join("\n");
  }

  lines.push(
    `- ECART NOTABLE : "${c.best.title}" demarre a ${c.best.rate}%, "${c.worst.title}" a ${c.worst.rate}%, soit ${c.gapPoints} points.`,
    "- C'est SA propre preuve, et c'est ce qu'il faut lui dire : le taux le plus haut, c'est elle qui l'a obtenu, sur son sujet, avec son audience. Le plus bas est donc rattrapable, et elle sait deja faire.",
    "- Dis-le en personnes autant qu'en pourcentage, et nomme les deux quiz.",
    "- Ce que tu ne sais PAS : POURQUOI l'un demarre mieux. Tu n'as ni les deux ecrans sous les yeux, ni le public de chacun. Propose de comparer les deux accueils (le titre, la phrase en dessous, le bouton, l'image) comme une piste a suivre, jamais comme une cause etablie.",
  );

  const focus = focusTitle
    ? c.rates.find((r) => r.title === focusTitle)
    : undefined;
  if (focus && focus.title !== c.best.title && c.best.rate - focus.rate >= MIN_GAP_POINTS) {
    lines.push(
      `- LE QUIZ ANALYSE ICI ("${focus.title}", ${focus.rate}%) est du mauvais cote de cet ecart. Sers-t'en : "${c.best.title}" fait ${c.best.rate}%, donc l'objectif n'est pas theorique.`,
    );
  }
  return lines.join("\n");
}
