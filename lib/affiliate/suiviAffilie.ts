// lib/affiliate/suiviAffilie.ts
//
// LE TABLEAU DE SUIVI DE L'AFFILIÉ (Béné, 29 août 2026).
//
// "En tant qu'affilié où je vois mes affiliés ? Mon graph de
// statistiques ? Un vrai tableau de suivi ? Au minimum aussi détaillé
// que systeme io, voire mieux, plus précis et plus complet."
//
// Il voyait ses commissions (`/revenus`) et ses liens (`/liens`), donc
// le DÉBUT et la FIN de la chaîne. Entre les deux, rien : ni qui il a
// amené, ni quand, ni par quel canal, ni combien se sont arrêtés en
// route. C'est justement le milieu qui dit quoi corriger.
//
// -- CE QUE CE MODULE NE FAIT PAS --------------------------------------
//
// Aucun appel, aucune base : il prend des lignes, il rend des chiffres.
// C'est la règle du dépôt depuis le 1er août, et c'est ce qui permet de
// tester le seul endroit qui pouvait dériver. La lecture vit dans la
// page.
//
// -- L'ADRESSE D'UN FILLEUL EST MASQUÉE, ET C'EST VOULU ----------------
//
// L'affilié a besoin de RECONNAÎTRE quelqu'un ("c'est bien la personne
// à qui j'ai parlé jeudi"), pas de disposer de son adresse. Ce sont les
// contacts de Béné, pas les siens : un écran se photographie, se
// partage, s'exporte. Même règle que l'IBAN, qui ne ressort jamais en
// clair, pas même à son propriétaire.

/** Une ligne de `affiliate_conversions`, réduite à ce qu'on en affiche. */
export interface LigneFilleul {
  email: string;
  created_at: string;
  channel?: string | null;
  source?: string | null;
}

/** Une ligne de `affiliate_commissions`, réduite de même. */
export interface LigneVente {
  customer_email?: string | null;
  sale_at?: string | null;
  commission_cents?: number | null;
  status?: string | null;
  cancelled_at?: string | null;
}

export type EtatFilleul = "inscrit" | "client" | "annule";

export interface Filleul {
  /** `j***e@gmail.com` : reconnaissable, pas réutilisable. */
  masque: string;
  /** Le jour de l'inscription, en ISO court. */
  jour: string;
  /** Son canal, sa provenance, ou rien. */
  origine: string | null;
  etat: EtatFilleul;
  /** Ce qu'il a rapporté, en centimes. Zéro tant qu'il n'a pas payé. */
  commissionsCents: number;
}

/**
 * Masque une adresse sans la rendre méconnaissable.
 *
 * On garde la première et la dernière lettre de la partie locale, et le
 * domaine en entier : c'est ce qui permet de dire "ah oui, le gmail de
 * Jocelyne" sans donner de quoi écrire à quelqu'un.
 */
