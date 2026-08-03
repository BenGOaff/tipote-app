// tests/logic/french-typography.test.mts
//
// Béné, 3 août 2026 : "en français on laisse un espace entre un mot et des
// guillemets, ou un mot et un point d'interrogation etc. Là ça n'est plus
// le cas. Attention : ce n'est pas le cas dans toutes les langues. Ce
// genre de petits détails est chiant et long à corriger, on peut se
// l'éviter ?"
//
// Ce fichier est la réponse à "on peut se l'éviter". Il couvre les deux
// causes du retour en arrière (l'espace jamais insérée, la création jamais
// traitée) ET tous les formats techniques qu'une insertion pourrait
// casser. Sans ces derniers, le remède serait pire que le mal : une URL
// coupée en deux est plus grave qu'une espace manquante.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyFrenchTypography,
  applyFrenchTypographyDeep,
  applyFrenchTypographyToHtml,
  isFrenchLocale,
} from "../../lib/frenchTypography.ts";

const NBSP = " ";
const fr = (s: string) => applyFrenchTypography(s, "fr");

// ── Cause 1 : l'espace ABSENTE est maintenant insérée ───────────────

test("l'espace manquante est insérée devant ? ! : ;", () => {
  // Le coeur du retour de Béné. Un modèle de langue écrit très souvent
  // "Prêt?" : avant, ça le restait pour toujours.
  assert.equal(fr("Prêt?"), `Prêt${NBSP}?`);
  assert.equal(fr("Génial!"), `Génial${NBSP}!`);
  assert.equal(fr("Voici: ceci"), `Voici${NBSP}: ceci`);
  assert.equal(fr("Donc; ensuite"), `Donc${NBSP}; ensuite`);
});

test("les guillemets français prennent leur espace des deux côtés", () => {
  assert.equal(fr("«oui»"), `«${NBSP}oui${NBSP}»`);
  assert.equal(fr("« oui »"), `«${NBSP}oui${NBSP}»`);
});

test("une espace déjà là devient insécable", () => {
  assert.equal(fr("Prêt ?"), `Prêt${NBSP}?`);
});

test("les accents sont reconnus comme des lettres", () => {
  // `\\w` les aurait manqués : "café?" serait resté fautif.
  assert.equal(fr("café?"), `café${NBSP}?`);
  assert.equal(fr("déjà!"), `déjà${NBSP}!`);
});

test("la transformation est idempotente", () => {
  const once = fr("Prêt? Vraiment: oui");
  assert.equal(fr(once), once);
});

// ── Les autres langues ne prennent PAS cette espace ─────────────────

test("l'anglais, l'espagnol et les autres ne sont jamais touchés", () => {
  // "Attention : ce n'est pas le cas dans toutes les langues."
  for (const loc of ["en", "es", "de", "it", "pt", "pt-BR", "ar"]) {
    assert.equal(applyFrenchTypography("Ready?", loc), "Ready?");
    assert.equal(applyFrenchTypography("Note: this", loc), "Note: this");
  }
});

test("toutes les variantes de français sont couvertes", () => {
  assert.equal(isFrenchLocale("fr"), true);
  assert.equal(isFrenchLocale("fr-CA"), true);
  assert.equal(isFrenchLocale("FR"), true);
  assert.equal(isFrenchLocale("en"), false);
  assert.equal(isFrenchLocale(null), false);
});

// ── Ce qu'une insertion pourrait casser ─────────────────────────────

test("une URL n'est jamais coupée", () => {
  // Le `?` d'une query est suivi d'une lettre, pas d'une fin : on ne
  // touche pas. Sans ce garde-fou, le lien serait mort.
  assert.equal(fr("https://exemple.fr/page?ref=1"), "https://exemple.fr/page?ref=1");
  assert.equal(fr("Va sur https://exemple.fr/a?b=1 pour voir"), "Va sur https://exemple.fr/a?b=1 pour voir");
});

test("une heure et un rapport ne bougent pas", () => {
  // `:` précédé d'un CHIFFRE : jamais touché.
  assert.equal(fr("Rendez-vous à 12:30"), "Rendez-vous à 12:30");
  assert.equal(fr("Un ratio de 8:1"), "Un ratio de 8:1");
});

test("le schéma d'une URL survit", () => {
  assert.equal(fr("mailto:contact@exemple.fr"), "mailto:contact@exemple.fr");
  assert.equal(fr("http://exemple.fr"), "http://exemple.fr");
});

// ── HTML : ni les balises ni les entités ────────────────────────────

