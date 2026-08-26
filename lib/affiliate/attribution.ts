// lib/affiliate/attribution.ts
//
// Coeur du système d'attribution affiliée. À chaque vente reçue (Tipote
// directement, ou Tiquiz via /api/affiliate/attribute-sale), on cherche
// si l'email du client matche une conversion affiliée récente. Si oui,
// on insère une row dans affiliate_commissions.
//
// Last-touch dans 90 jours : on prend la conversion la plus récente
// pour cet email. Si quelqu'un clique sur 2 affiliés et achète,
// l'affilié qui a "fermé" la vente l'emporte. Standard industrie.
//
// Idempotence : unique constraint (source_app, sio_order_id) en DB.
// Si Systeme.io retry le webhook on ignore silencieusement.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";
import { memePersonne } from "@/lib/affiliate/memeAdresse";
// LE RATTACHEMENT EST À VIE, et la décision vit dans un module PUR :
// ce fichier importe `supabaseAdmin`, donc aucun test ne peut
// l'importer. Voir `fenetreAttribution.ts`.
import { planchierRattachement } from "@/lib/affiliate/fenetreAttribution";
import {
  COMMISSION_RATES,
  htFromTtcCents,
  resolveCommissionRate,
  type CommissionBase,
} from "@/lib/affiliate/commission";


// LE TAUX VIENT DE `commission.ts`, ET DE NULLE PART AILLEURS.
//
// Il était écrit en dur ici (`0.4`) pendant que `lib/affiliate/
// commission.ts` existait précisément pour être LE seul endroit qui dit
// combien on paie, avec ses trois étages (override négocié, palier,
// taux du produit). Ce fichier là est celui qui PAIE : le taux affiché
// à l'affiliée venait donc d'un module, et le taux versé d'une
// constante à côté. Deux chiffres qui disent la même chose sans passer
// par le même code finissent toujours par se contredire, et
// `affiliate_rate_overrides` (créée le 19 août) n'était lue nulle part :
// un partenariat négocié à 60% aurait été payé 40% en silence.
//
// -- LE PRODUIT EST UN PARAMÈTRE OBLIGATOIRE (26 août 2026) -----------
//
// Il était écrit en dur ici (`"tiquiz"`), et le commentaire d'à côté
// disait "l'Atelier est attribué côté formaquiz, dans SA base". C'était
// vrai, et c'est précisément ce que Béné a refusé : "je veux notre
// propre système d'affiliation pour l'atelier comme pour tiquiz."
//
// Le jour où l'Atelier passe par ici, une constante `"tiquiz"` paierait
// ses ventes à 40% au lieu de 70%, en silence, sur chaque vente. C'est
// exactement le défaut du 1er août (une logique écrite pour un cas
// appliquée telle quelle à un autre), transposé à de l'argent qui part.
//
// `produit` est donc un ARGUMENT que l'appelant DOIT fournir. On ne peut
// plus appeler cette fonction sans avoir dit de quel produit on parle :
// c'est la seule protection qui survit au prochain qui touchera au
// fichier.
export type ProduitCommission = keyof typeof COMMISSION_RATES;

/**
 * L'ÉCHELLE DE FIDÉLITÉ EST CELLE DE TIQUIZ, ET ELLE NE S'APPLIQUE QU'À LUI.
 *
 * `recompense_commission_pct` monte de 40% à 70% par paliers de 10
 * filleuls (`lib/affiliate/recompense.ts`). Appliqué à l'Atelier, dont
 * le taux de BASE est déjà 70%, il ne pourrait que faire DESCENDRE la
 * commission : un affilié récompensé à 55% serait payé 55% sur l'Atelier
 * au lieu de 70%, donc puni d'avoir progressé.
 */
function palierApplicable(produit: ProduitCommission): boolean {
  return produit === "tiquiz";
}

const AFF_COLS = "sa, email, status";
const AFF_COLS_NEW = `${AFF_COLS}, recompense_commission_pct`;

