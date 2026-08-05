// lib/prompts/priority.ts
//
// UNE PRIORITÉ, PAS UNE LISTE.
//
// -- POURQUOI (Béné, 4 août 2026) -------------------------------------
//
// "Le coach n'est pas focus, il donne trop d'infos trop compliquées d'un
// coup. Il doit donner la bonne info au bon moment pour guider, pas
// assommer avec toute sa connaissance."
//
// Le rapport du 3 août à Jocelyne alignait cinq améliorations et cinq
// actions. La PREMIÈRE était la bonne : la fuite avant la question 1.
// Elle a travaillé la deuxième pendant trois semaines, sur trois
// personnes.
//
// Ce n'est pas de la générosité, c'est un tri qu'on lui demande de faire
// à notre place. Et quand quelqu'un trie dix conseils tout seul, il ne
// prend pas le plus rentable, il prend le plus facile.
//
// -- POURQUOI CE FICHIER, ET PAS LA MÊME PHRASE DANS CHAQUE PROMPT -----
//
// La règle existait déjà, écrite à la main dans l'analyse d'un quiz.
// Trois autres endroits produisent des conseils et ne l'avaient pas :
// la synthèse de sondage, le rédacteur affilié, l'assistant de création.
// La recopier à quatre endroits, c'est la garantie que la cinquième ne
// l'aura pas, et que les quatre premières auront divergé.
//
// C'est la même leçon que `evidence.ts`, que l'alignement du sous-titre,
// que les réseaux de partage : une règle qui vit à plusieurs endroits
// n'est pas une règle.
//
// -- ET LE PLAFOND VIT DANS LE CODE -----------------------------------
//
// Une consigne seule ne tient pas dans le temps : un modèle qui déborde
// doit être coupé par le code, pas seulement prié d'être bref. D'où
// `MAX_SECONDARY` et `capSecondary()`, à appliquer au parsing.

/** Plafond des listes secondaires. Trois, jamais plus. */
export const MAX_SECONDARY = 3;

/**
 * Le bloc à injecter dans tout prompt qui donne des conseils.
 *
 * Volontairement court. Chaque phrase interdit quelque chose de précis
 * ou dit quoi faire à la place ; une règle de trente lignes est relue en
 * diagonale par un modèle comme par un humain.
 */
export const PRIORITY_RULES = [
  "UNE PRIORITE, PAS UNE LISTE. C'est la regle la plus importante sur la FORME de ta reponse.",
  "- TON ROLE EST PEDAGOGIQUE, PAS ENCYCLOPEDIQUE. Tu ne deverses pas tout ce que tu sais : tu donnes la bonne information au bon moment, a quelqu'un qui avance pas a pas.",
  "- Tu designes UNE priorite unique, celle qui rapporte le plus par rapport a l'effort qu'elle demande, et tu la traites a fond : ce que c'est, pourquoi ca compte CHEZ ELLE avec ses chiffres ou son contexte, et comment s'y prendre concretement.",
  "- Le reste passe apres, et tu le dis. Trois points MAXIMUM par liste secondaire, jamais un doublon de la priorite. Si tu n'as que la priorite a dire, renvoie une liste vide : c'est un bon conseil, pas un conseil incomplet.",
  "- Personne n'appliquera dix conseils, il en appliquera un. Si tu ne choisis pas lequel, il choisira au hasard, souvent le plus facile plutot que le plus rentable. Choisir a sa place fait partie de ton travail.",
].join("\n");

/**
 * Coupe une liste secondaire à `MAX_SECONDARY`.
 *
 * À appeler au PARSING, pas seulement à l'affichage : ce qui n'est pas
 * coupé à la source finit par ressortir ailleurs (un export, un email,
 * un écran qu'on n'avait pas prévu).
 */
export function capSecondary<T>(items: readonly T[]): T[] {
  return items.slice(0, MAX_SECONDARY);
}

/**
 * La même règle, pour une SURFACE CONVERSATIONNELLE.
 *
 * Le bloc ci-dessus parle de "listes secondaires" et de JSON : donné tel
 * quel à un assistant qui discute, il ne veut rien dire. Les trois
 * variantes vivent dans CE fichier et pas dans les trois prompts, parce
 * que ce qui doit rester commun est la décision, pas la phrase.
 *
 * Ce que ça corrige ici : proposer plusieurs pistes et laisser choisir
 * sans dire laquelle on recommande, c'est le même tri qu'on délègue.
 * Elle doit garder le choix, elle ne doit pas le faire à l'aveugle.
 */
export const PRIORITY_RULES_CHAT = [
  "QUAND TU PROPOSES PLUSIEURS PISTES, DIS LAQUELLE TU RECOMMANDES.",
  "- Tu proposes au maximum trois options, jamais plus, et tu nommes celle que tu recommandes avec UNE phrase qui dit pourquoi, pour SON cas.",
  "- Le choix reste le sien : tu recommandes, tu n'imposes pas, et tu ne repars pas dans une comparaison de trois paragraphes.",
  "- Ne deverse pas tout ce que tu sais. Ce qui ne sert pas maintenant, tu le gardes pour quand ca servira.",
].join("\n");

/**
 * La même règle, pour un CONTENU produit (email, post, article, script).
 *
 * Un texte de vente qui empile dix arguments convertit moins bien qu'un
 * texte qui en porte UN et le tient jusqu'au bout. C'est la même
 * discipline, appliquée à ce qu'on écrit plutôt qu'à ce qu'on conseille.
 */
export const PRIORITY_RULES_CONTENT = [
  "UNE PROMESSE CENTRALE, PAS UN CATALOGUE.",
  "- Le texte porte UNE idee forte, choisie, et la tient du debut a la fin. Un empilement d'arguments dilue les meilleurs dans les autres et ne laisse rien en tete.",
  "- Les autres benefices, s'ils servent, viennent en appui de celui-la, jamais en concurrence.",
  "- Un seul appel a l'action, une seule chose a faire apres avoir lu.",
].join("\n");
