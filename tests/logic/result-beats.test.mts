// tests/logic/result-beats.test.mts
//
// Béné, 3 août 2026 : la page de résultat doit suivre les 4 temps
// enseignés dans l'Atelier (le miroir, la cause, le chemin, le pont),
// "évidemment ça ne doit pas toucher les quiz existants, mais s'appliquer
// aux nouveaux quiz générés".
//
// Cette dernière phrase est la plus importante à tenir, et c'est elle que
// ce fichier surveille en premier : un quiz d'hier doit rendre exactement
// la page d'hier.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BEAT_ORDER,
  beatShown,
  buildResultBeats,
  mirrorMedia,
  resultLayoutMode,
  sanitizeBeatMedia,
} from "../../lib/quiz/resultBeats.ts";

/** Suffisant pour les tests : le vrai sanitizer vit dans lib/richText. */
const strip = (s: string) => s.replace(/<[^>]*>/g, "");

const FALLBACKS = { cause: "Ce qui bloque", path: "Le chemin", bridge: "Et maintenant" };

const QUIZ_DEFAULT = {};

function beatsOf(result: Record<string, unknown>, quiz: Record<string, unknown> = QUIZ_DEFAULT) {
  return buildResultBeats({ result: result as never, quiz: quiz as never, fallbackHeadings: FALLBACKS }, strip);
}

// ── La garantie : les quiz existants ne bougent pas ──────────────────

test("un quiz sans result_layout reste en page classique", () => {
  // La colonne peut aussi être absente en prod si la migration n'est pas
  // encore passée : on doit rendre l'historique, jamais un demi-écran.
  assert.equal(resultLayoutMode(undefined), "classic");
  assert.equal(resultLayoutMode(null), "classic");
  assert.equal(resultLayoutMode(""), "classic");
  assert.equal(resultLayoutMode("classic"), "classic");
});

test("seule la valeur explicite bascule en 4 temps", () => {
  assert.equal(resultLayoutMode("beats"), "beats");
  // Une valeur inventée ne doit surtout pas passer pour du 'beats'.
  assert.equal(resultLayoutMode("BEATS"), "classic");
  assert.equal(resultLayoutMode("four-beats"), "classic");
});

test("un profil d'avant le 3 août n'a pas de pont, et n'en invente pas", () => {
  const beats = beatsOf({ insight: "<p>Ta cause</p>", projection: "<p>Ton chemin</p>" });
  assert.deepEqual(beats.map((b) => b.key), ["cause", "path"]);
});

// ── Les 4 temps ─────────────────────────────────────────────────────

test("l'ordre de lecture est le miroir, la cause, le chemin, le pont", () => {
  assert.deepEqual([...BEAT_ORDER], ["mirror", "cause", "path", "bridge"]);
});

test("le miroir n'est pas un bloc : son titre est le nom du profil", () => {
  // Lui donner un titre de bloc ferait doublon avec le <h2> du profil.
  const beats = beatsOf({ description: "<p>Tu te reconnais</p>", insight: "<p>x</p>" });
  assert.ok(!beats.some((b) => b.key === "mirror"));
});

test("le pont est le SEUL bloc d'appel", () => {
  const beats = beatsOf({ insight: "<p>a</p>", projection: "<p>b</p>", bridge: "<p>c</p>" });
  assert.deepEqual(beats.filter((b) => b.emphasis).map((b) => b.key), ["bridge"]);
  // Béné : "sans forcément créer 4 cartes de couleurs trop IA".
  assert.equal(beats.filter((b) => b.emphasis).length, 1);
});

test("le titre du profil gagne sur celui du quiz, qui gagne sur le défaut", () => {
  const beats = beatsOf(
    { insight: "<p>a</p>", insight_heading: "Le vrai frein", projection: "<p>b</p>" },
    { result_insight_heading: "Commun", result_projection_heading: "Commun aussi" },
  );
  assert.equal(beats[0].heading, "Le vrai frein");
  assert.equal(beats[1].heading, "Commun aussi");
});

