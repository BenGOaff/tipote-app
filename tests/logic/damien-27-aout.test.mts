// tests/logic/damien-27-aout.test.mts
//
// CE QUE LA RELECTURE DU QUIZ DE DAMIEN A SORTI (27 août 2026).
//
// Béné : "il veut que je revois son quiz pour lui donner mon avis."
// En lisant son contenu en base, trois défauts n'étaient pas les siens :
// ils venaient de chez nous, et ils touchent tout le monde.
//
// 1. SON BOUTON ÉTAIT NOIR SUR NOIR. Le libellé du CTA de son premier
//    profil portait `color: hsl(var(--foreground))`, qu'il n'a jamais
//    tapé : notre éditeur posait cette valeur en inline sur le champ, et
//    le navigateur l'a recopiée dans un <span> à la première commande de
//    mise en forme. Le viewer REPEINT `--foreground` avec la couleur de
//    texte du quiz (#171717 chez lui), et le fond du bouton vient de
//    `--primary` (#171717 aussi). Cette couleur inline bat le
//    `text-primary-foreground` du bouton : libellé invisible.
//    -> on ferme la source (rich-text-edit) ET on nettoie l'existant
//       (le sanitizer), parce qu'un contenu déjà enregistré ne se
//       répare pas tout seul.
//
// 2. SON TITRE DE PARTAGE COLLAIT DEUX PHRASES. Son `title` est
//    `Tu as une expertise ?<div>Qu'est-ce qui...</div>`, deux lignes à
//    l'écran. `stripHtml` remplaçait les balises par RIEN, donc
//    `og:title` et le texte de partage sortaient en "expertise ?Qu'est-ce".
//
// 3. SA TYPOGRAPHIE FRANÇAISE SAUTAIT APRÈS UN SYMBOLE. Il écrit
//    "2 000 € ?" : le motif exigeait une lettre ou un chiffre devant
//    l'espace, donc la règle ne se déclenchait pas et son `?` pouvait
//    tomber seul à la ligne sur un téléphone. "100 % ?" est le même cas,
//    et c'est une tournure que les créatrices écrivent tout le temps.
//
// Les protections documentées de la typographie sont retestées ici en
// entier : élargir ce qui peut précéder la ponctuation est exactement le
// genre de retouche qui casse une URL ou une heure sans que personne ne
// le voie.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizeRichText, stripHtml } from "@/lib/richText";
import { applyFrenchTypographyToHtml } from "@/lib/frenchTypography";

const NBSP = " ";

// ── 1. LA COULEUR QUI VIENT DE NOUS ──────────────────────────────────

test("une couleur qui pointe sur une variable CSS est retirée du contenu", () => {
  const sien = `<div style="text-align: center"><span style="color: hsl(var(--foreground))">CONSTRUIRE MON OFFRE - 27 €</span></div>`;
  const propre = sanitizeRichText(sien);
  assert.ok(!propre.includes("var(--"), propre);
  // L'alignement qu'il a VRAIMENT choisi survit : on retire la
  // déclaration fautive, pas l'attribut entier.
  assert.ok(propre.includes("text-align: center"), propre);
});

test("une vraie couleur choisie par la créatrice survit", () => {
  const propre = sanitizeRichText(`<span style="color: #ff0000">rouge</span>`);
  assert.ok(propre.includes("#ff0000"), propre);
});

test("un style vidé de tout ne laisse pas d'attribut vide derrière lui", () => {
  const propre = sanitizeRichText(`<span style="color: hsl(var(--foreground))">x</span>`);
  assert.ok(!propre.includes('style=""'), propre);
});

test("l'éditeur ne pose plus la variable CSS en inline sur le champ", () => {
  // Relecture de source assumée : cette ligne ne sert à rien en local
  // (le rendu est identique), et rien d'autre ne dirait qu'on l'a
  // remise. Même raison que les deux lignes de next.config.ts figées
  // par pdf-import.test.mts.
  const src = readFileSync("components/ui/rich-text-edit.tsx", "utf8");
  assert.ok(
    !src.includes('?? "hsl(var(--foreground))"'),
    "rich-text-edit repose la variable CSS en inline : le contenu des clientes va la ravaler",
  );
});

// ── 2. LE TITRE DE PARTAGE ───────────────────────────────────────────

test("stripHtml pose une espace sur une frontière de bloc", () => {
  const sien = `Tu as une expertise&nbsp;?<div><span style="font-weight: normal">Qu’est-ce qui t’empêche vraiment d’en faire une offre qui se vend&nbsp;?</span></div>`;
  const texte = stripHtml(sien);
  assert.ok(texte.includes("expertise ? Qu’est-ce"), texte);
  assert.ok(!texte.includes("?Qu’est-ce"), texte);
});

