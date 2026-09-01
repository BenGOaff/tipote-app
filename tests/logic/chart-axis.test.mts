// tests/logic/chart-axis.test.mts
//
// "LES NOMBRES À GAUCHE N'APPARAISSENT PAS BIEN EN ENTIER."
// (Adeline, 3 août 2026)
//
// Sur sa capture, l'axe de Mes stats affiche `8`, `21`, `4`, `7`, `0`.
// Ce sont `28`, `21`, `14`, `7`, `0` amputés de leur premier chiffre :
// la courbe semble plafonner à 8 alors qu'elle monte à 28. Un nombre
// coupé ne se lit pas comme un nombre incomplet, il se lit comme un
// AUTRE nombre.
//
// La cause : `margin={{ left: -16 }}` combiné à `<YAxis width={32} />`.
// Il restait 16 px pour écrire un tag alignée à droite, donc
// c'est son DÉBUT qui sortait du cadre.
//
// Et c'était écrit quatre fois, avec quatre valeurs différentes
// (-12, -16, -20, -24). Une décision recopiée dans chaque composant est
// fausse dans au moins un : c'est la même mécanique que l'alignement du
// sous-titre, les réseaux de partage et la disposition des réponses.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { maxSeriesValue, yAxisWidth } from "../../lib/charts/yAxis.ts";

/** Largeur du texte d'un tag, MESURÉE dans Chromium sur la pile
 *  de polices de l'app (0.636 x la taille de police par chiffre). */
function largeurTexte(label: string, fontSize: number): number {
  return label.length * fontSize * 0.64;
}

test("le cas d'Adeline : 28 tient en entier", () => {
  // 28 leads sur la journee du 17 aout, police 11 comme sur Mes stats.
  const largeur = yAxisWidth(28, { fontSize: 11 });
  assert.ok(
    largeur >= largeurTexte("28", 11) + 8,
    `28 ne tient pas dans ${largeur}px`,
  );
  // Et surtout : plus large que les 16px effectifs d'avant correction.
  assert.ok(largeur > 16);
});

test("les vues d'Adeline aussi : 421 tient en entier", () => {
  // Le KPI de sa capture annonce 421 vues, et les vues sont tracees sur
  // le MEME axe que les leads. C'est la plus grande valeur qui commande.
  const largeur = yAxisWidth(421, { fontSize: 11 });
  assert.ok(
    largeur >= largeurTexte("421", 11) + 8,
    `421 ne tient pas dans ${largeur}px`,
  );
});

test("plus le nombre est grand, plus la gouttiere est large", () => {
  const petit = yAxisWidth(9, { fontSize: 11 });
  const moyen = yAxisWidth(400, { fontSize: 11 });
  const grand = yAxisWidth(12_000, { fontSize: 11 });
  assert.ok(moyen > petit, `${moyen} devrait depasser ${petit}`);
  assert.ok(grand > moyen, `${grand} devrait depasser ${moyen}`);
  for (const [valeur, largeur] of [[400, moyen], [12_000, grand]] as const) {
    assert.ok(
      largeur >= largeurTexte(String(valeur), 11) + 8,
      `${valeur} ne tient pas dans ${largeur}px`,
    );
  }
});

test("le tick du haut depasse la donnee : on compte un chiffre de marge", () => {
  // Recharts arrondit l'echelle vers le haut. Sur une serie qui culmine
  // a 99, le dernier tick peut valoir 100 : trois chiffres, pas deux.
  const largeur = yAxisWidth(99, { fontSize: 11 });
  assert.ok(
    largeur >= largeurTexte("100", 11) + 8,
    `100 ne tiendrait pas dans ${largeur}px`,
  );
});

test("un suffixe compte dans la largeur", () => {
  const nu = yAxisWidth(80, { fontSize: 11 });
  const pourcent = yAxisWidth(80, { fontSize: 11, suffix: "%" });
  assert.ok(pourcent > nu, "le % ne prend pas de place");
});

test("une police plus petite demande moins de place", () => {
  assert.ok(yAxisWidth(400, { fontSize: 10 }) < yAxisWidth(400, { fontSize: 16 }));
});

test("fail-open : une valeur inconnue ne donne jamais zero", () => {
  // Mieux vaut une gouttiere un peu large qu'un nombre coupe.
  for (const vide of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const largeur = yAxisWidth(vide as number | null | undefined);
    assert.ok(largeur >= 30, `${String(vide)} donne ${largeur}px`);
    assert.ok(Number.isFinite(largeur), `${String(vide)} donne ${largeur}`);
  }
});

test("la gouttiere reste bornee : un graphique n'est pas qu'un axe", () => {
  assert.ok(yAxisWidth(999_999_999, { fontSize: 16 }) <= 76);
});

test("le maximum se lit sur les series DEMANDEES, jamais sur tout l'objet", () => {
  // Ces lignes portent aussi un libelle, une date et parfois un
  // pourcentage qui n'est pas trace. Deviner les cles marcherait
  // aujourd'hui et donnerait une gouttiere absurde au premier champ
  // ajoute (lecon des controles "profil" sur un quiz score).
  const rows = [
    { day: "2026-08-16", label: "16 août", count: 4, views: 27, pct: 481 },
    { day: "2026-08-17", label: "17 août", count: 13, views: 21, pct: 619 },
  ];
  assert.equal(maxSeriesValue(rows, ["count", "views"]), 27);
  assert.equal(maxSeriesValue(rows, ["count"]), 13);
  assert.equal(maxSeriesValue(rows, []), 0);
  assert.equal(maxSeriesValue([], ["count"]), 0);
  assert.equal(maxSeriesValue(null, ["count"]), 0);
});

test("une valeur illisible dans les donnees ne casse pas le calcul", () => {
  const rows = [
    { count: null },
    { count: "13" },
    { count: undefined },
    { count: Number.NaN },
  ] as unknown as Record<string, unknown>[];
  assert.equal(maxSeriesValue(rows, ["count"]), 13);
});

test("AUCUN graphique du repo ne reprend une marge gauche negative", () => {
  // C'est le bug d'Adeline, et c'est la seule chose qui empeche
  // vraiment son retour : le raccourci `left: -16` se recopie tout seul
  // d'un composant a l'autre.
  const fautifs: string[] = [];
  const racine = process.cwd();

  const parcourir = (dossier: string) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (entree.name === "node_modules" || entree.name.startsWith(".")) continue;
      const chemin = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!entree.name.endsWith(".tsx")) continue;
      const src = fs.readFileSync(chemin, "utf8");
      for (const ligne of src.split("\n")) {
        if (/margin=\{\{[^}]*left:\s*-/.test(ligne)) {
          fautifs.push(`${path.relative(racine, chemin)} : ${ligne.trim()}`);
        }
      }
    }
  };

  for (const dossier of ["app", "components"]) {
    const chemin = path.join(racine, dossier);
    if (fs.existsSync(chemin)) parcourir(chemin);
  }

  assert.deepEqual(
    fautifs,
    [],
    `marge gauche negative (les nombres seront coupes) :\n${fautifs.join("\n")}`,
  );
});
