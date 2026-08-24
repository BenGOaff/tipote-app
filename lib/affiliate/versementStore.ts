// lib/affiliate/versementStore.ts
//
// LIRE ET ÉCRIRE. AUCUNE DÉCISION ICI.
//
// Tout ce qui se décide (qui est payable, ce qui manque, ce qui entre
// dans le lot, le contenu du fichier) vit dans `coordonnees.ts`,
// `versement.ts` et `sepa.ts`, qui n'importent rien et se testent. Ce
// fichier importe `supabaseAdmin`, donc il exige des variables
// d'environnement au chargement, donc aucun test ne peut l'importer :
// c'est exactement pour ça qu'il ne doit rien décider.
//
// (Leçon du verrou des webhooks, 24 août : la décision était enfermée
// dans le module qui parle à la base, et c'est littéralement là que le
// bug s'était installé.)

import "server-only";

import {
  lireCoordonnees,
  masquerIban,
  peutEtrePayee,
  resoudreMethode,
  type Coordonnees,
  type MethodeVersement,
} from "@/lib/affiliate/coordonnees";
import {
  commissionApprouvable,
  construireLot,
  type AffilieePayable,
  type CommissionAVerser,
  type LigneLot,
  type Lot,
} from "@/lib/affiliate/versement";
import { construireAutofacture } from "@/lib/affiliate/autofacture";
import {
  MANDAT_VERSION,
  lireProfilFiscal,
  profilFiscalComplet,
  type ProfilFiscal,
} from "@/lib/affiliate/fiscal";
import { decryptField, encryptField, generateDEK, unwrapDEK, wrapDEK } from "@/lib/piiCrypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const TABLE_AFF = "affiliates";
const TABLE_COMM = "affiliate_commissions";
const TABLE_LOTS = "affiliate_payouts";

const CHAMPS_AFF =
  "sa, email, display_name, status, payout_method, paypal_email, iban_holder, iban_chiffre, iban_masque, pii_dek, bic";

/** Le profil fiscal : ce qu'il faut pour ÉMETTRE la facture, pas pour payer. */
const CHAMPS_FISCAL =
  "statut_fiscal, denomination, adresse1, adresse2, code_postal, ville, pays, siren, tva_numero, assujetti_tva, mandat_accepte_le, mandat_version";

interface LigneFiscale {
  statut_fiscal: string | null;
  denomination: string | null;
  adresse1: string | null;
  adresse2: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  siren: string | null;
  tva_numero: string | null;
  assujetti_tva: boolean | null;
  mandat_accepte_le: string | null;
  mandat_version: string | null;
}

/** Traduit les colonnes en profil. Les noms diffèrent, la forme aussi. */
function profilDepuisLigne(l: Partial<LigneFiscale>): ProfilFiscal {
  return lireProfilFiscal({
    statut: l.statut_fiscal,
    denomination: l.denomination,
    adresse1: l.adresse1,
    adresse2: l.adresse2,
    codePostal: l.code_postal,
    ville: l.ville,
    pays: l.pays,
    siren: l.siren,
    numeroTva: l.tva_numero,
    assujettiTva: l.assujetti_tva === true,
    mandatAccepteLe: l.mandat_accepte_le,
    mandatVersion: l.mandat_version,
  });
}

interface LigneAffiliee {
  sa: string;
  email: string;
  display_name: string | null;
  status: string | null;
  payout_method: string | null;
  paypal_email: string | null;
  iban_holder: string | null;
  iban_chiffre: string | null;
  iban_masque: string | null;
  pii_dek: string | null;
  bic: string | null;
}

/**
 * L'IBAN EN CLAIR, et il ne sort d'ici que pour le fichier SEPA.
 *
 * Aucune route ne le renvoie à un navigateur, pas même à sa
 * propriétaire : c'est `iban_masque` qui s'affiche. Le déchiffrement
 * n'a lieu qu'au moment de construire le lot.
 */
function dechiffrerIban(ligne: LigneAffiliee): string | null {
  if (!ligne.iban_chiffre || !ligne.pii_dek) return null;
  try {
    return decryptField(ligne.iban_chiffre, unwrapDEK(ligne.pii_dek));
  } catch (e) {
    // Une clé illisible n'est pas un plantage : c'est une affiliée qu'on
    // ne peut pas payer ce mois ci, et qui doit ressaisir. Le lot
    // l'écartera en le DISANT.
    console.error(`[versement] IBAN illisible pour ${ligne.sa} : ${(e as Error).message}`);
    return null;
  }
}

