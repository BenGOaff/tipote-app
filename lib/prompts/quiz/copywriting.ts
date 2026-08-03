// lib/prompts/quiz/copywriting.ts
//
// CE QUI FAIT QU'UN TITRE ACCROCHE, distillé des ressources de Béné
// (dossier `copywriting-claude/` du repo) : les 104 hooks viraux, la
// bibliothèque de triggers psychologiques, les structures de puces
// promesses, et le guide anti-style IA.
//
// POURQUOI DISTILLER PLUTÔT QUE COLLER LES RESSOURCES.
// Béné, 3 août 2026 : "ce serait pas mal d'upgrader la qualité des titres
// et sous-titres générés par l'IA, pour le moment ils sont pas ouf. Peut
// être en lui demandant de s'inspirer des 104 hooks."
//
// Coller 104 accroches littérales dans chaque prompt aurait deux effets,
// les deux mauvais : le coût en tokens sur CHAQUE génération, et surtout
// des quiz qui se ressemblent tous, parce qu'un modèle à qui on donne une
// liste finie recopie la liste. Ce qu'on veut transmettre, ce n'est pas
// le catalogue, c'est ce qui le rend efficace : les MÉCANIQUES.
//
// Chaque mécanique ci-dessous est nommée puis illustrée par un patron
// abstrait, jamais par une accroche à recopier. "[sujet]", "[douleur]",
// "[résultat]" sont des trous que le modèle remplit avec la vraie niche.
//
// Ce bloc est ajouté aux prompts qui écrivent des TITRES (le quiz, les
// questions, les profils, les quatre temps du résultat). Il ne touche
// pas au reste du prompt de génération, qui fonctionne bien.

/**
 * Mécaniques d'accroche + déclencheurs.
 *
 * Volontairement court : c'est un rappel de métier, pas un cours. Un
 * bloc long dilue les consignes vraiment discriminantes.
 */
export const HOOK_CRAFT_BLOCK = `ÉCRIRE DES TITRES QUI ACCROCHENT (déterminant) :
Un titre plat fait fermer l'onglet. Chaque titre doit ouvrir une boucle que seule la lecture referme. Sept mécaniques, à alterner pour ne pas produire quatre titres jumeaux :

1. LA CROYANCE RETOURNÉE : ce que la cible croit est faux, ou incomplet. "Ce qui t'empêche d'avoir [résultat], ce n'est pas [cause supposée]."
2. LE COÛT INVISIBLE : ce qu'elle perd sans le voir. "Ce que [comportement] te coûte chaque semaine."
3. LA RECONNAISSANCE : sa situation décrite si précisément qu'elle se dit "c'est moi". "Tu fais tout ce qu'il faut, et pourtant [problème]."
4. LA CAUSE NOMMÉE : le vrai blocage, plus précis que ce qu'elle en dit. "[cause précise], voilà ce qui bloque."
5. LE CHEMIN COURT : un nombre + une promesse crédible. "[N] étapes pour [résultat], dans cet ordre."
6. LA PERMISSION : lever la culpabilité. "Ce n'est pas toi le problème, c'est [vrai facteur]."
7. LE BÉNÉFICE DATÉ : le résultat rendu concret dans le temps. "[résultat] d'ici [délai réaliste]."

DÉCLENCHEURS à doser (jamais plus d'un par titre) : curiosité (une information manque), plausibilité (une promesse crédible convainc mieux qu'une promesse énorme), appartenance (elle n'est pas seule), bénéfice immédiat, autorité (une méthode nommée), preuve par le résultat.

RÈGLES DE FORME :
- Le titre parle à UNE personne, avec la forme d'adresse du quiz. Jamais "les entrepreneurs", toujours "toi" ou "vous".
- Du concret plutôt que de l'abstrait : une situation, un chiffre, un moment de la journée valent mieux qu'un adjectif.
- Longueurs VARIÉES d'un titre à l'autre. Quatre titres de même longueur et de même structure sonnent générés.
- Le vocabulaire de la niche, pas le vocabulaire du marketing.
- JAMAIS de promesse invérifiable, de superlatif creux ("révolutionnaire", "ultime", "incontournable"), ni de mot-valise ("optimiser", "booster", "libérer ton potentiel", "passer au niveau supérieur").
- JAMAIS le patron "Ce n'est pas X, c'est Y" en boucle : une fois dans tout le quiz, au maximum.`;

