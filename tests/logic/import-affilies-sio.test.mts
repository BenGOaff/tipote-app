// tests/logic/import-affilies-sio.test.mts
//
// UN AFFILIÉ, UNE IDENTITÉ, DEUX PORTES D'ENTRÉE (Béné, 29 août 2026).
//
// Ses affiliés Systeme.io n'existaient dans aucune ligne de notre
// registre : une conversion écrite avec `sa0134…` ne trouvait personne,
// donc aucune commission possible, ni par `?sa=` ni par `?ref=`.
//
// Chaque ligne importée crée un affilié qui pourra être PAYÉ. Une ligne
// douteuse ne se devine pas, elle se refuse et se dit.

import { test } from "node:test";
import assert from "node:assert/strict";

import { lireImportSio } from "@/lib/affiliate/importSio";

const SA1 = "sa013476947331a3b65a708ef70cabd5809b547764";
const SA2 = "sa0280183654b070cf433ca5c34ead248ffc5a004f";

test("l'ordre des colonnes n'est pas imposé", () => {
  // Un export n'obéit à personne : on RECONNAÎT le sa à sa forme et
  // l'email à la sienne. Imposer un ordre condamne l'import à échouer
  // en entier sur une colonne déplacée.
  const a = lireImportSio(`${SA1};eric@exemple.fr;Eric Legrigeois`);
  const b = lireImportSio(`Eric Legrigeois;eric@exemple.fr;${SA1}`);
  assert.deepEqual(a.affilies, b.affilies);
  assert.deepEqual(a.affilies[0], { sa: SA1, email: "eric@exemple.fr", nom: "Eric Legrigeois" });
});

test("tabulation, point-virgule et virgule sont acceptés", () => {
  // Un export ouvert dans Excel puis recopié arrive dans n'importe
  // laquelle des trois.
  for (const sep of ["\t", ";", ","]) {
    const lu = lireImportSio(`${SA1}${sep}eric@exemple.fr`);
    assert.equal(lu.affilies.length, 1, `séparateur refusé : ${JSON.stringify(sep)}`);
  }
});

test("l'email est mis en minuscules, le nom n'est jamais inventé", () => {
  const lu = lireImportSio(`${SA1};Eric@Exemple.FR`);
  assert.equal(lu.affilies[0].email, "eric@exemple.fr");
  // Pas de nom fabriqué depuis l'adresse : un affilié qui voit un nom
  // qu'il n'a pas donné se demande d'où on le sort.
  assert.equal(lu.affilies[0].nom, null);
});

test("la ligne d'en-têtes est ignorée, pas comptée comme une erreur", () => {
  // Sinon chaque import commencerait par un refus qui n'en est pas un.
  const lu = lireImportSio(`sa;email;nom\n${SA1};eric@exemple.fr;Eric`);
  assert.equal(lu.affilies.length, 1);
  assert.equal(lu.refusees.length, 0);
});

test("une ligne douteuse est REFUSÉE et dit pourquoi", () => {
  const lu = lireImportSio(
    [
      `${SA1};eric@exemple.fr`,
      `pas-un-sa;jocelyne@exemple.fr`,
      `${SA2};pas-un-email`,
      "n'importe quoi",
    ].join("\n"),
  );
  assert.equal(lu.affilies.length, 1);
  assert.deepEqual(
    lu.refusees.map((r) => [r.ligne, r.raison]),
    [
      [2, "sa-invalide"],
      [3, "email-invalide"],
      [4, "colonnes-manquantes"],
    ],
  );
});

test("un sa en double ne crée pas deux affiliés", () => {
  // La clé primaire est le `sa` : deux lignes écriraient l'une sur
  // l'autre, et la seconde adresse gagnerait sans que personne le voie.
  const lu = lireImportSio(`${SA1};eric@exemple.fr\n${SA1};autre@exemple.fr`);
  assert.equal(lu.affilies.length, 1);
  assert.equal(lu.affilies[0].email, "eric@exemple.fr");
  assert.deepEqual(lu.refusees.map((r) => r.raison), ["doublon"]);
});

test("un collage vide ou abîmé ne jette pas", () => {
  for (const brut of ["", "\n\n\n", "   "]) {
    const lu = lireImportSio(brut);
    assert.deepEqual(lu.affilies, []);
    assert.deepEqual(lu.refusees, []);
  }
});
