// lib/affiliate/tableauAffilies.ts
//
// LE SUIVI D'UN AFFILIÉ, EN UNE LIGNE (Béné, 29 août 2026).
//
// "De manière générale sur mes affiliés je dois voir : leur code ref,
// leur id sa si dispo, le nombre de clics qu'ils ont reçu, leur nombre
// d'affiliés, leur commission passées, présentes et futures. Bref un
// vrai suivi pratique."
//
// -- LES TROIS TEMPS DE L'ARGENT, ET ILS ONT DÉJÀ UN NOM --------------
//
// "Passées, présentes, futures" recouvre exactement le vocabulaire qui
// est déjà sur son écran de versements, et on garde CE vocabulaire
// plutôt que d'en inventer un deuxième :
//
//   versées        l'argent est parti, la pièce comptable existe
//   à verser       gagné, garantie passée, part au prochain lot
//   sous garantie  gagné, mais la vente peut encore être remboursée
//   annulées       la vente a été remboursée ou impayée
//
// La frontière entre "à verser" et "sous garantie" n'est PAS réécrite
// ici : c'est `commissionApprouvable`, la même fonction qui construit
// vraiment les lots. Deux règles pour la même question finiraient par
// donner deux montants, et c'est celui de l'écran qu'elle croirait.
//
// -- UN ANCIEN IDENTIFIANT COMPTE POUR SON PROPRIÉTAIRE ---------------
//
// Systeme.io peut désigner une personne par plusieurs identifiants (le
// cas d'Eric, 29 août). Ses clics arrivent donc sous l'ancien. Sans la
// traduction par alias, son tableau afficherait zéro clic alors qu'il
// travaille, ce qui est précisément le problème qu'on vient de fermer.
//
// -- ET ON N'ADDITIONNE PAS DES DEVISES ------------------------------
//
// Trois plans Tiquiz en dollars existent chez Systeme.io depuis avril.
// Une commission en dollars ajoutée à un total en euros produit un
// chiffre faux qui a l'air juste. On la COMPTE à part et l'écran le dit
// (même règle que l'exclusion du lot SEPA, 26 août).
//
// PUR : aucune lecture de base, aucune horloge. `maintenant` est un
// paramètre, sinon le test dépend de l'heure et finit par clignoter.

import { commissionApprouvable, type CommissionAVerser } from "@/lib/affiliate/versement";

export interface LigneAffilie {
  sa: string;
  /** Son code public. `null` = il n'a AUCUN lien utilisable aujourd'hui. */
  ref: string | null;
  email: string;
  nom: string | null;
  statut: string;
  /** Ses anciens identifiants Systeme.io, s'il en a. */
  alias: string[];
  clics: number;
  /** Les personnes qu'il a amenées, comptées une seule fois. */
  filleuls: number;
  verseesCents: number;
  aVerserCents: number;
  sousGarantieCents: number;
  annuleesCents: number;
  /** Des commissions dans une autre devise, non additionnables. */
  autresDevises: number;
  /** La date de sa dernière vente commissionnée. */
  derniereVente: string | null;
}

export interface EntreeAffilie {
  sa: string;
  ref?: string | null;
  email: string;
  display_name?: string | null;
  status?: string | null;
}

/**
 * Le tableau, une ligne par affilié.
 *
 * `alias` : ancien identifiant -> identifiant courant. Les clics, les
 * conversions et les commissions écrits sous un ancien sont reportés
 * sur son propriétaire.
 */
