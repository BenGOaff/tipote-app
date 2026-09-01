// lib/affiliate/ficheComplete.ts
//
// TOUT CE QU'IL FAUT SAVOIR SUR UN AFFILIÉ, EN UN SEUL ENDROIT.
//
// Béné, 31 août 2026 : "je clique sur l'affilié, je vois combien de
// comptes gratuits il a fait créer, combien il a de clients payants,
// quel est son palier de commission et / ou sa réduction sur l'outil,
// les factures passées, en cours et à venir, son mode de paiement...
// je veux TOUT parce que je ne peux le voir qu'ici."
//
// Elle a raison sur le "je ne peux le voir qu'ici" : le registre vit
// dans CE dépôt et nulle part ailleurs. Un chiffre qui n'apparaît pas
// sur cette fiche est un chiffre qu'elle ne peut obtenir qu'en ouvrant
// la base.
//
// -- CE MODULE NE LIT AUCUNE BASE, ET C'EST LE POINT --------------------
//
// Il reçoit des lignes et rend un écran. C'est ce qui le rend testable,
// et c'est la leçon qui revient dans ce dépôt depuis le 1er août : une
// règle enfermée dans un fichier qui importe `supabaseAdmin` n'est
// testée par personne, donc c'est là que les bugs s'installent.
//
// -- L'IBAN NE SORT JAMAIS EN CLAIR ------------------------------------
//
// Règle du 25 août, et elle vaut AUSSI pour l'écran de Béné : un écran
// se photographie, se partage, se laisse ouvert. On rend le MASQUE
// (`FR14••••2606`), déjà stocké, jamais le chiffré ni le déchiffré.
// Seul le constructeur du fichier SEPA lit les coordonnées, et il
// tourne sur le serveur.

import {
  COMMISSION_BASE_PCT,
  prochaineMarche,
  remiseAbonnementPct,
  tauxCommissionPct,
  type ChoixRecompense,
} from "@/lib/affiliate/recompense";

/** Ce que l'affilié gagne aujourd'hui, et ce qui l'attend à la marche suivante. */
export interface RecompenseAffilie {
  /** `commissions` (taux qui monte) ou `abonnement` (remise sur l'outil). */
  choix: ChoixRecompense;
  /** Le taux appliqué à ses ventes, en pourcentage. */
  tauxPct: number;
  /** Vient-il d'un accord négocié plutôt que du barème ? */
  tauxNegocie: boolean;
  /** La remise sur son abonnement, en pourcentage. */
  remisePct: number;
  /** Combien de filleuls il lui manque pour la marche suivante, ou null au plafond. */
  prochaineMarcheManque: number | null;
  /** Ce qu'il atteindra à cette marche : un taux, ou une remise selon son choix. */
  prochaineMarcheValeur: number | null;
}

/**
 * LE TAUX AFFICHÉ EST CELUI QUI SERA VERSÉ, jamais un barème recalculé
 * à côté.
 *
 * `attributeSale` pose `recompense_commission_pct` sur l'AFFILIÉ, et un
 * accord négocié (`affiliate_rate_overrides`) passe devant le barème.
 * Réafficher `tauxCommissionPct(filleuls)` ici donnerait un chiffre
 * différent de celui qui part vraiment, et c'est celui de l'écran que
 * Béné croirait. C'est le défaut sorti sept fois dans ces dépôts : deux
 * endroits qui calculent la même chose finissent par se contredire.
 *
 * `filleulsPayants` sert uniquement à annoncer la MARCHE SUIVANTE, qui
 * est une projection et pas un montant dû. **Un compte gratuit n'y
 * compte pas** : c'est la règle de Béné, et c'est déjà ce que fait
 * `cron/recompense-affilies`, qui décide vraiment.
 */
export function construireRecompense(args: {
  choix: unknown;
  /** Le taux stocké sur l'affilié, s'il y en a un. */
  tauxStockePct: unknown;
  /** Le taux négocié, qui passe devant tout le reste. */
  tauxNegociePct: unknown;
  remiseStockePct: unknown;
  /**
   * LES FILLEULS QUI PAIENT, ET EUX SEULS.
   *
   * Le nom est explicite exprès. J'ai passé ici le nombre TOTAL de
   * filleuls le 31 août, et l'écran a annoncé à Béné "encore 4 filleuls
   * et il passe à 50 %" en comptant des comptes gratuits. Sa réponse :
   * "tu veux que je paye des gens qui ne me rapportent rien ?"
   *
   * Un paramètre qui s'appelle `filleuls` accepte silencieusement le
   * mauvais nombre. Celui-ci ne peut plus être rempli au hasard : c'est
   * la seule protection qui survit au prochain qui touchera au fichier
   * (règle du 1er août).
   */
  filleulsPayants: number;
}): RecompenseAffilie {
  const choix: ChoixRecompense =
    String(args.choix ?? "").trim().toLowerCase() === "abonnement" ? "abonnement" : "commissions";

  const negocie = Number(args.tauxNegociePct);
  const tauxNegocie = Number.isFinite(negocie) && negocie > 0;

  const stocke = Number(args.tauxStockePct);
  // Ordre : l'accord négocié, puis ce qui est posé sur l'affilié, puis
  // le barème. Le barème est le DERNIER recours, pas le premier.
  const tauxPct = tauxNegocie
    ? negocie
    : Number.isFinite(stocke) && stocke > 0
      ? stocke
      : choix === "commissions"
        ? tauxCommissionPct(args.filleulsPayants)
        : COMMISSION_BASE_PCT;

  const remiseStockee = Number(args.remiseStockePct);
  const remisePct =
    choix === "abonnement"
      ? Number.isFinite(remiseStockee) && remiseStockee > 0
        ? remiseStockee
        : remiseAbonnementPct(args.filleulsPayants)
      : 0;

  // LA MARCHE SUIVANTE DÉPEND DU CHOIX, et c'est un PARAMÈTRE de
  // `prochaineMarche` : annoncer une marche de commission à quelqu'un
  // qui a pris la remise sur son abonnement serait faux dans les deux
  // sens (règle du 1er août : quand un cas a deux mécaniques, la
  // mécanique se dit, elle ne se devine pas).
  const marche = prochaineMarche(choix, args.filleulsPayants);
  return {
    choix,
    tauxPct,
    tauxNegocie,
    remisePct,
    prochaineMarcheManque: marche?.manque ?? null,
    prochaineMarcheValeur: marche?.valeur ?? null,
  };
}

