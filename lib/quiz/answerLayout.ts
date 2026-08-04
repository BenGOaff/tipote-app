// lib/quiz/answerLayout.ts
//
// LISTE OU COLONNES : UNE SEULE RÈGLE (retour Béné, 3 août 2026).
//
// "Le WYSIWYG de la présentation sous forme de liste ou de colonnes des
// réponses ne fonctionne pas : j'ai choisi liste et je vois toujours mes
// colonnes c'est PAS bon."
//
// Elle avait raison, et le viewer public n'y était pour rien : il lisait
// bien le réglage. C'est l'APERÇU de l'éditeur qui l'ignorait, avec sa
// propre règle écrite en dur :
//
//     q.options.length >= 3 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
//
// Aucune trace de `answer_layout` là dedans. Cocher "Liste" ne pouvait
// donc rien changer à l'écran, et pire : même en "Auto", les deux côtés
// ne répondaient pas la même chose, parce que le viewer comptait
// `options.length >= 3` à un endroit et l'éditeur à un autre.
//
// C'est la quatrième fois que le même défaut sort (les réseaux de
// partage, l'affichage du score, l'alignement du sous-titre) : quand
// l'aperçu recalcule une décision au lieu d'appeler la fonction du
// viewer, il finit toujours par mentir. D'où ce module, appelé par les
// DEUX.

export type AnswerLayout = "auto" | "grid" | "list";

/** Seuil du mode AUTO : en dessous, une colonne se lit mieux. */
const AUTO_GRID_MIN_OPTIONS = 3;

/**
 * Le réglage effectif pour une question donnée.
 *
 * L'override PAR QUESTION prime sur le réglage du quiz. Tout ce qui n'est
 * ni "grid" ni "list" ne surcharge rien : une valeur inconnue en base ne
 * doit pas décider de la mise en page.
 */
export function resolveAnswerLayout(
  quizLayout: string | null | undefined,
  questionOverride: unknown,
): AnswerLayout {
  if (questionOverride === "grid" || questionOverride === "list") return questionOverride;
  if (quizLayout === "grid" || quizLayout === "list") return quizLayout;
  return "auto";
}

/**
 * Les classes de grille des réponses.
 *
 * `list` force UNE colonne, sans condition : c'est le sens du mot, et
 * c'est ce que Béné attendait en le cochant. `grid` force deux colonnes
 * sur grand écran. `auto` suit le nombre de réponses.
 *
 * `stacked` sert l'aperçu mobile de l'éditeur : le canvas y est étroit,
 * donc les classes `sm:` du VIEWPORT resteraient actives et afficheraient
 * deux colonnes là où le téléphone réel n'en montre qu'une (même piège
 * que le split, retour Béné du 30 juillet). On rend alors la version
 * empilée, qui est ce que le visiteur verra vraiment.
 */
export function answerGridClass(
  layout: AnswerLayout,
  optionCount: number,
  opts: { stacked?: boolean } = {},
): string {
  if (opts.stacked) return "grid-cols-1";
  if (layout === "list") return "grid-cols-1";
  if (layout === "grid") return "grid-cols-1 sm:grid-cols-2";
  return optionCount >= AUTO_GRID_MIN_OPTIONS ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";
}

/**
 * Les réponses ILLUSTRÉES suivent la même règle, à une nuance près :
 * hors "list", elles passent en deux colonnes même à deux réponses, parce
 * qu'une vignette pleine largeur écrase le reste de l'écran.
 */
export function answerImageGridClass(
  layout: AnswerLayout,
  opts: { stacked?: boolean } = {},
): string {
  // `items-start` : depuis que l'image d'une reponse garde son format
  // reel (cf. lib/quiz/answerImage.ts), deux photos de formats differents
  // donnent deux cartes de hauteurs differentes. Sans ca, la grille les
  // etire a la hauteur de la plus grande et laisse un vide sous le texte.
  if (opts.stacked) return "grid-cols-1 items-start";
  return layout === "list"
    ? "grid-cols-1 items-start"
    : "grid-cols-1 sm:grid-cols-2 items-start";
}