export type AttributeSaleInput = {
  customer_email: string;
  sale_amount_cents: number;
  /**
   * SUR QUOI LE POURCENTAGE S'APPLIQUE. JAMAIS DEVINÉ.
   *
   * Trouvé en auditant le 26 août : les trois appelants ne parlaient pas
   * de la même chose dans ce champ.
   *
   *   notre bon de commande (Tiquiz)   -> HT  (`commissionBaseCents`)
   *   la route SIO de l'Atelier        -> HT  (`extractAmountHtCents`)
   *   le webhook Systeme.io de Tiquiz  -> TTC (`order.total_price`)
   *
   * Le troisième payait donc ~20 % de trop, en silence : 40 % de 17,00 €
   * font 6,80 € au lieu de 40 % de 14,17 € qui font 5,67 €. Un écart de
   * 1,13 € par vente, invisible parce que le champ s'appelle pareil.
   *
   * Décision Béné du 19 août : la base est le HT. Elle est donc APPLIQUÉE
   * ici, sur la valeur reçue, à partir de ce que l'appelant DIT avoir
   * envoyé. On ne devine pas à la valeur : 1700 centimes est un TTC
   * plausible et un HT plausible.
   */
  base: CommissionBase;
  /**
   * QUI VERSE CETTE COMMISSION. JAMAIS DEVINÉ.
   *
   * Béné, 26 août : "ce qui est vendu dans systeme io est payé sur
   * systeme io mais doit être tracké pour un dashboard affilié fiable
   * pour l'affilié et pour moi, et ce qui passe sur nos nouvelles pages
   * bah c'est ok on peut tout tracker proprement ?"
   *
   * Les deux populations vivent dans la MÊME table, et c'est voulu :
   * l'affilié doit voir TOUT ce qu'il a gagné, quel que soit le tunnel.
   * Mais `preparerLot` ne doit virer que les nôtres, sinon le premier
   * lot paie une deuxième fois ce que Systeme.io a déjà versé.
   *
   * On POURRAIT le déduire du préfixe de `sio_order_id`. On ne le fait
   * pas : deviner la mécanique au lieu de la porter est le défaut qui a
   * produit la fausse alerte de Véronique et les deux bases de
   * commission divergentes. Le jour où un troisième encaisseur arrive,
   * la déduction se tait et l'argent part.
   */
  reglePar: "nous" | "systeme_io";
  currency?: string;
  /**
   * QUELLE APP A ENCAISSÉ. `"atelier"` depuis le 26 août 2026 : la
   * contrainte de `affiliate_commissions` a été élargie par la migration
   * 20260826_affiliation_atelier.sql. Sans elle, Postgres REFUSE la
   * ligne et la commission disparaît dans le webhook.
   */
  source_app: "tipote" | "tiquiz" | "atelier";
  /**
   * LE PRODUIT VENDU, donc le taux. Obligatoire : cf. le bloc en tête de
   * fichier. `"tiquiz"` = 40%, `"atelier"` = 70%.
   */
  produit: ProduitCommission;
  sio_order_id: string;
  product_name?: string;
  sale_at: Date;
  raw_payload?: unknown;
  /**
   * L'IDENTIFIANT PORTÉ PAR LE LIEN, QUAND IL N'Y A PAS DE CONVERSION.
   *
   * Sur un tunnel Systeme.io, le `?sa=` était capté par leur page et
   * l'optin créait une ligne dans `affiliate_conversions` : l'attribution
   * par email suffisait donc.
   *
   * Depuis que Tiquiz vend sur son propre domaine avec son propre bon de
   * commande, ce chemin n'existe plus : pas de page Systeme.io, donc pas
   * d'optin, donc **aucune conversion à retrouver**. Sans cet indice, une
   * affiliée qui envoie du monde sur tiquiz.fr n'est payée sur rien, et
   * rien ne le signale.
   *
   * Il ne court-circuite AUCUN contrôle : le `sa` doit exister dans
   * `affiliates`, y être `active`, et ne pas être l'acheteur lui même.
   * La conversion par email reste prioritaire quand elle existe, parce
   * qu'elle est la preuve d'un passage réel, pas d'un paramètre d'URL.
   */
  sa_hint?: string | null;
  /**
   * LE CODE PUBLIC PORTÉ PAR LE LIEN (`?ref=jocelyne`).
   *
   * Depuis le 24 août 2026, nos liens ne portent plus le `sa` de
   * Systeme.io (Béné : "je ne veux surtout pas de sa dans les nouveaux
   * liens"). C'est donc ce champ qui arrive sur une vente prise sur
   * notre propre bon de commande.
   *
   * Il se traduit en `sa` ICI, contre la table `affiliates`, avec les
   * MÊMES contrôles ensuite : l'affiliée doit exister, être active, et
   * ne pas être l'acheteur. `ref_hint` et `sa_hint` sont deux entrées
   * d'une même porte, jamais deux portes.
   */
  ref_hint?: string | null;
};

export type AttributeSaleResult =
  | { status: "attributed"; sa: string; commission_cents: number; commission_id: string }
  | { status: "no_affiliate_match" }
  | { status: "duplicate" }
  | { status: "affiliate_not_registered"; sa: string }
  | { status: "error"; error: string };

/**
 * Le `sa` derrière un code public, ou `null`.
 *
 * Regarde le code ACTUEL puis les ANCIENS (`affiliate_ref_aliases`) :
 * une affiliée qui change de code a des liens dans des vidéos déjà
 * publiées, et ces liens doivent continuer de la payer. C'est la même
 * garantie que `resolveAffiliateByRef` côté redirection, et les deux
 * doivent rester d'accord.
 */
