// tests/logic/share-text.test.mts
//
// Béné, 3 août 2026, capture Threads : "regarde le partage dans Threads,
// c'est éclaté. J'ai fait le quiz de Jocelyne pour tester et bim c'est
// moche."
//
// Ce qui partait dans son post :
//   <div class="rt-field-fs" style="--rt-fs-d: 18px">Ce quiz permet
//   ... vraiment parlants&nbsp;!</div>
//
// Le champ de partage est RICHE, et le viewer l'envoyait tel quel. Ce
// fichier fige la règle : ce qui sort vers un réseau social est du TEXTE,
// sur UNE ligne, sans balise et sans entité.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildShareText, cleanShareUrl, toShareLine } from "../../lib/quiz/shareText.ts";

const fallback = (title: string) => `Je viens de faire le quiz "${title}" ! Fais-le aussi :`;

test("le message exact de Béné ressort en texte propre", () => {
  const raw =
    '<div class="rt-field-fs" style="--rt-fs-d: 18px">Ce quiz permet vraiment ' +
    "d'identifier la difficulté qui pèse le plus sur notre quotidien. Si vous vous " +
    "posez des questions à ce sujet, prenez 3 minutes pour le faire, les résultats " +
    "sont vraiment parlants&nbsp;!</div>";
  const out = buildShareText(raw, "<b>Neuro-atypie</b>", fallback);

  assert.ok(!out.includes("<"), "il reste une balise : " + out);
  assert.ok(!out.includes("&nbsp;"), "il reste une entité : " + out);
  assert.ok(!out.includes("rt-field-fs"), "il reste du style : " + out);
  assert.ok(out.startsWith("Ce quiz permet vraiment"), out);
  assert.ok(out.endsWith("sont vraiment parlants !"), out);
});

test("aucune balise ne survit, quelle qu'elle soit", () => {
  assert.equal(toShareLine("<p>Salut <strong>toi</strong></p>"), "Salut toi");
  assert.equal(toShareLine('<span style="color:red">Rouge</span>'), "Rouge");
  assert.equal(toShareLine("<br>"), "");
});

test("les entités du contentEditable sont décodées", () => {
  // Le navigateur ecrit &nbsp; a la place des espaces protegees, et
  // &#39; a la place des apostrophes : les deux s'affichaient en clair.
  assert.equal(toShareLine("Prêt&nbsp;?"), "Prêt ?");
  assert.equal(toShareLine("L&#39;essentiel"), "L'essentiel");
  assert.equal(toShareLine("Toi &amp; moi"), "Toi & moi");
});

test("le texte tient sur une seule ligne", () => {
  // Sur Threads ou X, un texte sur cinq lignes pousse le lien hors de vue.
  assert.equal(toShareLine("<p>Une</p>\n<p>Deux</p>"), "Une Deux");
  assert.equal(toShareLine("Une\n\n\nDeux"), "Une Deux");
});

test("SANS message, le titre du repli est nettoyé lui aussi", () => {
  // Le bug le plus large : la phrase par defaut contient le TITRE, qui
  // est riche sur TOUS les quiz (l'editeur est du WYSIWYG). Le repli
  // etait donc casse pour toutes celles qui n'avaient rien ecrit.
  const out = buildShareText(null, '<div class="rt-field-fs">Es-tu neuro&nbsp;?</div>', fallback);
  assert.equal(out, 'Je viens de faire le quiz "Es-tu neuro ?" ! Fais-le aussi :');
});

test("un message vide ou blanc retombe sur le repli", () => {
  // Un champ "vide" cote editeur vaut souvent "<div><br></div>" en base :
  // non vide au sens JS, vide a l'ecran. Sans ce cas, le visiteur
  // partageait une chaine blanche.
  for (const empty of ["", "   ", "<div><br></div>", "<p>&nbsp;</p>"]) {
    assert.equal(
      buildShareText(empty, "Mon quiz", fallback),
      'Je viens de faire le quiz "Mon quiz" ! Fais-le aussi :',
      `"${empty}" aurait du retomber sur le repli`,
    );
  }
});

test("un quiz sans titre ni message ne produit pas de balise", () => {
  const out = buildShareText(null, null, fallback);
  assert.ok(!out.includes("<"), out);
  assert.ok(out.includes("Je viens de faire le quiz"), out);
});

test("le texte d'origine n'est pas ampute", () => {
  // Nettoyer ne doit pas raccourcir : la creatrice a ecrit sa phrase.
  const msg = "Fais ce quiz, il dure 3 minutes et les résultats sont parlants !";
  assert.equal(buildShareText(msg, "T", fallback), msg);
});

// ── L'URL partagée ──────────────────────────────────────────────────
//
// L'autre moitié du "c'est éclaté" : sur la capture, le lien occupait
// cinq lignes de suivi publicitaire.

test("le suivi de campagne ne part pas dans le partage", () => {
  const arrivee =
    "https://quiz.j-bacquet.com/neuro-atypie-quiz?utm_source=ig&utm_medium=social" +
    "&utm_content=link_in_bio&fbclid=PAZXh0bgNhZW0CMTEAAc3J0YwZhcHBfaWQ";
  assert.equal(cleanShareUrl(arrivee), "https://quiz.j-bacquet.com/neuro-atypie-quiz");
});

test("le profil obtenu, LUI, reste dans le lien", () => {
  // `rp` est du contenu : il fait pointer l'apercu sur le bon profil.
  assert.equal(
    cleanShareUrl("https://q.fr/mon-quiz?rp=abc123&fbclid=xyz&utm_source=ig"),
    "https://q.fr/mon-quiz?rp=abc123",
  );
});

test("tout identifiant publicitaire tombe, connu ou pas", () => {
  // Liste BLANCHE : une regie qui invente demain son propre parametre
  // est couverte d'office, sans qu'on ait a le prevoir.
  const out = cleanShareUrl("https://q.fr/x?gclid=1&igshid=2&ttclid=3&un_truc_de_2027=4");
  assert.equal(out, "https://q.fr/x");
});

test("une URL sans paramètre traverse intacte", () => {
  assert.equal(cleanShareUrl("https://q.fr/mon-quiz"), "https://q.fr/mon-quiz");
});

test("le fragment de navigation interne ne part pas non plus", () => {
  assert.equal(cleanShareUrl("https://q.fr/mon-quiz#resultat"), "https://q.fr/mon-quiz");
});

test("une URL illisible est rendue telle quelle, jamais perdue", () => {
  // Fail-open : mieux vaut un lien moche qu'un partage sans lien.
  assert.equal(cleanShareUrl("pas-une-url"), "pas-une-url");
  assert.equal(cleanShareUrl(null), "");
});