test("stripHtml sépare les éléments d'une liste", () => {
  assert.equal(stripHtml("<ul><li>un</li><li>deux</li></ul>"), "un deux");
});

test("stripHtml ne coupe pas un mot mis en gras au milieu d'une phrase", () => {
  // La correction ne doit toucher QUE les blocs : un <b> ou un <span>
  // au milieu d'une phrase ne crée aucune frontière.
  assert.equal(stripHtml("Bonjour <b>toi</b>"), "Bonjour toi");
  assert.equal(stripHtml("un<span>deux</span>"), "undeux");
});

// ── 3. LA TYPOGRAPHIE APRÈS UN SYMBOLE ───────────────────────────────

const avecInsecable = (t: string) => applyFrenchTypographyToHtml(t, "fr");

test("un symbole devant la ponctuation ne fait plus sauter la règle", () => {
  assert.equal(avecInsecable("2 000 € ?"), `2 000 €${NBSP}?`);
  assert.equal(avecInsecable("100 % ?"), `100 %${NBSP}?`);
  assert.equal(avecInsecable("prix € !"), `prix €${NBSP}!`);
  assert.equal(avecInsecable("20 °C ?"), `20 °C${NBSP}?`);
});

test("une fermeture devant la ponctuation compte aussi", () => {
  assert.equal(avecInsecable("(le prix) ?"), `(le prix)${NBSP}?`);
});

test("ce qui marchait avant marche toujours", () => {
  assert.equal(avecInsecable("Tu aides qui ?"), `Tu aides qui${NBSP}?`);
  assert.equal(avecInsecable("Tu aides qui?"), `Tu aides qui${NBSP}?`);
  assert.equal(avecInsecable("Réponds à 8 questions :"), `Réponds à 8 questions${NBSP}:`);
});

test("la règle reste idempotente", () => {
  const une = avecInsecable("2 000 € ?");
  assert.equal(avecInsecable(une), une);
});

test("les protections documentées tiennent, symboles compris", () => {
  // Une URL avec une query.
  assert.equal(avecInsecable("va sur example.com/a?b=1 tout de suite"), "va sur example.com/a?b=1 tout de suite");
  // Une heure et un rapport.
  assert.equal(avecInsecable("rendez-vous à 12:30"), "rendez-vous à 12:30");
  assert.equal(avecInsecable("un ratio de 8:1 environ"), "un ratio de 8:1 environ");
  // Une entité HTML : son point-virgule est structurel.
  assert.ok(avecInsecable("prix&nbsp;: 27 €").includes("&nbsp;"));
  assert.ok(!avecInsecable("prix&nbsp;: 27 €").includes("&nbsp ;"));
  // Le CSS d'un attribut, protégé par le découpage sur les balises.
  const html = `<span style="color:red">x</span>`;
  assert.equal(avecInsecable(html), html);
  // Une taille de champ : le drame Éric du 4 août.
  const taille = `<div class="rt-field-fs" style="--rt-fs-d: 48px">titre</div>`;
  assert.equal(avecInsecable(taille), taille);
});

test("aucune autre langue n'est touchée", () => {
  for (const locale of ["en", "es", "it", "pt", "pt-BR", "ar"]) {
    assert.equal(applyFrenchTypographyToHtml("2 000 € ?", locale), "2 000 € ?");
  }
});

// ── 4. LE COMPTE EST BON, LA RÉPARTITION NON ─────────────────────────
//
// Ses questions 4 et 8 ont 4 réponses pour 4 profils, mais servent deux
// fois le profil 0 et jamais le profil 3. Ni `analyzeOptionSupply` (qui
// compte les réponses) ni `analyzeResultCoverage` (qui regarde tout le
// quiz) ne pouvaient le voir.

import { analyzeOptionSupply, analyzeProfileGaps, analyzeResultCoverage } from "@/lib/quizCoherence";
import { readCaptureCompliance } from "@/lib/quiz/captureCompliance";

const q = (...indices: number[]) => ({ options: indices.map((result_index) => ({ result_index })) });

/** Le quiz de Damien, réduit à ce qui compte : ses 8 questions et leurs
 *  `result_index`, relevés en base le 27 août. */
