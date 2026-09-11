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
  commissionsDejaDansDesLots,
  construireLot,
  reouvertureDeLot,
  type AffilieePayable,
  type CommissionAVerser,
  type LigneLot,
  type Lot,
  type LotEnBase,
} from "@/lib/affiliate/versement";
import { construireAutofacture } from "@/lib/affiliate/autofacture";
import {
  MANDAT_VERSION,
  lireProfilFiscal,
  profilFiscalComplet,
  type ProfilFiscal,
} from "@/lib/affiliate/fiscal";
import { verifierVies } from "@/lib/facture/vies";
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

/**
 * LE REGISTRE DES AFFILIÉES CONCERNÉES, LU PAR PAQUETS.
 *
 * -- POURQUOI PAR PAQUETS (audit du 31 août 2026) ----------------------
 *
 * Un `.in("sa", [...])` part dans l'URL. Un `sa` fait 20 à 80
 * caractères, et la commission est RÉCURRENTE depuis le 26 août : le lot
 * d'un mois peut réunir des centaines d'affiliées distinctes. Passé
 * quelques milliers de caractères, le serveur refuse la requête entière
 * (414), et l'ancien code IGNORAIT l'erreur : `affs` valait `null`, donc
 * plus AUCUNE affiliée n'était reconnue, donc tout le monde sortait en
 * `affiliee-inconnue` et le lot du mois était vide.
 *
 * Le symptôme aurait été le pire possible : un écran qui dit « le
 * registre ne connaît pas cette affiliée » à propos de gens parfaitement
 * inscrits, un mois après l'autre, sans qu'une seule ligne d'erreur
 * n'explique pourquoi. C'est exactement ce que Béné ne peut pas se
 * permettre en démarchant de gros affiliés.
 *
 * 100 par paquet : largement sous la limite d'URL, et ça reste quelques
 * allers-retours même sur un très gros mois.
 *
 * **Une erreur ARRÊTE tout et le dit.** Rendre ce qu'on a lu
 * fabriquerait un lot partiel qui a l'air complet, et les manquants y
 * seraient taggés « inconnues ».
 */
const PAQUET_AFFILIEES = 100;

