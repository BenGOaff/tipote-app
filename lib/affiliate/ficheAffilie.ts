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

export interface FicheAffilie {
  filleuls: Filleul[];
  /** Ceux qui ont acheté au moins une fois. */
  acheteurs: number;
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

  return { filleuls, acheteurs: filleuls.filter((f) => f.achats.length > 0).length };
}