/** Ce qu'une affiliée voit de ses propres coordonnées. Jamais l'IBAN. */
export interface CoordonneesAffichables {
  methode: MethodeVersement | null;
  /** Explicite = elle a vraiment choisi. Sinon l'écran redemande. */
  choixExplicite: boolean;
  paypalEmail: string | null;
  titulaire: string | null;
  ibanMasque: string | null;
  bic: string | null;
  complet: boolean;
  majLe: string | null;
}

export async function lireCoordonneesAffiliee(sa: string): Promise<CoordonneesAffichables | null> {
  try {
    const { data } = await supabaseAdmin
      .from(TABLE_AFF)
      .select(`${CHAMPS_AFF}, coordonnees_maj_le`)
      .eq("sa", sa)
      .maybeSingle();
    if (!data) return null;
    const l = data as LigneAffiliee & { coordonnees_maj_le: string | null };
    // On juge sur l'IBAN DÉCHIFFRÉ : un masque ne dit pas si la clé de
    // contrôle passe, et afficher "tout est bon" sur un IBAN illisible
    // serait un virement rejeté que personne n'attend.
    const c = lireCoordonnees({
      payout_method: l.payout_method,
      paypal_email: l.paypal_email,
      iban_holder: l.iban_holder,
      iban_number: dechiffrerIban(l),
      bic: l.bic,
    });
    return {
      methode: c.methode,
      choixExplicite: resoudreMethode({ payout_method: l.payout_method }).explicite,
      paypalEmail: l.paypal_email,
      titulaire: l.iban_holder,
      ibanMasque: l.iban_masque,
      bic: l.bic,
      complet: peutEtrePayee(c),
      majLe: l.coordonnees_maj_le,
    };
  } catch (e) {
    console.error(`[versement] lecture coordonnees impossible : ${(e as Error).message}`);
    return null;
  }
}

/**
 * Enregistre le choix et les coordonnées.
 *
 * L'IBAN est chiffré ICI, jamais stocké en clair. La clé de l'affiliée
 * est créée au premier enregistrement et réutilisée ensuite : en
 * regénérer une à chaque écriture rendrait l'ancien chiffré illisible.
 */
export async function ecrireCoordonneesAffiliee(args: {
  sa: string;
  methode: MethodeVersement;
  paypalEmail?: string | null;
  titulaire?: string | null;
  /** En clair, tel que saisi. Chiffré avant écriture. */
  iban?: string | null;
  bic?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { data } = await supabaseAdmin
      .from(TABLE_AFF).select("pii_dek").eq("sa", args.sa).maybeSingle();
    if (!data) return { ok: false, reason: "affiliee_inconnue" };

    let dekEnveloppe = (data as { pii_dek: string | null }).pii_dek;
    if (!dekEnveloppe) dekEnveloppe = wrapDEK(generateDEK());
    const dek = unwrapDEK(dekEnveloppe);

    const maj: Record<string, unknown> = {
      payout_method: args.methode,
      pii_dek: dekEnveloppe,
      coordonnees_maj_le: new Date().toISOString(),
    };

    if (args.methode === "paypal") {
      maj.paypal_email = (args.paypalEmail ?? "").trim().toLowerCase() || null;
    } else {
      maj.iban_holder = (args.titulaire ?? "").trim() || null;
      maj.bic = (args.bic ?? "").trim().toUpperCase() || null;
      const iban = (args.iban ?? "").replace(/[\s.-]/g, "").toUpperCase();
      if (iban) {
        maj.iban_chiffre = encryptField(iban, dek);
        maj.iban_masque = masquerIban(iban);
        // L'ancienne colonne en clair reste vide, pour toujours.
        maj.iban_number = null;
      }
    }

    const { error } = await supabaseAdmin.from(TABLE_AFF).update(maj).eq("sa", args.sa);
    if (error) {
      console.error(`[versement] ecriture coordonnees refusee : ${error.message}`);
      return { ok: false, reason: "base" };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[versement] ecriture coordonnees impossible : ${(e as Error).message}`);
    return { ok: false, reason: "chiffrement" };
  }
}

/** Le profil fiscal d'une affiliée, pour l'écran. */
export async function lireProfilFiscalAffiliee(sa: string): Promise<ProfilFiscal | null> {
  try {
    const { data } = await supabaseAdmin
      .from(TABLE_AFF).select(CHAMPS_FISCAL).eq("sa", sa).maybeSingle();
    return data ? profilDepuisLigne(data as LigneFiscale) : null;
  } catch (e) {
    console.error(`[versement] lecture profil fiscal impossible : ${(e as Error).message}`);
    return null;
  }
}

/**
 * Écrit le profil fiscal, et l'acceptation du mandat.
 *
 * **L'ACCEPTATION EST HORODATÉE PAR LE SERVEUR**, jamais reprise du
 * client : une date envoyée par un navigateur ne prouve rien, et c'est
 * exactement la donnée qu'un contrôle regardera.
 */
export async function ecrireProfilFiscalAffiliee(args: {
  sa: string;
  profil: ProfilFiscal;
  accepteLeMandat: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  const p = args.profil;
  try {
    const maj: Record<string, unknown> = {
      statut_fiscal: p.statut,
      denomination: p.denomination,
      adresse1: p.adresse1,
      adresse2: p.adresse2,
      code_postal: p.codePostal,
      ville: p.ville,
      pays: p.pays,
      siren: p.siren,
      tva_numero: p.numeroTva,
      assujetti_tva: p.assujettiTva,
      profil_fiscal_maj_le: new Date().toISOString(),
    };
    if (args.accepteLeMandat) {
      maj.mandat_accepte_le = new Date().toISOString();
      maj.mandat_version = MANDAT_VERSION;
    }
    const { error } = await supabaseAdmin.from(TABLE_AFF).update(maj).eq("sa", args.sa);
    if (error) {
      console.error(`[versement] ecriture profil fiscal refusee : ${error.message}`);
      return { ok: false, reason: "base" };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[versement] ecriture profil fiscal impossible : ${(e as Error).message}`);
    return { ok: false, reason: "reseau" };
  }
}

