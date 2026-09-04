// lib/generateurs/offre.ts
//
// LA SEULE CHOSE QUE LA CRÉATRICE SAISIT.
//
// Le quiz porte déjà le sujet, le ton, les profils et leurs
// descriptions (`briefQuiz.ts`). Ce qu'il ne peut pas savoir, c'est ce
// qu'elle VEND : le bonus et la séquence d'emails mènent quelque part,
// et sans ce quelque part le modèle invente une offre qui n'existe pas.
//
// -- PLUSIEURS OFFRES, UNE PAR PROFIL (Béné, 3 septembre 2026) --------
//
// Cette page disait, jusqu'à ce jour : "L'Atelier en accepte plusieurs
// [...] on ne reprend PAS ça ici, pas encore". Elle a tranché :
//
//   "Au final je veux exactement la même chose sur l'atelier et sur
//    tiquiz. Pareil. Ni plus, ni moins."
//
// Et le "pas encore" était de toute façon un mauvais calcul : le retour
// de Monique (5 août) décrit un quiz qui ORIENTE vers trois offres
// différentes, ce qui est précisément ce que Tiquiz vend. Renvoyer les
// trois profils vers la même offre, c'est dire l'inverse de ce que le
// quiz vient de leur dire.
//
// -- CE MODULE EST UNE RÉIMPLÉMENTATION, PAS UNE COPIE ---------------
//
// Les quatre autres modules du labo sont portés à l'octet près, et un
// `cmp` le prouve. Celui là ne peut pas l'être : `lib/bonus/offers.ts`
// parle anglais (`BonusOffer.promise`, `.kind`, `.price`) et tout
// `lib/generateurs/` parle français. J'ai d'abord tenté un pont, et il
// tenait sur un `as unknown as` entre deux formes DIFFÉRENTES, c'est à
// dire un mensonge que le compilateur ne pouvait plus contredire (règle
// du 7 août, drame `pdf-parse`).
//
// Deux formes pour la même chose sont exactement la divergence qu'on
// cherche à éviter. Il n'y en a donc qu'UNE, en français, et c'est le
// COMPORTEMENT qui est figé : `tests/logic/offres-par-profil.test.mts`
// rejoue les cas de `bonus-offers.test.mts` de l'Atelier, un par un.

/** Le format de l'offre payante. Liste fermée : elle sert au prompt. */
export const FORMATS_OFFRE = [
  "formation",
  "accompagnement",
  "prestation",
  "outil",
  "produit",
  "abonnement",
  "groupe",
] as const;
export type FormatOffre = (typeof FORMATS_OFFRE)[number];

/**
 * Comment on DÉCRIT ce format au modèle.
 *
 * Le code porte une clé courte (elle voyage dans une requête et se
 * traduit à l'écran) ; le prompt reçoit la phrase, en français, parce
 * que c'est lui qui la lit. Les deux ne se confondent pas : envoyer
 * `"groupe"` tel quel au modèle lui ferait écrire sur des groupes de
 * discussion.
 */
export const FORMAT_OFFRE_POUR_PROMPT: Record<FormatOffre, string> = {
  formation: "une formation en ligne, suivie en autonomie",
  accompagnement: "un accompagnement ou du coaching individuel",
  prestation: "une prestation de service réalisée par la créatrice",
  outil: "un outil ou un logiciel",
  produit: "un produit physique",
  abonnement: "un abonnement, facturé de façon récurrente",
  groupe: "un programme suivi en groupe, avec une promotion",
};

/**
 * QUAND LE BONUS EST REMIS. Porté de l'Atelier (`BonusTrigger`).
 *
 * Ce n'est pas un détail de formulaire : le déclenchement décide de ce
 * que le bonus doit ÊTRE. À la fin du quiz, il prolonge un résultat que
 * le visiteur vient de lire ; après un partage, il récompense un geste,
 * donc il doit valoir le geste.
 */
export const DECLENCHEURS = ["completion", "share"] as const;
export type Declencheur = (typeof DECLENCHEURS)[number];

/**
 * Comment on DÉCRIT le déclenchement au modèle.
 *
 * Mêmes phrases que `TRIGGER_LABEL` dans l'Atelier. Le code porte une
 * clé courte (elle voyage dans une requête et se traduit à l'écran) ;
 * le prompt reçoit la phrase, en français, parce que c'est lui qui la
 * lit.
 */
