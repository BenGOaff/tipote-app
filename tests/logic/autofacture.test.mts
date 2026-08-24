// tests/logic/autofacture.test.mts
//
// ON ÉMET LA FACTURE À LA PLACE DE L'AFFILIÉ.
//
// Béné, 25 août 2026 : "je veux le même truc que systeme io : l'affilié
// complète ses infos, son numéro de TVA et siren s'il a, ses
// coordonnées, son mode paiement et tous les mois on génère sa facture
// pour sa compta, il peut la télécharger et nous on peut le payer via
// cette facture qu'on a générée pour lui."
//
// Et, dans le même message, la distinction qui structure tout :
//
//   "Ne pas confondre :
//    - les factures qu'on crée pour nos acheteurs
//    - les factures qu'on crée à la place de nos affiliés pour les payer
//      et ne pas avoir à attendre leurs propres factures"
//
// LES DEUX VONT DANS DES SENS OPPOSÉS. Sur une vente, nous sommes le
// vendeur et le prix est TTC : la TVA se calcule DEDANS. Ici l'affilié
// est le vendeur, la commission est nette de taxe, et la TVA s'AJOUTE.
// Recopier l'une sur l'autre ferait des factures fausses des deux côtés,
// et rien ne le signalerait avant une réclamation.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import {
  COMMISSION_EST_HT,
  MANDAT_VERSION,
  MENTION_AUTOFACTURATION,
  PROFIL_VIDE,
  lireProfilFiscal,
  manquesFiscaux,
  montantsAutofacture,
  profilFiscalComplet,
  resoudreTvaAutofacture,
  sirenValide,
  type ProfilFiscal,
} from "@/lib/affiliate/fiscal";
import {
  CLIENT,
  TEXTE_MANDAT,
  construireAutofacture,
  serieAutofacture,
} from "@/lib/affiliate/autofacture";
import { construireLot, type CommissionAVerser } from "@/lib/affiliate/versement";
import { lireCoordonnees, peutEtrePayee } from "@/lib/affiliate/coordonnees";

const lire = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

/** Un SIREN qui passe vraiment la clé de Luhn. */
const SIREN_OK = "909349045";

function profil(sur: Partial<ProfilFiscal> = {}): ProfilFiscal {
  return lireProfilFiscal({
    statut: "entreprise",
    denomination: "Jocelyne Conseil",
    adresse1: "3 rue des Tilleuls",
    codePostal: "75011",
    ville: "Paris",
    pays: "FR",
    siren: SIREN_OK,
    assujettiTva: false,
    mandatAccepteLe: "2026-08-25T10:00:00Z",
    mandatVersion: MANDAT_VERSION,
    ...sur,
  });
}

// ── LE RÉGIME DE TVA, QUI EST LE MIROIR DE LA VENTE ─────────────────

