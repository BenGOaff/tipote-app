// tests/logic/on-dit-tag.test.mts
//
// Béné, 1er septembre 2026 : "ne dis jamais étiquette, nulle part, on
// parle bien de tag en français aussi. Supprime tout ce que tu appelles
// étiquette partout pour dire tag, et mets tags bordel !"
//
// La raison est PRODUIT, pas stylistique : c'est le mot que Systeme.io
// affiche. Son menu CRM en français dit "Tag". Une consigne qui dit
// "étiquette" envoie la créatrice chercher un mot qui n'existe pas sur
// son écran, au moment précis où elle suit une marche à suivre clic par
// clic.
//
// ET ÇA VAUT PAR LANGUE, PAS DANS L'ABSOLU. Vérifié sur ses captures :
// leur interface dit "Tag" en français, en italien, en portugais et en
// anglais, mais "Etiquetas" en ESPAGNOL. Y écrire "tag" rendrait la
// consigne fausse.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const INTERDIT = /étiquet|etiquet/i;

test("aucune étiquette dans le français vu par les créatrices", () => {
  const src = readFileSync(new URL("../../messages/fr.json", import.meta.url), "utf8");
  const fautifs = src.split("\n").filter((l) => INTERDIT.test(l));
  assert.deepEqual(fautifs, [], "le mot est revenu dans messages/fr.json");
});

test("ni en italien, ni en portugais : leur interface dit Tag aussi", () => {
  for (const loc of ["it", "pt", "pt-BR"]) {
    const brut = readFileSync(new URL(`../../messages/${loc}.json`, import.meta.url), "utf8");
    const d = JSON.parse(brut) as Record<string, unknown>;

    // ON VISE PAR LA CLÉ, PAS PAR DES MOTS DANS LE TEXTE. Un premier
    // jet cherchait "sio" dans la phrase : il matchait "conver-sio-ne"
    // et faisait rougir la traduction du libellé Google Ads, qui n'a
    // rien à voir avec un tag Systeme.io.
    const fautifs: string[] = [];
    const visite = (o: unknown, chemin: string) => {
      if (typeof o === "string") {
        const parleDeTag = /automatisation\.|sioTag|sio_tag|csvColumns\.tag|ExportSio/i.test(chemin);
        if (parleDeTag && /etichett|etiquet/i.test(o)) fautifs.push(chemin);
        return;
      }
      if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) visite(v, `${chemin}.${k}`);
      }
    };
    visite(d, "");
    assert.deepEqual(fautifs, [], `${loc} : un tag Systeme.io s'appelle encore autrement`);
  }
});

test("L'ESPAGNOL GARDE SON MOT, et c'est OBLIGATOIRE", () => {
  // Leur bouton s'appelle "Etiqueta añadida". Écrire "tag" enverrait la
  // créatrice cliquer sur quelque chose qui n'existe pas. Cette
  // exemption reste ÉCRITE : sans elle, le prochain passage la prendrait
  // pour un oubli et "finirait le travail".
  const src = readFileSync(new URL("../../messages/es.json", import.meta.url), "utf8");
  assert.ok(
    /etiqueta/i.test(src),
    "l'espagnol a perdu son mot : la consigne ne correspond plus à leur écran",
  );
});
