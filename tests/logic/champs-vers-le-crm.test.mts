// tests/logic/champs-vers-le-crm.test.mts
//
// LES CHAMPS PERSONNALISÉS DU FORMULAIRE PARTENT DANS LA FICHE CONTACT
// (Béné, 16 septembre 2026 : "oui il faut envoyer à systeme io et ghl").
//
// Ce que ce fichier tient, et les moitiés comptent ENSEMBLE :
//
//  1. la DÉCISION est pure (`lib/integrations/champsContact.ts`) : quels
//     champs partent, sous quel nom (le libellé du jour) et quel slug
//     (STABLE, dérivé de l'id : un renommage ne fabrique pas un second
//     champ chez Systeme.io) ; côté GoHighLevel, quoi écrire et quoi créer ;
//  2. l'adaptateur Systeme.io ASSURE le champ (`POST /contact_fields`)
//     AVANT d'écrire la valeur : un slug inconnu y est accepté et ignoré
//     (mesuré le 25 août 2026), donc écrire d'abord perdrait la valeur
//     sans une erreur ;
//  3. l'adaptateur GoHighLevel LISTE les champs du sous-compte avant d'en
//     CRÉER, n'envoie jamais `customFields` dans l'upsert, et écrit la
//     valeur sous `field_value` (le nom que porte LEUR spécification
//     OpenAPI, 12 occurrences ; `fieldValue` zéro) ;
//  4. la route de capture passe les champs dans la charge, aux deux
//     dépôts, chacun avec SON préfixe (`tiquiz`, `tipote`).
//
// Il est le MÊME dans les deux dépôts, et s'adapte à ce que chacun porte.
// Vérifié en rejouant des versions fautives : elles rougissent.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MAX_NOM_CHAMP_CONTACT,
  champsContactPersonnalises,
  memeNomDeChamp,
  planifierChampsGhl,
  slugChampContact,
} from "@/lib/integrations/champsContact";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

const lire = (p: string) => sansCommentaires(readFileSync(p, "utf8"));
const ROUTE = "app/api/quiz/[quizId]/public/route.ts";
const ADAPTATEUR_SIO = "lib/integrations/adaptateurs/systemeio.ts";
const ADAPTATEUR_GHL = "lib/integrations/adaptateurs/gohighlevel.ts";
/** Tiquiz porte les adaptateurs ; Tipote garde son client Systeme.io dans la route. */
const estTiquiz = existsSync(ADAPTATEUR_SIO);
const PREFIXE_ATTENDU = estTiquiz ? "tiquiz" : "tipote";

const ville = { id: "cf_ab12cd", label: "Ta ville", placeholder: "Paris", required: true };
const metier = { id: "cf_metier01", label: "Ton métier", placeholder: "", required: false };
const sansNom = { id: "cf_vide01", label: "", placeholder: "", required: false };

// ── 1. LA DÉCISION ────────────────────────────────────────────────────

test("le slug est STABLE (le prefixe puis l'id), le nom est le libelle du jour", () => {
  const [c] = champsContactPersonnalises("tiquiz", [ville], { cf_ab12cd: "Lyon" });
  assert.deepEqual(c, { id: "cf_ab12cd", slug: "tiquiz_cf_ab12cd", nom: "Ta ville", valeur: "Lyon" });
  // Renommer le libelle ne change PAS le slug : Systeme.io garde le meme champ.
  const [r] = champsContactPersonnalises("tiquiz", [{ ...ville, label: "Ville" }], { cf_ab12cd: "Lyon" });
  assert.equal(r.slug, c.slug);
  assert.equal(r.nom, "Ville");
  // Un autre prefixe, un autre slug : Tipote n'ecrit pas dans les champs de Tiquiz.
  assert.equal(champsContactPersonnalises("tipote", [ville], { cf_ab12cd: "Lyon" })[0].slug, "tipote_cf_ab12cd");
});

test("ne part que ce qui a un libelle ET une valeur, jamais un champ vide", () => {
  const sortie = champsContactPersonnalises(
    "tiquiz",
    [ville, metier, sansNom],
    { cf_ab12cd: "   ", cf_metier01: "  Coach  ", cf_vide01: "x", cf_inconnu: "y" },
  );
  assert.deepEqual(sortie.map((c) => [c.id, c.valeur]), [["cf_metier01", "Coach"]]);
  assert.deepEqual(champsContactPersonnalises("tiquiz", [ville], null), []);
  assert.deepEqual(champsContactPersonnalises("tiquiz", [ville], {}), []);
});

test("un slug doit tenir `^\\w+$` (la contrainte de Systeme.io), et le nom est borne a 255", () => {
  assert.equal(slugChampContact("tiquiz", "cf_ab12cd"), "tiquiz_cf_ab12cd");
  assert.equal(slugChampContact("ti-quiz", "cf_ab12cd"), null, "un tiret n'est pas un caractere de mot");
  assert.equal(slugChampContact("", "cf_ab12cd"), null, "sans prefixe, le slug serait celui de l'autre app");
  assert.equal(slugChampContact("tiquiz", ""), null);
  assert.deepEqual(champsContactPersonnalises("ti-quiz", [ville], { cf_ab12cd: "Lyon" }), [], "un slug invalide ecarte le champ, il ne leve pas");
  const long = { ...ville, label: "a".repeat(400) };
  assert.equal(champsContactPersonnalises("tiquiz", [long], { cf_ab12cd: "Lyon" })[0].nom.length, Math.min(400, MAX_NOM_CHAMP_CONTACT));
});