async function saDepuisRef(brut: string | null | undefined): Promise<string | null> {
  const ref = sanitizeRef(brut);
  if (ref.length < REF_MIN_LENGTH) return null;

  const { data: direct, error } = await supabaseAdmin
    .from("affiliates")
    .select("sa")
    .ilike("ref", ref)
    .maybeSingle();
  if (error) {
    // On ne se tait pas : c'est de l'argent dû à quelqu'un.
    console.error(`[affiliate/attribution] lecture du code ${ref} impossible : ${error.message}`);
    return null;
  }
  if (direct) return (direct as { sa: string }).sa;

  const { data: alias } = await supabaseAdmin
    .from("affiliate_ref_aliases")
    .select("sa")
    .eq("ref", ref)
    .maybeSingle();
  return alias ? (alias as { sa: string }).sa : null;
}

/**
 * L'AFFILIÉ À QUI CE CONTACT EST RATTACHÉ, s'il y en a un.
 *
 * Le PREMIER rattachement, pas le dernier : c'est celui qui a amené la
 * personne qui la garde. Trier du plus récent donnerait le contact au
 * dernier affilié dont il a croisé un lien, ce qui viderait de son sens
 * la promesse "il reste son affilié à vie".
 */
async function findRecentConversion(email: string): Promise<{ id: string; sa: string } | null> {
  let requete = supabaseAdmin
    .from("affiliate_conversions")
    .select("id, sa")
    .eq("email", email.toLowerCase());
  const plancher = planchierRattachement();
  if (plancher) requete = requete.gte("created_at", plancher);
  const { data, error } = await requete
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[affiliate/attribution] findRecentConversion error:", error.message);
    return null;
  }
  return (data as { id: string; sa: string } | null) ?? null;
}

