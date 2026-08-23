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

/** Une ligne de `affiliate_links`, réduite à ce qu'on en affiche. */
export interface LigneLien {
  id: string;
  destination: string;
  channel: string | null;
  short_code: string;
  clicks_count?: number | null;
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
  /** Le lien court, celui qui se dicte dans une vidéo. */
  urlCourte: string;
  clics: number;
  inscrits: number;
  payants: number;
  commissionsCents: number;
  creeLe: string | null;
  /** Le lien par défaut ne se supprime pas : il vit dans des vidéos. */
  supprimable: boolean;
}

export interface CompteursParLien {
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
  /** Les destinations connues aujourd'hui, pour ne pas montrer un lien mort. */
  destinationsConnues: ReadonlySet<string>;
  /** L'origine de l'espace affilié : elle porte `/go/` ET `/j/`. */
  origine: string;
  /** La destination qui ne se supprime pas. */
  destinationParDefaut: string;
}): LienAffiche[] {
  const sortie: LienAffiche[] = [];

  const base = args.origine.replace(/\/+$/, "");

  for (const lien of args.liens) {
    // Une destination retirée du catalogue : on n'affiche PAS un lien
    // qu'on ne sait plus nommer. Il continue de rediriger (la
    // redirection lit la base, pas cet écran), mais une ligne sans nom
    // dans un tableau de comparaison ne sert à rien.
    if (!args.destinationsConnues.has(lien.destination)) continue;

    const canal = String(lien.channel ?? "").trim();
    // `/go/<code>/<destination>/<canal>` : le canal est le DERNIER
    // segment, c'est lui qui dit LEQUEL de ses liens a produit le clic.
    const chemin = [args.refCode, lien.destination, canal].filter(Boolean).map(encodeURIComponent);
    sortie.push({
      id: lien.id,
      nom: nomDuLien(lien, args.nomsDestinations),
      url: `${base}/go/${chemin.join("/")}`,
      urlCourte: `${base}/j/${lien.short_code}`,
      clics: Number(lien.clicks_count) || 0,
      inscrits: args.compteurs.inscrits.get(lien.id) ?? 0,
      payants: args.compteurs.payants.get(lien.id) ?? 0,
      commissionsCents: args.compteurs.commissions.get(lien.id) ?? 0,
      creeLe: lien.created_at ?? null,
      // Le lien par défaut ne se supprime pas : il vit dans des vidéos
      // déjà publiées, et un lien mort est une vente perdue pour
      // toujours. C'est la même garantie que les anciens codes.
      supprimable: !!canal || lien.destination !== args.destinationParDefaut,
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
  inscrits: number;
  payants: number;
  commissionsCents: number;
} {
  return liens.reduce(
    (acc, l) => ({
      liens: acc.liens + 1,
      clics: acc.clics + l.clics,
      inscrits: acc.inscrits + l.inscrits,
      payants: acc.payants + l.payants,
      commissionsCents: acc.commissionsCents + l.commissionsCents,
    }),
    { liens: 0, clics: 0, inscrits: 0, payants: 0, commissionsCents: 0 },
  );
}