export function construireTableauAffilies(args: {
  affilies: readonly EntreeAffilie[];
  alias: ReadonlyMap<string, string>;
  clics: readonly { sa: string }[];
  conversions: readonly { sa: string; email?: string | null }[];
  commissions: readonly CommissionAVerser[];
  maintenant: number;
}): LigneAffilie[] {
  const resoudre = (sa: unknown): string => {
    const v = String(sa ?? "").trim();
    return args.alias.get(v) ?? v;
  };

  const connus = new Set(args.affilies.map((a) => a.sa));

  const clics = new Map<string, number>();
  for (const c of args.clics) {
    const sa = resoudre(c.sa);
    if (!connus.has(sa)) continue;
    clics.set(sa, (clics.get(sa) ?? 0) + 1);
  }

  // Les filleuls se comptent par ADRESSE, pas par ligne : la même
  // personne peut cliquer et revenir, et la compter deux fois
  // gonflerait un chiffre dont il va se servir pour se juger.
  const filleuls = new Map<string, Set<string>>();
  for (const c of args.conversions) {
    const sa = resoudre(c.sa);
    if (!connus.has(sa)) continue;
    const email = String(c.email ?? "").trim().toLowerCase();
    const vus = filleuls.get(sa) ?? new Set<string>();
    vus.add(email || `#${vus.size}`);
    filleuls.set(sa, vus);
  }

  const argent = new Map<string, Omit<LigneAffilie, keyof EntreeAffilie | "alias" | "clics" | "filleuls" | "nom" | "statut">>();
  const vide = () => ({
    sa: "",
    ref: null as string | null,
    email: "",
    verseesCents: 0,
    aVerserCents: 0,
    sousGarantieCents: 0,
    annuleesCents: 0,
    autresDevises: 0,
    derniereVente: null as string | null,
  });

  for (const c of args.commissions) {
    const sa = resoudre(c.sa);
    if (!connus.has(sa)) continue;
    const l = argent.get(sa) ?? vide();

    const devise = String(c.currency ?? "EUR").trim().toUpperCase() || "EUR";
    const statut = String(c.status ?? "").trim().toLowerCase();
    const cents = Number(c.commission_cents) || 0;

    // La date la plus récente, quel que soit le statut : une vente
    // annulée a quand même eu lieu.
    const t = Date.parse(String(c.sale_at ?? ""));
    if (Number.isFinite(t)) {
      const actuelle = l.derniereVente ? Date.parse(l.derniereVente) : -Infinity;
      if (t > actuelle) l.derniereVente = c.sale_at;
    }

    if (c.cancelled_at || statut === "cancelled" || statut === "rejected") {
      l.annuleesCents += devise === "EUR" ? cents : 0;
      if (devise !== "EUR") l.autresDevises += 1;
    } else if (devise !== "EUR") {
      // Non additionnable, mais SURTOUT PAS invisible : il a gagné cet
      // argent, quelqu'un devra s'en occuper.
      l.autresDevises += 1;
    } else if (statut === "paid") {
      l.verseesCents += cents;
    } else if (statut === "approved" || commissionApprouvable(c, args.maintenant)) {
      l.aVerserCents += cents;
    } else {
      l.sousGarantieCents += cents;
    }

    argent.set(sa, l);
  }

  return args.affilies.map((a) => {
    const l = argent.get(a.sa) ?? vide();
    return {
      sa: a.sa,
      ref: String(a.ref ?? "").trim() || null,
      email: a.email,
      nom: String(a.display_name ?? "").trim() || null,
      // Un statut illisible est lu comme actif : refuser de payer
      // quelqu'un sur une valeur qu'on ne sait pas lire serait la pire
      // des réponses (règle du 26 août).
      statut: String(a.status ?? "").trim().toLowerCase() || "active",
      alias: [...args.alias.entries()].filter(([, vers]) => vers === a.sa).map(([old]) => old),
      clics: clics.get(a.sa) ?? 0,
      filleuls: filleuls.get(a.sa)?.size ?? 0,
      verseesCents: l.verseesCents,
      aVerserCents: l.aVerserCents,
      sousGarantieCents: l.sousGarantieCents,
      annuleesCents: l.annuleesCents,
      autresDevises: l.autresDevises,
      derniereVente: l.derniereVente,
    };
  });
}

/**
 * Range le tableau : celui qui travaille le plus en premier.
 *
 * L'argent d'abord, puis les filleuls, puis les clics. Trier par date
 * d'inscription mettrait le plus ancien en tête et le meilleur en bas
 * (même raison que le tableau de ses liens, 24 août).
 */
export function trierAffilies(lignes: readonly LigneAffilie[]): LigneAffilie[] {
  const poids = (l: LigneAffilie) =>
    l.verseesCents + l.aVerserCents + l.sousGarantieCents;
  return [...lignes].sort(
    (a, b) => poids(b) - poids(a) || b.filleuls - a.filleuls || b.clics - a.clics,
  );
}
