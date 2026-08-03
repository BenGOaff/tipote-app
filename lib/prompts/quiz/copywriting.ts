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
export const RESULT_BEATS_BLOCK = `PAGE DE RÉSULTAT : LES 4 TEMPS (structure obligatoire) :
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

// ── Le sous-titre de l'écran d'accueil ──────────────────────────────
//
// Béné, 3 août 2026 : "à chaque fois, l'IA génère un truc comme ça dans
// le sous titre du quiz : '9 questions, un diagnostic, un truc concret à
// faire ce soir.' Franchement on s'en fout du nombre de questions."
//
// POURQUOI ÇA ARRIVAIT. Aucune ligne du prompt ne demandait le nombre de
// questions. Le problème était l'inverse : rien ne disait ce que le
// sous-titre DOIT contenir. Les deux seules consignes le concernant
// étaient "accrocher en 1-2 phrases" et "texte d'intro engageant". À un
// modèle à qui on demande d'être "engageant" sans dire sur quoi, il ne
// reste que les faits qu'il a sous la main, et "NOMBRE DE QUESTIONS : 9"
// est écrit dans le brief. Il recopiait la fiche technique.
//
// CE QU'ELLE VEUT, mot pour mot : "une phrase simple qui explique le
// bénéfice pour le visiteur à faire le quiz (découvre pourquoi... regarde
// si tu... apprenez comment... en 2mn, 5mn... et recevez le bonus promis
// par l'user)".
//
// Noter que la DURÉE est voulue : c'est une info qui lève une objection
// ("ça va me prendre combien de temps ?"). C'est le nombre de questions
// qui ne dit rien au visiteur. Les deux se ressemblent, et les confondre
// referait le bug dans l'autre sens.

/**
 * Durée annoncée, en minutes, à partir du nombre de questions.
 *
 * Calculée ici plutôt que laissée au modèle : sinon il annonce "5 minutes"
 * sur un quiz de 3 questions, et le visiteur qui abandonne à cause d'une
 * durée surestimée est un lead perdu pour rien. ~20 secondes par question,
 * lecture comprise, arrondi au dessus.
 */
export function estimateQuizMinutes(questionCount: number): number {
  const n = Number.isFinite(questionCount) ? Math.max(1, Math.trunc(questionCount)) : 5;
  return Math.min(15, Math.max(1, Math.ceil((n * 20) / 60)));
}

/**
 * La consigne du sous-titre, prête à insérer dans un prompt.
 *
 * Sert à la génération ET à l'import : Béné a constaté le problème sur les
 * deux ("il a bien réutilisé mon titre, mais pas le sous titre, mais de
 * toute façon ils sont pas ouf en mode normal").
 */
export function introSubtitleBlock(opts: {
  formality: "tu" | "vous";
  /** null à l'import : le nombre de questions vient du fichier source. */
  minutes: number | null;
  bonus?: string;
}): string {
  const isTu = opts.formality === "tu";
  const openers = isTu
    ? `"Découvre pourquoi…", "Regarde si tu…", "Apprends comment…", "Sache en 2 minutes si…"`
    : `"Découvrez pourquoi…", "Regardez si vous…", "Apprenez comment…", "Sachez en 2 minutes si…"`;
  const bonusLine = opts.bonus
    ? `- TERMINE par ce que le visiteur reçoit à la fin, en reprenant ses mots à lui : "${opts.bonus}". C'est la contrepartie de son email, elle doit être visible avant qu'il commence.`
    : `- Le créateur n'a pas prévu de bonus : ne promets RIEN qui n'existe pas (pas de "et reçois ton plan personnalisé" inventé).`;

  return `SOUS-TITRE DE L'ACCUEIL ("introduction") : RÈGLE STRICTE :
Une phrase simple qui dit LE BÉNÉFICE pour le visiteur à faire le quiz. Deux phrases au maximum. Il doit comprendre en une seconde ce qu'il y gagne, pas ce que le quiz contient.
- Commence par un verbe qui promet une découverte : ${openers}. Varie, ne prends pas toujours le même.
${opts.minutes == null
    ? `- Annonce la durée, estimée à ~20 secondes par question du texte source (arrondie à la minute supérieure). Elle lève l'objection "ça va me prendre combien de temps".`
    : `- Annonce la durée : environ ${opts.minutes} ${opts.minutes > 1 ? "minutes" : "minute"}. Elle lève l'objection "ça va me prendre combien de temps".`}
${bonusLine}
- INTERDIT : le NOMBRE DE QUESTIONS ("9 questions", "un quiz en 10 questions"). Le visiteur s'en moque, et ça transforme une promesse en fiche technique. La durée oui, le nombre de questions jamais.
- INTERDIT aussi : décrire le produit au lieu du bénéfice ("un diagnostic complet", "un test rapide et ludique", "un quiz interactif"), et les énumérations sèches séparées par des virgules ("X questions, un diagnostic, un plan").
- Le sous-titre PROLONGE le titre, il ne le répète pas. Si le titre pose une question, le sous-titre dit ce qu'on obtient en y répondant.`;
}