describe("La TVA d'une autofacture", () => {
  test("LE CAS LE PLUS FRÉQUENT : la franchise en base", () => {
    // Il n'existe PAS du côté vente. Un auto-entrepreneur sous les
    // seuils ne facture pas la TVA, et lui en faire porter une
    // l'obligerait à la reverser.
    const d = resoudreTvaAutofacture(profil({ assujettiTva: false }));
    assert.equal(d.regime, "franchise-en-base");
    assert.equal(d.tauxBp, 0);
    assert.ok(d.mentions.some((m) => m.includes("293 B")));
  });

  test("prestataire français assujetti : 20 % qui S'AJOUTENT", () => {
    const d = resoudreTvaAutofacture(profil({ assujettiTva: true, numeroTva: "FR38909349045" }));
    assert.equal(d.regime, "france-tva");
    assert.equal(d.tauxBp, 2000);
  });

  test("ON N'A JAMAIS BESOIN DU TAUX D'UN AUTRE PAYS", () => {
    // C'est la conséquence contre-intuitive du sens : un prestataire
    // belge ne nous facture pas la TVA belge. Son service est taxé là où
    // le PRENEUR est établi, donc chez nous, en autoliquidation.
    const belge = resoudreTvaAutofacture(
      profil({ pays: "BE", siren: null, numeroTva: "BE0123456789", assujettiTva: true }),
    );
    assert.equal(belge.regime, "autoliquidation-ue");
    assert.equal(belge.tauxBp, 0, "jamais 21 %");
    assert.ok(belge.mentions.some((m) => m.includes("Autoliquidation")));
  });

  test("hors Union : autoliquidation aussi", () => {
    const d = resoudreTvaAutofacture(profil({ pays: "US", siren: null, numeroTva: null }));
    assert.equal(d.regime, "autoliquidation-hors-ue");
    assert.equal(d.tauxBp, 0);
    assert.ok(d.mentions.some((m) => m.includes("283-2")));
  });

  test("un prestataire UE sans numéro valide est SIGNALÉ", () => {
    // Sans numéro, on ne peut pas prouver qu'il est assujetti, et
    // l'autoliquidation deviendrait de la TVA à notre charge.
    const d = resoudreTvaAutofacture(profil({ pays: "BE", siren: null, numeroTva: null }));
    assert.ok(d.aVerifier.includes("tva-numero-invalide"));
  });

  test("un particulier : pas de TVA, et on le SIGNALE", () => {
    // Il ne peut pas, en principe, facturer une prestation à titre
    // habituel. On émet quand même (il a gagné cet argent) et on marque :
    // retenir son argent en attendant serait pire.
    const d = resoudreTvaAutofacture(profil({ statut: "particulier", siren: null }));
    assert.equal(d.regime, "particulier");
    assert.equal(d.tauxBp, 0);
    assert.ok(d.aVerifier.includes("statut-particulier"));
  });

  test("LA MENTION « AUTOFACTURATION » EST SUR TOUTES LES PIÈCES", () => {
    // Article 242 nonies A du CGI : elle est obligatoire, sans exception.
    for (const p of [
      profil(),
      profil({ assujettiTva: true, numeroTva: "FR38909349045" }),
      profil({ pays: "BE", siren: null, numeroTva: "BE0123456789" }),
      profil({ pays: "US", siren: null }),
      profil({ statut: "particulier", siren: null }),
    ]) {
      assert.equal(resoudreTvaAutofacture(p).mentions[0], MENTION_AUTOFACTURATION);
    }
  });

  test("la mention nomme le mandat, parce que c'est lui qui autorise", () => {
    assert.match(MENTION_AUTOFACTURATION, /au nom et pour le compte/i);
    assert.match(MENTION_AUTOFACTURATION, /mandat/i);
  });
});

// ── LES MONTANTS, DANS L'AUTRE SENS ─────────────────────────────────

describe("La commission est nette de taxe, la TVA s'AJOUTE", () => {
  test("32,90 € de commission à 20 % : 39,48 € à payer", () => {
    // L'inverse d'une facture de vente, où 32,90 TTC donnerait 27,42 HT.
    // Confondre les deux sens ferait payer 20 % de moins à chaque
    // affilié assujetti, sans que rien ne le signale.
    const m = montantsAutofacture(3290, 2000);
    assert.equal(m.htCents, 3290);
    assert.equal(m.tvaCents, 658);
    assert.equal(m.ttcCents, 3948);
  });

  test("sans TVA, le montant ne bouge pas", () => {
    const m = montantsAutofacture(3290, 0);
    assert.equal(m.htCents, 3290);
    assert.equal(m.tvaCents, 0);
    assert.equal(m.ttcCents, 3290);
  });

  test("HT + TVA fait TOUJOURS le TTC", () => {
    for (const c of [1, 999, 2000, 3290, 17000, 123456]) {
      for (const bp of [0, 2000]) {
        const m = montantsAutofacture(c, bp);
        assert.equal(m.htCents + m.tvaCents, m.ttcCents, `${c} a ${bp}`);
      }
    }
  });

  test("LE SENS EST UNE CONSTANTE NOMMÉE, pas un calcul caché", () => {
    // Si Béné veut que la commission soit TTC (donc que l'affilié
    // assujetti touche moins), c'est cette constante qui change, et une
    // seule.
    assert.equal(COMMISSION_EST_HT, true);
    assert.match(lire("lib/affiliate/fiscal.ts"), /COMMISSION_EST_HT/);
  });
});

// ── CE QU'IL FAUT POUR ÉMETTRE ──────────────────────────────────────