export const DECLENCHEUR_POUR_PROMPT: Record<Declencheur, string> = {
  completion: "à la fin du quiz, quand le visiteur découvre son résultat",
  share: "après un partage, en récompense",
};

export interface Offre {
  /** Ce que l'offre promet, dans les mots de la créatrice. */
  promesse: string;
  format: FormatOffre;
  /** Son prix, tel qu'elle l'écrit. Facultatif. */
  prix: string;
  /**
   * Les profils de résultat auxquels CETTE offre s'adresse, par index.
   *
   * Une offre peut en servir plusieurs (Monique a 3 offres pour 4
   * profils). Ignoré hors du plan `par-profil-son-offre`, où une seule
   * offre s'adresse à tout le monde.
   */
  profils: number[];
}

/**
 * COMMENT LE BONUS ET L'OFFRE SE DÉCLINENT. Un choix, trois valeurs.
 *
 * L'ordre est celui de l'effort croissant : c'est celui dans lequel les
 * cartes sont proposées, pour que la plus simple soit la première.
 *
 * -- POURQUOI UN SEUL CHOIX À TROIS VALEURS, ET PAS DEUX RÉGLAGES -----
 *
 * On pourrait croire à deux questions indépendantes : "un bonus ou
 * plusieurs ?" et "une offre ou plusieurs ?". Ça ferait quatre
 * combinaisons, dont une est INCOHÉRENTE : un bonus COMMUN qui devrait
 * mener vers des offres DIFFÉRENTES. Un seul texte, lu par tout le
 * monde, ne peut pas pointer vers trois offres sans redevenir le
 * problème que Monique décrit.
 *
 * Trois valeurs, donc, et la quatrième est impossible par construction.
 */
export const PLANS_BONUS = ["commun", "par-profil", "par-profil-son-offre"] as const;
export type PlanBonus = (typeof PLANS_BONUS)[number];

/** Le bonus est-il décliné par profil ? Vrai pour deux des trois plans. */
export function bonusParProfil(plan: PlanBonus): boolean {
  return plan !== "commun";
}

/** L'offre change-t-elle selon le profil ? Vrai pour un seul plan. */
export function offreParProfil(plan: PlanBonus): boolean {
  return plan === "par-profil-son-offre";
}

/**
 * L'OFFRE QUI S'APPLIQUE À UN PROFIL.
 *
 * Hors du plan à offres multiples, c'est toujours la première : il n'y
 * en a qu'une, et c'est elle que la créatrice a saisie.
 *
 * `null` quand un profil n'est couvert par aucune offre. L'appelant DOIT
 * traiter ce cas : écrire un bonus qui ne mène nulle part, c'est faire
 * travailler la créatrice pour rien.
 */
export function offreDuProfil(
  plan: PlanBonus,
  offres: Offre[],
  profilIndex: number,
): Offre | null {
  if (offres.length === 0) return null;
  if (!offreParProfil(plan)) return offres[0]!;
  return offres.find((o) => o.profils.includes(profilIndex)) ?? null;
}

export type CouvertureOffres = {
  ok: boolean;
  /** Les profils (index) qu'aucune offre ne couvre. */
  sansOffre: number[];
  /** Les profils (index) que PLUSIEURS offres revendiquent. */
  enDouble: number[];
  /** Les offres (index) qui ne servent aucun profil. */
  inutilisees: number[];
};

/**
 * CHAQUE PROFIL A-T-IL EXACTEMENT UNE OFFRE ?
 *
 * Même famille que `analyzeTrancheCoverage` : on prévient la créatrice
 * AVANT de produire, au lieu de la laisser découvrir le trou dans le
 * texte généré. Les trois défauts ont des conséquences différentes, donc
 * ils se nomment séparément :
 *
 * - un profil SANS offre : son bonus n'a nulle part où mener ;
 * - un profil avec DEUX offres : on ne peut pas choisir à sa place, et
 *   deviner produirait exactement l'incohérence qu'on corrige ;
 * - une offre qui ne sert PERSONNE : ce n'est pas bloquant, mais c'est
 *   presque toujours un profil oublié dans une case à cocher.
 *
 * Hors du plan à offres multiples, il n'y a rien à couvrir : une seule
 * offre s'adresse à tout le monde. Structure inconnue (aucun profil) :
 * on ne bloque pas sur une donnée qu'on n'a pas.
 */