/**
 * FAIT PASSER LES COMMISSIONS MÛRES EN `approved`.
 *
 * La décision est dans `commissionApprouvable`, pure et testée. Ici on
 * ne fait que lire, filtrer et écrire.
 */
export async function approuverCommissionsMures(
  maintenant: number = Date.now(),
): Promise<{ approuvees: number }> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_COMM)
    .select("id, sa, status, commission_cents, sale_at, cancelled_at, payout_id")
    .eq("status", "pending")
    // CE QUE SYSTEME.IO VERSE NE MURIT PAS CHEZ NOUS.
    //
    // Ces lignes existent pour que le tableau de bord de l'affilie soit
    // complet, pas pour entrer dans un lot. Les faire passer `approved`
    // les rendrait indiscernables des notres au premier coup d'oeil.
    .eq("regle_par", "nous")
    // LA PLUS ANCIENNE D'ABORD, ET CE N'EST PAS DÉCORATIF.
    //
    // La commission est RÉCURRENTE depuis le 26 août : une ligne par
    // abonné et par mois. Le nombre de lignes en attente grandit donc
    // avec la base, et le jour où il dépasse la limite, une requête
    // sans tri laisse Postgres choisir lesquelles il rend. Ce sont
    // alors toujours les mêmes qui restent dehors, sans que rien ne le
    // signale : quelqu'un ne serait jamais payé.
    //
    // Avec le tri, la limite ne fait que RETARDER : ce qui déborde
    // passe au tour suivant, en commençant par ce qui attend depuis le
    // plus longtemps.
    .order("sale_at", { ascending: true })
    .limit(2000);
  if (error) {
    console.error(`[versement] lecture des commissions refusee : ${error.message}`);
    return { approuvees: 0 };
  }
  const mures = ((data ?? []) as CommissionAVerser[]).filter((c) =>
    commissionApprouvable(c, maintenant),
  );
  if (mures.length === 0) return { approuvees: 0 };

  const { error: majErr } = await supabaseAdmin
    .from(TABLE_COMM)
    .update({ status: "approved", approved_at: new Date(maintenant).toISOString() })
    .in("id", mures.map((c) => c.id));
  if (majErr) {
    console.error(`[versement] approbation refusee : ${majErr.message}`);
    return { approuvees: 0 };
  }
  return { approuvees: mures.length };
}

