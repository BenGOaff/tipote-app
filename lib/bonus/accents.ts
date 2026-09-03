// lib/bonus/accents.ts
//
// LA COULEUR DES SECTIONS D'UN DOCUMENT GÉNÉRÉ.
//
// -- POURQUOI CE FICHIER EXISTE (Béné, 5 août 2026) -------------------
//
// J'avais rendu le document volontairement sobre, en invoquant son refus
// du 3 août ("sans forcément créer 4 cartes de couleurs trop IA"). Elle
// a corrigé :
//
//   "Oui mais ça c'était pour les quiz des users, ceux qu'ils affichent
//    à leurs visiteurs ! Dans l'Atelier tu peux te lâcher et réutiliser
//    le branding de l'Atelier et de Tiquiz ! Ça n'est pas montré aux
//    visiteurs de nos users !"
//
// Elle a raison, et c'est une distinction qui vaut pour tout ce qu'on
// dessine : la retenue chromatique protège le quiz d'une créatrice, qui
// doit ressembler à SA marque et pas à la nôtre. L'espace membre, lui,
// est notre produit : il a le droit d'avoir une identité.
//
// -- POURQUOI LES COULEURS VIVENT ICI ET PAS DANS LE COMPOSANT --------
//
// L'écran et le PDF doivent se ressembler. Deux palettes écrites
// séparément (des classes Tailwind d'un côté, des hexadécimaux de
// l'autre) divergeraient au premier ajustement, et personne ne s'en
// apercevrait avant d'imprimer. Ici, chaque accent porte les DEUX.
//
// Les classes sont écrites en toutes lettres, jamais construites par
// concaténation : Tailwind ne génère que ce qu'il voit dans le source,
// et une classe fabriquée à l'exécution sort sans style.

export type SectionAccent = {
  key: string;
  /** Pour le PDF, et pour tout ce qui a besoin de la valeur brute. */
  hex: string;
  /** L'en-tête de la carte. */
  head: string;
  /** La pastille numérotée. */
  badge: string;
  /** Le titre de la section. */
  title: string;
  /** Le filet d'un sous-titre, et les puces. */
  rule: string;
  /** Le libellé d'une étape. */
  step: string;
};

/**
 * Quatre accents, dérivés de la famille indigo de l'Atelier (le même
 * `#5D6CDB` que Tiquiz) et étalés vers le violet, le turquoise et
 * l'ambre. Assez proches pour rester une famille, assez distincts pour
 * qu'on repère une section d'un coup d'oeil.
 *
 * Quatre et pas huit : au delà, deux sections voisines se ressemblent,
 * et la couleur cesse d'être un repère pour devenir de la décoration.
 */
export const SECTION_ACCENTS: SectionAccent[] = [
  {
    key: "indigo",
    hex: "#5D6CDB",
    head: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900",
    badge: "bg-indigo-500 text-white",
    title: "text-indigo-950 dark:text-indigo-100",
    rule: "border-indigo-300 dark:border-indigo-700",
    step: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100",
  },
  {
    key: "violet",
    hex: "#8B5CF6",
    head: "bg-violet-50 dark:bg-violet-950/40 border-violet-100 dark:border-violet-900",
    badge: "bg-violet-500 text-white",
    title: "text-violet-950 dark:text-violet-100",
    rule: "border-violet-300 dark:border-violet-700",
    step: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100",
  },
  {
    key: "teal",
    hex: "#0D9488",
    head: "bg-teal-50 dark:bg-teal-950/40 border-teal-100 dark:border-teal-900",
    badge: "bg-teal-600 text-white",
    title: "text-teal-950 dark:text-teal-100",
    rule: "border-teal-300 dark:border-teal-700",
    step: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  },
  {
    key: "amber",
    hex: "#D97706",
    head: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900",
    badge: "bg-amber-600 text-white",
    title: "text-amber-950 dark:text-amber-100",
    rule: "border-amber-300 dark:border-amber-700",
    step: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  },
];

/**
 * L'accent d'une section, par sa position.
 *
 * Le cycle est volontairement stable : la section 1 est toujours à la
 * couleur de la marque, et regénérer un bloc ne redistribue pas les
 * couleurs sous les yeux de la créatrice. Un index négatif ou absurde
 * retombe sur le premier plutôt que de casser le rendu.
 */
export function sectionAccent(index: number): SectionAccent {
  const n = SECTION_ACCENTS.length;
  if (!Number.isFinite(index)) return SECTION_ACCENTS[0];
  const i = ((Math.trunc(index) % n) + n) % n;
  return SECTION_ACCENTS[i];
}