export function couvertureDesOffres(
  plan: PlanBonus,
  offres: Offre[],
  nbProfils: number,
): CouvertureOffres {
  const vide: CouvertureOffres = { ok: true, sansOffre: [], enDouble: [], inutilisees: [] };
  if (!offreParProfil(plan)) return vide;
  if (nbProfils <= 0) return vide;

  const sansOffre: number[] = [];
  const enDouble: number[] = [];
  for (let i = 0; i < nbProfils; i++) {
    const n = offres.filter((o) => o.profils.includes(i)).length;
    if (n === 0) sansOffre.push(i);
    if (n > 1) enDouble.push(i);
  }
  const inutilisees = offres
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => !o.profils.some((p) => p >= 0 && p < nbProfils))
    .map(({ i }) => i);

  return { ok: sansOffre.length === 0 && enDouble.length === 0, sansOffre, enDouble, inutilisees };
}

/** Une offre neuve, vide. */
export const OFFRE_VIDE: Offre = { promesse: "", format: "formation", prix: "", profils: [] };

/**
 * L'offre, écrite pour un prompt.
 *
 * Rend une chaîne VIDE quand il n'y a pas d'offre : le générateur de
 * promotion n'en demande pas, et une ligne "OFFRE : -" apprendrait au
 * modèle qu'il a le droit d'en inventer une (même règle que le brief).
 */
export function rendreOffrePourPrompt(offre: Offre | null | undefined): string {
  if (!offre || !offre.promesse.trim()) return "";
  const l = [
    `L'OFFRE PAYANTE VERS LAQUELLE ÇA MÈNE : ${offre.promesse.trim()}`,
    `FORMAT DE L'OFFRE : ${FORMAT_OFFRE_POUR_PROMPT[offre.format] ?? offre.format}`,
  ];
  if (offre.prix.trim()) l.push(`SON PRIX, À N'ÉCRIRE QUE TEL QUEL : ${offre.prix.trim()}`);
  return l.join("\n");
}

/**
 * LES OFFRES, ÉCRITES POUR UN PROMPT.
 *
 * Calqué sur la section offre de `renderBriefForPrompt` dans l'Atelier,
 * et pour les mêmes raisons :
 *
 * 1. quand on écrit POUR UN PROFIL, on ne donne que SON offre. Sans ça,
 *    un quiz qui oriente vers trois offres renvoyait les trois profils
 *    vers la même (retour Monique, 5 août 2026) ;
 * 2. quand on ne sait pas encore pour qui on écrit (l'étape des pistes),
 *    on montre la CARTE COMPLÈTE profil par profil : c'est ce qui permet
 *    de proposer un format qui tienne pour tout le monde ;
 * 3. un profil sans offre est DIT tel quel au modèle. Le taire lui
 *    ferait inventer une offre, ce qui est le seul résultat pire que
 *    l'absence de bonus.
 *
 * Rend une chaîne VIDE quand il n'y a aucune offre remplie : le
 * générateur de promotion n'en demande pas, et une ligne "OFFRE : -"
 * apprendrait au modèle qu'il a le droit d'en inventer une.
 */
export function rendreOffresPourPrompt(args: {
  plan: PlanBonus;
  offres: Offre[];
  profils: { titre: string }[];
  /** Le profil pour lequel on écrit, ou `null` à l'étape des pistes. */
  profilIndex: number | null;
  declencheur: Declencheur;
}): string {
  const remplies = args.offres.filter((o) => o.promesse.trim().length > 0);
  if (remplies.length === 0) return "";

  const pour =
    typeof args.profilIndex === "number"
      ? (offreDuProfil(args.plan, args.offres, args.profilIndex) ?? remplies[0]!)
      : remplies[0]!;

  const l = [rendreOffrePourPrompt(pour)];

  if (offreParProfil(args.plan) && args.profilIndex === null && args.profils.length > 0) {
    l.push("", "CHAQUE PROFIL MÈNE VERS SA PROPRE OFFRE :");
    args.profils.forEach((p, i) => {
      const o = offreDuProfil(args.plan, args.offres, i);
      l.push(`- ${p.titre} -> ${o ? o.promesse.trim() : "(aucune offre associée)"}`);
    });
  }

  l.push("", `LE BONUS EST REMIS ${DECLENCHEUR_POUR_PROMPT[args.declencheur].toUpperCase()}.`);
  return l.filter(Boolean).join("\n");
}