/** Construit le lot du mois, SANS rien écrire. C'est un aperçu. */
export async function preparerLot(): Promise<Lot | null> {
  try {
    const { data: comms } = await supabaseAdmin
      .from(TABLE_COMM)
      .select("id, sa, status, commission_cents, currency, sale_at, cancelled_at, payout_id")
      .eq("status", "approved")
      // ── LE FILTRE QUI EMPECHE DE PAYER DEUX FOIS ──
      //
      // Bene, 26 aout : "ce qui est vendu dans systeme io est payé sur
      // systeme io mais doit être tracké pour un dashboard affilié
      // fiable pour l'affilié et pour moi, et ce qui passe sur nos
      // nouvelles pages bah c'est ok on peut tout tracker proprement ?"
      //
      // Les deux populations vivent dans la MEME table, et c'est voulu :
      // l'affilie doit voir TOUT ce qu'il a gagne. Sans ce filtre, le
      // premier lot aurait vire une deuxieme fois ce que Systeme.io a
      // deja verse. Aucun lot n'avait encore tourne : c'est pris avant
      // le premier virement.
      //
      // La colonne est ECRITE a la creation, jamais deduite du prefixe
      // de `sio_order_id` : le jour ou un troisieme encaisseur arrive,
      // une deduction se tait et l'argent part.
      .eq("regle_par", "nous")
      .is("payout_id", null)
      // La plus ancienne d'abord : même raison que ci dessus. Ce qui
      // déborde part au lot suivant, jamais aux oubliettes.
      .order("sale_at", { ascending: true })
      .limit(5000);
    const commissions = (comms ?? []) as CommissionAVerser[];
    if (commissions.length === 0) {
      return { lignes: [], ecartees: [], totalCents: 0, totalParMethode: { paypal: 0, virement: 0 } };
    }

    const sas = [...new Set(commissions.map((c) => c.sa))];
    const { data: affs } = await supabaseAdmin
      .from(TABLE_AFF).select(`${CHAMPS_AFF}, ${CHAMPS_FISCAL}`).in("sa", sas);

    const affiliees: AffilieePayable[] = ((affs ?? []) as (LigneAffiliee & LigneFiscale)[]).map((l) => {
      const coordonnees: Coordonnees = lireCoordonnees({
        payout_method: l.payout_method,
        paypal_email: l.paypal_email,
        iban_holder: l.iban_holder,
        iban_number: dechiffrerIban(l),
        bic: l.bic,
      });
      // Un statut inconnu ou absent est lu comme `active` : c'est le
      // defaut de la colonne, et refuser de payer quelqu'un sur une
      // valeur qu'on ne sait pas lire serait la pire des reponses.
      const brut = String(l.status ?? "active").trim().toLowerCase();
      const statut = brut === "banned" || brut === "paused" ? brut : "active";
      return {
        sa: l.sa,
        email: l.email,
        displayName: l.display_name,
        statut,
        coordonnees,
        payable: peutEtrePayee(coordonnees),
        // DISTINCT de `payable` : deux questions différentes, remplies
        // sur le même écran. Voir `AffilieePayable`.
        profilComplet: profilFiscalComplet(profilDepuisLigne(l)),
      };
    });

    return construireLot(commissions, affiliees);
  } catch (e) {
    console.error(`[versement] preparation du lot impossible : ${(e as Error).message}`);
    return null;
  }
}

/**
 * FIGE le lot : il devient une pièce, et les commissions passent en
 * `paid` en portant son identifiant.
 *
 * L'ordre compte : on crée le lot D'ABORD, puis on marque les
 * commissions. L'inverse laisserait des commissions marquées `paid`
 * pointant vers un lot qui n'existe pas, c'est à dire de l'argent qu'on
 * croit versé sans trace de virement.
 */