export async function attributeSale(input: AttributeSaleInput): Promise<AttributeSaleResult> {
  try {
    const email = input.customer_email.trim().toLowerCase();
    if (!email) return { status: "no_affiliate_match" };

    // La conversion PASSE EN PREMIER quand elle existe : c'est la trace
    // d'un passage réel, pas un paramètre d'URL. L'indice du lien ne sert
    // que là où il n'y a rien à retrouver (notre propre bon de commande).
    const conversion = await findRecentConversion(email);
    // Le code public d'abord (c'est ce que portent tous nos liens
    // depuis le 24 août), le `sa` ensuite (anciens liens Systeme.io).
    const saDuRef = await saDepuisRef(input.ref_hint);
    const saHint = (input.sa_hint ?? "").trim();
    const sa = conversion?.sa ?? saDuRef ?? (saHint || null);
    if (!sa) return { status: "no_affiliate_match" };

    // Vérifie que l'affilié existe dans notre registre (sinon refuse
    // — un sa valide format mais inconnu = lien forgé ou ex-affilié banni).
    const { data: affRow } = await supabaseAdmin
      .from("affiliates")
      // DEUX LISTES DE COLONNES : PostgREST rejette la requête ENTIÈRE
      // sur une colonne inconnue, et ici l'échec ne serait pas un écran
      // vide, ce serait une commission jamais créée.
      .select(AFF_COLS_NEW)
      .eq("sa", sa)
      .maybeSingle();
    const affLu = affRow
      ? affRow
      : (
          await supabaseAdmin
            .from("affiliates")
            .select(AFF_COLS)
            .eq("sa", sa)
            .maybeSingle()
        ).data;
    const aff = affLu as unknown as {
      sa: string;
      email: string;
      status: string;
      recompense_commission_pct?: number | null;
    } | null;
    if (!aff || aff.status !== "active") {
      return { status: "affiliate_not_registered", sa };
    }

    // ANTI-AUTO-AFFILIATION, ALIAS COMPRIS.
    //
    // La comparaison était brute (`aff.email.toLowerCase() === email`) :
    // acheter avec `moi+1@gmail.com` suffisait à se payer 40 % de son
    // propre abonnement. La règle qui voit ces alias existait déjà côté
    // Tiquiz, mais elle ne gardait que le MOIS OFFERT. On protégeait le
    // cadeau mieux que le versement.
    if (memePersonne(aff.email, email)) {
      console.log(
        `[affiliate/attribution] self-attribution refused: sa=${aff.sa} email=${email}`,
      );
      return { status: "no_affiliate_match" };
    }

    // LE TAUX, avec ses trois étages, et le montant sur la base décidée.
    const { data: overrideRow } = await supabaseAdmin
      .from("affiliate_rate_overrides")
      .select("rate")
      .eq("sa", sa)
      .eq("product", input.produit)
      .maybeSingle();
    // LE PALIER DE FIDÉLITÉ (Béné, 25 août 2026 : "il a 10 affiliés
    // abonnés [...] il gagne 20 %"). Il s'insère à l'étage prévu pour
    // lui depuis le 19 août ("le taux de son PALIER, quand les paliers
    // existeront") : un taux négocié à la main passe toujours devant, et
    // un affilié sans palier retombe sur le taux de base du produit.
    //
    // La valeur est un INSTANTANÉ, écrit par le recalcul mensuel. On ne
    // recompte pas ses filleuls ici : une commission créée pendant le
    // webhook d'un paiement n'a pas à aller compter des lignes, et le
    // taux doit être celui ANNONCÉ à l'affilié ce mois-ci, pas celui
    // qu'un décompte fait à la seconde près donnerait.
    const palierPct = palierApplicable(input.produit)
      ? Number(aff.recompense_commission_pct ?? NaN)
      : NaN;
    const rate = resolveCommissionRate({
      product: input.produit,
      override: Number((overrideRow as { rate?: number } | null)?.rate ?? NaN),
      tierRate: Number.isFinite(palierPct) ? palierPct / 100 : null,
    });

    // Le montant de la VENTE reste celui qui a été encaissé : c'est lui
    // qu'on garde en base, c'est lui qu'on affiche. Seule la BASE DE
    // CALCUL passe au HT quand l'appelant a envoyé du TTC.
    const baseCents =
      input.base === "ttc" ? htFromTtcCents(input.sale_amount_cents) : input.sale_amount_cents;
    const commissionCents = Math.round(baseCents * rate);

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("affiliate_commissions")
      .insert({
        sa,
        sio_order_id: input.sio_order_id,
        source_app: input.source_app,
        customer_email: email,
        // `null` quand l'attribution vient du lien : il n'y a pas de
        // conversion a rattacher, et en inventer une serait pire.
        conversion_id: conversion?.id ?? null,
        product_name: input.product_name ?? null,
        sale_amount_cents: input.sale_amount_cents,
        commission_rate: rate,
        commission_cents: commissionCents,
        currency: input.currency ?? "EUR",
        regle_par: input.reglePar,
        status: "pending",
        sale_at: input.sale_at.toISOString(),
        raw_payload: input.raw_payload ?? null,
      })
      .select("id")
      .single();

    if (insertErr) {
      // Unique constraint hit = retry Systeme.io ; on traite comme idempotent.
      if (insertErr.code === "23505") {
        return { status: "duplicate" };
      }
      console.error("[affiliate/attribution] insert error:", insertErr.message);
      return { status: "error", error: insertErr.message };
    }

    // UNE VENTE ATTRIBUÉE RATTACHE L'ACHETEUR, À VIE.
    //
    // Béné, 26 août 2026 : "un mec qui vend l'atelier en affi doit bien
    // sûr toucher ses commissions sur tiquiz si son affilié s'abonne et
    // inversement pour l'atelier vendu via tiquiz."
    //
    // Ça ne marchait QUE dans un sens, et personne ne pouvait le voir.
    // Cette fonction LISAIT `affiliate_conversions` et n'y écrivait
    // jamais. Quelqu'un qui achetait l'Atelier par le lien de Marc
    // n'avait donc aucun rattachement : trois mois plus tard, en
    // s'abonnant à Tiquiz depuis son compte, il n'avait plus de lien
    // dans son URL, la recherche par email ne trouvait rien, et Marc ne
    // touchait rien. Il avait pourtant amené le client.
    //
    // Le rattachement vaut pour LA PERSONNE, pas pour le produit :
    // c'est ce qui fait que les commissions se croisent entre l'Atelier
    // et Tiquiz, dans les deux sens, au taux du produit vendu.
    //
    // LE PREMIER RATTACHEMENT GAGNE : on n'écrit que s'il n'y en a pas.
    // Un contact appartient à celui qui l'a AMENÉ, pas au dernier qui
    // lui a vendu quelque chose.
    //
    // Best-effort, et jamais bloquant : la commission vient d'être
    // écrite, elle compte plus que le rattachement. Mais on ne se tait
    // pas, parce qu'un rattachement perdu, c'est un affilié qui ne
    // touchera rien sur les ventes suivantes.
    if (!conversion) {
      const { error: rattErr } = await supabaseAdmin
        .from("affiliate_conversions")
        .insert({ email, sa, page_url: null });
      if (rattErr && rattErr.code !== "23505") {
        console.error(
          `[affiliate/attribution] rattachement ${email} -> ${sa} refuse : ${rattErr.message}`,
        );
      }
    }

    return {
      status: "attributed",
      sa,
      commission_cents: commissionCents,
      commission_id: (inserted as { id: string }).id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[affiliate/attribution] unexpected:", message);
    return { status: "error", error: message };
  }
}
