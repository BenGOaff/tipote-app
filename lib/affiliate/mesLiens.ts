// lib/affiliate/mesLiens.ts
//
// UN LIEN PAR CANAL, ET CHACUN SAIT CE QU'IL RAPPORTE.
//
// Béné, 24 août 2026, en montrant l'espace ambassadeur de Waalaxy :
// "j'aime beaucoup ce qu'ils font c'est moderne et ça donne envie".
//
// Ce qu'ils font de mieux, et qui nous manquait : **une ligne par lien
// NOMMÉ, avec ses propres chiffres.** Chez eux : "Lien par défaut" 915
// clics, "Upgrade" 96, "Demo" 5. En un coup d'oeil, l'affiliée sait
// lequel de ses canaux travaille et lequel ne sert à rien.
//
// -- TOUT ÉTAIT DÉJÀ EN BASE, RIEN N'ÉTAIT AFFICHÉ ---------------------
//
// `affiliate_links` (destination + canal + code court + compteur de
// clics) existe depuis le 19 août, `affiliate_clicks.link_id` et
// `affiliate_conversions.link_id` aussi. L'espace affilié n'en montrait
// rien : l'affiliée avait UN lien, sans moyen de comparer quoi que ce
// soit. La donnée dormait.
//
// -- CE FICHIER NE PARLE À PERSONNE ------------------------------------
//
// Il ne fait aucun appel : il prend des lignes, il rend un tableau.
// C'est ce qui le rend testable, et c'est la règle du dépôt depuis le
// 1er août. La lecture en base vit dans la page.

// -- LES CLICS VIENNENT DE `affiliate_clicks`, JAMAIS D'AILLEURS -------
//
// Béné, 29 août 2026 : "mon dashboard dans affiliate me compte 0 clics
// alors que j'ai shooté mon lien hier et que sur pilotage il me compte
// 6 inscrits. Donc lequel est juste ?"
//
// Pilotage était juste, et cet écran mentait deux fois.
//
// 1. IL LISAIT UN COMPTEUR QUE PERSONNE N'ÉCRIT. La colonne
//    `affiliate_links.clicks_count` existe depuis le 19 août et AUCUNE
//    ligne de code, aucun trigger, ne l'incrémente. Elle vaut donc zéro
//    pour tout le monde, pour toujours : même une affiliée qui utilise
//    ses liens `/go/` verrait toute sa colonne à zéro.
// 2. IL NE MONTRAIT QUE CE QUI PASSE PAR UN LIEN NOMMÉ. Le lien
//    distribué par Promouvoir est `tiquiz.fr/?ref=<code>`, et son clic
//    est enregistré avec `link_id = null` (`/api/affiliate/clic`, la
//    voie ouverte le 27 août). Aucune ligne de `affiliate_links`, donc
//    aucune ligne de tableau, donc quatre chiffres à zéro pendant que
//    le bloc "d'où viennent tes clics", trente pixels plus bas, en
//    affichait 31.
//
// **Règle : le clic se compte dans `affiliate_clicks`, la seule table
// où il est écrit.** C'est la même définition que la vue
// `affiliate_stats` que lit la console de pilotage, donc les deux
// écrans ne peuvent plus se contredire. Et ce qui n'est rattaché à
// aucun lien nommé n'est pas perdu : il porte le nom du lien de base.
//
// Corollaire, et c'est la vraie leçon : un tableau dont on affiche la
// somme doit contenir TOUT ce que la somme prétend couvrir. La règle du
// 24 août ("les chiffres du bandeau sont la SOMME du tableau") était
// respectée à la lettre ; c'est le tableau qui était incomplet.

/** Une ligne de `affiliate_links`, réduite à ce qu'on en affiche. */
export interface LigneLien {
  id: string;
  destination: string;
  channel: string | null;
  short_code: string;
  created_at?: string | null;
}