test("sans aucun titre, on retombe sur le libellé traduit", () => {
  const beats = beatsOf({ bridge: "<p>c</p>" });
  assert.equal(beats[0].heading, "Et maintenant");
});

test("un bloc masqué par la créatrice disparaît", () => {
  const beats = beatsOf(
    { insight: "<p>a</p>", projection: "<p>b</p>", bridge: "<p>c</p>" },
    { show_result_projection: false },
  );
  assert.deepEqual(beats.map((b) => b.key), ["cause", "bridge"]);
});

test("un bloc rich-text vide ne cree pas un bloc vide a l'ecran", () => {
  // `<p></p>` et `<p><br></p>` ne sont pas des chaines vides, mais ne
  // contiennent pas un mot : les rendre donnerait un cadre orphelin.
  const beats = beatsOf({ insight: "<p></p>", projection: "<p><br></p>", bridge: "<p>vrai</p>" });
  assert.deepEqual(beats.map((b) => b.key), ["bridge"]);
});

// ── Image par temps ─────────────────────────────────────────────────

test("une image peut REMPLACER le texte d'un temps", () => {
  const beats = beatsOf({
    insight: "<p>texte</p>",
    beat_media: { cause: { url: "https://cdn.test/a.png", mode: "only" } },
  });
  assert.equal(beats[0].showText, false);
  assert.equal(beats[0].media?.url, "https://cdn.test/a.png");
});

test("une image peut s'AJOUTER au texte", () => {
  const beats = beatsOf({
    insight: "<p>texte</p>",
    beat_media: { cause: { url: "https://cdn.test/a.png", mode: "with" } },
  });
  assert.equal(beats[0].showText, true);
  assert.ok(beats[0].media);
});

test("une image seule suffit à faire exister le temps", () => {
  const beats = beatsOf({ beat_media: { path: { url: "https://cdn.test/b.png", mode: "only" } } });
  assert.deepEqual(beats.map((b) => b.key), ["path"]);
});

test("le miroir a son image à part, puisqu'il n'est pas un bloc", () => {
  const m = mirrorMedia({ mirror: { url: "https://cdn.test/m.png", mode: "with" } });
  assert.equal(m?.url, "https://cdn.test/m.png");
  assert.equal(mirrorMedia(null), null);
});

// ── Sanitizer : ce champ finit dans un <img src> public ─────────────

test("une URL non http(s) est refusée", () => {
  // Sans ça, `javascript:` serait servi tel quel sur une page publique.
  assert.equal(sanitizeBeatMedia({ cause: { url: "javascript:alert(1)", mode: "with" } }), null);
  assert.equal(sanitizeBeatMedia({ cause: { url: "  ", mode: "with" } }), null);
});

test("une data-URL image reste acceptée", () => {
  const out = sanitizeBeatMedia({ cause: { url: "data:image/png;base64,AAAA", mode: "with" } });
  assert.equal(out?.cause?.url, "data:image/png;base64,AAAA");
});

test("le mode inconnu retombe sur 'with', jamais sur un texte masqué", () => {
  // Se tromper dans l'autre sens ferait disparaître le texte que la
  // créatrice a écrit, sans qu'elle l'ait demandé.
  const out = sanitizeBeatMedia({ cause: { url: "https://cdn.test/a.png", mode: "nawak" } });
  assert.equal(out?.cause?.mode, "with");
});

test("la largeur est bornée à 25-99%, 100% signifiant pleine largeur", () => {
  const wide = sanitizeBeatMedia({ cause: { url: "https://a.test/x.png", mode: "with", width: 400 } });
  assert.equal(wide?.cause?.width, undefined);
  const tiny = sanitizeBeatMedia({ cause: { url: "https://a.test/x.png", mode: "with", width: 1 } });
  assert.equal(tiny?.cause?.width, undefined);
  const ok = sanitizeBeatMedia({ cause: { url: "https://a.test/x.png", mode: "with", width: 60 } });
  assert.equal(ok?.cause?.width, 60);
});

