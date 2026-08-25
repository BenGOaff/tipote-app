// lib/affiliate/recompense.ts
//
// RÉCOMPENSER UN AFFILIÉ QUI AMÈNE DU MONDE, ET LE LAISSER CHOISIR.
//
// Béné, 25 août 2026 : "possible de récompenser un affilié qui est aussi
// membre ? Genre : il a 10 affiliés abonnés, son abonnement baisse de
// 10 %, il en a 20 il gagne 20 %, il en a 100 ben il paye plus rien ?"
// Puis : "on pourra laisser le choix à l'affilié : soit réduire le prix
// de son abonnement, soit augmenter ses commissions quand il a des
// affiliés. C'est lui qui choisit quand il remplit son profil et il peut
// switcher quand il veut de l'un à l'autre (ce sera pris en compte pour
// le mois suivant)."
//
// -- UN SEUL DES DEUX, JAMAIS LES DEUX ---------------------------------
//
// C'est la même récompense, versée de deux façons. Les cumuler paierait
// deux fois le même mérite : une commission plus forte ET un abonnement
// moins cher, sur le même filleul. Le choix est donc EXCLUSIF, et c'est
// pour ça que la fonction rend les DEUX valeurs à la fois : celle qui
// n'a pas été choisie retombe explicitement à sa valeur de base, au lieu
// d'être laissée à l'appelant qui pourrait l'oublier.
//
// -- POURQUOI LE DÉFAUT EST "COMMISSIONS" ------------------------------
//
// Parce que c'est le seul qui marche pour tout le monde. Beaucoup
// d'affiliés n'ont AUCUN abonnement Tiquiz : leur offrir une remise sur
// un abonnement qui n'existe pas ne leur donnerait rien, et ils ne
// verraient jamais qu'ils avaient un choix à faire. La commission, elle,
// concerne tous les affiliés par définition.
//
// -- CE QU'EST UN "FILLEUL ABONNÉ" -------------------------------------
//
// Quelqu'un qui a généré une commission RÉCEMMENT, c'est à dire qui a
// payé son mois. Ni un inscrit gratuit, ni un essai, ni quelqu'un qui a
// été remboursé. Compter autre chose ouvrirait la porte aux faux
// filleuls, et la récompense se paie en argent réel.
//
// Conséquence voulue : la récompense MONTE ET DESCEND. Un filleul qui
// arrête de payer sort du compte le mois suivant. C'est le prix de la
// justesse, et c'est pour ça que le recalcul est MENSUEL et annoncé :
// une remise qui baisserait du jour au lendemain serait une hausse de
// prix sans prévenir.

/** Ce que l'affilié a choisi comme récompense. */
export type ChoixRecompense = "commissions" | "abonnement";

/** Une marche tous les 10 filleuls (décision de Béné, 25 août 2026). */
export const PALIER_FILLEULS = 10;
/** À 100 filleuls, l'abonnement est offert. */
export const REMISE_ABO_MAX_PCT = 100;

/** Le taux de commission de base sur Tiquiz. */
export const COMMISSION_BASE_PCT = 40;
/** Le plafond de commission (décision Béné, 25 août 2026). */
export const COMMISSION_MAX_PCT = 70;
/** Ce que chaque marche de 10 filleuls ajoute au taux. */
export const COMMISSION_PAS_PCT = 5;

function filleuls(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0;
}

/**
 * La remise sur SON abonnement, en pourcentage.
 *
 * Par marches de 10 : 10 filleuls -10 %, 20 -20 %, ... 100 et plus =
 * gratuit. Entre deux marches, rien ne bouge : c'est plus lisible sur
 * une page de vente, et ça évite d'annoncer "-37 %" à quelqu'un qui
 * repassera à "-36 %" le mois suivant.
 */
export function remiseAbonnementPct(filleulsActifs: unknown): number {
  const n = filleuls(filleulsActifs);
  const marches = Math.floor(n / PALIER_FILLEULS) * PALIER_FILLEULS;
  return Math.min(REMISE_ABO_MAX_PCT, marches);
}

/**
 * Son taux de commission, en pourcentage.
 *
 * Béné, 25 août 2026, mot pour mot : "0 affilié : 40 %, 1 à 10 affiliés :
 * 45 %, 11 à 20 : 50 %, 21 à 30 : 55 %, etc, jusqu'à 70 %."
 *
 * ATTENTION, LES DEUX ÉCHELLES NE SE DÉCOUPENT PAS PAREIL, et c'est
 * voulu : ici la marche s'ouvre au PREMIER filleul (1 suffit pour 45 %),
 * alors que la remise d'abonnement attend le DIXIÈME (9 filleuls = 0 %).
 * Ce sont ses deux formulations, et les aligner de force reviendrait à
 * changer un chiffre qu'elle a donné. Les deux fonctions vivent côte à
 * côte pour que la différence se lise au lieu de se découvrir.
 */