describe("Ce qu'il faut avant d'émettre au nom de quelqu'un", () => {
  test("LE MANDAT EST LA CONDITION DE TOUT", () => {
    // Écrire une facture au nom de quelqu'un sans son accord n'est pas
    // une facilité, c'est un faux (article 289 I-2 du CGI).
    assert.deepEqual(manquesFiscaux(profil({ mandatAccepteLe: null })), ["mandat"]);
    assert.ok(!profilFiscalComplet(profil({ mandatAccepteLe: null })));
  });

  test("un mandat d'une ANCIENNE version se réaccepte", () => {
    // Un texte réécrit n'est plus celui qui a été accepté.
    assert.deepEqual(manquesFiscaux(profil({ mandatVersion: "2020-01-01" })), ["mandat"]);
  });

  test("un profil complet ne manque de rien", () => {
    assert.deepEqual(manquesFiscaux(profil()), []);
    assert.ok(profilFiscalComplet(profil()));
  });

  test("LE STATUT DÉCIDE DE CE QU'ON EXIGE", () => {
    // Réclamer un SIREN à un particulier, c'est un formulaire qu'il
    // n'aura jamais fini.
    assert.deepEqual(manquesFiscaux(profil({ statut: "particulier", siren: null })), []);
    assert.ok(manquesFiscaux(profil({ siren: null })).includes("siren"));
  });

  test("le SIREN n'existe QU'EN FRANCE", () => {
    const belge = profil({ pays: "BE", siren: null, numeroTva: "BE0123456789" });
    assert.ok(!manquesFiscaux(belge).includes("siren"));
  });

  test("hors France dans l'Union, le numéro de TVA est OBLIGATOIRE", () => {
    // Sans lui, l'autoliquidation devient de la TVA à notre charge.
    const belge = profil({ pays: "BE", siren: null, numeroTva: null });
    assert.ok(manquesFiscaux(belge).includes("tva-numero"));
  });

  test("assujetti sans numéro : refusé", () => {
    assert.ok(manquesFiscaux(profil({ assujettiTva: true, numeroTva: null })).includes("tva-numero"));
  });

  test("ASSUJETTI N'EST PAS DÉDUCTIBLE DE LA PRÉSENCE D'UN NUMÉRO", () => {
    // Un auto-entrepreneur en franchise en base a souvent un numéro
    // intracommunautaire pour ses achats européens, tout en ne facturant
    // PAS la TVA. Deviner ferait apparaître 20 % sur sa facture, et
    // c'est LUI qui devrait les reverser.
    const p = profil({ assujettiTva: false, numeroTva: "FR38909349045" });
    assert.equal(resoudreTvaAutofacture(p).regime, "franchise-en-base");
    assert.equal(resoudreTvaAutofacture(p).tauxBp, 0);
  });

  test("sans statut, un seul manque : la question à poser", () => {
    assert.deepEqual(manquesFiscaux(PROFIL_VIDE), ["statut"]);
  });

  test("LA CLÉ DE LUHN attrape la faute de frappe sur le SIREN", () => {
    assert.ok(sirenValide(SIREN_OK));
    assert.ok(sirenValide("90934904500007"), "un SIRET aussi (9 + 5 chiffres)");
    assert.ok(!sirenValide("909349046"), "un chiffre change");
    assert.ok(!sirenValide("12345678"), "8 chiffres");
    assert.ok(!sirenValide("abcdefghi"));
    assert.ok(!sirenValide(""));
    assert.ok(manquesFiscaux(profil({ siren: "909349046" })).includes("siren-invalide"));
  });
});

// ── LA PIÈCE ────────────────────────────────────────────────────────