const DAMIEN = [
  q(0, 1, 2, 3, 3),
  q(0, 1, 2, 3),
  q(0, 1, 2, 3),
  q(0, 1, 2, 0), // <- la 4e réponse décrit le profil 3
  q(0, 1, 1, 2, 3),
  q(0, 1, 2, 3),
  q(0, 1, 2, 3),
  q(0, 1, 2, 0), // <- idem
];

test("le trou de Damien est vu, et il désigne les bonnes questions", () => {
  const gaps = analyzeProfileGaps("profiles", DAMIEN, 4);
  // Index 3 des questions 4 et 8, soit les positions 3 et 7.
  assert.deepEqual(gaps[3], [3, 7]);
  // Les trois autres profils sont servis partout.
  assert.deepEqual(gaps[0], []);
  assert.deepEqual(gaps[1], []);
  assert.deepEqual(gaps[2], []);
});

test("les deux contrôles existants ne pouvaient PAS le voir", () => {
  // C'est la raison d'être du nouveau : si l'un des deux le voyait, on
  // aurait ajouté une alerte en double au lieu d'un contrôle.
  assert.equal(analyzeOptionSupply("profiles", DAMIEN, 4).short, false);
  assert.equal(analyzeResultCoverage("profiles", DAMIEN, 4)[3].severity, "ok");
});

test("une question trop courte est laissée à analyzeOptionSupply", () => {
  // 3 réponses pour 4 profils : le profil manquant est déjà nommé
  // ailleurs, avec sa propre cause. Le dire deux fois ferait du bruit.
  const gaps = analyzeProfileGaps("profiles", [q(0, 1, 2)], 4);
  assert.deepEqual(gaps[3], []);
  assert.equal(analyzeOptionSupply("profiles", [q(0, 1, 2)], 4).short, true);
});

test("en scoring le contrôle se tait, sans rien calculer", () => {
  // `result_index` ne veut rien dire en scoring : c'est la tranche de
  // points qui attribue (drame Véronique, 1er août).
  const gaps = analyzeProfileGaps("scoring", DAMIEN, 4);
  assert.deepEqual(gaps, [[], [], [], []]);
});

test("les types sans options ne sont jamais signalés", () => {
  const libre = { options: [], question_type: "free_text" };
  const ouiNon = { options: [{ result_index: 0 }, { result_index: 1 }], question_type: "yes_no" };
  assert.deepEqual(analyzeProfileGaps("profiles", [libre, ouiNon], 4), [[], [], [], []]);
});

// ── 5. LA CASE DE CONSENTEMENT QUI NE RENVOIE À RIEN ─────────────────

test("le cas de Damien est signalé", () => {
  // Relevé en base : capture_enabled true, show_consent_checkbox true,
  // consent_text vide, privacy_url nul.
  const v = readCaptureCompliance({
    captureEnabled: true,
    showConsentCheckbox: true,
    consentText: "",
    privacyUrl: null,
  });
  assert.equal(v.consentSansPolitique, true);
});

test("une adresse de politique renseignée suffit", () => {
  const v = readCaptureCompliance({
    captureEnabled: true,
    showConsentCheckbox: true,
    consentText: "",
    privacyUrl: "https://exemple.fr/confidentialite",
  });
  assert.equal(v.consentSansPolitique, false);
});

test("son propre lien dans le texte suffit aussi", () => {
  const v = readCaptureCompliance({
    captureEnabled: true,
    showConsentCheckbox: true,
    consentText: `J'accepte la <a href="https://exemple.fr/vie-privee">politique</a>.`,
    privacyUrl: null,
  });
  assert.equal(v.consentSansPolitique, false);
});

test("un texte personnalisé SANS lien ne suffit pas", () => {
  // Le piège : elle a écrit une phrase, donc elle croit avoir traité le
  // sujet, et le visiteur n'a toujours rien à lire.
  const v = readCaptureCompliance({
    captureEnabled: true,
    showConsentCheckbox: true,
    consentText: "J'accepte de recevoir des emails.",
    privacyUrl: "  ",
  });
  assert.equal(v.consentSansPolitique, true);
});

test("sans capture ni case affichée, il n'y a rien à promettre", () => {
  const sansCapture = readCaptureCompliance({
    captureEnabled: false,
    showConsentCheckbox: true,
    consentText: "",
    privacyUrl: null,
  });
  const sansCase = readCaptureCompliance({
    captureEnabled: true,
    showConsentCheckbox: false,
    consentText: "",
    privacyUrl: null,
  });
  assert.equal(sansCapture.consentSansPolitique, false);
  assert.equal(sansCase.consentSansPolitique, false);
});
