// lib/charts/yAxis.ts
//
// LA PLACE RÉSERVÉE AUX NOMBRES À GAUCHE D'UN GRAPHIQUE.
//
// -- CE QU'ADELINE A VU (3 août 2026) ----------------------------------
//
// "Dans les statistiques, les nombres à gauche n'apparaissent pas bien en
// entier. Sur ordi on voit un peu mieux mais ils ne sont pas en entiers
// non plus."
//
// Sur sa capture, l'axe affiche `8`, `21`, `4`, `7`, `0`. Ce ne sont pas
// des valeurs : ce sont `28`, `21`, `14`, `7`, `0` amputées de leur
// premier chiffre. Une lecture fausse, pas seulement moche : la courbe
// semble plafonner à 8 alors qu'elle monte à 28.
//
// -- LA CAUSE ----------------------------------------------------------
//
// Recharts réserve la largeur des tags dans `YAxis width` (60 par
// défaut). Nos graphiques rognaient cette place DEUX fois :
//
//     <AreaChart margin={{ left: -16 }}>   // on décale tout vers la gauche
//     <YAxis width={32} />                 // et on rétrécit la gouttière
//
// Il restait 16 px pour écrire "421". Le texte est aligné à droite, donc
// c'est le DÉBUT du nombre qui sort du cadre SVG et disparaît. Le
// `margin.left` négatif est un raccourci qu'on trouve partout sur le web
// pour "coller le graphique au bord" : il marche tant que les valeurs
// tiennent sur un chiffre, et il ment dès que le compte monte. Adeline
// est simplement la première à avoir dépassé 9.
//
// -- ET C'ÉTAIT ÉCRIT CINQ FOIS ----------------------------------------
//
// `-16` sur Mes stats, `-12` dans l'analyse d'un quiz, `-20` sur le
// tableau de bord, `-24` dans l'éditeur. Quatre valeurs différentes pour
// une seule décision, deux `width={32}` sur quatre graphiques, aucune
// justification nulle part. C'est exactement la mécanique du "problème
// qui revient" déjà documentée pour l'alignement du sous-titre, les
// réseaux de partage et la disposition des réponses : **une décision
// recopiée dans chaque composant finit par être fausse dans au moins
// un.**
//
// -- LA RÈGLE ----------------------------------------------------------
//
// 1. `margin.left` vaut TOUJOURS 0. Jamais de valeur négative.
// 2. La gouttière de gauche se CALCULE depuis la plus grande valeur
//    affichée, avec `yAxisWidth()`, et se passe à `YAxis width`.
//
// Le test `tests/logic/chart-axis.test.mts` interdit le retour d'un
// `margin.left` négatif dans tout le repo.

/**
 * Largeur (px) à réserver à gauche pour que la PLUS GRANDE tag
 * s'affiche en entier.
 *
 * @param maxValue la plus grande valeur tracée, toutes séries confondues
 * @param fontSize la taille de police des ticks, celle passée au `YAxis`
 * @param suffix   ce que le `tickFormatter` ajoute au nombre ("%" ...)
 *
 * Fail-open : une valeur inconnue, négative ou illisible retombe sur la
 * largeur minimale. Mieux vaut une gouttière un peu large qu'un nombre
 * coupé, parce qu'un nombre coupé se lit comme un AUTRE nombre.
 */
export function yAxisWidth(
  maxValue: number | null | undefined,
  opts: { fontSize?: number; suffix?: string } = {},
): number {
  const fontSize = opts.fontSize && opts.fontSize > 0 ? opts.fontSize : 11;
  const suffix = String(opts.suffix ?? "");

  const value = Number(maxValue);
  const usable = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

  // Recharts écrit le nombre brut, sans séparateur de milliers. Le tick
  // du haut peut dépasser la donnée (l'échelle est arrondie vers le
  // haut), d'où le +1 sur la valeur avant de compter les chiffres.
  const chars = String(usable + 1).length + suffix.length;

  // 0.65 x la taille de police majore la largeur d'un chiffre dans les
  // polices du produit : mesuree a 0.636 dans Chromium sur la pile
  // `Inter, system-ui, ...`, on arrondit au dessus pour couvrir les
  // machines ou Inter n'est pas installee. 14 px couvrent le trait de
  // graduation et l'espace avant la courbe.
  const width = Math.ceil(chars * fontSize * 0.65) + 14;

  return Math.min(76, Math.max(30, width));
}

/**
 * La plus grande valeur d'un jeu de données, sur les séries données.
 *
 * Les SÉRIES SONT UN PARAMÈTRE OBLIGATOIRE, jamais devinées en lisant
 * toutes les clés des lignes : ces objets portent aussi des libellés,
 * des dates et parfois un pourcentage qui n'est pas tracé. Deviner
 * marcherait aujourd'hui et donnerait une gouttière absurde au premier
 * champ ajouté (leçon des contrôles "profil" appliqués à un quiz scoré).
 */
export function maxSeriesValue(
  rows: readonly Record<string, unknown>[] | null | undefined,
  keys: readonly string[],
): number {
  let max = 0;
  for (const row of rows ?? []) {
    if (!row) continue;
    for (const key of keys) {
      const value = Number(row[key]);
      if (Number.isFinite(value) && value > max) max = value;
    }
  }
  return max;
}