export async function figerLot(args: {
  periode: string;
  lot: Lot;
  par: string;
}): Promise<{ ok: boolean; id?: string; reason?: string }> {
  if (args.lot.lignes.length === 0) return { ok: false, reason: "lot_vide" };
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLE_LOTS)
      .insert({
        periode: args.periode,
        statut: "prepare",
        lignes: args.lot.lignes,
        ecartees: args.lot.ecartees,
        total_cents: args.lot.totalCents,
        total_paypal_cents: args.lot.totalParMethode.paypal,
        total_virement_cents: args.lot.totalParMethode.virement,
        prepare_par: args.par,
      })
      .select("id")
      .single();

    if (error) {
      // L'unicité sur `periode` est une PROTECTION : construire deux
      // fois le lot d'août paierait deux fois. Le refus se nomme.
      const doublon = /duplicate key|unique/i.test(error.message);
      console.error(`[versement] lot ${args.periode} non cree : ${error.message}`);
      return { ok: false, reason: doublon ? "lot_existe_deja" : "base" };
    }

    const id = (data as { id: string }).id;

    // LES AUTOFACTURES, UNE PAR AFFILIÉE, ÉMISES AVEC LE LOT.
    //
    // Béné : "tous les mois on génère sa facture pour sa compta, il peut
    // la télécharger et nous on peut le payer via cette facture qu'on a
    // générée pour lui."
    //
    // ICI et pas ailleurs : la ligne du lot porte déjà le montant figé
    // et les commissions soldées. Émettre depuis un autre écran
    // demanderait de recalculer, et deux calculs de la même somme
    // finissent par se contredire.
    //
    // **On n'échoue jamais pour une facture.** Le lot existe, les
    // virements peuvent partir : une pièce manquante se réémet, un
    // virement perdu non. On crie, et l'admin voit le compte.
    await emettreAutofacturesDuLot(id, args.periode, args.lot.lignes);

    const ids = args.lot.lignes.flatMap((l) => l.commissionIds);
    const { error: majErr } = await supabaseAdmin
      .from(TABLE_COMM)
      .update({ status: "paid", paid_at: new Date().toISOString(), payout_id: id })
      .in("id", ids);
    if (majErr) {
      // Le lot existe, les commissions non marquées : elles
      // repartiraient dans le lot suivant, donc payées deux fois. On
      // CRIE, et l'admin verra deux lots pour les mêmes personnes.
      console.error(
        `[versement] lot ${id} cree mais commissions NON marquees (${majErr.message}). ` +
          `RISQUE DE DOUBLE PAIEMENT : verifier avant de deposer le fichier.`,
      );
      return { ok: false, reason: "commissions_non_marquees", id };
    }
    return { ok: true, id };
  } catch (e) {
    console.error(`[versement] lot impossible : ${(e as Error).message}`);
    return { ok: false, reason: "reseau" };
  }
}

/**
 * L'HISTORIQUE DES LOTS, ET IL NE PORTE PAS D'IBAN.
 *
 * `affiliate_payouts.lignes` contient les coordonnées FIGÉES, donc des
 * IBAN en clair : c'est voulu en base (une pièce ne bouge plus), et
 * c'est exactement ce qui ne doit pas partir dans un navigateur. Un
 * `select("*")` les envoyait à l'écran d'admin, alors que la règle
 * écrite le 25 août dit l'inverse : "aucune route ne le renvoie à un
 * navigateur, pas même à sa propriétaire".
 *
 * On énumère donc les colonnes, et le nombre de virements est COMPTÉ
 * ici : l'écran en a besoin pour comparer avec le nombre de factures,
 * il n'a pas besoin de savoir sur quels comptes.
 *
 * Seul le constructeur du fichier SEPA lit les lignes, et il tourne sur
 * le serveur (`lireLot`).
 */
export async function lireLots(limite = 24) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_LOTS)
    .select(
      "id, periode, statut, total_cents, total_paypal_cents, total_virement_cents, prepare_le, prepare_par, exporte_le, paye_le, paye_par, lignes",
    )
    .order("prepare_le", { ascending: false })
    .limit(limite);
  if (error) {
    console.error(`[versement] lecture des lots refusee : ${error.message}`);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((l) => {
    const { lignes, ...reste } = l;
    return { ...reste, nbLignes: Array.isArray(lignes) ? lignes.length : 0 };
  });
}

