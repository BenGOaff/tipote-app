// tests/logic/supabase-project.test.mts
//
// « INVALID API KEY » : LA PANNE DU 22 AOÛT AU SOIR, REJOUÉE.
//
// Béné : "je n'ai aucun client côté tipote avec l'erreur suivante,
// qu'est ce que tu as foutu encore ??? [...] le code est à jour, les
// migrations aussi."
//
// Elle avait raison sur les deux points : le code était à jour et les
// migrations aussi. Ce qui était faux, c'est l'environnement du
// PROCESSUS. Son terminal portait encore les variables de Tiquiz, le
// `prebuild` a refusé de construire, et le `pm2 restart --update-env` de
// la ligne suivante a poussé ce terminal dans l'app.
//
// Les deux identifiants ci dessous sont ceux de la vraie panne. Ce ne
// sont pas des secrets : un `ref` de projet Supabase se lit dans l'URL
// publique de la base.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  formaterDiagnostic,
  lireCleSupabase,
  refDepuisUrl,
  verifierProjetSupabase,
} from "@/lib/env/supabaseProject";

const TIQUIZ = "ottpciabnrclwgdlwjdt";
const TIPOTE = "mmwyfqfbfkvcnrkyvagv";

/** Fabrique un JWT de la forme de ceux de Supabase (signature bidon). */
function jwt(ref: string, role: string, expSecondes: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", ref, role, exp: expSecondes })}.signature`;
}

const DANS_10_ANS = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
const IL_Y_A_1_AN = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;

test("l'URL rend l'identifiant du projet, et rien d'autre", () => {
  assert.equal(refDepuisUrl(`https://${TIPOTE}.supabase.co`), TIPOTE);
  assert.equal(refDepuisUrl(`https://${TIPOTE}.supabase.co/`), TIPOTE);
  assert.equal(refDepuisUrl("https://exemple.fr"), null);
  assert.equal(refDepuisUrl(""), null);
  assert.equal(refDepuisUrl(null), null);
  // La valeur abîmée vue dans son terminal ce soir la.
  assert.equal(refDepuisUrl("http:https://quiz.tipote.com"), null);
});

test("une cle est lue sans jamais etre validee ni recopiee", () => {
  const lue = lireCleSupabase(jwt(TIPOTE, "service_role", DANS_10_ANS));
  assert.equal(lue.etat, "jwt");
  if (lue.etat !== "jwt") return;
  assert.equal(lue.ref, TIPOTE);
  assert.equal(lue.role, "service_role");
});

test("les nouvelles cles sb_ sont reconnues, PAS devinees", () => {
  // Elles ne portent aucun projet lisible. Dire "opaque" est honnête ;
  // conclure quoi que ce soit serait faux.
  assert.equal(lireCleSupabase("sb_publishable_ABCdef123").etat, "opaque");
  assert.equal(lireCleSupabase("sb_secret_ABCdef123").etat, "opaque");
  assert.equal(lireCleSupabase("").etat, "absente");
  assert.equal(lireCleSupabase("nimportequoi").etat, "illisible");
});

test("LA PANNE : l'URL de Tipote et les cles de Tiquiz", () => {
  const d = verifierProjetSupabase({
    url: `https://${TIPOTE}.supabase.co`,
    anon: jwt(TIQUIZ, "anon", DANS_10_ANS),
    service: jwt(TIQUIZ, "service_role", DANS_10_ANS),
  });
  assert.equal(d.etat, "croisee");
  assert.equal(d.ecarts.filter((e) => e.genre === "projet-different").length, 2);

  const texte = formaterDiagnostic(d, "TIPOTE");
  assert.ok(texte, "la panne certaine ne produit aucun message");
  assert.ok(texte!.includes(TIQUIZ) && texte!.includes(TIPOTE), "les deux projets ne sont pas nommes");
  // Le point que Béné ne peut pas deviner seule : changer le .env ne
  // suffit pas, il faut RECONSTRUIRE depuis un terminal neuf.
  assert.ok(texte!.includes("terminal NEUF"), "le message ne dit pas comment corriger");
});

test("un message de journal ne contient JAMAIS une cle", () => {
  const cle = jwt(TIQUIZ, "service_role", DANS_10_ANS);
  const texte = formaterDiagnostic(
    verifierProjetSupabase({ url: `https://${TIPOTE}.supabase.co`, anon: cle, service: cle }),
    "TIPOTE",
  );
  assert.ok(texte, "pas de message a inspecter");
  assert.ok(!texte!.includes(cle), "la cle complete part dans le journal");
  // Même un morceau : la signature et la charge utile restent dehors.
  assert.ok(!texte!.includes(cle.split(".")[1]), "la charge utile de la cle part dans le journal");
});

test("tout coherent : on se tait", () => {
  const d = verifierProjetSupabase({
    url: `https://${TIPOTE}.supabase.co`,
    anon: jwt(TIPOTE, "anon", DANS_10_ANS),
    service: jwt(TIPOTE, "service_role", DANS_10_ANS),
  });
  assert.equal(d.etat, "coherent");
  assert.equal(formaterDiagnostic(d, "TIPOTE"), null);
});

test("une cle perimee est nommee comme telle", () => {
  const d = verifierProjetSupabase({
    url: `https://${TIPOTE}.supabase.co`,
    anon: jwt(TIPOTE, "anon", IL_Y_A_1_AN),
    service: jwt(TIPOTE, "service_role", DANS_10_ANS),
  });
  assert.equal(d.etat, "croisee");
  assert.ok(d.ecarts.some((e) => e.genre === "perimee"));
});

test("ce qu'on ne peut pas lire ne devient JAMAIS une alerte", () => {
  // Nouvelles clés, ou variable absente pendant un build : on ne crie
  // pas. Une alerte qui sort à tort est pire que pas d'alerte, elle
  // apprend à ignorer les alertes.
  for (const entrees of [
    { url: `https://${TIPOTE}.supabase.co`, anon: "sb_publishable_x", service: "sb_secret_y" },
    { url: "", anon: "", service: "" },
    { url: `https://${TIPOTE}.supabase.co`, anon: "", service: "" },
  ]) {
    const d = verifierProjetSupabase(entrees);
    assert.notEqual(d.etat, "croisee");
    assert.equal(formaterDiagnostic(d, "TIPOTE"), null);
  }
});

test("le controle est BRANCHE au demarrage du serveur", () => {
  // Une fonction pure que personne n'appelle ne protège de rien. C'est
  // `instrumentation.ts` qui la branche, et Next ne l'exécute que si le
  // fichier est à la racine.
  const src = fs.readFileSync(path.join(process.cwd(), "instrumentation.ts"), "utf8");
  assert.ok(src.includes("export async function register"), "instrumentation n'expose plus register");
  assert.ok(src.includes("verifierProjetSupabase"), "le controle Supabase n'est plus appele au demarrage");
  // Le runtime Edge n'a ni Buffer ni les variables serveur.
  assert.ok(src.includes('NEXT_RUNTIME !== "nodejs"'), "le controle tourne aussi hors Node");
});