export function masquerEmail(brut: string): string {
  const email = String(brut ?? "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domaine = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? "*"}***${domaine}`;
  return `${local[0]}***${local[local.length - 1]}${domaine}`;
}

/** Le jour ISO (UTC) d'un horodatage, ou null s'il est illisible. */
export function jourDe(iso: string | null | undefined): string | null {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * La liste des filleuls, du plus récent au plus ancien.
 *
 * L'ÉTAT vient des commissions, jamais d'une déduction sur le montant :
 * une commission annulée existe, avec son montant, et l'afficher comme
 * un client payant ferait croire à un revenu qui ne viendra pas.
 *
 * **Une commission annulée ne compte PAS dans le total.** Elle reste
 * visible sur la ligne, avec son état : la faire disparaître serait un
 * chiffre qui baisse sans explication, et l'affilié n'aurait aucun
 * moyen de comprendre pourquoi.
 */
export function construireFilleuls(args: {
  conversions: readonly LigneFilleul[];
  ventes: readonly LigneVente[];
}): Filleul[] {
  const parEmail = new Map<string, { cents: number; annulee: boolean; payante: boolean }>();
  for (const v of args.ventes) {
    const email = String(v.customer_email ?? "").trim().toLowerCase();
    if (!email) continue;
    const annulee = !!v.cancelled_at || v.status === "cancelled" || v.status === "rejected";
    const vu = parEmail.get(email) ?? { cents: 0, annulee: false, payante: false };
    if (annulee) {
      vu.annulee = true;
    } else {
      vu.cents += Number(v.commission_cents) || 0;
      vu.payante = true;
    }
    parEmail.set(email, vu);
  }

  const sortie: Filleul[] = [];
  for (const c of args.conversions) {
    const email = String(c.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const jour = jourDe(c.created_at);
    if (!jour) continue;
    const vente = parEmail.get(email);
    const etat: EtatFilleul = vente?.payante ? "client" : vente?.annulee ? "annule" : "inscrit";
    sortie.push({
      masque: masquerEmail(email),
      jour,
      // Le canal qu'il a écrit passe devant la provenance déduite : il
      // reconnaît son étiquette, pas un nom de domaine.
      origine: String(c.channel ?? "").trim() || String(c.source ?? "").trim() || null,
      etat,
      commissionsCents: vente?.cents ?? 0,
    });
  }

  return sortie.sort((a, b) => (a.jour < b.jour ? 1 : a.jour > b.jour ? -1 : 0));
}

export interface PointJour {
  jour: string;
  clics: number;
  inscrits: number;
  ventes: number;
}

/**
 * La courbe, un point par JOUR, y compris les jours à zéro.
 *
 * Les jours vides ne se sautent pas : c'est le RYTHME qui informe (une
 * campagne le mardi, un creux le week-end). Une courbe qui ne montre
 * que les jours actifs les colle les uns aux autres et ment sur la
 * régularité.
 *
 * `finJour` est un PARAMÈTRE : un test qui dépend de l'horloge clignote,
 * et un écran qui dépend du fuseau du serveur affiche un jour de plus ou
 * de moins selon l'heure.
 */
export function serieParJour(args: {
  clics: readonly { created_at: string }[];
  conversions: readonly { created_at: string }[];
  ventes: readonly LigneVente[];
  jours: number;
  finJour: string;
}): PointJour[] {
  const fin = Date.parse(`${args.finJour}T00:00:00Z`);
  if (!Number.isFinite(fin) || args.jours <= 0) return [];

  const index = new Map<string, PointJour>();
  const JOUR = 86400000;
  for (let i = args.jours - 1; i >= 0; i--) {
    const jour = new Date(fin - i * JOUR).toISOString().slice(0, 10);
    index.set(jour, { jour, clics: 0, inscrits: 0, ventes: 0 });
  }

  const ajouter = (iso: string | null | undefined, champ: "clics" | "inscrits" | "ventes") => {
    const jour = jourDe(iso);
    if (!jour) return;
    const point = index.get(jour);
    // Hors de la fenêtre demandée : on ignore, on ne rabat pas sur le
    // premier jour. Un pic artificiel au bord se lit comme une vraie
    // journée, et c'est indétectable une fois affiché.
    if (point) point[champ] += 1;
  };

  for (const c of args.clics) ajouter(c.created_at, "clics");
  for (const c of args.conversions) ajouter(c.created_at, "inscrits");
  for (const v of args.ventes) {
    if (v.cancelled_at || v.status === "cancelled" || v.status === "rejected") continue;
    ajouter(v.sale_at, "ventes");
  }

  return [...index.values()];
}

export interface Entonnoir {
  clics: number;
  inscrits: number;
  clients: number;
  /** Pourcentage de clics qui laissent une adresse. `null` sans clic. */
  tauxInscription: number | null;
  /** Pourcentage d'inscrits qui achètent. `null` sans inscrit. */
  tauxVente: number | null;
}

/**
 * Les trois étapes, et les deux taux qui disent où ça coince.
 *
 * Un taux sur zéro n'est pas zéro, c'est INCONNU : afficher "0 %" à
 * quelqu'un qui n'a pas encore eu un seul clic lui dit que son lien ne
 * convertit pas, alors qu'il n'a simplement pas encore été utilisé.
 */
export function entonnoir(args: { clics: number; inscrits: number; clients: number }): Entonnoir {
  const pct = (part: number, tout: number) =>
    tout > 0 ? Math.round((part / tout) * 1000) / 10 : null;
  return {
    clics: args.clics,
    inscrits: args.inscrits,
    clients: args.clients,
    tauxInscription: pct(args.inscrits, args.clics),
    tauxVente: pct(args.clients, args.inscrits),
  };
}