async function lireAffilieesParPaquets(
  sas: readonly string[],
): Promise<{ ok: true; lignes: unknown[] } | { ok: false }> {
  const lignes: unknown[] = [];
  for (let i = 0; i < sas.length; i += PAQUET_AFFILIEES) {
    const paquet = sas.slice(i, i + PAQUET_AFFILIEES);
    const { data, error } = await supabaseAdmin
      .from(TABLE_AFF)
      .select(`${CHAMPS_AFF}, ${CHAMPS_FISCAL}`)
      .in("sa", paquet);
    if (error) {
      console.error(
        `[versement] registre illisible sur le paquet ${i / PAQUET_AFFILIEES + 1} ` +
          `(${paquet.length} affiliees) : ${error.message}`,
      );
      return { ok: false };
    }
    lignes.push(...((data ?? []) as unknown[]));
  }
  return { ok: true, lignes };
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

    // ── CE QU'UN LOT FIGÉ PORTE DÉJÀ, ET LE MARQUAGE QUI A RATÉ ──
    //
    // `figerLot` crée le lot PUIS marque les commissions `paid`. Entre
    // les deux, une panne laisse des commissions `approved` sans
    // `payout_id`, que ce filtre reprendrait au lot suivant : le même
    // virement partirait deux fois, et rien ne le dirait. Le journal
    // criait `commissions_non_marquees`, et c'est tout.
    //
    // On lit donc les lots eux mêmes (ils portent les identifiants de
    // commission dans `lignes`), on ÉCARTE ce qui y est déjà, et on
    // RÉPARE le marquage ici : le lot suivant répare le précédent.
    //
    // Une lecture ratée ARRÊTE tout : construire un lot sans savoir ce
    // que les précédents ont pris est exactement la situation qu'on
    // ferme. « Je n'ai pas pu regarder » n'est pas « il n'y a rien ».
    const { data: lotsBruts, error: lotsErr } = await supabaseAdmin
      .from(TABLE_LOTS)
      .select("id, statut, lignes")
      .neq("statut", "annule");
    if (lotsErr) {
      console.error(`[versement] lot NON prepare : les lots precedents sont illisibles (${lotsErr.message}).`);
      return null;
    }
    const dejaDansUnLot = commissionsDejaDansDesLots((lotsBruts ?? []) as LotEnBase[]);
    await reparerMarquage(commissions, dejaDansUnLot);

    const sas = [...new Set(commissions.map((c) => c.sa))];
    const lecture = await lireAffilieesParPaquets(sas);
    if (!lecture.ok) {
      // ON NE CONSTRUIT PAS UN LOT SUR UNE LECTURE RATÉE.
      //
      // Sans ce garde-fou, un `.in()` refusé rendait `null`, donc AUCUNE
      // affiliée connue, donc TOUT le monde écarté en
      // `affiliee-inconnue` : l'écran annonçait que le registre ne les
      // connaît pas alors qu'il les connaît très bien, et le lot du mois
      // sortait vide. « Je n'ai pas pu regarder » et « il n'y a rien »
      // sont deux réponses différentes (règle du 23 août).
      console.error("[versement] lot NON prepare : le registre d'affiliees est illisible.");
      return null;
    }
    const affs = lecture.lignes;

    const affiliees: AffilieePayable[] = (affs as (LigneAffiliee & LigneFiscale)[]).map((l) => {
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

    return construireLot(commissions, affiliees, undefined, { dejaDansUnLot });
  } catch (e) {
    console.error(`[versement] preparation du lot impossible : ${(e as Error).message}`);
    return null;
  }
}

/**
 * REMET `paid` + `payout_id` SUR CE QU'UN LOT PORTE DÉJÀ.
 *
 * Idempotent, best-effort, par lot : une commission `approved` sans
 * `payout_id` qui figure dans les lignes d'un lot figé est une
 * commission dont le marquage a raté. Une erreur ici ne bloque rien,
 * parce que le filtre de `construireLot` protège déjà du double
 * paiement ; elle est DITE, et le marquage sera retenté au prochain
 * aperçu.
 */
async function reparerMarquage(
  commissions: readonly CommissionAVerser[],
  dejaDansUnLot: ReadonlyMap<string, string>,
): Promise<void> {
  const parLot = new Map<string, string[]>();
  for (const c of commissions) {
    const lot = dejaDansUnLot.get(c.id);
    if (!lot) continue;
    const ids = parLot.get(lot) ?? [];
    ids.push(c.id);
    parLot.set(lot, ids);
  }
  for (const [lot, ids] of parLot) {
    const { error } = await supabaseAdmin
      .from(TABLE_COMM)
      .update({ status: "paid", paid_at: new Date().toISOString(), payout_id: lot })
      .in("id", ids);
    if (error) {
      console.error(
        `[versement] marquage du lot ${lot} toujours NON repare (${ids.length} commission(s)) : ${error.message}`,
      );
    } else {
      console.warn(
        `[versement] marquage du lot ${lot} REPARE : ${ids.length} commission(s) remise(s) en paid. ` +
          `Elles etaient dans le fichier du lot sans etre marquees.`,
      );
    }
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
  // ── ANNULER UN LOT ROUVRE SES COMMISSIONS ──
  //
  // Avant, « annuler » ne touchait qu'au statut du lot : ses
  // commissions restaient `paid`, donc l'affilié n'était JAMAIS payé
  // pour ces ventes, et aucun écran ne le disait. La décision (un lot
  // `paye` ne s'annule pas) vit dans `reouvertureDeLot`, pure.
  //
  // L'ORDRE compte : on rouvre les commissions D'ABORD, on annule le
  // lot ENSUITE. L'inverse laisserait, sur une panne entre les deux,
  // un lot annulé dont les commissions sont encore `paid` : exactement
  // le trou qu'on ferme. Dans ce sens, une panne laisse un lot encore
  // `exporte` avec des commissions déjà libres, que
  // `commissionsDejaDansDesLots` écarte tant qu'il n'est pas annulé.
  if (statut === "annule") {
    const { data: lot, error: lectureErr } = await supabaseAdmin
      .from(TABLE_LOTS).select("id, statut").eq("id", id).maybeSingle();
    if (lectureErr || !lot) {
      console.error(`[versement] lot ${id} illisible, annulation refusee : ${lectureErr?.message ?? "introuvable"}`);
      return false;
    }
    if (reouvertureDeLot((lot as { statut: string | null }).statut) === "refuser") {
      console.error(`[versement] lot ${id} est ${(lot as { statut: string | null }).statut} : il ne s'annule pas.`);
      return false;
    }
    const { error: rouvreErr } = await supabaseAdmin
      .from(TABLE_COMM)
      .update({ status: "approved", paid_at: null, payout_id: null })
      .eq("payout_id", id)
      .eq("status", "paid");
    if (rouvreErr) {
      console.error(`[versement] lot ${id} NON annule : ses commissions n'ont pas pu etre rouvertes (${rouvreErr.message}).`);
      return false;
    }
  }
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
    // ON DEMANDE A VIES, ET UNE PIECE N'ATTEND JAMAIS APRES LUI.
    //
    // `verifierVies` ne leve pas et rend `injoignable` au bout de six
    // secondes : la piece sort alors marquee, comme avant. Un virement
    // bloque parce que la Commission europeenne redemarrait serait pire
    // que le doute (regle du 7 aout : on emet toujours).
    const vies = profil.numeroTva
      ? await verifierVies(profil.numeroTva)
      : ("non-verifie" as const);
    const f = construireAutofacture({ ligne, profil, periode, lotId, emiseLe, vies });
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

/** Une commission versée puis annulée, que l'admin doit récupérer à la main. */
export interface ACompenser {
  commissionId: string;
  sa: string;
  email: string | null;
  montantCents: number;
  motif: string | null;
  depuis: string | null;
  lotId: string | null;
}

/**
 * LES COMMISSIONS À COMPENSER, ET « JE N'AI PAS PU LIRE » SE DIT.
 *
 * `lisible: false` quand la colonne n'existe pas encore (migration du
 * 11 septembre) ou que la lecture rate : un écran qui afficherait « rien
 * à compenser » sur une panne de lecture ferait croire que tout est
 * réglé (règle du 23 août).
 */
export async function lireACompenser(): Promise<
  { lisible: true; lignes: ACompenser[] } | { lisible: false; raison: string }
> {
  const { data, error } = await supabaseAdmin
    .from(TABLE_COMM)
    .select("id, sa, customer_email, a_compenser_cents, a_compenser_motif, a_compenser_depuis, payout_id")
    .gt("a_compenser_cents", 0)
    .is("a_compenser_regle_le", null)
    .order("a_compenser_depuis", { ascending: true })
    .limit(200);
  if (error) {
    console.error(`[versement] compensations illisibles : ${error.message}`);
    return { lisible: false, raison: error.message };
  }
  return {
    lisible: true,
    lignes: ((data ?? []) as Record<string, unknown>[]).map((l) => ({
      commissionId: String(l.id),
      sa: String(l.sa),
      email: (l.customer_email as string | null) ?? null,
      montantCents: Number(l.a_compenser_cents ?? 0),
      motif: (l.a_compenser_motif as string | null) ?? null,
      depuis: (l.a_compenser_depuis as string | null) ?? null,
      lotId: (l.payout_id as string | null) ?? null,
    })),
  };
}

/** L'humain a compensé (lot suivant, ou écrit à l'affilié) : on le note, on n'efface rien. */
export async function reglerCompensation(commissionId: string, par: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from(TABLE_COMM)
    .update({ a_compenser_regle_le: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", commissionId)
    .gt("a_compenser_cents", 0);
  if (error) {
    console.error(`[versement] compensation ${commissionId} non reglee par ${par} : ${error.message}`);
    return false;
  }
  console.log(`[versement] compensation ${commissionId} reglee par ${par}`);
  return true;
}
