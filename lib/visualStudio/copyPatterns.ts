// lib/visualStudio/copyPatterns.ts
//
// Formules de copywriting éprouvées, EXTRAITES des ressources Tipote
// (`tipote-knowledge/` : "145 accroches", "puces promesses", guide LinkedIn).
// On les fige ici en presets réutilisables et on les injecte comme EXEMPLES DE
// STYLE dans les prompts IA du studio (l'IA s'en INSPIRE pour la structure,
// elle ne recopie jamais le contenu — qui vient du post + de la voix de marque).
//
// Pourquoi figer plutôt que parser les .docx à la volée : les docs sont des
// .docx/.xlsx (parsing lourd, lent, coûteux à chaque génération). On a fait
// l'extraction une fois ; pour enrichir, on édite ce fichier.
//
// Les `[crochets]` sont des variables à remplir par l'IA depuis le post.

/** Gabarits d'ACCROCHE (titre stop-scroll). Source : 145-accroches-tunnels. */
export const HEADLINE_PATTERNS: string[] = [
  "Le secret bien gardé des [experts] pour [bénéfice]",
  "Une façon étonnamment simple de [bénéfice]",
  "[cible] : voici comment [bénéfice] au lieu de [inconvénient]",
  "La méthode peu connue pour [bénéfice]",
  "Le plan en [chiffre] étapes pour [bénéfice]",
  "Les [chiffre] leviers pour [bénéfice] sans [inconvénient]",
  "Comment [bénéfice] sans [échec redouté]",
  "Et si [situation] ne tenait qu'à [une chose] ?",
  "Laquelle de ces [chiffre] erreurs fais-tu quand tu veux [objectif] ?",
  "La nouvelle méthode pour [bénéfice] sans [frein principal]",
  "Pourquoi [croyance répandue] te coûte [conséquence]",
  "Ce que [référence/cible] font et que tu ne fais pas encore",
];

/** Structures de PUCES PROMESSES (bénéfice + curiosité). Source : puces_promesses. */
export const PROMISE_BULLET_PATTERNS: string[] = [
  "La méthode exacte pour [résultat] (modèle à copier-coller)",
  "Ce qu'il ne faut JAMAIS faire quand [situation], et pourquoi ça [conséquence]",
  "La seule façon de [résultat] sans [sacrifice]",
  "Comment [résultat surprenant] en [délai court]",
  "Le [petit détail] que [pourcentage] des [cible] ignorent",
  "INCLUS : la structure en [chiffre] étapes pour [résultat]",
  "Pourquoi [méthode classique] ne marche plus, et par quoi la remplacer",
];

/** Principes de copywriting (résumé des guides) — règles, pas des phrases. */
export const COPY_PRINCIPLES: string[] = [
  "Une accroche = un bénéfice concret OU une curiosité, jamais du vague.",
  "Parle au lecteur (tu/vous), pas de toi. Bénéfice avant fonctionnalité.",
  "Spécifique > générique : un chiffre, un délai, un cas réel valent mieux qu'un adjectif.",
  "Curiosité = ouvrir une boucle sans la refermer (le lecteur DOIT lire la suite).",
  "Pas de jargon, pas de mots pour faire malin : une idée claire par ligne.",
];

/** Construit un bloc d'EXEMPLES DE STYLE à coller dans un prompt. On échantillonne
 *  pour varier d'une génération à l'autre (déterministe si `seed` fourni). */
export function copyStyleHint(seed = Date.now()): string {
  const pick = (arr: string[], n: number) => {
    const start = Math.abs(seed) % arr.length;
    const out: string[] = [];
    for (let i = 0; i < Math.min(n, arr.length); i++) out.push(arr[(start + i) % arr.length]);
    return out;
  };
  return [
    "PROVEN COPY PATTERNS to take inspiration from (these are STRUCTURES — fill the [brackets] from the SOURCE, never copy them literally, never output brackets):",
    "Headlines: " + pick(HEADLINE_PATTERNS, 5).join(" / "),
    "Promise bullets: " + pick(PROMISE_BULLET_PATTERNS, 4).join(" / "),
    "Principles: " + COPY_PRINCIPLES.join(" "),
  ].join("\n");
}
