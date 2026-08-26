// tests/logic/espace-affilie-nouveautes.test.mts
//
// L'ESPACE AFFILIÉ DIT CE QUI A CHANGÉ, ET LA PORTE D'ENTRÉE EST LA
// NÔTRE.
//
// Béné, 26 août 2026 : "je ne vois toujours rien des nouveaux liens ni
// nouveaux système ni rien sur affiliate : en l'état je peux pas dire à
// mes users allez sur affiliate vous verrez tout est à jour et
// expliqué ! Aussi ils doivent pouvoir s'inscrire directement depuis la
// page de login s'ils n'ont pas encore de compte."
//
// Deux constats, et le diagnostic est plus intéressant que le symptôme :
//
// 1. TOUT ÉTAIT CORRIGÉ, RIEN N'ÉTAIT ANNONCÉ. Les écrans portaient les
//    bons chiffres et les liens le bon format, mais un affilié qui
//    revient voit la même page qu'avant : pour lui, il ne s'est rien
//    passé. C'est la leçon du 3 août, une nouveauté qu'on ne montre pas
//    n'existe pas.
// 2. LE LIEN D'INSCRIPTION EXISTAIT, en troisième position, sous un
//    bouton plein qui renvoyait chez Systeme.io. Elle a lu l'écran et
//    n'a pas vu l'option, ce qui est la seule mesure qui compte.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { getDict } from "@/app/affiliate/i18n";

const LANGUES = ["fr", "en", "es", "it", "pt", "ar"] as const;
const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

test("l'annonce existe dans les 6 langues, et rien n'y est a trou", () => {
  for (const l of LANGUES) {
    const n = getDict(l).nouveautes;
    assert.ok(n, `${l} : bloc absent`);
    for (const [cle, valeur] of Object.entries(n)) {
      assert.ok(String(valeur).trim().length > 0, `${l}.${cle} vide`);
      assert.doesNotMatch(String(valeur), /\{|\}|undefined|NaN/, `${l}.${cle}`);
    }
  }
});

test("l'annonce dit les CHIFFRES du programme, pas des generalites", () => {
  // Une annonce qui dit "on a ameliore le programme" ne sert a rien :
  // l'affilie a besoin des nombres qui changent ce qu'il touche.
  const fr = getDict("fr").nouveautes;
  const tout = Object.values(fr).join(" ");
  for (const chiffre of ["70%", "40%", "20 €", "50 €", "30 jours", "10 et le 13"]) {
    assert.ok(tout.includes(chiffre), `le chiffre ${chiffre} manque a l'annonce`);
  }
  // Et elle rassure sur les anciens liens : sans ca, un affilie croit
  // que ce qu'il a deja partage ne paie plus.
  assert.match(tout, /anciens liens restent valides/i);
});

test("aucun tiret cadratin ni chevron francais dans l'annonce", () => {
  for (const l of LANGUES) {
    for (const [cle, valeur] of Object.entries(getDict(l).nouveautes)) {
      assert.doesNotMatch(String(valeur), /[—–]/, `${l}.${cle}`);
      if (l === "fr") assert.doesNotMatch(String(valeur), /[«»]/, `${l}.${cle}`);
    }
  }
});

test("l'annonce se ferme et s'en souvient, par affilie", () => {
  const src = lire("app/affiliate/components/NouveautesProgramme.tsx");
  assert.match(src, /"use client"/);
  assert.match(src, /localStorage/);
  // Une cle par affilie : deux personnes sur le meme navigateur ne se
  // masquent pas l'annonce l'une a l'autre.
  assert.match(src, /function cleMemoire\(sa: string\)/);
  assert.match(src, /\$\{sa\}/);
  // Lu APRES le montage, sinon le serveur rend le bandeau et le client
  // le retire aussitot : l'hydratation casse.
  assert.match(src, /useEffect\(/);
  assert.match(src, /if \(!monte \|\| masque\) return null;/);
});

test("un stockage refuse AFFICHE l'annonce au lieu de la masquer", () => {
  // Navigation privee, stockage bloque : une annonce en trop ne coute
  // rien, une annonce jamais vue coute un affilie qui continue avec son
  // ancien lien.
  const src = lire("app/affiliate/components/NouveautesProgramme.tsx");
  assert.match(src, /catch \{[\s\S]{0,400}setMasque\(false\)/);
});

test("l'annonce est en TETE de l'accueil, avant les liens", () => {
  const src = lire("app/affiliate/page.tsx");
  const annonce = src.indexOf("<NouveautesProgramme");
  const liens = src.indexOf("<PromoteCard");
  assert.ok(annonce > 0, "l'annonce n'est pas branchee");
  assert.ok(annonce < liens, "elle passe apres les liens, donc elle n'explique plus rien");
});

test("le lien vers les conditions ne fait pas QUITTER l'espace", () => {
  // Regle du 24 aout : un lien externe s'ouvre dans un nouvel onglet.
  const src = lire("app/affiliate/components/NouveautesProgramme.tsx");
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer"/);
});

test("s'inscrire est le bouton PRINCIPAL de la page de connexion", () => {
  const src = lire("app/affiliate/login/LoginAffiliateForm.tsx");
  const inscription = src.indexOf("signup_direct");
  const decouvrir = src.indexOf("discover_program");
  assert.ok(inscription > 0 && decouvrir > 0);
  assert.ok(
    inscription < decouvrir,
    "la page de vente Systeme.io repasse devant notre propre inscription",
  );
  // Et c'est bien un bouton plein, pas une ligne soulignee.
  assert.match(src, /<Button className="w-full" asChild>\s*<Link href="\/signup">/);
});