describe("La facture émise à sa place", () => {
  function ligne(montant = 3290, ids = ["c1", "c2"]) {
    const coordonnees = lireCoordonnees({ payout_method: "paypal", paypal_email: "j@exemple.fr" });
    const commissions: CommissionAVerser[] = ids.map((id) => ({
      id, sa: "sa1", status: "approved",
      commission_cents: Math.round(montant / ids.length), sale_at: "2026-07-01T00:00:00Z",
    }));
    return construireLot(commissions, [
      {
        sa: "sa1", email: "jocelyne@exemple.fr", displayName: "Jocelyne", statut: "active",
        coordonnees, payable: peutEtrePayee(coordonnees), profilComplet: true,
      },
    ]).lignes[0];
  }

  test("une facture ordinaire, sans TVA", () => {
    const f = construireAutofacture({
      ligne: ligne(),
      profil: profil(),
      periode: "2026-08",
      lotId: "lot-1",
      emiseLe: "2026-09-10T08:00:00Z",
    });
    assert.equal(f.serie, "AFF-2026");
    assert.equal(f.ttcCents, 3290);
    assert.equal(f.tvaCents, 0);
    assert.equal(f.nombreVentes, 2);
    // L'identité est RECOPIÉE : la pièce ne bouge plus après émission.
    assert.equal(f.prestataire.denomination, "Jocelyne Conseil");
    assert.equal(f.client.denomination, "ETHILIFE");
  });

  test("avec TVA, le montant à payer MONTE", () => {
    const f = construireAutofacture({
      ligne: ligne(),
      profil: profil({ assujettiTva: true, numeroTva: "FR38909349045" }),
      periode: "2026-08",
      lotId: "lot-1",
      emiseLe: "2026-09-10T08:00:00Z",
    });
    assert.equal(f.htCents, 3290);
    assert.equal(f.tvaCents, 658);
    assert.equal(f.ttcCents, 3948);
  });

  test("UNE FACTURE PAR AFFILIÉ ET PAR LOT, jamais une par commission", () => {
    // C'est UN virement qu'on lui fait, donc UNE pièce. Le détail est
    // dedans, en nombre de ventes.
    const f = construireAutofacture({
      ligne: ligne(9000, ["a", "b", "c", "d"]),
      profil: profil(),
      periode: "2026-08",
      lotId: "lot-1",
      emiseLe: "2026-09-10T08:00:00Z",
    });
    assert.equal(f.commissionIds.length, 4);
    assert.equal(f.nombreVentes, 4);
  });

  test("la série est l'année d'ÉMISSION", () => {
    assert.equal(serieAutofacture("2026-12-31T23:59:00Z"), "AFF-2026");
    assert.equal(serieAutofacture("2027-01-02T00:01:00Z"), "AFF-2027");
  });

  test("TROIS PRÉFIXES, TROIS COMPTEURS, TROIS BASES", () => {
    // `TQ-` = les acheteurs de Tiquiz, `AQ-` = ceux de l'Atelier,
    // `AFF-` = les affiliés. Un préfixe partagé donnerait deux pièces au
    // même numéro pour deux choses différentes.
    assert.match(serieAutofacture("2026-08-25T00:00:00Z"), /^AFF-/);
  });

  test("le fil vers le virement est gardé", () => {
    // Le jour où une affiliée dit "je n'ai pas été payée", c'est ce
    // champ qui répond.
    const f = construireAutofacture({
      ligne: ligne(), profil: profil(), periode: "2026-08",
      lotId: "lot-42", emiseLe: "2026-09-10T08:00:00Z",
    });
    assert.equal(f.lotId, "lot-42");
  });
});

// ── LES RÈGLES QUI NE SE VOIENT PAS ─────────────────────────────────

describe("Les règles qui ne se voient pas dans un écran", () => {
  test("ON NE CONFOND PAS LES DEUX FACTURES", () => {
    // Le sens de la TVA est opposé. Le fichier le dit en tête, et ce
    // test le garde : c'est la distinction que Béné a écrite elle même.
    const src = lire("lib/affiliate/fiscal.ts");
    assert.match(src, /NE PAS CONFONDRE LES DEUX FACTURES/);
    assert.match(src, /MIROIR DE LA VENTE/);
  });

  test("les décisions vivent dans des modules PURS", () => {
    for (const f of ["lib/affiliate/fiscal.ts", "lib/affiliate/autofacture.ts"]) {
      assert.ok(!lire(f).includes("supabaseAdmin"), `${f} importe supabaseAdmin`);
    }
  });

  test("LE TEXTE DU MANDAT N'EST PAS DE LA COPY", () => {
    // C'est un acte juridique : il vit dans le code, pas dans un fichier
    // de langue, et sa version est stockée avec l'acceptation.
    assert.ok(TEXTE_MANDAT.length >= 3);
    assert.ok(TEXTE_MANDAT.join(" ").includes("289 I-2"));
    // Le droit de CONTESTER est une condition légale : il doit y être.
    assert.ok(TEXTE_MANDAT.join(" ").toLowerCase().includes("contester"));
    // Et la sortie doit être possible, sinon ce n'est pas un mandat.
    assert.ok(TEXTE_MANDAT.join(" ").toLowerCase().includes("mettre fin"));
  });

  test("L'IDENTITÉ DU CLIENT EST CELLE DES DEUX AUTRES DÉPÔTS", () => {
    // Même société. Pas de paquet partagé, donc une recopie, donc ça
    // diverge : on fige pour qu'un changement soit voulu.
    assert.equal(CLIENT.denomination, "ETHILIFE");
    assert.equal(CLIENT.rcs, "Montpellier 909 349 045");
    assert.equal(CLIENT.tva, "FR38909349045");
    assert.equal(CLIENT.adresse, "377 Tertre Avenue Grassion Cibrand, 34130 Mauguio, France");
  });
});

