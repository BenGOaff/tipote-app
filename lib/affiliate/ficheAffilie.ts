// lib/affiliate/ficheAffilie.ts
//
// LA FICHE D'UN AFFILIÉ (Béné, 29 août 2026).
//
// "Pour chaque affilié je veux une fiche contact plus précise : je veux
// voir qui sont leurs affiliés, et pour leurs clients je veux voir qui
// est leur affilié."
//
// -- CE QU'UNE FICHE DOIT RÉPONDRE ------------------------------------
//
// Pas "combien il a gagné" (le tableau le dit déjà), mais **qui il a
// amené, et ce que ces gens ont fait ensuite**. C'est la seule vue qui
// permet de lui écrire quelque chose d'utile : dix inscrits et zéro
// achat, ce n'est pas le même message qu'un inscrit qui a pris l'annuel.
//
// -- L'ORDRE N'EST PAS CHRONOLOGIQUE, ET C'EST VOULU -------------------
//
// Ceux qui ont ACHETÉ en premier, puis les derniers arrivés. Une fiche
// rangée par date mettrait en haut celui qui vient de cliquer et tout en
// bas celui qui a pris l'abonnement annuel.
//
// -- UN ANCIEN IDENTIFIANT COMPTE POUR LUI ----------------------------
//
// Systeme.io peut désigner une personne par plusieurs identifiants. Sans
// la traduction par alias, sa fiche serait vide alors qu'il travaille.
//
// PUR : ni horloge ni base. `maintenant` est un paramètre.

import { commissionApprouvable, type CommissionAVerser } from "@/lib/affiliate/versement";

export interface AchatFilleul {
  /** Ce qui a été acheté, quand on le sait. */
  produit: string | null;
  /** La commission gagnée dessus, en centimes. */
  commissionCents: number;
  devise: string;
  /** `versee | a-verser | sous-garantie | annulee` */
  etat: "versee" | "a-verser" | "sous-garantie" | "annulee";
  le: string;
}

export interface Filleul {
  email: string;
  /** Quand il est arrivé par son lien. */
  arriveLe: string | null;
  achats: AchatFilleul[];
  /** Ce qu'il a rapporté, annulations exclues, en euros seulement. */
  gagneCents: number;
}

/**
 * L'ARGENT, EN POCHES QUI NE SE RECOUVRENT PAS (31 août 2026).
 *
 * Béné : "je veux TOUT parce que je ne peux le voir qu'ici." Un total
 * unique ne répond à aucune de ses questions : "combien je lui dois",
 * "combien part au prochain lot" et "combien il a déjà touché" sont
 * trois nombres différents, et les additionner en un seul est ce qui a
 * fait annoncer un chiffre jamais versé le 31 août.
 *
 * L'ANNULÉ S'AFFICHE, il ne se soustrait pas en silence : c'est la
 * règle des lignes écartées d'un lot (25 août).
 */
export interface ArgentAffilie {
  /** Gagné et pas encore versé : `sousGarantie` + `aVerser`. */
  aVenirCents: number;
  /** Encore dans le délai de 30 jours après le paiement. */
  sousGarantieCents: number;
  /** Mûr : ça part au prochain lot, entre le 10 et le 13. */
  aVerserCents: number;
  verseCents: number;
  /** Remboursements et impayés. */
  annuleCents: number;
  /**
   * Les commissions dans une AUTRE devise, comptées en NOMBRE et pas en
   * montant : les additionner à des euros produirait un total faux qui
   * a l'air juste. Elles sont écartées d'un lot avec la raison
   * `devise` (26 août).
   */
  autresDevises: number;
}

export interface FicheAffilie {
  filleuls: Filleul[];
  /** Ceux qui ont acheté au moins une fois, annulations comprises. */
  acheteurs: number;
  /**
   * CEUX QUI COMPTENT POUR LE PALIER, et eux seuls.
   *
   * Béné, 31 août 2026 : "on compte les affiliés mais seuls ceux QUI
   * PAIENT permettent d'augmenter le palier de commission ! Tu veux que
   * je paye des gens qui ne me rapportent rien ? Client payant =
   * augmente le %, client gratuit = aucun impact."
   *
   * Compté EXACTEMENT comme `cron/recompense-affilies`, qui est ce qui
   * décide vraiment : une personne par adresse, et les commissions
   * `cancelled` / `rejected` ne comptent pas. Un remboursement ne doit
   * pas laisser un palier gagné derrière lui.
   *
   * Il diffère donc d'`acheteurs`, qui compte tous ceux qui ont acheté
   * un jour : les deux se ressemblent et les confondre ferait annoncer
   * un palier que le barème ne donnera pas.
   */
  payants: number;
  argent: ArgentAffilie;
}