/** Ce que l'écran affiche pour un lien. */
export interface LienAffiche {
  id: string;
  /** Le nom lu par l'affiliée : son canal, ou le nom de la destination. */
  nom: string;
  /**
   * Le lien long, celui qu'elle colle dans un article.
   *
   * Il passe par NOTRE redirecteur (`/go/<code>/<destination>`), et pas
   * directement par la page de vente : c'est le passage qui enregistre
   * le clic. Un lien qui court-circuite le redirecteur commissionne
   * toujours (le `?ref=` est propagé), mais ses chiffres restent à zéro
   * pour toujours, et l'affiliée conclut que son canal ne marche pas.
   */
  url: string;
  /**
   * Le lien court, celui qui se dicte dans une vidéo.
   *
   * `null` sur le lien de base : il n'est jamais passé par le
   * redirecteur, il n'a donc pas de code court. Inventer une adresse
   * qui ne répond pas serait pire que ne rien afficher.
   */
  urlCourte: string | null;
  clics: number;
  /**
   * Empreintes d'IP distinctes. Une APPROXIMATION, pas une identité :
   * une famille partage une adresse, un téléphone en 4G en change en
   * marchant. L'écran dit "visiteurs", jamais "personnes".
   */
  visiteurs: number;
  inscrits: number;
  payants: number;
  commissionsCents: number;
  creeLe: string | null;
  /** Le lien par défaut ne se supprime pas : il vit dans des vidéos. */
  supprimable: boolean;
  /**
   * La ligne du LIEN DE BASE : tout ce qui est arrivé par
   * `?ref=<code>` sans passer par un lien nommé. C'est le lien que
   * distribue Promouvoir, donc celui que presque tout le monde
   * partage : l'oublier mettait le tableau, et donc les quatre
   * chiffres du haut, à zéro.
   */
  parDefaut: boolean;
  /**
   * `false` quand la destination a quitté le catalogue.
   *
   * On l'affiche QUAND MÊME. La faire disparaître emportait ses clics
   * avec elle, donc changeait un total sans que personne ne puisse le
   * voir : une ligne qu'on ne sait plus nommer vaut mieux qu'un chiffre
   * faux.
   */
  destinationConnue: boolean;
}

/**
 * L'identifiant de la ligne du lien de base.
 *
 * Ce n'est pas une ligne de `affiliate_links` : elle n'existe que dans
 * le tableau. Le préfixe interdit toute collision avec un uuid, et
 * l'écran s'en sert pour ne PAS proposer de suppression.
 */
export const ID_LIEN_PAR_DEFAUT = "lien-de-base";

/** Ce qui est arrivé sans passer par un lien nommé. */
export interface HorsLien {
  clics: number;
  visiteurs: number;
  inscrits: number;
  payants: number;
  commissionsCents: number;
}

export interface CompteursParLien {
  /**
   * `link_id` -> nombre de clics, comptés dans `affiliate_clicks`.
   *
   * JAMAIS `affiliate_links.clicks_count` : voir l'en-tête. Cette
   * colonne n'est écrite par personne.
   */
  clics: Map<string, number>;
  /** `link_id` -> empreintes d'IP distinctes. */
  visiteurs: Map<string, number>;
  /** `link_id` -> nombre d'inscrits (conversions). */
  inscrits: Map<string, number>;
  /** `link_id` -> nombre d'inscrits devenus payants. */
  payants: Map<string, number>;
  /** `link_id` -> commissions en centimes. */
  commissions: Map<string, number>;
}

/**
 * Le nom montré à l'affiliée.
 *
 * Son canal quand elle en a posé un (c'est ce qu'elle reconnaît), sinon
 * le nom de la destination. Jamais un identifiant technique : un tableau
 * où toutes les lignes s'appellent `tiquiz_main` ne se lit pas.
 */
export function nomDuLien(
  lien: LigneLien,
  nomsDestinations: ReadonlyMap<string, string>,
): string {
  const canal = String(lien.channel ?? "").trim();
  if (canal) return canal;
  return nomsDestinations.get(lien.destination) ?? lien.destination;
}

/**
 * Le tableau des liens, le plus utilisé en premier.
 *
 * L'ordre n'est pas décoratif : ce que l'affiliée veut voir, c'est ce
 * qui MARCHE. Trier par date de création mettrait son plus vieux lien en
 * haut et son meilleur canal en bas.
 *
 * À clics égaux, le plus récent d'abord : deux liens neufs à zéro clic
 * doivent au moins apparaître dans l'ordre où elle les a créés.
 */
