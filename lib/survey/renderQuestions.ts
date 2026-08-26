// lib/survey/renderQuestions.ts (Tipote)
//
// CE QUE L'IA LIT DES RÉPONSES, ÉCRIT UNE SEULE FOIS.
//
// -- POURQUOI (26 août 2026) -------------------------------------------
//
// Trois écrans donnaient à Claude la même ligne, recopiée :
//
//     (note moyenne : 4.2)
//
// Sans son échelle. 4,2 sur 5 est un très bon score, 4,2 sur 10 est un
// mauvais score, et la ligne était identique dans les deux cas. Pire :
// une échelle porte des libellés que la créatrice écrit elle-même
// ("0 = je suis épuisée", "10 = je pète le feu"), et rien ne les
// transmettait. Sur une échelle de fatigue, une note HAUTE est une
// mauvaise nouvelle : l'IA n'avait aucun moyen de le savoir et
// félicitait la créatrice.
//
// Et la moyenne seule EFFACE le cas le plus intéressant. Une moyenne de
// 5 sur 10 peut venir de trente personnes à 5, ou de quinze à 0 et
// quinze à 10. Le premier cas est une audience tiède, le second est
// une audience coupée en deux : ce sont deux quiz différents, et deux
// conseils opposés. On envoie donc la RÉPARTITION à côté de la moyenne.
//
// Même chose pour les questions à plusieurs réponses possibles
// (`config.multi_select`) : leurs pourcentages se cumulent au delà de
// 100, et l'IA les lisait comme des parts d'un tout.
//
// -- LA RÈGLE ----------------------------------------------------------
//
// UNE fonction rend les questions pour le prompt : l'analyse de sondage
// (`lib/survey/analysis.ts`) et l'analyse stratégique du quiz
// (`lib/quiz/insights.ts`) l'appellent toutes les deux. C'est la même
// leçon que les réseaux de partage, le score et l'alignement du
// sous-titre : deux endroits qui calculent la même chose finissent
// toujours par diverger, et un seul des deux se fait corriger.
//
// Le module est PUR (aucun import de supabase) : c'est ce qui le rend
// testable, donc testé.

export type EchelleRendue = {
  min: number;
  max: number;
  /** Libellés des bornes, écrits par la créatrice. Ce sont EUX qui disent
   *  si une note haute est une bonne ou une mauvaise nouvelle. */
  minLabel?: string | null;
  maxLabel?: string | null;
};

export type QuestionPourPrompt = {
  index: number;
  text: string;
  type: string;
  options: { text: string; count: number; pct: number }[];
  average?: number | null;
  echelle?: EchelleRendue | null;
  /** Répartition des notes, valeur par valeur. Une moyenne seule cache
   *  une audience coupée en deux. */
  notes?: { valeur: number; count: number }[] | null;
  /** `config.multi_select` : les pourcentages se cumulent au delà de 100. */
  multiSelect?: boolean;
  textSamples?: string[];
  textCount?: number;
  answeredCount: number;
};

const NOM_DU_TYPE: Record<string, string> = {
  multiple_choice: "choix",
  image_choice: "choix illustré",
  yes_no: "oui / non",
  rating_scale: "échelle",
  star_rating: "étoiles",
  free_text: "réponse libre",
};

export function nomDuType(type: string | null | undefined): string {
  const t = String(type ?? "multiple_choice");
  return NOM_DU_TYPE[t] ?? t;
}

/**
 * Les bornes d'une échelle, LUES COMME LE VIEWER LES LIT.
 *
 * Les valeurs par défaut sont recopiées de `PublicQuizClient` (échelle :
 * 0 à 10 ; étoiles : 1 à `max`, 5 par défaut). Si elles divergeaient,
 * l'IA raisonnerait sur une échelle que le visiteur n'a jamais vue.
 */
export function resoudreEchelle(
  type: string | null | undefined,
  config: Record<string, unknown> | null | undefined,
): EchelleRendue | null {
  const t = String(type ?? "");
  if (t !== "rating_scale" && t !== "star_rating") return null;
  const cfg = (config ?? {}) as Record<string, unknown>;
  const nb = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const txt = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  if (t === "star_rating") {
    return { min: 1, max: nb(cfg.max) ?? 5, minLabel: null, maxLabel: null };
  }
  return {
    min: nb(cfg.min) ?? 0,
    max: nb(cfg.max) ?? 10,
    minLabel: txt(cfg.minLabel),
    maxLabel: txt(cfg.maxLabel),
  };
}

/** `config.multi_select` : plusieurs réponses possibles à une question. */
export function estMultiSelect(config: Record<string, unknown> | null | undefined): boolean {
  return (config ?? ({} as Record<string, unknown>)).multi_select === true;
}

/**
 * Prend au plus `max` éléments RÉPARTIS sur toute la liste, premier et
 * dernier compris. Les leads arrivent triés par date : prendre les 15
 * premiers, c'est ne lire que l'audience du jour du lancement, et
 * conclure sur elle. Déterministe (pas de tirage au sort) : deux
 * analyses du même sondage doivent citer les mêmes verbatims.
 */
export function echantillonReparti<T>(items: T[], max: number): T[] {
  if (max <= 0) return [];
  if (items.length <= max) return [...items];
  if (max === 1) return [items[0]];
  const pris: T[] = [];
  const pas = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    pris.push(items[Math.round(i * pas)]);
  }
  return pris;
}