// ── LA CHAÎNE, QUI N'EST DANS AUCUNE FONCTION PURE ──────────────────
//
// Tout ce qui suit vit dans des fichiers qu'aucun test ne peut
// IMPORTER : `versementStore.ts` tire `supabaseAdmin`, la route tire
// `next/server`, la migration est du SQL. Ce sont pourtant eux qui
// décident si la facture existe vraiment. On lit donc la source.
//
// Un test de source est un pis aller, et il a une limite : il vérifie
// que la ligne est là, pas qu'elle fait ce qu'elle dit. C'est assez
// pour empêcher qu'on la RETIRE, et c'est exactement ce qui est arrivé
// aux garde-fous du 22 août.

describe("La chaîne qui produit vraiment la facture", () => {
  const store = lire("lib/affiliate/versementStore.ts");

  test("L'ORDRE : le lot d'abord, la facture ensuite, les commissions en dernier", () => {
    const iLot = store.indexOf(".insert({\n        periode: args.periode");
    const iFacture = store.indexOf("await emettreAutofacturesDuLot(");
    const iPaid = store.indexOf('.update({ status: "paid"');
    assert.ok(iLot > 0 && iFacture > 0 && iPaid > 0, "une des trois étapes a disparu");
    // Avant le lot, la facture n'aurait pas d'identifiant de versement
    // à porter. Après le marquage, une panne laisserait des commissions
    // soldées sans la pièce qui les justifie.
    assert.ok(iLot < iFacture, "la facture est emise avant que le lot existe");
    assert.ok(iFacture < iPaid, "les commissions sont soldees avant l'emission");
  });

  test("UNE FACTURE RATÉE NE BLOQUE JAMAIS UN VIREMENT", () => {
    // Une pièce manquante se réémet, un virement perdu non. L'émission
    // ne rend rien, ne lève pas, et chaque échec passe au suivant.
    assert.match(store, /emettreAutofacturesDuLot\([\s\S]{0,400}?\): Promise<void>/);
    const corps = store.slice(store.indexOf("async function emettreAutofacturesDuLot"));
    assert.ok(corps.includes("continue;"), "un echec d'emission ne passe pas au suivant");
    assert.ok(!/emettreAutofacturesDuLot[^;]*return \{ ok: false/.test(store));
  });

  test("LE PROFIL EST RELU ET RECOPIÉ AU MOMENT D'ÉMETTRE", () => {
    // Une facture émise ne bouge plus : elle porte l'adresse du jour de
    // l'émission, pas celle d'aujourd'hui. Même règle que la facture de
    // vente (24 août). Si l'écran lisait le profil COURANT, un
    // déménagement réécrirait tout l'historique en silence.
    const corps = store.slice(store.indexOf("async function emettreAutofacturesDuLot"));
    assert.ok(corps.includes("CHAMPS_FISCAL"), "le profil n'est pas relu a l'emission");
    assert.ok(corps.includes("p_prestataire: f.prestataire"), "l'identite n'est pas recopiee");
  });

  test("L'IBAN FIGÉ NE PART PAS DANS UN NAVIGATEUR", () => {
    // `affiliate_payouts.lignes` porte les coordonnées recopiées, donc
    // des IBAN en clair. Un `select("*")` les envoyait à l'écran
    // d'admin, alors que la règle du 25 août dit l'inverse. L'écran
    // reçoit un COMPTE, pas des comptes bancaires.
    const corps = store.slice(store.indexOf("export async function lireLots"));
    const fin = corps.indexOf("export async function lireLot(");
    const lireLots = corps.slice(0, fin > 0 ? fin : undefined);
    assert.ok(!lireLots.includes('select("*")'), "lireLots renvoie toutes les colonnes");
    assert.ok(lireLots.includes("nbLignes"), "le compte de virements n'est pas calcule");
    assert.match(lireLots, /const \{ lignes, \.\.\.reste \} = l/);
  });

  test("LA DATE DU MANDAT VIENT DU SERVEUR, jamais du navigateur", () => {
    // C'est la date d'un acte juridique. Acceptée depuis un formulaire,
    // elle serait celle que le navigateur veut bien annoncer.
    const corps = store.slice(store.indexOf("export async function ecrireProfilFiscalAffiliee"));
    assert.match(corps.slice(0, 2000), /mandat_accepte_le\s*[:=]\s*new Date\(\)\.toISOString\(\)/);
    // Et le corps de la requête ne porte QUE le oui/non.
    const route = lire("app/api/affiliate/coordonnees/route.ts");
    assert.ok(!/mandatAccepteLe\s*:\s*body\./.test(route), "la date vient du navigateur");
    assert.match(route, /accepteLeMandat: body\.accepteLeMandat === true/);
  });
});

describe("Ce que la base garantit, et que le code ne peut pas garantir", () => {
  const sql = lire("supabase/migrations/20260825_autofacturation.sql");

  test("UNE SEULE FACTURE PAR AFFILIÉ ET PAR LOT", () => {
    // PayPal et Stripe rejouent leurs webhooks, et un admin peut
    // recliquer. Deux factures pour un même versement, c'est une
    // numérotation cassée et une compta fausse.
    assert.match(sql, /unique index[\s\S]{0,200}?\(sa, payout_id, genre\)/i);
  });

  test("UN DOUBLON REND LA PIÈCE EXISTANTE, il ne LÈVE pas", () => {
    // Lever ferait échouer l'appelant, donc bloquerait le lot, donc les
    // virements : exactement ce qu'on refuse. C'est la règle déjà
    // tenue par `emettre_facture` côté Tiquiz.
    const fn = sql.slice(sql.indexOf("create or replace function public.emettre_autofacture"));
    assert.ok(fn.length > 200, "la fonction n'a pas ete trouvee");
    // Le SELECT d'entrée rend la pièce déjà émise.
    assert.ok(/select \* into v_ligne[\s\S]{0,200}?where sa = p_sa/i.test(fn));
    // ET le filet pour deux appels SIMULTANÉS, que le SELECT ne peut pas
    // voir : sans lui la fonction lève, donc le lot échoue, donc les
    // virements attendent une pièce comptable.
    assert.match(fn, /when unique_violation then/i);
  });

  test("LE NUMÉRO EST ALLOUÉ ET LA LIGNE INSÉRÉE DANS LA MÊME OPÉRATION", () => {
    // Une séquence Postgres saute des numéros dès qu'une transaction
    // est annulée, c'est même sa raison d'être. Une numérotation de
    // factures doit être continue : un trou est exactement ce qu'un
    // contrôle cherche.
    assert.ok(!/create sequence/i.test(sql), "une sequence sauterait des numeros");
    assert.match(sql, /autofacture_compteurs/);
    assert.match(sql, /security definer/i);
  });

  test("LA MIGRATION EST REJOUABLE", () => {
    // Elle sera passée à la main dans le Studio, parfois deux fois.
    assert.ok(sql.includes("if not exists"), "la migration n'est pas rejouable");
    assert.match(sql, /notify pgrst, 'reload schema'/i);
  });
});

describe("La page imprimable", () => {
  const page = lire("app/facture-affilie/[numero]/page.tsx");

  test("PERSONNE NE LIT LA FACTURE DE QUELQU'UN D'AUTRE", () => {
    // Le numéro est devinable (série + compteur croissant) : il ne
    // protège RIEN. La porte est la session, et il en faut deux, parce
    // qu'un admin n'a pas de session d'affilié.
    assert.ok(page.includes("getAffiliateSession"), "aucune session d'affilie verifiee");
    assert.match(page, /session\?\.sa === f\.sa/);
    assert.ok(page.includes("isAdminEmail"), "l'admin ne peut pas ouvrir la piece");
    // Refusé = introuvable : dire "ce n'est pas la tienne" confirmerait
    // qu'elle existe, donc qu'il y a eu un versement ce mois là.
    assert.match(page, /if \(!autorise\) notFound\(\)/);
  });

  test("LA MENTION LÉGALE VIENT DE LA PIÈCE, jamais d'un recalcul", () => {
    // Sur cette facture, l'affilié est le VENDEUR et nous sommes le
    // client, et la mention « Autofacturation » (art. 242 nonies A) est
    // obligatoire. Elle est FIGÉE dans la pièce à l'émission : la
    // recalculer aujourd'hui réécrirait une facture déjà remise à un
    // comptable le jour où le texte change.
    assert.match(page, /f\.mentions/);
    assert.ok(
      !page.includes("MENTION_AUTOFACTURATION"),
      "la page recalcule la mention au lieu de rendre celle qui est figee",
    );
    assert.match(page, /Prestataire/);
  });
});
