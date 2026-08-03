// lib/quiz/profileWinner.ts
//
// QUI GAGNE, EN MODE PROFILS, ET COMMENT ON DÉPARTAGE UNE ÉGALITÉ.
//
// Béné, 3 août 2026 : "le scoring du quiz par profil me parait assez
// aléatoire. Peut-être parce que j'ai importé mon quiz ? Faudrait
// vraiment pouvoir supprimer cette histoire d'ex aequo, c'est chiant à
// mourir."
//
// LA CAUSE, ET ELLE N'EST PAS L'IMPORT. En mode profils, chaque réponse
// donne une voix au profil que la créatrice lui a associé, et le profil
// le plus voté gagne. Jusqu'ici, une ÉGALITÉ se tranchait par l'ordre
// d'affichage des profils : `if (score > max)` en comparaison stricte,
// donc le premier profil de la liste gagnait toujours. Ce n'était pas
// une décision, c'était un effet de bord de la boucle.
//
// Vu du visiteur, ça donne exactement l'impression décrite : il répond
// autrement, il obtient le même profil. Vu de la créatrice, ça donne un
// bandeau rouge permanent qui liste des ex-æquo qu'elle ne sait pas
// corriger.
//
// CE QU'ON NE PEUT PAS FAIRE, ET IL FAUT LE DIRE. On ne peut pas
// "supprimer les ex-æquo" en redistribuant les points. En mode profils,
// chaque question donne son poids à UN seul profil : deux profils sont à
// égalité dès que deux sous-ensembles disjoints de questions ont la même
// somme. Les rendre tous différents impose des poids qui doublent à
// chaque question (1, 2, 4, 8, 16...), c'est à dire un quiz où la
// dernière question pèse plus que toutes les autres réunies. La
// créatrice n'écrirait plus un quiz, elle remplirait un tableur.
//
// CE QU'ON PEUT FAIRE, ET C'EST MIEUX : que l'égalité se tranche sur ce
// que le VISITEUR a répondu, au lieu de l'ordre des profils. L'ex-æquo
// existe toujours en théorie, il n'a plus d'effet visible, et le bandeau
// n'a plus de raison d'être.
//
// LA CHAÎNE DE DÉPARTAGE, dans l'ordre, chaque cran ne servant que si le
// précédent laisse une égalité :
//
//   1. le score total (inchangé) ;
//   2. le NOMBRE de voix : à points égaux, le profil choisi le plus
//      SOUVENT l'emporte sur celui choisi une fois très lourdement.
//      C'est la constance qui départage ;
//   3. la voix unique la plus forte : le profil choisi le plus
//      franchement (déjà présent depuis le retour Adeline) ;
//   4. la voix la plus RÉCENTE : la dernière fois que le visiteur a
//      penché de ce côté. Sur un quiz non pondéré, où 1, 2 et 3 sont
//      identiques pour tout le monde, c'est ce cran qui fait tout le
//      travail, et il dépend entièrement des réponses ;
//   5. l'ordre des profils, en tout dernier recours (deux profils
//      strictement indiscernables sur toute la copie).
//
// LE LECTEUR ET L'ANALYSEUR APPELLENT CETTE MÊME FONCTION. C'est la
// règle la plus chèrement apprise de ce dépôt : quand deux endroits
// recalculent la même décision, l'un des deux finit par mentir. Ici,
// l'analyseur d'ex-æquo de l'éditeur ne doit signaler QUE les égalités
// que le viewer ne saura pas trancher, sinon il alerte sur des cas qui
// n'arrivent jamais.

/**
 * Comment ce quiz tranche une égalité.
 *
 * `"first"` : l'ordre des profils, le comportement historique.
 * `"answers"` : la chaîne ci-dessus, à partir des réponses.
 */
export type TieBreak = "first" | "answers";

/**
 * Colonne `quizzes.tie_break`.
 *
 * Défaut `"first"` : AUCUN quiz existant ne change de résultat tant que
 * sa créatrice n'a rien demandé (colonne absente, valeur inconnue,
 * migration pas encore passée : comportement d'avant). Les quiz créés
 * après le 3 août naissent en `"answers"`.
 */
export function tieBreakMode(raw: string | null | undefined): TieBreak {
  return raw === "answers" ? "answers" : "first";
}

/** Une voix : une réponse choisie, et ce qu'elle apporte à un profil. */
export type ProfileVote = {
  /** Profil visé par la réponse choisie. */
  resultIndex: number;
  /** Poids de la réponse (`points`, 1 par défaut). */
  weight: number;
  /** Rang de la question dans le quiz. Sert au départage par récence. */
  questionIndex: number;
};

export type ProfileTally = {
  /** Score de chaque profil, dans l'ordre des profils. */
  scores: number[];
  /** Nombre de voix reçues par chaque profil. */
  votes: number[];
  /** Voix unique la plus forte reçue par chaque profil. */
  strongest: number[];
  /** Rang de la DERNIÈRE question ayant voté pour chaque profil (-1 si aucune). */
  lastVote: number[];
};

export function tallyVotes(votes: readonly ProfileVote[], resultCount: number): ProfileTally {
  const tally: ProfileTally = {
    scores: new Array(resultCount).fill(0),
    votes: new Array(resultCount).fill(0),
    strongest: new Array(resultCount).fill(0),
    lastVote: new Array(resultCount).fill(-1),
  };
  for (const v of votes) {
    const ri = v.resultIndex;
    if (ri < 0 || ri >= resultCount) continue;
    tally.scores[ri] += v.weight;
    tally.votes[ri] += 1;
    if (v.weight > tally.strongest[ri]) tally.strongest[ri] = v.weight;
    if (v.questionIndex > tally.lastVote[ri]) tally.lastVote[ri] = v.questionIndex;
  }
  return tally;
}

/**
 * Le profil gagnant, et les profils encore à égalité APRÈS départage.
 *
 * `tiedAfter` porte plus d'un index seulement quand deux profils sont
 * indiscernables sur toute la copie : même score, même nombre de voix,
 * même voix la plus forte, même dernière question. C'est ce tableau, et
 * lui seul, que l'éditeur doit signaler à la créatrice.
 */
export function pickProfileWinner(
  tally: ProfileTally,
  mode: TieBreak,
): { index: number; tiedAfter: number[] } {
  const n = tally.scores.length;
  if (n === 0) return { index: -1, tiedAfter: [] };

  // Les criteres, du plus fort au plus faible. En mode "first" on s'en
  // tient au score : c'est exactement la boucle historique.
  const criteria: (readonly number[])[] =
    mode === "answers"
      ? [tally.scores, tally.votes, tally.strongest, tally.lastVote]
      : [tally.scores];

  let best = 0;
  for (let i = 1; i < n; i++) {
    if (comparePositions(criteria, i, best) > 0) best = i;
  }

  const tiedAfter: number[] = [];
  for (let i = 0; i < n; i++) {
    if (comparePositions(criteria, i, best) === 0) tiedAfter.push(i);
  }
  // Une egalite a zero voix n'en est pas une : personne n'a rien choisi.
  if (tally.scores[best] <= 0) return { index: best, tiedAfter: [] };
  return { index: best, tiedAfter: tiedAfter.length > 1 ? tiedAfter : [] };
}

/** > 0 si `a` passe devant `b`, 0 si les deux sont indiscernables. */
function comparePositions(criteria: (readonly number[])[], a: number, b: number): number {
  for (const c of criteria) {
    if (c[a] !== c[b]) return c[a] > c[b] ? 1 : -1;
  }
  return 0;
}
