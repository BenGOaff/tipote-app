// tests/logic/resultat-taille-texte.test.mts
//
// Béné, 25 août 2026 : "sur les résultats je veux la police à 16px sur le
// pitch post titre et toutes les parties en dessous. Là c'est
// déséquilibré et je dois tout reprendre manuellement. Aussi vérifie un
// coup que le responsive marche : je peux bien choisir une taille de
// texte différente pour la version PC et mobile."
//
// Les deux moitiés de sa phrase étaient deux bugs distincts.
//
// 1. LES TAILLES. Le viewer et l'aperçu ne disaient pas la même chose :
//    le pitch valait 16px chez le visiteur et 18px dans l'éditeur, le
//    pont 16px chez le visiteur et 14px dans l'éditeur. Elle réglait donc
//    sa page sur un aperçu qui mentait, puis reprenait tout à la main en
//    découvrant le vrai résultat. Huitième fois que ce défaut sort.
//
// 2. LE RESPONSIVE. Il marchait dans l'éditeur de QUIZ et pas dans celui
//    de SONDAGE : le toggle Monitor/Smartphone y existait, mais rien ne
//    le transmettait. Sans le provider, la toolbar écrit toujours la
//    taille DESKTOP (valeur par défaut du contexte) : passer en mobile et
//    changer la taille modifiait le PC. Et sans `data-device-preview`,
//    l'aperçu affichait la taille que la media query choisit d'après la
//    largeur réelle de l'écran, pas celle du device sélectionné.
//
// Ce test lit la SOURCE, comme editor-chrome et pdf-import : ces deux
// bugs sont dans des classes CSS et dans un câblage React, que ni le
// typecheck ni le filet de captures ne peuvent voir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { RESULT_BODY_CLASS } from "@/lib/quiz/resultBeats";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lire = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

const viewer = lire("components", "quiz", "PublicQuizClient.tsx");
const editeur = lire("components", "quiz", "QuizDetailClient.tsx");
const sondage = lire("components", "quiz", "SurveyDetailClient.tsx");

/** L'écran de résultat principal du viewer, du miroir au bloc suivant. */
function blocResultatViewer(): string {
  const debut = viewer.indexOf("Le MIROIR : le nom du profil");
  assert.notEqual(debut, -1, "l'écran de résultat doit rester repérable");
  const fin = viewer.indexOf("show_results_breakdown", debut);
  assert.notEqual(fin, -1);
  return viewer.slice(debut, fin);
}

// ── 1. LA TAILLE ─────────────────────────────────────────────────────

test("le corps de la page de resultat vaut 16px", () => {
  // text-base = 1rem = 16px. Si quelqu'un veut changer la valeur, c'est
  // ICI qu'il doit le faire, pas dans un composant.
  assert.match(RESULT_BODY_CLASS, /\btext-base\b/);
  assert.doesNotMatch(RESULT_BODY_CLASS, /\btext-(xs|sm|lg|xl)\b/);
});

test("le viewer n'ecrit plus aucune taille en dur sur l'ecran de resultat", () => {
  const bloc = blocResultatViewer();
  // C'est exactement ce qui produisait le déséquilibre : le pitch à
  // text-base, la cause et le chemin à text-sm, dans le même écran.
  assert.doesNotMatch(bloc, /text-(xs|sm|lg|xl|2xl) leading-relaxed/);
  // Et il appelle bien la constante partagée.
  assert.match(bloc, /RESULT_BODY_CLASS/);
});

test("l'apercu de l'editeur appelle la MEME constante, il ne la recopie pas", () => {
  // Un aperçu qui recalcule finit toujours par mentir : la seule
  // protection est qu'il ne PUISSE pas recalculer.
  assert.match(editeur, /import \{ RESULT_BODY_CLASS \} from "@\/lib\/quiz\/resultBeats"/);
  // Côté Tipote les placeholders sont des chaînes littérales, pas des
  // clés i18n : le repère change, la règle est la même.
  for (const champ of [
    'placeholder="Description…"',
    'placeholder="Insight…"',
    'placeholder="Projection…"',
    "placeholder=\"Ce que ça change pour lui",
  ]) {
    const i = editeur.indexOf(champ);
    assert.notEqual(i, -1, `le champ ${champ} doit exister dans l'éditeur`);
    // La classe est posée juste avant le placeholder dans chacun des
    // quatre RichTextEdit. On regarde la fenêtre qui les entoure.
    const fenetre = editeur.slice(Math.max(0, i - 400), i);
    assert.match(fenetre, /RESULT_BODY_CLASS/, `${champ} doit lire RESULT_BODY_CLASS`);
    assert.doesNotMatch(
      fenetre.slice(-200),
      /text-(xs|sm|lg|xl) leading-relaxed/,
      `${champ} ne doit plus porter de taille en dur`,
    );
  }
});

// ── 2. LE RESPONSIVE ─────────────────────────────────────────────────

const EDITEURS = [
  ["QuizDetailClient", editeur],
  ["SurveyDetailClient", sondage],
] as const;

test("tout editeur qui a un toggle PC/mobile transmet le device", () => {
  for (const [nom, src] of EDITEURS) {
    // Le toggle existe : c'est ce qui rend la promesse à la créatrice.
    assert.match(src, /Smartphone/, `${nom} doit avoir le toggle mobile`);
    // Sans le provider, la toolbar écrit --rt-fs-d quoi qu'il arrive,
    // donc régler la taille en mode mobile change le PC, en silence.
    assert.match(
      src,
      /<EditorPreviewDeviceProvider device=\{device\}>/,
      `${nom} doit envelopper son aperçu dans EditorPreviewDeviceProvider`,
    );
    // Sans cet attribut, l'aperçu montre ce que la largeur de l'écran
    // décide, pas ce que la créatrice a choisi.
    assert.match(
      src,
      /data-device-preview=\{device\}/,
      `${nom} doit poser data-device-preview sur son conteneur d'aperçu`,
    );
  }
});

test("les deux variables de taille restent independantes en CSS", () => {
  const css = lire("app", "globals.css");
  // Mobile lit --rt-fs-m et RIEN d'autre : sinon une taille posée sur le
  // PC descendrait sur le téléphone sans qu'on l'ait demandé.
  assert.match(css, /font-size: var\(--rt-fs-m, inherit\) !important/);
  // Desktop lit --rt-fs-d PUIS --rt-fs-m : une créatrice qui n'a réglé
  // que le mobile ne doit pas se retrouver avec un PC par défaut.
  assert.match(css, /font-size: var\(--rt-fs-d, var\(--rt-fs-m, inherit\)\) !important/);
  // Et l'override d'aperçu doit exister pour LES DEUX devices, sinon le
  // WYSIWYG ne dit la vérité que dans un sens.
  assert.match(css, /\[data-device-preview="mobile"\]/);
  assert.match(css, /\[data-device-preview="desktop"\]/);
});

test("une taille choisie par la creatrice passe DEVANT le defaut", () => {
  // C'est la garantie qui permet de changer le défaut sans toucher au
  // travail déjà fait : l'enveloppe .rt-field-fs porte !important.
  const css = lire("app", "globals.css");
  const i = css.indexOf(".rt-field-fs,");
  assert.notEqual(i, -1);
  assert.match(css.slice(i, i + 200), /!important/);
});