test("GoHighLevel : un champ se retrouve par sa CLE d'abord, par son NOM ensuite, et un manquant se cree UNE fois", () => {
  const existants = [
    { id: "A", name: "Resultat du quiz", fieldKey: "contact.tiquiz_resultat" },
    { id: "B", name: "ta ville", fieldKey: "contact.ta_ville" },
  ];
  const plan = planifierChampsGhl(existants, [
    { cle: "tiquiz_resultat", nom: "tiquiz_resultat", valeur: "Le Stratege" },
    { nom: "Ta  Ville", valeur: "Lyon" },
    { nom: "Ton métier", valeur: "Coach" },
    { nom: "ton metier ", valeur: "x" },
    { nom: "Ton métier", valeur: "Consultant" },
    { nom: "Sans valeur", valeur: "  " },
  ]);
  assert.deepEqual(plan.aEcrire, [
    { id: "A", valeur: "Le Stratege" },
    { id: "B", valeur: "Lyon" },
  ]);
  // "Ton métier" et "ton metier " ne sont pas le meme nom (l'accent compte
  // chez eux) ; "Ton métier" deux fois n'en cree qu'un.
  assert.deepEqual(plan.aCreer.map((c) => c.nom), ["Ton métier", "ton metier"]);
  assert.ok(memeNomDeChamp("Ta  Ville", "ta ville"));
  assert.ok(!memeNomDeChamp("", ""), "deux noms vides ne sont pas le meme champ");
});

test("GoHighLevel : une fois le champ cree, le plan suivant l'ECRIT au lieu de le recreer", () => {
  const voulus = [{ nom: "Ta ville", valeur: "Lyon" }];
  const avant = planifierChampsGhl([], voulus);
  assert.deepEqual(avant, { aEcrire: [], aCreer: [{ nom: "Ta ville", valeur: "Lyon" }] });
  const apres = planifierChampsGhl([{ id: "N", name: "Ta ville", fieldKey: "contact.ta_ville" }], voulus);
  assert.deepEqual(apres, { aEcrire: [{ id: "N", valeur: "Lyon" }], aCreer: [] });
});

// ── 2 et 3. LES ADAPTATEURS (Tiquiz) ─────────────────────────────────