/** Formate une moyenne AVEC son échelle. Jamais l'une sans l'autre. */
export function rendreMoyenne(average: number, echelle?: EchelleRendue | null): string {
  if (!echelle) return `note moyenne : ${average}`;
  return `note moyenne : ${average} sur ${echelle.max}`;
}

function rendreEnTete(q: QuestionPourPrompt, total: number): string {
  const bouts: string[] = [nomDuType(q.type)];
  if (q.multiSelect) bouts.push("PLUSIEURS réponses possibles, les % se cumulent au delà de 100");
  if (q.echelle) {
    let e = `de ${q.echelle.min} à ${q.echelle.max}`;
    const bas = q.echelle.minLabel?.trim();
    const haut = q.echelle.maxLabel?.trim();
    if (bas || haut) {
      e += ` (${q.echelle.min} = "${bas || "?"}", ${q.echelle.max} = "${haut || "?"}")`;
    }
    bouts.push(e);
  }
  return `Q${q.index + 1}. ${q.text}  [${q.answeredCount}/${total} ont répondu] (${bouts.join(" ; ")})`;
}

/**
 * Rend les questions pour le prompt. `samples` borne le nombre de
 * verbatims cités par question (budget de tokens), l'échantillon reste
 * réparti sur toute la période.
 */
export function renderQuestionsForPrompt(
  questions: QuestionPourPrompt[],
  total: number,
  opts?: { samples?: number },
): string[] {
  const maxSamples = opts?.samples ?? 15;
  const lines: string[] = [];
  for (const q of questions) {
    lines.push(rendreEnTete(q, total));
    if (q.answeredCount <= 0) {
      // Afficher ses options toutes à 0% se lirait "tout le monde a
      // répondu et personne n'a rien choisi". Même règle que les étapes
      // `hasData: false` du funnel : on dit qu'il n'y a pas de donnée.
      lines.push("   pas encore de réponse à cette question");
      lines.push("");
      continue;
    }
    for (const o of q.options) lines.push(`   - ${o.text} : ${o.pct}% (${o.count})`);
    if (q.average !== null && q.average !== undefined) {
      lines.push(`   ${rendreMoyenne(q.average, q.echelle)}`);
      // TOUTE l'échelle, les valeurs à zéro comprises : c'est le CREUX au
      // milieu qui fait voir une audience coupée en deux ("0 : 5, ..., 10 : 6"
      // ne se lit pas comme "5 : 11"). Filtrer les zéros effacerait
      // exactement l'information qu'on est venu chercher.
      const notes = q.notes ?? [];
      if (notes.some((n) => n.count > 0)) {
        const detail = notes.map((n) => `${n.valeur} : ${n.count}`).join(", ");
        lines.push(`   répartition des notes : ${detail}`);
      }
    }
    if (q.textCount && q.textCount > 0) {
      const tous = q.textSamples ?? [];
      const cites = echantillonReparti(tous, maxSamples);
      const suffixe =
        cites.length < q.textCount
          ? ` Échantillon de ${cites.length}, réparti de la première à la dernière réponse :`
          : " Les voici toutes :";
      lines.push(
        `   ${q.textCount} réponses libres au total.${suffixe} ${cites.map((s) => `"${s}"`).join(", ")}`,
      );
    }
    lines.push("");
  }
  return lines;
}

/**
 * Les règles de lecture qui vont AVEC ce format. Elles vivent ici parce
 * qu'elles décrivent ce que la fonction ci-dessus écrit : les séparer,
 * c'est se réveiller avec un prompt qui commente un format qu'on n'envoie
 * plus.
 */
export const ANSWER_READING_RULES = [
  "RÈGLES DE LECTURE DES RÉPONSES :",
  "- Chaque question affiche '[N/T ont répondu]' : N = personnes ayant répondu à CETTE question, T = total des participants. Si N > 0, la question A des réponses : ne dis JAMAIS qu'elle est vide.",
  "- Une moyenne ne veut rien dire sans son échelle. Cite-la TOUJOURS sous la forme '4,2 sur 10', jamais '4,2' tout seul.",
  "- Quand l'échelle porte des libellés, ce sont EUX qui disent si une note haute est une bonne ou une mauvaise nouvelle. Sur une échelle de fatigue ou de difficulté, une note haute est un problème : ne félicite pas la créatrice pour une moyenne élevée sans avoir lu ce que la borne haute veut dire.",
  "- La répartition des notes passe avant la moyenne. Deux groupes opposés (beaucoup de notes basses ET beaucoup de notes hautes) donnent la même moyenne qu'une audience tiède, et ce sont deux situations opposées : quand tu la vois, dis-le et parle des deux groupes.",
  "- Sur une question à PLUSIEURS réponses possibles, les pourcentages se cumulent au delà de 100 : ce ne sont pas des parts d'un tout, et '40%' ne veut pas dire que 60% ont choisi autre chose.",
  "- Les réponses libres sont une matière première, pas un décor : cite les mots des gens, c'est ce qui rend l'analyse utile. Quand seul un échantillon est fourni, il est réparti sur toute la période, mais reste un échantillon : n'en tire pas de pourcentage.",
  "- Pour les autres questions, les pourcentages sont calculés sur les répondants à cette question (pas sur le total), ils somment donc à 100% pour un choix unique.",
].join("\n");
