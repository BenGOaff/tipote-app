// lib/prompts/generateurs/consignes.ts
//
// LA PARTIE VARIABLE DU PROMPT : ce qui change d'un générateur, d'une
// étape et d'un quiz à l'autre.
//
// Elle part APRÈS le point de césure du cache (cf. `socle.ts`). L'ordre
// n'est pas un détail : le cache d'Anthropic est un PRÉFIXE EXACT, donc
// le stable doit venir AVANT le variable, sinon rien ne s'accroche.
//
// -- DEUX ÉTAPES, ET UN SEUL MORCEAU À LA FOIS ------------------------
//
// `pistes` rend trois pistes en JSON court. `production` rend UN morceau.
// Tout demander d'un coup, c'est exactement ce qui a produit le JSON brut
// affiché à des élèves le 3 août : la réponse coupée en plein milieu,
// `JSON.parse` qui échoue, et l'écran qui montre notre panne au lieu du
// livrable.
//
// -- UN PROMPT EST DU CODE : IL SE TESTE ------------------------------
//
// `tests/logic/generateurs.test.mts` vérifie ce qui compte : la langue
// est dite, le ton est dit, le gabarit JSON n'a pas de tiret cadratin,
// et une consigne ne contredit pas une autre.

import { buildLanguageDirective } from "@/lib/quizLanguages";
import type { GenerateurId } from "@/lib/generateurs/catalogue";
import type { Piece, Piste } from "@/lib/generateurs/blocs";
import { MAX_PIECES } from "@/lib/generateurs/blocs";
import type { BriefQuiz, ProfilBrief } from "@/lib/generateurs/briefQuiz";
import { rendreBriefPourPrompt } from "@/lib/generateurs/briefQuiz";
import {
  rendreOffresPourPrompt,
  type Declencheur,
  type Offre,
  type PlanBonus,
} from "@/lib/generateurs/offre";

/**
 * Le nom de la langue, écrit en toutes lettres.
 *
 * Un code ISO ne suffit pas : `pt-BR` fait écrire du portugais européen
 * une fois sur deux, et `ar` fait parfois basculer en anglais. Le
 * modèle lit une CONSIGNE, pas une locale.
 */
export function consigneLangue(locale: string): string {
  // LA LANGUE DU QUIZ, PAS CELLE DE L'INTERFACE, et les 100 du catalogue,
  // pas les 7 de l'interface.
  //
  // Béné, 2 septembre 2026 : "pense au multilangues, on doit offrir la
  // même qualité à toutes les langues prises en charge et les contenus +
  // bonus sont générés dans la langue du quiz bien sûr."
  //
  // J'avais réécrit ici une table de SEPT langues, celles de
  // l'interface. Un quiz écrit en japonais ou en swahili en sortait donc
  // avec `la langue de code "ja"`, quand `buildLanguageDirective`
  // (`lib/quizLanguages.ts`) existe depuis des mois et rend "Japanese
  // (日本語)" plus ses NOTES RÉGIONALES ("voiture" vs "char",
  // "ordenador" vs "computadora"). C'est ce que reçoit déjà la
  // génération de quiz : deux qualités de consigne pour deux écrans du
  // même produit, et c'est le générateur qui écrivait moins bien.
  //
  // Septième fois que ce dépôt paie une règle recopiée à côté de celle
  // qui existe.
  return `LANGUE : tu écris ENTIÈREMENT en ${buildLanguageDirective(locale)}. Chaque titre, chaque phrase, chaque libellé de bouton.`;
}

/**
 * Recolle des lignes en laissant tomber les vides en trop.
 *
 * Les blocs ci-dessous poussent des lignes conditionnelles (une offre
 * absente, un profil absent) : sans ça le prompt part avec des trous de
 * trois lignes, et un modèle lit un trou comme une séparation de
 * section. C'est cosmétique pour nous, pas pour lui.
 */