/**
 * Les 4 temps de la page de résultat.
 *
 * C'est ce qui est enseigné dans l'Atelier ("vendre avec un quiz"), et
 * c'est exactement là que Tiquiz n'était pas raccord : la page produisait
 * des blocs sans intention narrative, alors que l'élève venait
 * d'apprendre une progression précise.
 *
 * Le vocabulaire "miroir / cause / chemin / pont" est un OUTIL DE
 * RÉDACTION, jamais un contenu : ces mots ne doivent apparaître nulle
 * part dans le texte produit, sinon le visiteur lit le squelette au lieu
 * de lire le message.
 */
export const RESULT_BEATS_BLOCK = `PAGE DE RÉSULTAT — LES 4 TEMPS (structure obligatoire) :
Le résultat n'est pas une fiche descriptive, c'est une progression. Le visiteur doit se reconnaître, comprendre, se projeter, puis avoir envie de la suite. Quatre temps, dans cet ordre, chacun avec un TITRE et un TEXTE COURT.

1. LE MIROIR -> "title" + "description"
   Tu lui redis où il en est, avec SES mots. Il se reconnaît, donc il continue à lire.
   - "title" : le nom du profil. Court, incarné, valorisant même quand la situation ne l'est pas. Jamais un jugement ("Le Mauvais Vendeur"), jamais une étiquette froide ("Profil 2").
   - "description" : 2 à 3 phrases qui décrivent sa situation de façon si juste qu'il se dit "c'est exactement ça". Du concret, des situations vécues. Aucune solution ici, aucun conseil : uniquement le miroir.

2. LA CAUSE -> "insight_heading" + "insight"
   Tu nommes ce qui bloque vraiment. C'est souvent autre chose que ce qu'il croyait, et c'est ce décalage qui crée le déclic.
   - "insight_heading" : 3 à 7 mots qui annoncent la révélation, sans la donner.
   - "insight" : 2 à 3 phrases. Une seule cause, nommée précisément. Si elle contredit une croyance courante de la cible, dis-le franchement.

3. LE CHEMIN -> "projection_heading" + "projection"
   Tu montres les étapes pour s'en sortir. Il voit que c'est faisable, donc il se projette.
   - "projection_heading" : 3 à 7 mots qui annoncent une sortie concrète.
   - "projection" : 2 à 3 phrases. Des étapes réelles, dans l'ordre, avec un effort crédible. Pas de méthode miracle. Il doit se dire "je peux faire ça".

4. LE PONT -> "bridge_heading" + "bridge"
   Tu proposes la suite logique de ce qu'il vient de lire. PAS une pub.
   - "bridge_heading" : 3 à 7 mots qui font la jonction entre son chemin et ce que le créateur propose.
   - "bridge" : 2 à 3 phrases, ORIENTÉES BÉNÉFICES : ce qu'il aura, ce qu'il n'aura plus à faire, ce que ça change concrètement dans sa semaine. Le texte doit donner envie de cliquer le bouton qui suit, et rester cohérent avec le libellé de ce bouton ("cta_text"). Jamais de pression, jamais de fausse urgence, jamais "ne rate pas cette occasion".

INTERDIT ABSOLU : n'écris NULLE PART les mots "miroir", "cause", "chemin", "pont", "étape 1", "temps 1", ni aucun mot qui révèle cette structure. Ce sont mes noms de travail. Le visiteur doit lire un message qui coule, pas un plan.
Les quatre temps s'enchaînent : la cause répond à la description, le chemin répond à la cause, le pont prolonge le chemin. Relis-les à la suite : si on peut intervertir deux blocs sans que ça se voie, c'est raté.`;
