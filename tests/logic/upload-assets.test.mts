// tests/logic/upload-assets.test.mts
//
// SERVIR LES IMAGES DEPUIS NOTRE SERVEUR.
//
// Béné, 26 août 2026 : "on a un super serveur quasiment inutilisé : on
// ne peut pas l'exploiter davantage ? Histoire de ne pas avoir un
// abonnement en plus à payer et d'éviter les futures alertes."
//
// Écrire sur notre disque à partir de ce qu'envoie un navigateur est le
// moment le plus dangereux de toute la chaîne. Ce fichier garde la
// fonction qui décide, pas la route qui exécute : c'est la règle du
// dépôt depuis le 1er août.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { describe } from "node:test";

import {
  baseAssetsValide,
  urlAssetLocal,
  validerCheminAsset,
} from "@/lib/storage/cheminAsset";

const lire = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

/** Tous les fichiers de code sous ces dossiers, recursivement. */
function sourcesDe(dossiers: string[]): string[] {
  const trouves: string[] = [];
  const descendre = (rel: string) => {
    for (const e of fs.readdirSync(path.join(process.cwd(), rel), { withFileTypes: true })) {
      const sous = `${rel}/${e.name}`;
      if (e.isDirectory()) descendre(sous);
      else if (/\.tsx?$/.test(e.name)) trouves.push(sous);
    }
  };
  for (const d of dossiers) descendre(d);
  return trouves.sort();
}

const MOI = "11111111-2222-3333-4444-555555555555";
const AUTRE = "99999999-8888-7777-6666-555555555555";

describe("Ou un fichier a le droit d'atterrir", () => {
  test("un chemin normal passe", () => {
    const v = validerCheminAsset(`logos/${MOI}/quiz-abc-1756123456789.webp`, MOI);
    assert.equal(v.ok, true);
    assert.equal(v.chemin, `logos/${MOI}/quiz-abc-1756123456789.webp`);
  });

  test("ON N'ECRIT PAS CHEZ QUELQU'UN D'AUTRE", () => {
    // Sans ce controle, une creatrice pourrait remplacer le logo d'une
    // autre : les chemins portent l'identite, et le navigateur les
    // fabrique.
    const v = validerCheminAsset(`logos/${AUTRE}/logo-1.webp`, MOI);
    assert.equal(v.ok, false);
    assert.equal(v.raison, "pas_le_bon_proprietaire");
  });

  test("ON NE SORT PAS DU DOSSIER", () => {
    // Chacune de ces formes ecrirait ailleurs sur le serveur.
    for (const mauvais of [
      `logos/${MOI}/../../../etc/passwd.webp`,
      `../logos/${MOI}/a.webp`,
      `/logos/${MOI}/a.webp`,
      `logos\\${MOI}\\a.webp`,
      `logos/${MOI}/%2e%2e/a.webp`,
      `logos/${MOI}//a.webp`,
      `logos/./${MOI}/a.webp`,
    ]) {
      const v = validerCheminAsset(mauvais, MOI);
      assert.equal(v.ok, false, `accepte : ${mauvais}`);
    }
  });

  test("LISTE BLANCHE D'EXTENSIONS, jamais une liste noire", () => {
    // Un `.php`, un `.html` ou un `.svg` servi depuis notre domaine
    // s'execute dans le navigateur du visiteur. Une liste noire oublie
    // toujours la prochaine extension.
    for (const ext of ["php", "html", "svg", "js", "sh", "webp.php", ""]) {
      const v = validerCheminAsset(`logos/${MOI}/a.${ext}`, MOI);
      assert.equal(v.ok, false, `accepte : .${ext}`);
    }
    for (const ext of ["webp", "png", "jpg", "jpeg", "gif", "avif"]) {
      assert.equal(validerCheminAsset(`logos/${MOI}/a.${ext}`, MOI).ok, true, `refuse : .${ext}`);
    }
  });

  test("UN DOSSIER INCONNU EST REFUSE", () => {
    const v = validerCheminAsset(`ailleurs/${MOI}/a.webp`, MOI);
    assert.equal(v.ok, false);
    // `ok: false` porte la raison : le narrowing de TypeScript l'exige,
    // et c'est ce qui rend le refus explicable a l'ecran.
    if (!v.ok) assert.equal(v.raison, "dossier_inconnu");
  });

  test("UN NOM EXOTIQUE EST NETTOYE, pas refuse", () => {
    // Refuser ferait perdre son envoi a une creatrice pour un accent
    // dans un nom de fichier.
    const v = validerCheminAsset(`logos/${MOI}/mon logo été.webp`, MOI);
    assert.equal(v.ok, true);
    assert.ok(v.chemin.startsWith(`logos/${MOI}/`));
    // Plus d'espace, plus d'accent, et l'extension survit : c'est elle
    // qui dit au navigateur ce qu'il regarde.
    assert.ok(v.chemin.endsWith(".webp"));
    assert.ok(!/[^A-Za-z0-9._\/-]/.test(v.chemin), `reste un caractere exotique : ${v.chemin}`);
  });

  test("SANS SESSION, RIEN NE PASSE", () => {
    assert.equal(validerCheminAsset(`logos/${MOI}/a.webp`, "").ok, false);
    assert.equal(validerCheminAsset("", MOI).ok, false);
  });
});