test("une clé qui n'est pas un temps est ignorée", () => {
  const out = sanitizeBeatMedia({ nawak: { url: "https://a.test/x.png", mode: "with" } });
  assert.equal(out, null);
});

test("une entrée illisible ne fait pas tomber les autres", () => {
  const out = sanitizeBeatMedia({
    cause: { url: "javascript:alert(1)", mode: "with" },
    path: { url: "https://a.test/ok.png", mode: "with" },
  });
  assert.equal(out?.cause, undefined);
  assert.equal(out?.path?.url, "https://a.test/ok.png");
});

// ── L'aperçu ne lisait pas les interrupteurs (25 août 2026) ──────────
//
// Béné : "pourquoi ces parties activables ou pas ? On met tout [...] et
// une option pour supprimer un bloc directement dans l'éditeur, on n'a
// pas besoin de ça dans la barre de paramètres."
//
// En allant déplacer ces interrupteurs sur les blocs, on a trouvé pire
// que leur emplacement : l'aperçu de l'éditeur ne les lisait PAS.
// Décocher "Afficher la carte insight" retirait le bloc chez le visiteur
// et le laissait dans l'aperçu. Septième fois que ce défaut sort.
// `beatShown` est maintenant la seule réponse, pour les trois écrans.

test("un réglage absent ou nul montre le bloc, jamais l'inverse", () => {
  // Colonne pas encore migrée en prod : le bloc reste à l'écran. Une
  // migration en retard ne doit pas effacer la page d'une cliente.
  for (const quiz of [{}, { show_result_insight: null }, { show_result_insight: undefined }]) {
    assert.equal(beatShown("cause", "beats", quiz), true);
    assert.equal(beatShown("path", "beats", quiz), true);
  }
});

test("seul un false explicite retire un temps", () => {
  assert.equal(beatShown("cause", "beats", { show_result_insight: false }), false);
  assert.equal(beatShown("path", "beats", { show_result_projection: false }), false);
  assert.equal(beatShown("bridge", "beats", { show_result_bridge: false }), false);
  // ...et il ne retire que le sien.
  assert.equal(beatShown("path", "beats", { show_result_insight: false }), true);
});

test("le MIROIR ne se retire pas : c'est le nom du profil", () => {
  assert.equal(beatShown("mirror", "beats", { show_result_insight: false }), true);
  assert.equal(beatShown("mirror", "classic", {}), true);
});

test("le PONT n'existe pas sur une page classique", () => {
  // Sinon l'éditeur proposerait de réafficher un bloc que le visiteur
  // ne verra jamais.
  assert.equal(beatShown("bridge", "classic", {}), false);
  assert.equal(beatShown("bridge", "beats", {}), true);
});

test("buildResultBeats passe par beatShown, il ne relit pas les colonnes", () => {
  const result = { title: "P", insight: "cause", projection: "chemin", bridge: "pont" };
  assert.deepEqual(
    beatsOf(result, { show_result_projection: false }).map((b) => b.key),
    ["cause", "bridge"],
  );
  assert.deepEqual(
    beatsOf(result, { show_result_insight: false, show_result_bridge: false }).map((b) => b.key),
    ["path"],
  );
});

test("retirer un temps n'efface AUCUN texte", () => {
  // La garantie de Béné : "on ne doit JAMAIS supprimer ou abimer les
  // contenus créés par les users". Le bouton de l'éditeur pose ce
  // réglage, donc remettre le réglage doit rendre le bloc INTACT.
  const result = { title: "P", insight: "<p>la cause</p>", projection: "chemin" };
  assert.deepEqual(beatsOf(result, { show_result_insight: false }).map((b) => b.key), ["path"]);
  const [cause] = beatsOf(result, { show_result_insight: true });
  assert.equal(cause.key, "cause");
  assert.equal(cause.body, "<p>la cause</p>");
});