function recoller(lignes: string[]): string {
  return lignes
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function consigneTon(b: BriefQuiz): string {
  return b.adresse === "vous"
    ? "TON : tu VOUVOIES le lecteur, comme le quiz. Ne bascule jamais sur le tutoiement, pas même dans un titre."
    : "TON : tu TUTOIES le lecteur, comme le quiz. Ne bascule jamais sur le vouvoiement, pas même dans un titre.";
}

// ─────────────────────────────────────────────────────────────────────
// ÉTAPE 1 : les pistes
// ─────────────────────────────────────────────────────────────────────

/**
 * Le gabarit JSON des pistes.
 *
 * `pieces` n'est demandé QUE là où le nombre est une décision
 * éditoriale. Pour le bonus, les trois morceaux sont imposés par nous
 * (cf. `piecesDeLaPiste`) : le laisser décider lui en ferait oublier un
 * une fois sur trois, et la créatrice se retrouverait avec un bonus
 * qu'elle ne sait pas livrer.
 */
function gabaritPistes(id: GenerateurId): string {
  const commun = `"titre": "le nom du livrable, tel qu'il sera affiché",
    "format": "sa forme en deux ou trois mots",
    "punchline": "une phrase qui donne envie, adressée au lecteur",
    "pourquoi": "pourquoi cette piste là pour CE quiz, une phrase, adressée à la créatrice",
    "tempsParPersonne": "VIDE si ça se livre tout seul. Sinon, la phrase qui dit ce que ça lui coûtera PAR PERSONNE."`;

  if (id === "bonus") {
    return `{
  "pistes": [
    { ${commun} }
  ],
  "recommandee": 0,
  "pourquoiRecommandee": "en une phrase, pourquoi celle là plutôt que les deux autres"
}`;
  }

  const bloc = id === "emails" ? `"email"` : `"email" ou "post"`;
  const combien =
    id === "emails"
      ? `de 3 à ${MAX_PIECES.emails} emails`
      : `de 2 à 3 emails ET de 3 à 5 posts, dans cet ordre`;

  return `{
  "pistes": [
    {
      ${commun},
      "pieces": [
        { "bloc": ${bloc}, "resume": "en une ligne, ce que CE morceau dit et rien d'autre" }
      ]
    }
  ],
  "recommandee": 0,
  "pourquoiRecommandee": "en une phrase, pourquoi celle là plutôt que les deux autres"
}

Chaque piste porte ${combien}. Les résumés d'une même piste ne se recouvrent pas : si deux d'entre eux pourraient être échangés, la piste est mauvaise.`;
}

/** Le gabarit JSON d'UNE piste, pour la relance. */
function gabaritUnePiste(id: GenerateurId): string {
  const commun = `"titre": "le nom du livrable, tel qu'il sera affiché",
  "format": "sa forme en deux ou trois mots",
  "punchline": "une phrase qui donne envie, adressée au lecteur",
  "pourquoi": "pourquoi cette piste là pour CE quiz, une phrase, adressée à la créatrice",
  "tempsParPersonne": "VIDE si ça se livre tout seul. Sinon, la phrase qui dit ce que ça lui coûtera PAR PERSONNE."`;
  if (id === "bonus") return `{\n  ${commun}\n}`;
  const bloc = id === "emails" ? `"email"` : `"email" ou "post"`;
  return `{
  ${commun},
  "pieces": [
    { "bloc": ${bloc}, "resume": "en une ligne, ce que CE morceau dit et rien d'autre" }
  ]
}`;
}

const CONSIGNE_PISTES: Record<GenerateurId, string> = {
  bonus: `ON TE DEMANDE TROIS PISTES DE BONUS POST-QUIZ.

Le bonus est remis automatiquement par le quiz, à la fin ou après un partage. Il est le MÊME pour tout le monde : le quiz n'en porte qu'un. Propose donc un format qui parle à tous les profils sans être creux, en s'appuyant sur ce qu'ils ont EN COMMUN (le sujet, la situation de départ) plutôt que sur ce qui les sépare.

Les trois pistes doivent être VRAIMENT différentes : trois formats différents, trois angles différents. Trois variations du même document, c'est une seule piste présentée trois fois, et la créatrice le voit tout de suite.

Privilégie ce qui se consomme en moins de dix minutes et se fabrique en moins d'une heure. Un format ambitieux qu'elle n'écrira jamais vaut moins qu'une checklist publiée demain.

LES 4 PILIERS D'UN BONUS QUI CONVERTIT. Tu les vérifies avant de proposer quoi que ce soit, en silence : ce qui en rate un se remplace, il ne se commente pas.
- URGENCE : il règle un problème brûlant, celui que le résultat du quiz vient de nommer.
- SPÉCIFICITÉ : la promesse est précise, et on peut dire si elle est tenue ou non.
- ACCESSIBILITÉ : il se consomme en moins de 20 minutes, ou il produit un résultat en un clic.
- CONTINUITÉ : il ouvre un vide que SEULE l'offre payante comble entièrement. Un bonus qui se suffit à lui même ne vend rien, et un bonus qui n'est qu'une bande annonce déçoit. Le bon rend un service réel ET laisse une suite évidente.`,

  emails: `ON TE DEMANDE TROIS PISTES DE SÉQUENCE D'EMAILS POST-QUIZ.

Ces emails partent à quelqu'un qui vient d'obtenir UN profil précis, celui qui t'est donné plus bas. Il t'a laissé son adresse il y a quelques minutes : il attend la suite, mais il ne t'a rien acheté et il ne te doit rien.

Une séquence n'est PAS une suite d'arguments de vente. C'est une suite de services rendus, dont chacun se suffit à lui même, et dont le dernier propose la suite comme une évidence. Le premier email tient la promesse faite à l'écran de résultat ; s'il ne sert à rien, aucun des suivants ne sera ouvert.

Les trois pistes proposent trois PROGRESSIONS différentes, pas trois habillages : par exemple lever les objections une par une, ou dérouler une méthode étape par étape, ou raconter un cas concret jusqu'au résultat. Chacune décide de son propre nombre d'emails.`,

  promo: `ON TE DEMANDE TROIS PISTES DE CAMPAGNE POUR FAIRE PASSER LE QUIZ.

Ces contenus s'adressent à des gens qui n'ont PAS encore répondu, et qui ne connaissent peut être pas la créatrice. Ils ne vendent rien : ils promettent une réponse à une question que la personne se pose déjà sur elle même. La curiosité sur soi est le seul moteur, et il est très puissant.

Le lien du quiz est donné plus bas. Il apparaît une fois par email et une fois par post, jamais deux.

Les trois pistes attaquent par trois entrées différentes : par exemple la situation qui agace, la croyance retournée, ou le résultat qu'on peut nommer. Chacune porte ses emails ET ses posts, et les posts ne sont pas les emails raccourcis : un post se lit dans un fil, sans contexte, et doit tenir debout tout seul.`,
};

/** Le bloc système VARIABLE de l'étape 1. */
export function consignePistes(id: GenerateurId): string {
  return [
    CONSIGNE_PISTES[id],
    "",
    "TU RÉPONDS UNIQUEMENT PAR CET OBJET JSON, sans un mot avant ni après, sans bloc de code :",
    gabaritPistes(id),
    "",
    "TROIS pistes, ni plus ni moins. `recommandee` est l'indice de celle que tu conseilles, à partir de 0.",
    "",
    "`tempsParPersonne` EST VIDE dans le cas normal. Tu ne le remplis que si le format que tu proposes demande son temps à CHAQUE nouveau visiteur, et tu dis alors ce que ça lui coûtera par personne. Ne le cache JAMAIS derrière le mot \"personnalisé\" : un quiz qui marche ramène des centaines de personnes, donc une réussite qui se transforme en dette.",
  ].join("\n");
}

/**
 * UNE PISTE DE PLUS, PAS UNE NOUVELLE FOURNÉE.
 *
 * Porté du labo de l'Atelier (`buildOnePisteSystemPrompt`).
 *
 * Béné, 6 août 2026 : "aucune ne te convainc ?" Le bouton dit ce qu'il
 * coûte et ce qu'il rend, une idée et pas trois. Sans ça, on clique en
 * craignant de perdre les trois qui sont à l'écran, donc on ne clique
 * pas.
 *
 * `connues` est OBLIGATOIRE et part dans le prompt : une génération
 * payée pour un doublon de ce qu'elle a déjà sous les yeux serait la
 * pire dépense possible.
 */
export function consigneUnePisteDePlus(
  id: GenerateurId,
  connues: { format: string; titre: string }[],
): string {
  const liste = connues.map((p, i) => `${i + 1}. ${p.format} : ${p.titre}`).join("\n");
  return [
    CONSIGNE_PISTES[id],
    "",
    "ELLE A DÉJÀ CES PISTES SOUS LES YEUX, ET AUCUNE NE LA CONVAINC :",
    liste,
    "",
    "TU EN PROPOSES UNE SEULE, VRAIMENT AUTRE CHOSE :",
    "- un format qui n'est PAS dans la liste ci dessus ;",
    "- un angle différent, pas une reformulation d'une piste existante ;",
    "- si les pistes existantes couvrent déjà les formats évidents, va chercher plus loin plutôt que de revenir sur l'un d'eux.",
    "",
    "TU RÉPONDS UNIQUEMENT PAR CET OBJET JSON, sans un mot avant ni après, sans bloc de code :",
    gabaritUnePiste(id),
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// ÉTAPE 2 : un morceau
// ─────────────────────────────────────────────────────────────────────

const CONSIGNE_BONUS: Record<string, string> = {
  contenu: `ÉCRIS LE BONUS LUI MÊME, en entier, prêt à être mis en page.

C'est le livrable que le visiteur reçoit. Il doit pouvoir s'en servir sans rien acheter et sans revenir vers la créatrice. Structure le avec des titres, et termine par UNE page qui amène l'offre : ce qu'elle règle, pour qui, et le premier pas. Pas d'argumentaire de vente en dix points.

LES 4 PILIERS D'UN BONUS QUI CONVERTIT. Tu les vérifies avant de proposer quoi que ce soit, en silence : ce qui en rate un se remplace, il ne se commente pas.
- URGENCE : il règle un problème brûlant, celui que le résultat du quiz vient de nommer.
- SPÉCIFICITÉ : la promesse est précise, et on peut dire si elle est tenue ou non.
- ACCESSIBILITÉ : il se consomme en moins de 20 minutes, ou il produit un résultat en un clic.
- CONTINUITÉ : il ouvre un vide que SEULE l'offre payante comble entièrement. Un bonus qui se suffit à lui même ne vend rien, et un bonus qui n'est qu'une bande annonce déçoit. Le bon rend un service réel ET laisse une suite évidente.`,

  guide: `ÉCRIS LE MODE D'EMPLOI POUR LA CRÉATRICE : comment fabriquer ce bonus, et comment le livrer.

Tu t'adresses à ELLE, pas au visiteur. Des étapes numérotées, avec les outils qu'elle a déjà. Dis explicitement où le fichier doit finir (un lien public) et où ce lien se colle dans Tiquiz : dans l'écran bonus du quiz, onglet Partager, champ de description du bonus.

Ne propose aucun outil payant, aucun développement, et rien qui lui demande d'intervenir à chaque nouveau visiteur.`,

  remise: `ÉCRIS LES TEXTES QUI REMETTENT LE BONUS.

Trois choses, dans cet ordre, séparées par un titre :
1. le texte de l'écran bonus du quiz : ce qu'on promet, en trois phrases au maximum ;
2. le libellé du bouton, entre trois et six mots ;
3. l'email de remise, objet compris, court, qui donne le lien et une seule chose à faire ensuite.`,
};

const CONSIGNE_EMAIL_SEQUENCE = `ÉCRIS CET EMAIL LÀ, ET LUI SEUL.

Donne l'OBJET en premier, sur une ligne, précédé de "Objet :". Puis le corps.

L'objet ne raconte pas l'email : il ouvre une boucle. Pas de "Newsletter", pas de nom de marque, pas d'emoji.

Le corps tient en moins de 300 mots. Une seule idée, un seul appel à l'action à la fin. Pas de post-scriptum publicitaire.

Cet email arrive dans une boîte pleine : la première phrase doit se lire dans l'aperçu et donner envie d'ouvrir la deuxième.`;

const CONSIGNE_EMAIL_PROMO = `ÉCRIS CET EMAIL D'INVITATION LÀ, ET LUI SEUL.

Donne l'OBJET en premier, sur une ligne, précédé de "Objet :". Puis le corps.

Il invite à faire le quiz, il ne vend rien. Moins de 250 mots. Le lien du quiz apparaît UNE fois, avec un libellé de bouton de trois à six mots. Annonce la durée, jamais le nombre de questions.`;

const CONSIGNE_POST = `ÉCRIS CE POST LÀ, ET LUI SEUL.

Il se lit dans un fil, sans contexte : la première ligne doit arrêter le pouce. Moins de 150 mots. Aucun jargon.

Le lien du quiz est à la fin, sur sa propre ligne. Termine par au maximum trois mots-dièse, en minuscules, tirés du vocabulaire de la niche. Aucun emoji sauf si le brief en montre.`;

/** Le bloc système VARIABLE de l'étape 2. */
export function consigneProduction(args: { id: GenerateurId; piece: Piece }): string {
  const { id, piece } = args;

  let quoi: string;
  if (id === "bonus") {
    quoi = CONSIGNE_BONUS[piece.bloc] ?? CONSIGNE_BONUS.contenu;
  } else if (id === "emails") {
    quoi = CONSIGNE_EMAIL_SEQUENCE;
  } else {
    quoi = piece.bloc === "post" ? CONSIGNE_POST : CONSIGNE_EMAIL_PROMO;
  }

  const l = [quoi, ""];

  // `resume` porte l'INTENTION du temps (l'email 2 n'est pas l'email 3).
  // Il vient de `sequences.ts`, donc il est le MÊME pour tout le monde :
  // il a sa place ici, du côté qui se met en cache.
  if (piece.resume) {
    l.push(
      `CE MORCEAU LÀ, ET RIEN D'AUTRE : ${piece.resume}`,
      "Les autres morceaux de la série sont écrits séparément. N'empiète pas sur eux, et ne les résume pas.",
      "",
    );
  }

  return recoller(l);
}

/**
 * LE LIEN DU QUIZ A-T-IL LE DROIT D'APPARAÎTRE DANS CE MORCEAU ?
 *
 * Non partout, et ce n'est pas un détail : le CONTENU d'un bonus se lit
 * hors ligne, y coller l'adresse renverrait le lecteur vers le quiz
 * qu'il vient de finir. Il ne sort donc que dans la promotion et dans
 * les textes de remise.
 *
 * La règle vit ici, en fonction pure, parce que DEUX endroits en
 * dépendent depuis que les faits ont quitté le bloc système : la
 * consigne ne le porte plus, c'est le message qui le porte. Recopier la
 * condition dans le message la ferait diverger au premier bloc ajouté.
 */
export function lienQuizAutorise(id: GenerateurId, bloc: Piece["bloc"]): boolean {
  return id === "promo" || bloc === "remise";
}

/**
 * CE QUI DÉPEND DE SON QUIZ, ET RIEN D'AUTRE : la langue et le ton.
 *
 * Ce sont des règles, donc elles restent dans le bloc système ; mais
 * elles changent d'une créatrice à l'autre, donc elles vivent APRÈS le
 * dernier point de cache. Les mettre avant multiplierait les entrées par
 * le nombre de langues du catalogue (100) fois deux formes d'adresse,
 * pour gagner 74 jetons.
 */
export function consigneDuQuiz(brief: BriefQuiz): string {
  return recoller([consigneLangue(brief.langue), consigneTon(brief)]);
}

// ─────────────────────────────────────────────────────────────────────
// Le message utilisateur
// ─────────────────────────────────────────────────────────────────────

/**
 * Ce que le modèle reçoit comme message : les FAITS.
 *
 * Le brief et l'offre y vivent ensemble, jamais dans le système :
 * le système dit les règles, le message dit le cas. Mélanger les deux
 * rend le prompt impossible à relire quand une sortie déçoit.
 */
export function messagePourLeModele(args: {
  brief: BriefQuiz;
  /** Les offres saisies. Vide sur le générateur de promotion. */
  offres?: Offre[];
  plan?: PlanBonus;
  declencheur?: Declencheur;
  /**
   * Le profil pour lequel on écrit, ou `null` à l'étape des pistes.
   *
   * C'est LUI qui décide quelle offre part dans le prompt : sans ça, un
   * quiz qui oriente vers trois offres renvoyait les trois profils vers
   * la même (retour Monique, Atelier, 5 août 2026).
   */
  profilIndex?: number | null;
  /**
   * LA PISTE CHOISIE, quand il y en a une. C'est un FAIT (ce qu'elle a
   * choisi), pas une règle : il vivait dans le bloc système, ce qui
   * rendait la consigne différente pour chaque créatrice, donc
   * impossible à mettre en cache.
   */
  piste?: { titre: string; format: string; punchline: string } | null;
  /** LE PROFIL pour lequel on écrit, avec ses mots à lui. */
  profil?: ProfilBrief | null;
  /** L'adresse du quiz, seulement là où elle a le droit d'apparaître. */
  lienQuiz?: string;
  demande: string;
}): string {
  const l = [
    rendreBriefPourPrompt(args.brief),
    "",
    rendreOffresPourPrompt({
      plan: args.plan ?? "commun",
      offres: args.offres ?? [],
      profils: args.brief.profils,
      profilIndex: args.profilIndex ?? null,
      declencheur: args.declencheur ?? "completion",
    }),
    "",
  ];

  if (args.profil) {
    l.push(
      "LE PROFIL POUR LEQUEL TU ÉCRIS, ET LUI SEUL :",
      `- ${args.profil.titre || `Profil ${args.profil.rang}`}`,
      args.profil.description
        ? `- ce que le quiz vient de lui dire : ${args.profil.description}`
        : "",
      "Ce texte ne doit pas pouvoir être envoyé à un autre profil sans être réécrit.",
      "",
    );
  }

  if (args.lienQuiz) {
    l.push(`LE LIEN DU QUIZ, à recopier EXACTEMENT, sans rien y ajouter : ${args.lienQuiz}`, "");
  }

  if (args.piste) {
    l.push(
      "LA PISTE CHOISIE PAR LA CRÉATRICE :",
      `- ${args.piste.titre}`,
      args.piste.format ? `- forme : ${args.piste.format}` : "",
      args.piste.punchline ? `- ce qu'elle promet : ${args.piste.punchline}` : "",
      "",
    );
  }

  l.push(args.demande);
  return recoller(l);
}
