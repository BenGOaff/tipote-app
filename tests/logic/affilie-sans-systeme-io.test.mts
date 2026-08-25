// tests/logic/affilie-sans-systeme-io.test.mts
//
// Béné, 25 août 2026 : "on est censés avoir NOTRE système d'affiliation ?
// Du coup pourquoi un type sans systeme io ne pourrait pas devenir
// affilié chez nous ??"
//
// Elle avait raison, et je m'étais trompé sur la cause : j'avais dit que
// `affiliates.sa` étant la clé primaire, on ne pouvait pas recruter sans
// Systeme.io. C'est faux, cette colonne est un `text` qui accepte
// n'importe quoi. Le verrou était la FORME exigée partout, et le
// formulaire d'inscription qui rendait le champ obligatoire.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SA_RE, genererSa, lireSa } from "../../lib/affiliate/saFormat.ts";

test("l'identifiant fabriqué passe TOUS les contrôles existants", () => {
  // C'est tout l'intérêt de garder la même forme : les clics,
  // l'attribution, le rattachement et le diagnostic continuent de
  // marcher sans une ligne de changement.
  for (let i = 0; i < 200; i += 1) {
    const sa = genererSa();
    assert.match(sa, SA_RE, `identifiant refusé : ${sa}`);
    assert.equal(lireSa(sa), sa);
  }
});

test("deux identifiants fabriqués ne sont jamais les mêmes", () => {
  // Deux inscriptions simultanées ne doivent pas pouvoir écrire l'une
  // sur l'autre, et un identifiant devinable laisserait quelqu'un
  // fabriquer un lien au nom d'une autre.
  const vus = new Set<string>();
  for (let i = 0; i < 500; i += 1) vus.add(genererSa());
  assert.equal(vus.size, 500);
});

test("ce qui n'a pas la forme d'un identifiant reste refusé", () => {
  // Un `sa` finit dans un versement : une valeur inventée ne doit pas
  // pouvoir créer une ligne au nom de personne.
  for (const faux of ["", "sa", "jocelyne", "sa123", "sa" + "z".repeat(30), " ", "sa 0016abcdef0123456789"]) {
    assert.equal(lireSa(faux), null, `accepté à tort : ${faux}`);
  }
});

test("un identifiant Systeme.io réel reste accepté", () => {
  const reel = "sa0007878317200141bbe3de2b6644176621db2c6580";
  assert.equal(lireSa(reel), reel);
  assert.equal(lireSa(`  ${reel}  `), reel);
});

// ── La forme n'est écrite QU'ICI ─────────────────────────────────────

test("aucune autre copie de la regex ne vit dans le dépôt", () => {
  // Elle vivait en cinq exemplaires. Elles ne disaient pas encore des
  // choses différentes, mais c'est exactement ainsi que commence une
  // divergence : le jour où Systeme.io allonge ses identifiants, quatre
  // endroits l'acceptent et le cinquième le refuse, et une commission se
  // perd là où personne ne regarde.
  const trouvees: string[] = [];
  const ignore = new Set([".next", "node_modules", ".git", "public"]);
  const scan = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (ignore.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.(ts|tsx)$/.test(e.name)) {
        const src = readFileSync(p, "utf8");
        if (/sa\[a-f0-9\]\{20,80\}/i.test(src)) trouvees.push(p);
      }
    }
  };
  for (const racine of ["app", "lib", "components", "tests"]) scan(racine);
  assert.deepEqual(
    trouvees.sort(),
    ["lib/affiliate/saFormat.ts"],
    `la forme du sa est recopiée : ${trouvees.join(", ")}`,
  );
});

// ── L'origine se STOCKE, elle ne se devine pas ───────────────────────

test("un identifiant fabriqué est indiscernable d'un identifiant Systeme.io", () => {
  // Et c'est VOULU : c'est ce qui permet de ne rien changer ailleurs.
  // Corollaire obligatoire : l'origine ne peut PAS se déduire de la
  // forme, donc elle vit dans une colonne (`affiliates.origin`).
  // Deviner marcherait aujourd'hui et casserait le jour où Systeme.io
  // change la sienne : c'est la leçon du `?ref=` contre le `?sa=`.
  const maison = genererSa();
  const systemeIo = "sa0007878317200141bbe3de2b6644176621db2c6580";
  assert.equal(SA_RE.test(maison), SA_RE.test(systemeIo));
  assert.equal(maison.length >= 22, true);
});

test("la migration qui porte l'origine existe et a un défaut sûr", () => {
  // Défaut 'systeme_io' : c'est la vérité pour toutes les lignes
  // existantes, puisque jusqu'au 25 août on ne pouvait pas s'inscrire
  // autrement.
  const sql = readFileSync(
    "supabase/migrations/20260825_affilies_sans_systeme_io.sql",
    "utf8",
  );
  assert.match(sql, /add column if not exists origin/i);
  assert.match(sql, /default 'systeme_io'/i);
  assert.match(sql, /check \(origin in \('systeme_io', 'tipote'\)\)/i);
  assert.match(sql, /notify pgrst/i);
});

// ── L'inscription ────────────────────────────────────────────────────

test("le formulaire n'exige plus l'identifiant Systeme.io", () => {
  const route = readFileSync("app/affiliate/api/auth/signup/route.ts", "utf8");
  // Le champ vide est le cas normal...
  assert.match(route, /saSaisi !== null && !SA_RE\.test\(saSaisi\)/);
  // ...et une adresse déjà affiliée sous un AUTRE identifiant est
  // refusée avec sa raison, jamais fusionnée en silence : tout
  // l'historique des commissions est accroché à la clé primaire.
  assert.match(route, /email_deja_affiliee/);
  // L'identifiant existant ne se régénère JAMAIS.
  assert.match(route, /saExistant \?\? saSaisi \?\? genererSa\(\)/);

  const client = readFileSync("app/affiliate/signup/SignupClient.tsx", "utf8");
  assert.match(client, /disabled=\{status === "loading" \|\| !email\}/);
  assert.ok(!/!email \|\| !sa/.test(client), "le bouton exige encore le sa");
});

test("les 6 langues de l'espace affilié disent le nouveau cas", () => {
  const dir = "app/affiliate/i18n";
  const langues = readdirSync(dir).filter((f) => /^(ar|en|es|fr|it|pt)\.ts$/.test(f));
  assert.equal(langues.length, 6);
  for (const f of langues) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.match(src, /err_email_deja_affiliee/, `${f} : raison non traduite`);
    // Un écran qui garderait "obligatoire" contredirait le serveur.
    assert.ok(
      !/label_email_hint: "Celui de ton compte Systeme\.io\."/.test(src),
      `${f} : l'aide dit encore que l'email doit être celui de Systeme.io`,
    );
  }
});