export async function lireLot(id: string) {
  const { data } = await supabaseAdmin.from(TABLE_LOTS).select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

export async function marquerLot(
  id: string,
  statut: "exporte" | "paye" | "annule",
  par: string,
): Promise<boolean> {
  const maj: Record<string, unknown> = { statut };
  if (statut === "exporte") maj.exporte_le = new Date().toISOString();
  if (statut === "paye") {
    maj.paye_le = new Date().toISOString();
    maj.paye_par = par;
  }
  const { error } = await supabaseAdmin.from(TABLE_LOTS).update(maj).eq("id", id);
  if (error) {
    console.error(`[versement] lot ${id} non marque ${statut} : ${error.message}`);
    return false;
  }
  return true;
}

/**
 * Émet une autofacture par ligne de lot.
 *
 * Le profil fiscal est relu MAINTENANT et recopié dans la pièce : après
 * émission elle ne bouge plus, même si l'affiliée déménage le lendemain.
 * C'est la même règle que la facture de vente (24 août).
 */
async function emettreAutofacturesDuLot(
  lotId: string,
  periode: string,
  lignes: readonly LigneLot[],
): Promise<void> {
  if (lignes.length === 0) return;
  const emiseLe = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from(TABLE_AFF)
    .select(`sa, ${CHAMPS_FISCAL}`)
    .in("sa", lignes.map((l) => l.sa));
  const parSa = new Map<string, ProfilFiscal>();
  for (const l of (data ?? []) as (LigneFiscale & { sa: string })[]) {
    parSa.set(l.sa, profilDepuisLigne(l));
  }

  for (const ligne of lignes) {
    const profil = parSa.get(ligne.sa);
    if (!profil) {
      console.error(`[autofacture] profil introuvable pour ${ligne.sa} : piece NON emise.`);
      continue;
    }
    const f = construireAutofacture({ ligne, profil, periode, lotId, emiseLe });
    const { data: sortie, error } = await supabaseAdmin.rpc("emettre_autofacture", {
      p_serie: f.serie,
      p_genre: "facture",
      p_sa: f.sa,
      p_email: f.emailAffilie,
      p_periode: f.periode,
      p_payout_id: lotId,
      p_commission_ids: f.commissionIds,
      p_libelle: f.libelle,
      p_nombre_ventes: f.nombreVentes,
      p_currency: f.currency,
      p_ht_cents: f.htCents,
      p_tva_cents: f.tvaCents,
      p_ttc_cents: f.ttcCents,
      p_tva_taux_bp: f.tvaTauxBp,
      p_mentions: f.mentions,
      p_prestataire: f.prestataire,
      p_client: f.client,
      p_a_verifier: f.aVerifier,
      p_avoir_de: null,
    });
    if (error) {
      console.error(`[autofacture] ${ligne.sa} : piece NON emise (${error.message}).`);
      continue;
    }
    const ligneEmise = (Array.isArray(sortie) ? sortie[0] : sortie) as { numero?: string } | null;
    console.log(`[autofacture] ${ligneEmise?.numero ?? "?"} emise pour ${ligne.sa}`);
  }
}

/** Les autofactures d'une affiliée, la plus récente d'abord. */
export async function lireAutofactures(sa: string, limite = 60) {
  const { data, error } = await supabaseAdmin
    .from("affiliate_factures")
    .select("numero, genre, periode, libelle, nombre_ventes, currency, ht_cents, tva_cents, ttc_cents, tva_taux_bp, emise_le")
    .eq("sa", sa)
    .order("emise_le", { ascending: false })
    .limit(limite);
  if (error) {
    console.error(`[autofacture] lecture refusee : ${error.message}`);
    return [];
  }
  return data ?? [];
}

/** Une autofacture par son numéro, pour la page imprimable. */
export async function lireAutofacture(numero: string) {
  const n = String(numero ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(n)) return null;
  const { data } = await supabaseAdmin
    .from("affiliate_factures").select("*").eq("numero", n).maybeSingle();
  return data ?? null;
}

/**
 * LES PIÈCES D'UN LOT, côté admin.
 *
 * Le lot dit ce qui a été VERSÉ ; ces lignes disent sur quelle facture.
 * Sans cet écran, une pièce qui n'a pas pu être émise (profil relu
 * entre temps, base indisponible) n'existe que dans `pm2 logs` : Béné
 * déposerait le fichier à la banque en croyant sa compta complète.
 * L'écran compare donc les deux comptes, et le dit quand ils diffèrent.
 */
export async function lireAutofacturesDuLot(lotId: string) {
  const { data, error } = await supabaseAdmin
    .from("affiliate_factures")
    .select("numero, sa, email, libelle, currency, ht_cents, tva_cents, ttc_cents, a_verifier, emise_le")
    .eq("payout_id", lotId)
    .order("emise_le", { ascending: true });
  if (error) {
    console.error(`[autofacture] lecture du lot ${lotId} refusee : ${error.message}`);
    return [];
  }
  return data ?? [];
}