test("le texte d'un lien est corrigé, jamais son href", () => {
  const out = applyFrenchTypographyToHtml('<a href="https://x.fr/a?b=1">Prêt?</a>', "fr");
  assert.ok(out.includes('href="https://x.fr/a?b=1"'), "l'URL a été abîmée : " + out);
  assert.ok(out.includes(`Prêt${NBSP}?`), "le texte n'a pas été corrigé : " + out);
});

test("le CSS d'un attribut style n'est pas touché", () => {
  // C'était le piège de l'ancienne version dès qu'on insère : `color:red`
  // serait devenu `color :red`, donc du style cassé.
  const out = applyFrenchTypographyToHtml('<p style="color:red">Alors: voilà</p>', "fr");
  assert.ok(out.includes('style="color:red"'), "le CSS a été abîmé : " + out);
  assert.ok(out.includes(`Alors${NBSP}:`), "le texte n'a pas été corrigé : " + out);
});

test("les entités HTML gardent leur point-virgule", () => {
  // `&nbsp;` deviendrait `&nbsp ;`, donc du texte parasite à l'écran.
  const out = applyFrenchTypographyToHtml("<p>a&nbsp;b et caf&eacute;</p>", "fr");
  assert.ok(out.includes("&nbsp;"), "entité cassée : " + out);
  assert.ok(out.includes("&eacute;"), "entité cassée : " + out);
});

test("le HTML d'une autre langue est rendu tel quel", () => {
  const html = "<p>Ready? Note: yes</p>";
  assert.equal(applyFrenchTypographyToHtml(html, "en"), html);
});

// ── Cause 2 : tout le contenu est couvert, pas une liste de champs ──

test("un contenu entier est traité, y compris en profondeur", () => {
  // C'est ce qui remplace la liste blanche de colonnes : les questions
  // portent leurs options, les résultats leurs textes.
  const out = applyFrenchTypographyDeep(
    {
      title: "Prêt?",
      questions: [{ question_text: "Alors: quoi", options: [{ text: "Oui!" }] }],
    },
    "fr",
  );
  assert.equal(out.title, `Prêt${NBSP}?`);
  assert.equal(out.questions[0].question_text, `Alors${NBSP}: quoi`);
  assert.equal(out.questions[0].options[0].text, `Oui${NBSP}!`);
});

test("un champ NOUVEAU est couvert d'office", () => {
  // Le renversement qui fait disparaître la classe de bug : avec une
  // liste blanche, ce champ aurait été oublié jusqu'à ce qu'une cliente
  // le signale.
  const out = applyFrenchTypographyDeep({ un_champ_invente_demain: "Vraiment?" }, "fr");
  assert.equal(out.un_champ_invente_demain, `Vraiment${NBSP}?`);
});

test("les champs techniques sont épargnés par leur NOM", () => {
  const out = applyFrenchTypographyDeep(
    {
      cta_url: "https://x.fr/a?b=1",
      brand_color_primary: "#4F46E5",
      slug: "mon-quiz",
      sio_tag_names: ["profil:a"],
      locale: "fr",
    },
    "fr",
  );
  assert.equal(out.cta_url, "https://x.fr/a?b=1");
  assert.equal(out.brand_color_primary, "#4F46E5");
  assert.equal(out.slug, "mon-quiz");
  assert.deepEqual(out.sio_tag_names, ["profil:a"]);
  assert.equal(out.locale, "fr");
});

test("une valeur technique est épargnée même sous un nom anodin", () => {
  // Double sécurité : le nom du champ ET la forme de la valeur.
  const out = applyFrenchTypographyDeep({ texte: "https://x.fr/a?b=1" }, "fr");
  assert.equal(out.texte, "https://x.fr/a?b=1");
});

test("hors français, le contenu ressort intact", () => {
  const input = { title: "Ready?", questions: [{ question_text: "Note: yes" }] };
  assert.deepEqual(applyFrenchTypographyDeep(input, "en"), input);
});

test("l'objet reçu n'est jamais modifié sur place", () => {
  // Un appelant qui garde une référence sur le payload d'origine ne doit
  // pas voir son contenu changer sous ses pieds.
  const input = { title: "Prêt?" };
  const out = applyFrenchTypographyDeep(input, "fr");
  assert.equal(input.title, "Prêt?");
  assert.equal(out.title, `Prêt${NBSP}?`);
});

test("les nombres, booléens et null traversent sans dommage", () => {
  const out = applyFrenchTypographyDeep(
    { sort_order: 3, show: true, insight: null, points: 2.5 },
    "fr",
  );
  assert.deepEqual(out, { sort_order: 3, show: true, insight: null, points: 2.5 });
});