describe("L'adresse publique de nos fichiers", () => {
  test("UNE BASE FAUSSE NE PRODUIT AUCUNE URL", () => {
    // Une base fausse ecrirait des adresses MORTES dans la base de
    // donnees, sur des quiz publies, et elles y resteraient apres
    // correction de la variable. C'est le drame Veronique du 2 aout,
    // en pire : `??` ne protege que de la variable absente.
    for (const mauvais of [
      "",
      "http://assets.tiquiz.com",
      "https://localhost:3000",
      "https://127.0.0.1",
      "https://monserveur.local",
      "pas une url",
      null,
    ]) {
      assert.equal(baseAssetsValide(mauvais), null, `acceptee : ${mauvais}`);
    }
  });

  test("une base valide rend une URL utilisable", () => {
    assert.equal(baseAssetsValide("https://assets.tiquiz.com/"), "https://assets.tiquiz.com");
    assert.equal(
      urlAssetLocal("logos/abc/mon-logo.webp", "https://assets.tiquiz.com"),
      "https://assets.tiquiz.com/logos/abc/mon-logo.webp",
    );
  });

  test("SANS BASE VALIDE, on retombe sur Supabase", () => {
    // `null` n'est pas un detail : c'est ce qui fait que rien ne change
    // tant que la variable n'est pas posee sur le serveur.
    assert.equal(urlAssetLocal("logos/abc/a.webp", "http://localhost:3000"), null);
  });
});

describe("La chaine, qui n'est dans aucune fonction pure", () => {
  test("PLUS AUCUN COMPOSANT NE TELEVERSE DIRECTEMENT", () => {
    // Il y avait une quinzaine d'appels recopies : changer de
    // destination demandait autant de modifications, et il suffisait
    // d'en oublier une pour que la moitie des images parte encore chez
    // Supabase sans que rien ne le signale. C'est le motif du depot
    // depuis trois mois.
    //
    // ON BALAIE LE DOSSIER, on ne tient pas une liste de fichiers. Une
    // liste ecrite a la main ne voit pas le composant ajoute demain, et
    // c'est exactement lui qui rouvrirait la porte.
    const fautifs = sourcesDe(["components", "app"]).filter((f) =>
      lire(f).includes('storage.from("public-assets").upload'),
    );
    assert.deepEqual(fautifs, [], `televersement direct : ${fautifs.join(", ")}`);

    // Et le test doit pouvoir echouer : si plus personne n'appelle
    // `televerserAsset`, c'est que la chaine a ete debranchee, pas
    // qu'elle est propre.
    const passentPar = sourcesDe(["components"]).filter((f) =>
      lire(f).includes("televerserAsset("),
    );
    assert.ok(passentPar.length > 0, "plus aucun composant n'appelle televerserAsset");
  });

  test("LA ROUTE PREND L'IDENTITE DANS LA SESSION, jamais dans le corps", () => {
    const route = lire("app/api/upload/asset/route.ts");
    assert.match(route, /validerCheminAsset\(form\.get\("path"\), user\.id\)/);
    // Et elle verifie EN PLUS le chemin resolu : la seule verification
    // qui ne depend d'aucun raisonnement sur les chaines.
    assert.match(route, /startsWith\(DOSSIER \+ sep\)/);
  });

  test("ON NE PERD JAMAIS L'ENVOI D'UNE CREATRICE", () => {
    // Disque plein, droits manquants, route pas encore deployee : on
    // retombe sur Supabase. Une image au mauvais endroit se deplace ;
    // une image perdue se re-televerse, et la creatrice ne sait pas
    // pourquoi ca a rate.
    const src = lire("lib/storage/televerser.ts");
    assert.match(src, /on retombe sur Supabase/);
    assert.match(src, /supabase\.storage\.from\(BUCKET\)\.upload/);
  });

  test("LA DECISION EST PURE : aucun test ne doit toucher au disque", () => {
    assert.ok(!/^import .*node:fs/m.test(lire("lib/storage/cheminAsset.ts")));
  });
});