test("Systeme.io : le champ est ASSURE (POST /contact_fields) AVANT que la valeur soit ecrite", { skip: !estTiquiz }, () => {
  const src = lire(ADAPTATEUR_SIO);
  const debut = src.indexOf("export async function ecrireChampsPersonnalisesSio");
  assert.ok(debut > 0, "ecrireChampsPersonnalisesSio introuvable");
  const corps = src.slice(debut, src.indexOf("export async function enrollInSioCourse"));
  const assure = corps.indexOf("assurerChampContactSio(apiKey, c.slug, c.nom)");
  const patch = corps.indexOf("/contacts/${contactId}`");
  assert.ok(assure > 0 && patch > assure, "la valeur est ecrite avant que le champ existe : Systeme.io l'ignore en silence");
  const fn = src.slice(src.indexOf("export async function assurerChampContactSio"), debut);
  assert.match(fn, /"\/contact_fields",\s*\{\s*method:\s*"POST",\s*body:\s*\{\s*fieldName,\s*slug\s*\}/);
  assert.ok(fn.includes("create.status === 422"), "un 422 veut dire que le champ existe : on ne le lit pas comme une panne");
  assert.match(fn, /\/contact_fields\/\$\{encodeURIComponent\(slug\)\}`,\s*\{\s*method:\s*"PATCH"/, "le fieldName suit le libelle du jour");
  assert.match(src, /SIO_PREFIXE_CHAMP\s*=\s*"tiquiz"/);
  // Et l'envoi appelle l'ecriture, APRES le profil.
  const envoi = src.slice(src.indexOf("export async function envoyerVersSystemeio"));
  const profil = envoi.indexOf("enrichSioContact(apiKey, contactId, charge.profilTitre)");
  const champs = envoi.indexOf("ecrireChampsPersonnalisesSio(apiKey, contactId, charge.champs)");
  assert.ok(profil > 0 && champs > profil, "les champs personnalises ne partent pas, ou partent avant le profil");
});

test("GoHighLevel : on LISTE avant de CREER, on ecrit par identifiant sous `field_value`, jamais dans l'upsert", { skip: !estTiquiz }, () => {
  const src = lire(ADAPTATEUR_GHL);
  const upsert = src.slice(src.indexOf("function corpsUpsert"), src.indexOf("export async function envoyerVersGhl"));
  assert.ok(!upsert.includes("customFields"), "corpsUpsert porte customFields : un champ refuse ferait echouer le contact entier");
  const ecrire = src.slice(src.indexOf("export async function ecrireChampsGhl"));
  const liste = ecrire.indexOf("listerChampsGhl(compte)");
  const cree = ecrire.indexOf("creerChampGhl(compte, aCreer.nom)");
  assert.ok(liste > 0 && cree > liste, "on cree sans avoir liste : chaque lead fabriquerait un champ de plus");
  assert.ok(ecrire.includes("planifierChampsGhl("), "le plan n'est plus decide par la fonction pure");
  assert.ok(src.includes("field_value:"), "la valeur ne part plus sous field_value");
  assert.ok(!src.includes("fieldValue"), "`fieldValue` n'existe pas dans leur specification OpenAPI (0 occurrence, contre 12 pour field_value)");
  assert.match(src, /dataType:\s*"TEXT",\s*model:\s*"contact"/, "un champ cree est un champ TEXTE de CONTACT");
  assert.match(src, /customFields\?model=contact/);
  // Les tags partent AVANT les champs : un champ refuse ne coute jamais un tag.
  const envoi = src.slice(src.indexOf("export async function envoyerVersGhl"), src.indexOf("export async function listerChampsGhl"));
  assert.ok(envoi.indexOf("/tags`") > 0 && envoi.indexOf("ecrireChampsGhl(compte, contactId, voulus)") > envoi.indexOf("/tags`"));
  assert.ok(envoi.includes("for (const c of charge.champs ?? [])"), "les champs de la charge ne sont pas voulus");
});

test("GoHighLevel : la connexion demande les scopes customFields, sans lesquels lister et creer repondent 401", { skip: !estTiquiz }, () => {
  const src = lire("app/api/connexions/crm-oauth/oauth/route.ts");
  const m = src.match(/GHL_OAUTH_SCOPES\s*=\s*\n?\s*"([^"]+)"/);
  assert.ok(m, "GHL_OAUTH_SCOPES introuvable");
  const scopes = m![1].split(/\s+/);
  for (const s of ["contacts.readonly", "contacts.write", "locations/tags.readonly", "locations/customFields.readonly", "locations/customFields.write"]) {
    assert.ok(scopes.includes(s), `scope manquant : ${s}`);
  }
});

// ── 4. LA ROUTE DE CAPTURE ───────────────────────────────────────────

test("la capture lit les CHAMPS avec les valeurs, et les passe a l'envoi avec le prefixe du depot", () => {
  const src = lire(ROUTE);
  assert.ok(src.includes("await lireChampsPersonnalises(admin, quizId, body.custom_fields)"), "la route ne lit plus les champs");
  assert.ok(/Promise<\{ champs: ChampPersonnalise\[\]; valeurs: ValeursChamps \}>/.test(src), "la lecture ne rend plus les definitions des champs, donc aucun libelle a envoyer");
  assert.ok(src.includes("champsContactPersonnalises(SIO_PREFIXE_CHAMP, champsPerso, valeursChamps)"), "les champs ne sont pas decides par la fonction pure");
  if (estTiquiz) {
    // La charge porte `champs:` DANS l'appel a envoyerLead de la capture.
    const appel = src.indexOf("const envoi = await envoyerLead(");
    const fin = src.indexOf("quizUserId,\n          );", appel);
    assert.ok(appel > 0 && fin > appel, "appel a envoyerLead introuvable");
    assert.ok(src.slice(appel, fin).includes("champs: champsContactPersonnalises("), "la charge de la capture ne porte pas les champs");
    assert.ok(src.includes('import { SIO_PREFIXE_CHAMP } from "@/lib/integrations/adaptateurs/systemeio"'));
  } else {
    assert.match(src, /const SIO_PREFIXE_CHAMP = "tipote"/);
    const fn = src.slice(src.indexOf("async function ecrireChampsPersonnalisesSio"), src.indexOf("Enroll a SIO contact"));
    const assure = fn.indexOf("assurerChampContactSio(apiKey, c.slug, c.nom)");
    const patch = fn.indexOf("/contacts/${contactId}`");
    assert.ok(assure > 0 && patch > assure, "la valeur est ecrite avant que le champ existe");
    const envoi = src.slice(src.indexOf("await enrichSioContact(apiKey, sioContactId, resultTitle)"));
    assert.ok(envoi.includes("await ecrireChampsPersonnalisesSio(apiKey, sioContactId, champsContact)"), "les champs ne partent pas apres le profil");
  }
});

test("le prefixe du depot est le sien : Tiquiz et Tipote n'ecrivent pas dans les memes champs", () => {
  const src = lire(estTiquiz ? ADAPTATEUR_SIO : ROUTE);
  assert.match(src, new RegExp(`SIO_PREFIXE_CHAMP\\s*=\\s*"${PREFIXE_ATTENDU}"`));
});

test("le module pur n'importe ni base ni reseau", () => {
  const src = lire("lib/integrations/champsContact.ts");
  for (const interdit of ["supabaseAdmin", "fetch(", "process.env", "next/"]) {
    assert.ok(!src.includes(interdit), `${interdit} dans un module pur`);
  }
});
