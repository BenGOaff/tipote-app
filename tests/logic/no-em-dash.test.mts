// tests/logic/no-em-dash.test.mts
//
// LA REGLE ANTI-IA DE BENE, TENUE PAR UN TEST.
//
// "Aucun em-dash ni en-dash dans le contenu user-visible." La consigne
// existe depuis le 7 juin 2026, elle est rappelée dans AGENTS.md, et
// elle est quand même repartie plusieurs fois : un `grep` qu'on doit
// penser à lancer avant chaque commit finit toujours par être oublié.
//
// Ce fichier le lance à notre place, sur les deux endroits qui comptent :
//
//   messages/*.json  - toute l'interface, dans les 7 langues ;
//   lib/prompts/**   - ce qu'on montre au modèle. Un prompt qui contient
//                      un tiret long en apprend l'usage : c'est ainsi
//                      que le caractère revient dans le contenu généré,
//                      donc dans les quiz des clientes.
//
// Les COMMENTAIRES de code sont exclus : la cliente ne les voit jamais,
// et les interdire ferait rougir le test pour rien.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const DASH = /[—–]/;

function filesUnder(dir: string, exts: string[]): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(filesUnder(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Retire les commentaires de ligne et de bloc. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function offenders(path: string, text: string): string[] {
  return text
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => DASH.test(line))
    .map(({ line, n }) => `${path.replace(ROOT + "/", "")}:${n}  ${line.trim().slice(0, 120)}`);
}

test("aucun tiret long dans l'interface, dans aucune langue", () => {
  const bad = filesUnder(join(ROOT, "messages"), [".json"]).flatMap((p) =>
    offenders(p, readFileSync(p, "utf8")),
  );
  assert.deepEqual(
    bad,
    [],
    `Tirets longs dans l'interface :\n${bad.join("\n")}\n\nRemplacer par - , : ou une nouvelle phrase.`,
  );
});

test("aucun tiret long dans les prompts envoyés au modèle", () => {
  // Le plus sournois des deux : on ne le voit pas à l'écran, on le voit
  // dans les quiz que l'IA écrit ensuite.
  const bad = filesUnder(join(ROOT, "lib", "prompts"), [".ts"]).flatMap((p) =>
    offenders(p, stripComments(readFileSync(p, "utf8"))),
  );
  assert.deepEqual(
    bad,
    [],
    `Tirets longs dans un prompt :\n${bad.join("\n")}\n\nUn prompt qui contient le caractère en apprend l'usage.`,
  );
});
