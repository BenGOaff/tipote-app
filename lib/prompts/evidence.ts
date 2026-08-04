// lib/prompts/evidence.ts
//
// La règle commune à toutes nos IA qui commentent des chiffres :
// **dire ce qu'on sait, dire ce qu'on suppose, et ne jamais confondre
// les deux.**
//
// -- POURQUOI (Jocelyne, 4 août 2026, et moi le même jour) ------------
//
// Le rapport IA du 3 août lui disait : "Retravailler la question 7,
// 6% de perte". Écrit comme un constat. En réalité c'était un artefact
// de calcul sur trois visiteurs, et la question désignée n'était même
// pas celle où les gens s'arrêtaient. Elle a réécrit, réordonné, puis
// supprimé cette question. Trois semaines.
//
// Le même jour, en cherchant la cause, j'ai moi-même affirmé à Béné que
// son titre était trop long, puis que son bouton passait sous la ligne
// de flottaison sur mobile. Deux hypothèses présentées comme des
// conclusions. Les deux étaient fausses, et elle a dû aller vérifier à
// ma place.
//
// C'est le même défaut, et il n'est pas propre aux modèles : une
// hypothèse formulée avec assurance se lit comme un fait, et la
// personne en face agit dessus. Le coût n'est pas l'erreur, c'est le
// temps qu'elle fait perdre à quelqu'un qui nous fait confiance.
//
// -- CE QUE LA RÈGLE EXIGE --------------------------------------------
//
// Elle ne demande pas d'être prudent, ce qui ne veut rien dire et
// produit des textes mous. Elle demande une chose précise et
// vérifiable : qu'une CAUSE ne soit jamais écrite au présent de
// l'indicatif comme une observation.
//
//     "48% repartent de ton écran d'accueil" : observation, elle est
//     dans les chiffres.
//     "parce que ta promesse est floue" : hypothèse, elle n'y est pas.
//
// La deuxième peut être utile, à condition d'être annoncée comme une
// piste et accompagnée du moyen de la vérifier.

/**
 * Le bloc à injecter dans tout prompt qui commente des chiffres.
 *
 * Volontairement court : une règle de trente lignes est relue en
 * diagonale par un modèle comme par un humain. Chaque phrase interdit
 * quelque chose de précis, ou dit quoi faire à la place.
 */
export const EVIDENCE_RULES = [
  "CE QUE TU SAIS, ET CE QUE TU SUPPOSES. La distinction est la regle la plus importante de ce prompt.",
  "- Un CONSTAT, c'est un chiffre qui t'a ete donne ici. Tu l'ecris tel quel, sans l'arrondir a ton avantage et sans le transformer en tendance.",
  "- Une CAUSE n'est JAMAIS un constat. Tu ne sais pas POURQUOI les gens partent : tu ne vois ni leur ecran, ni ce qu'on leur a promis avant, ni ce qu'ils cherchaient. Quand tu en proposes une, tu l'annonces comme une piste (\"le plus probable est que\", \"a verifier en premier\") et tu dis COMMENT la verifier.",
  "- INTERDIT : inventer un chiffre, une moyenne du secteur, un pourcentage \"habituel\", une comparaison avec d'autres createurs, ou un resultat attendu apres correction. Tu n'as aucune de ces donnees. Une moyenne inventee est la faute la plus grave possible ici, parce qu'elle est invérifiable et qu'elle sert a juger quelqu'un.",
  "- INTERDIT : presenter au present de l'indicatif ce que tu deduis. \"Ton titre est trop long\" est une affirmation ; \"ton titre fait 90 caracteres, ce qui peut expliquer X, regarde d'abord si\" en est une autre.",
  "- Quand une donnee te MANQUE, dis-le en une phrase et dis ce qu'il faudrait pour l'avoir. Ne comble jamais un trou par une generalite de methode : ca sonne juste, ca ne parle pas de SON projet, et la personne va l'appliquer pour rien.",
  "- Une seule chose compte plus que d'avoir raison : ne pas envoyer quelqu'un travailler des semaines sur une piste que tu as fabriquee.",
].join("\n");

/**
 * La même règle, pour un prompt qui n'a REÇU aucun chiffre.
 *
 * Sans elle, un modèle à qui on demande un diagnostic sans données ne
 * répond pas "je ne sais pas" : il récite la méthode avec assurance.
 */
export const NO_DATA_RULES = [
  "TU N'AS PAS DE CHIFFRES. Tu ne fabriques donc AUCUN diagnostic.",
  "- Tu ne nommes aucune etape, aucune question, aucun taux.",
  "- Tu le dis en une phrase, tu expliques ce qu'il faudrait pour que tu puisses aider, et tu aides sur ce qui ne depend pas des chiffres : la promesse, la structure, l'offre.",
].join("\n");