export function tauxCommissionPct(filleulsActifs: unknown): number {
  const n = filleuls(filleulsActifs);
  const marches = Math.ceil(n / PALIER_FILLEULS);
  return Math.min(COMMISSION_MAX_PCT, COMMISSION_BASE_PCT + marches * COMMISSION_PAS_PCT);
}

export type Recompense = {
  /** Ce qui a été pris en compte. */
  filleulsActifs: number;
  /** La remise sur SON abonnement. 0 s'il a choisi les commissions. */
  remiseAboPct: number;
  /** Son taux de commission. La base s'il a choisi l'abonnement. */
  commissionPct: number;
  /** Le choix effectivement appliqué. */
  choix: ChoixRecompense;
};

/**
 * La récompense du mois, les deux valeurs d'un coup.
 *
 * `choix` est un PARAMÈTRE OBLIGATOIRE, jamais deviné d'un champ rempli :
 * les deux versements ne se cumulent pas, et deviner lequel s'applique
 * finirait par en payer deux.
 *
 * Une valeur de choix illisible retombe sur `commissions` : c'est le seul
 * des deux qui ne peut rien casser (elle augmente ce qu'on lui doit sur
 * des ventes qu'il a amenées), quand une remise d'abonnement posée par
 * erreur ampute un revenu récurrent.
 */
export function recompenseDuMois(
  choix: ChoixRecompense | string | null | undefined,
  filleulsActifs: unknown,
): Recompense {
  const n = filleuls(filleulsActifs);
  const c: ChoixRecompense = choix === "abonnement" ? "abonnement" : "commissions";
  return c === "abonnement"
    ? {
        filleulsActifs: n,
        remiseAboPct: remiseAbonnementPct(n),
        commissionPct: COMMISSION_BASE_PCT,
        choix: c,
      }
    : {
        filleulsActifs: n,
        remiseAboPct: 0,
        commissionPct: tauxCommissionPct(n),
        choix: c,
      };
}

/**
 * Le nombre de filleuls qui manquent pour la marche suivante.
 *
 * Sert à l'écran de l'affilié : "encore 3 abonnés et ta remise passe à
 * 20 %". Une récompense qu'on ne voit pas approcher ne motive personne.
 * Rend `null` quand il est au maximum.
 */
export function prochaineMarche(
  choix: ChoixRecompense | string | null | undefined,
  filleulsActifs: unknown,
): { manque: number; valeur: number } | null {
  const n = filleuls(filleulsActifs);
  if (choix === "abonnement") {
    if (remiseAbonnementPct(n) >= REMISE_ABO_MAX_PCT) return null;
    const suivante = (Math.floor(n / PALIER_FILLEULS) + 1) * PALIER_FILLEULS;
    return { manque: suivante - n, valeur: Math.min(REMISE_ABO_MAX_PCT, suivante) };
  }
  if (tauxCommissionPct(n) >= COMMISSION_MAX_PCT) return null;
  const suivante = (Math.floor(n / PALIER_FILLEULS) + 1) * PALIER_FILLEULS + 1;
  return { manque: suivante - n, valeur: tauxCommissionPct(suivante) };
}

/**
 * Un changement de choix vaut-il pour CE mois ou le suivant ?
 *
 * Béné : "il peut switcher quand il veut de l'un à l'autre, ce sera pris
 * en compte pour le mois suivant." La règle n'a donc pas besoin d'une
 * date d'effet stockée : la récompense est RECALCULÉE une fois par mois,
 * et le recalcul lit le choix du moment. Changer d'avis le 12 ne touche
 * rien avant le recalcul suivant, ce qui est exactement la promesse.
 *
 * Cette fonction existe pour que l'ÉCRAN puisse le dire honnêtement, au
 * lieu de laisser l'affilié croire que son changement est immédiat.
 */
export function effetDuChangement(
  choixActuel: ChoixRecompense | string | null | undefined,
  choixVoulu: ChoixRecompense | string | null | undefined,
): "aucun-changement" | "le-mois-prochain" {
  const a = choixActuel === "abonnement" ? "abonnement" : "commissions";
  const b = choixVoulu === "abonnement" ? "abonnement" : "commissions";
  return a === b ? "aucun-changement" : "le-mois-prochain";
}
