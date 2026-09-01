// tests/logic/email-pas-un-motif.test.mts
//
// UNE ADRESSE EMAIL N'EST PAS UN MOTIF DE RECHERCHE (31 août 2026).
//
// Dans un LIKE Postgres, `_` remplace n'importe quel caractere, et `_`
// est parfaitement legal dans une adresse. `jean_dupont@gmail.com`
// cherche en ILIKE matche donc `jeanXdupont@gmail.com`, c'est a dire
// le compte de QUELQU'UN D'AUTRE.
//
// Les deux pires cas de CE depot, et ce sont les plus graves des
// trois :
// - `lib/affiliate/session.ts` resout la session affiliee sur cette
//   recherche. Un joker peut rendre la ligne d'un AUTRE affilie, donc
//   lui montrer le tableau de bord, les commissions et les
//   coordonnees de quelqu'un d'autre ;
// - `auth/start` fait la meme chose a la connexion. Et quand deux
//   lignes matchent, `maybeSingle` echoue : l'affilie n'a alors plus
//   de session du tout, sans qu'aucune erreur ne le dise.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

import { echapperMotifLike } from "@/lib/db/motifLike";

/** Tous les fichiers qui cherchent un compte par son adresse. */
const SURVEILLES = [
  "app/affiliate/api/auth/start/route.ts",
  "app/affiliate/api/trial/activate/route.ts",
  "app/api/affiliate/admin/import-sio/route.ts",
  "lib/affiliate/session.ts",
  "app/affiliate/api/admin/codes/route.ts",
];

test("les jokers de LIKE sont neutralises", () => {
  assert.equal(echapperMotifLike("jean_dupont@gmail.com"), "jean\\_dupont@gmail.com");
  assert.equal(echapperMotifLike("a%b@gmail.com"), "a\\%b@gmail.com");
  // Le backslash s'echappe EN PREMIER, sinon on echapperait les barres
  // qu'on vient d'ajouter.
  assert.equal(echapperMotifLike("a\\_b@x.com"), "a\\\\\\_b@x.com");
});

test("une adresse ordinaire n'est pas touchee", () => {
  // Echapper ne doit RIEN changer au cas courant, sinon la correction
  // casserait des connexions qui marchaient.
  for (const ok of ["bene@tipote.com", "jean.dupont@gmail.com", "a+b@x.co.uk"]) {
    assert.equal(echapperMotifLike(ok), ok);
  }
});

test("la casse reste ignoree : on echappe, on ne passe pas a .eq", () => {
  // `.eq` serait plus simple et casserait une connexion partout ou la
  // colonne porte une majuscule (imports Systeme.io). C'est pire que
  // le bug corrige, donc on garde `.ilike`.
  for (const f of SURVEILLES) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /\.ilike\("email"/, `${f} : la recherche doit rester insensible a la casse`);
  }
});

test("aucune recherche de compte ne passe une adresse BRUTE a ilike", () => {
  for (const f of SURVEILLES) {
    const src = readFileSync(f, "utf8");
    const nus = src.match(/\.ilike\(\s*"email",\s*(?!echapperMotifLike)[a-zA-Z][\w.]*\s*\)/g) ?? [];
    assert.deepEqual(nus, [], `${f} passe une adresse brute a ilike : ${nus.join(", ")}`);
    assert.match(src, /echapperMotifLike/, `${f} n'appelle pas l'echappement`);
  }
});

// ── ET PAS SEULEMENT L'ADRESSE EMAIL (1er septembre 2026) ────────────
//
// La passe du 31 août n'avait couvert que les recherches de COMPTE. Le
// même joker vivait sur `ref`, `slug`, `hostname` et `code`, tous lus
// dans une URL publique :
//
//   - `?ref=jocelyn_` pouvait désigner une AUTRE affiliée, donc créditer
//     quelqu'un d'autre. C'est de l'argent, et c'est le pire des deux ;
//   - `/q/mon_quiz` pouvait servir le quiz d'une autre créatrice, ou
//     n'en servir aucun (deux lignes trouvées font échouer `maybeSingle`,
//     donc un 404 sur un quiz qui existe).
//
// Le balayage porte sur TOUT le dépôt, pas sur une liste de fichiers :
// une liste oublie le prochain fichier écrit, et c'est exactement
// comment celui-ci est arrivé.

test("aucune valeur externe n'est passée BRUTE à ilike, nulle part", async () => {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const COLONNES = ["ref", "slug", "hostname", "code", "email"];
  const nu = new RegExp(
    `\\.ilike\\(\\s*"(${COLONNES.join("|")})"\\s*,\\s*(?!echapperMotifLike)([A-Za-z_$][\\w.$]*)\\s*\\)`,
    "g",
  );

  const fautifs: string[] = [];
  async function parcourir(dossier: string) {
    let entrees;
    try {
      entrees = await readdir(dossier, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const chemin = join(dossier, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        await parcourir(chemin);
        continue;
      }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = readFileSync(chemin, "utf8");
      if (!src.includes(".ilike(")) continue;
      // On ignore les lignes de commentaire : le fichier qui EXPLIQUE la
      // règle en montre forcément la version fautive.
      const code = src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      for (const m of code.matchAll(nu)) {
        fautifs.push(`${chemin} -> .ilike("${m[1]}", ${m[2]})`);
      }
    }
  }
  await parcourir("app");
  await parcourir("lib");

  assert.deepEqual(
    fautifs,
    [],
    "une valeur reçue de l'extérieur part brute dans un LIKE :\n" + fautifs.join("\n"),
  );
});