export function construireMesLiens(args: {
  liens: LigneLien[];
  compteurs: CompteursParLien;
  nomsDestinations: ReadonlyMap<string, string>;
  /** Le code public, celui qui vit dans l'URL du redirecteur. */
  refCode: string;
  /** Les destinations connues aujourd'hui. Une inconnue s'affiche quand même. */
  destinationsConnues: ReadonlySet<string>;
  /** L'origine de l'espace affilié : elle porte `/go/` ET `/j/`. */
  origine: string;
  /** La destination qui ne se supprime pas. */
  destinationParDefaut: string;
  /**
   * Ce qui n'est rattaché à AUCUN lien nommé : le lien de base.
   *
   * C'est `tiquiz.fr/?ref=<code>`, celui que distribue Promouvoir et
   * que l'affiliée partage vraiment. Ses clics sont enregistrés avec
   * `link_id = null` ; sans cette ligne ils n'apparaissaient nulle
   * part, et les quatre chiffres du haut annonçaient zéro à quelqu'un
   * qui venait d'en faire trente et un.
   */
  horsLien: HorsLien;
  /** Le nom lisible du lien de base, dans la langue de l'affiliée. */
  nomLienParDefaut: string;
  /** L'URL du lien de base, telle qu'elle est distribuée. */
  urlLienParDefaut: string;
}): LienAffiche[] {
  const sortie: LienAffiche[] = [];

  const base = args.origine.replace(/\/+$/, "");

  for (const lien of args.liens) {
    // Une destination retirée du catalogue reste AFFICHÉE, nommée par
    // son slug. La masquer emportait ses clics avec elle : le tableau
    // changeait de total sans que personne ne puisse le constater.
    const connue = args.destinationsConnues.has(lien.destination);

    const canal = String(lien.channel ?? "").trim();
    // `/go/<code>/<destination>/<canal>` : le canal est le DERNIER
    // segment, c'est lui qui dit LEQUEL de ses liens a produit le clic.
    const chemin = [args.refCode, lien.destination, canal].filter(Boolean).map(encodeURIComponent);
    sortie.push({
      id: lien.id,
      nom: nomDuLien(lien, args.nomsDestinations),
      url: `${base}/go/${chemin.join("/")}`,
      urlCourte: `${base}/j/${lien.short_code}`,
      clics: args.compteurs.clics.get(lien.id) ?? 0,
      visiteurs: args.compteurs.visiteurs.get(lien.id) ?? 0,
      inscrits: args.compteurs.inscrits.get(lien.id) ?? 0,
      payants: args.compteurs.payants.get(lien.id) ?? 0,
      commissionsCents: args.compteurs.commissions.get(lien.id) ?? 0,
      creeLe: lien.created_at ?? null,
      // Le lien par défaut ne se supprime pas : il vit dans des vidéos
      // déjà publiées, et un lien mort est une vente perdue pour
      // toujours. C'est la même garantie que les anciens codes.
      supprimable: !!canal || lien.destination !== args.destinationParDefaut,
      parDefaut: false,
      destinationConnue: connue,
    });
  }

  // LE LIEN DE BASE, EN PREMIER ET SANS CONDITION DE VOLUME.
  //
  // Il s'affiche dès qu'il a produit quoi que ce soit. Il ne se
  // supprime pas (il vit dans des vidéos déjà publiées) et il n'a pas
  // de lien court : il n'est pas passé par le redirecteur, il n'a donc
  // aucun code à raccourcir.
  const hl = args.horsLien;
  if (hl.clics > 0 || hl.inscrits > 0 || hl.payants > 0 || hl.commissionsCents > 0) {
    sortie.push({
      id: ID_LIEN_PAR_DEFAUT,
      nom: args.nomLienParDefaut,
      url: args.urlLienParDefaut,
      urlCourte: null,
      clics: hl.clics,
      visiteurs: hl.visiteurs,
      inscrits: hl.inscrits,
      payants: hl.payants,
      commissionsCents: hl.commissionsCents,
      creeLe: null,
      supprimable: false,
      parDefaut: true,
      destinationConnue: true,
    });
  }

  return sortie.sort((a, b) => {
    if (b.clics !== a.clics) return b.clics - a.clics;
    const ta = a.creeLe ? Date.parse(a.creeLe) : 0;
    const tb = b.creeLe ? Date.parse(b.creeLe) : 0;
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}

/** Le total de la colonne, pour le bandeau du haut. */
export function totauxDesLiens(liens: readonly LienAffiche[]): {
  liens: number;
  clics: number;
  visiteurs: number;
  inscrits: number;
  payants: number;
  commissionsCents: number;
} {
  return liens.reduce(
    (acc, l) => ({
      // Le lien de base n'est pas un lien qu'elle a créé : il ne se
      // compte pas dans "Liens", sinon le tableau annoncerait un lien
      // à quelqu'un qui n'en a fabriqué aucun. Ses clics, eux, comptent.
      liens: acc.liens + (l.parDefaut ? 0 : 1),
      clics: acc.clics + l.clics,
      visiteurs: acc.visiteurs + l.visiteurs,
      inscrits: acc.inscrits + l.inscrits,
      payants: acc.payants + l.payants,
      commissionsCents: acc.commissionsCents + l.commissionsCents,
    }),
    { liens: 0, clics: 0, visiteurs: 0, inscrits: 0, payants: 0, commissionsCents: 0 },
  );
}