/** Où part son argent, en clair pour la méthode, MASQUÉ pour le reste. */
export interface VersementAffilie {
  /** `paypal`, `virement`, ou null tant qu'il n'a rien choisi. */
  methode: "paypal" | "virement" | null;
  /** A-t-il CHOISI, ou est-ce déduit d'une ligne historique ? */
  explicite: boolean;
  paypalEmail: string | null;
  /** `FR14••••2606`. Jamais l'IBAN, ni chiffré ni déchiffré. */
  ibanMasque: string | null;
  titulaire: string | null;
  /** Le mandat d'autofacturation est-il accepté ? Sans lui, pas de facture. */
  mandatAccepteLe: string | null;
  /** Ce qui manque pour qu'un virement puisse partir. */
  manques: string[];
}

/**
 * CE QUI MANQUE EST DIT, JAMAIS AVALÉ.
 *
 * Une ligne écartée d'un lot de versement doit s'expliquer (règle du
 * 25 août). Ici on le dit AVANT le lot, pour que Béné puisse écrire à
 * la personne au lieu de découvrir le trou le jour du virement.
 *
 * Les deux familles restent SÉPARÉES : quelqu'un qui a très bien rempli
 * son IBAN et qui a juste oublié de cocher le mandat ne doit pas lire
 * "coordonnées manquantes", ça l'envoie chercher au mauvais endroit.
 */
export function construireVersement(args: {
  methode: unknown;
  paypalEmail: unknown;
  ibanMasque: unknown;
  titulaire: unknown;
  mandatAccepteLe: unknown;
  /** Le profil fiscal est-il complet ? La décision vit dans `fiscal.ts`. */
  profilFiscalComplet: boolean;
}): VersementAffilie {
  const brut = String(args.methode ?? "").trim().toLowerCase();
  const paypalEmail = texte(args.paypalEmail);
  const ibanMasque = texte(args.ibanMasque);

  let methode: VersementAffilie["methode"] = null;
  let explicite = false;
  if (brut === "paypal" || brut === "virement") {
    methode = brut;
    explicite = true;
  } else if (paypalEmail && !ibanMasque) {
    // ON NE DEVINE QUE POUR LES LIGNES HISTORIQUES, et on le DIT
    // (`explicite: false`), pour que l'écran redemande. Deviner quand
    // les deux sont remplis, ce serait le code qui décide où part
    // l'argent de quelqu'un.
    methode = "paypal";
  } else if (ibanMasque && !paypalEmail) {
    methode = "virement";
  }

  const manques: string[] = [];
  if (!methode) manques.push("methode");
  if (methode === "paypal" && !paypalEmail) manques.push("paypal");
  if (methode === "virement" && !ibanMasque) manques.push("iban");
  if (!args.mandatAccepteLe) manques.push("mandat");
  if (!args.profilFiscalComplet) manques.push("profil-fiscal");

  return {
    methode,
    explicite,
    paypalEmail,
    ibanMasque,
    titulaire: texte(args.titulaire),
    mandatAccepteLe: texte(args.mandatAccepteLe),
    manques,
  };
}

/** Une autofacture émise à son nom. */
export interface FactureAffilie {
  numero: string;
  genre: string;
  periode: string;
  ttcCents: number;
  htCents: number;
  currency: string;
  emiseLe: string | null;
  /** Rattachée à un lot de versement, donc payée. */
  versee: boolean;
}

function texte(v: unknown, max = 320): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

/** L'argent, en quatre poches qui ne se recouvrent pas. */
export interface ArgentAffilie {
  /** Gagné et pas encore versé (`pending` + `approved`). */
  aVenirCents: number;
  /** Encore dans le délai de 30 jours. */
  sousGarantieCents: number;
  /** Mûr, il partira au prochain lot. */
  aVerserCents: number;
  verseCents: number;
  /** Remboursements et impayés. AFFICHÉ, jamais soustrait en silence. */
  annuleCents: number;
  /** Les devises étrangères sont ÉCARTÉES d'un lot : on les compte à part. */
  autresDevises: number;
}