/** L'état d'une commission, dans les mots de l'écran des versements. */
export function etatCommission(
  c: CommissionAVerser,
  maintenant: number,
): AchatFilleul["etat"] {
  const statut = String(c.status ?? "").trim().toLowerCase();
  if (c.cancelled_at || statut === "cancelled" || statut === "rejected") return "annulee";
  if (statut === "paid") return "versee";
  if (statut === "approved" || commissionApprouvable(c, maintenant)) return "a-verser";
  return "sous-garantie";
}

export function construireFiche(args: {
  sa: string;
  /** ancien identifiant -> identifiant courant. */
  alias: ReadonlyMap<string, string>;
  conversions: readonly { sa: string; email?: string | null; created_at?: string | null }[];
  commissions: readonly (CommissionAVerser & {
    customer_email?: string | null;
    product_name?: string | null;
  })[];
  maintenant: number;
}): FicheAffilie {
  const resoudre = (sa: unknown): string => {
    const v = String(sa ?? "").trim();
    return args.alias.get(v) ?? v;
  };

  const parEmail = new Map<string, Filleul>();
  // Les adresses qui ont au moins une commission NON annulée. Un Set
  // parce qu'on compte des PERSONNES : un filleul qui paie douze
  // échéances ne vaut pas douze filleuls.
  const payants = new Set<string>();
  const argent: ArgentAffilie = {
    aVenirCents: 0,
    sousGarantieCents: 0,
    aVerserCents: 0,
    verseCents: 0,
    annuleCents: 0,
    autresDevises: 0,
  };

  const prendre = (email: string): Filleul => {
    const cle = email.trim().toLowerCase();
    const vu = parEmail.get(cle);
    if (vu) return vu;
    const neuf: Filleul = { email: cle, arriveLe: null, achats: [], gagneCents: 0 };
    parEmail.set(cle, neuf);
    return neuf;
  };

  for (const c of args.conversions) {
    if (resoudre(c.sa) !== args.sa) continue;
    const email = String(c.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const f = prendre(email);
    // LA PLUS ANCIENNE DATE GAGNE : c'est celle où il l'a amené, et
    // c'est ce rattachement qui vaut à vie.
    const t = Date.parse(String(c.created_at ?? ""));
    const actuelle = f.arriveLe ? Date.parse(f.arriveLe) : Infinity;
    if (Number.isFinite(t) && t < actuelle) f.arriveLe = String(c.created_at);
  }

  for (const c of args.commissions) {
    if (resoudre(c.sa) !== args.sa) continue;
    const email = String(c.customer_email ?? "").trim().toLowerCase();
    // UN ACHAT SANS ADRESSE RESTE VISIBLE, sous un nom qui le dit : le
    // faire disparaître ferait manquer de l'argent dans la fiche.
    const f = prendre(email || "adresse inconnue");
    const etat = etatCommission(c, args.maintenant);
    const devise = String(c.currency ?? "EUR").trim().toUpperCase() || "EUR";
    f.achats.push({
      produit: String(c.product_name ?? "").trim() || null,
      commissionCents: Number(c.commission_cents) || 0,
      devise,
      etat,
      le: String(c.sale_at ?? ""),
    });
    if (etat !== "annulee" && devise === "EUR") {
      f.gagneCents += Number(c.commission_cents) || 0;
    }

    if (etat !== "annulee" && email) payants.add(email);

    const montant = Number(c.commission_cents) || 0;
    if (devise !== "EUR") {
      // Comptée, jamais additionnée : voir `ArgentAffilie.autresDevises`.
      argent.autresDevises += 1;
    } else if (etat === "annulee") {
      argent.annuleCents += montant;
    } else if (etat === "versee") {
      argent.verseCents += montant;
    } else if (etat === "a-verser") {
      argent.aVerserCents += montant;
      argent.aVenirCents += montant;
    } else {
      argent.sousGarantieCents += montant;
      argent.aVenirCents += montant;
    }
  }

  const filleuls = [...parEmail.values()].map((f) => ({
    ...f,
    achats: [...f.achats].sort((a, b) => (b.le > a.le ? 1 : b.le < a.le ? -1 : 0)),
  }));

  // CEUX QUI ONT ACHETÉ D'ABORD. Un rangement par date mettrait en haut
  // celui qui vient de cliquer et tout en bas celui qui a pris l'annuel.
  filleuls.sort((a, b) => {
    if (a.achats.length !== b.achats.length) return b.achats.length - a.achats.length;
    if (a.gagneCents !== b.gagneCents) return b.gagneCents - a.gagneCents;
    const ta = a.arriveLe ? Date.parse(a.arriveLe) : -Infinity;
    const tb = b.arriveLe ? Date.parse(b.arriveLe) : -Infinity;
    return tb - ta;
  });

  return {
    filleuls,
    acheteurs: filleuls.filter((f) => f.achats.length > 0).length,
    payants: payants.size,
    argent,
  };
}
