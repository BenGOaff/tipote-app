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
  reparerEntitesCassees,
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

// Bene, 25 aout 2026 : "le generateur de quiz de tiquiz et tipote et
// partout en fait ne doit jamais utiliser ce type de guillemet en
// francais : « mais " ".
//
// Cette page faisait EXACTEMENT l'inverse jusqu'a ce jour : elle posait
// une espace insecable autour des chevrons pour les rendre
// typographiquement justes. C'etait juste, et ce n'est pas ce qu'elle
// veut. Le test d'avant figeait donc l'ancien comportement : il a rougi,
// c'est son travail.
test("les chevrons deviennent des guillemets droits", () => {
  assert.equal(fr("«oui»"), '"oui"');
  assert.equal(fr("« oui »"), '"oui"');
  assert.equal(fr("Il a dit « bonjour » hier"), 'Il a dit "bonjour" hier');
});

test("l'espace interieure part AVEC le chevron", () => {
  // Une insecable orpheline collee a un guillemet droit serait pire que
  // le chevron d'origine.
  assert.ok(!fr("« oui »").includes(NBSP));
  assert.ok(!fr("«\u202Foui\u202F»").includes("\u202F"));
});

test("la ponctuation garde son espace meme collee a un chevron", () => {
  // Les motifs de ponctuation se servent du `»` comme repere de fin de
  // phrase : convertir les chevrons AVANT les priverait de ce repere.
  assert.equal(fr("Il a dit « prêt? » hier"), `Il a dit "prêt${NBSP}?" hier`);
});

test("aucune autre langue n'est touchee par les chevrons", () => {
  for (const loc of ["en", "es", "it", "pt", "pt-BR", "ar"]) {
    assert.equal(applyFrenchTypography("« oui »", loc), "« oui »", loc);
  }
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

// ── Eric, 4 août 2026 : la taille du titre revient à l'original ───────
//
// "Il modifie la taille, il enregistre, et dès qu'il a enregistré la
// taille est revenue à l'original."
//
// La taille d'un champ vit dans `style="--rt-fs-d: 48px"`. Le nom de la
// variable finit par une LETTRE et le `:` est suivi d'une espace : pour
// la règle française, c'est un deux-points qui mérite son espace
// insécable. Appliquée au HTML brut, elle écrivait `--rt-fs-d&nbsp;:`,
// une propriété CSS qui n'existe pas, que le sanitizer jetait ensuite
// SANS UN MOT. La taille était détruite à chaque enregistrement.
//
// La version HTML de la fonction ne fait pas cette faute depuis le
// 3 août. Trois appelants prenaient simplement la mauvaise des deux.

const TITRE_DIMENSIONNE =
  '<div class="rt-field-fs" style="--rt-fs-d: 48px;">Prêt à changer de vie ?</div>';

test("la taille d'un champ survit à la version TEXTE de la fonction", () => {
  // C'est ça, le correctif : on ne compte plus sur l'appelant pour
  // choisir la bonne des deux fonctions.
  const out = applyFrenchTypography(TITRE_DIMENSIONNE, "fr");
  assert.match(out, /--rt-fs-d:\s*48px/, "la variable CSS ne doit pas être touchée");
  assert.ok(!/--rt-fs-d\s*\u202f|--rt-fs-d\s*&nbsp;|--rt-fs-d\s+:/.test(out));
});

test("et le texte visible du même champ est bien corrigé", () => {
  // Le repli vers la version HTML ne doit pas faire perdre la règle :
  // le point d'interrogation garde son espace.
  const out = applyFrenchTypography(TITRE_DIMENSIONNE, "fr");
  assert.match(out, /vie\u00a0\?|vie&nbsp;\?/, "le ? du texte garde son espace");
});

test("les deux tailles, mobile et desktop, survivent", () => {
  const out = applyFrenchTypography(
    '<div class="rt-field-fs" style="--rt-fs-m: 24px; --rt-fs-d: 48px;">Bonjour !</div>',
    "fr",
  );
  assert.match(out, /--rt-fs-m:\s*24px/);
  assert.match(out, /--rt-fs-d:\s*48px/);
});

test("un texte SANS balise garde exactement l'ancien comportement", () => {
  // Le repli ne doit pas changer le cas normal, qui est la majorité.
  assert.equal(
    applyFrenchTypography("Prêt?", "fr"),
    applyFrenchTypographyToHtml("Prêt?", "fr"),
  );
  assert.match(applyFrenchTypography("Prêt?", "fr"), /Prêt\u00a0\?/);
});

test("les autres langues restent intactes, balises comprises", () => {
  for (const locale of ["en", "es", "it", "pt", "pt-BR", "ar"]) {
    assert.equal(applyFrenchTypography(TITRE_DIMENSIONNE, locale), TITRE_DIMENSIONNE);
  }
});

test("aucun appelant ne peut plus détruire une taille de police", () => {
  // Garde-fou de bout en bout : ce que la route écrit vraiment en base.
  const questionText = '<div class="rt-field-fs" style="--rt-fs-d: 32px;">Où en es-tu ?</div>';
  for (const out of [
    applyFrenchTypography(questionText, "fr"),
    applyFrenchTypographyToHtml(questionText, "fr"),
    (applyFrenchTypographyDeep({ question_text: questionText }, "fr") as Record<string, string>)
      .question_text,
  ]) {
    assert.match(out, /--rt-fs-d:\s*32px/);
  }
});

// ── L'INTERFACE FRANÇAISE N'EN PORTE AUCUN NON PLUS ─────────────────
//
// Béné : "le générateur de quiz de tiquiz et tipote et PARTOUT EN FAIT
// ne doit jamais utiliser ce type de guillemet en français."
//
// La règle serveur couvre ce que le modèle écrit. Elle ne couvre pas ce
// que NOUS avons écrit à la main : 70 chevrons vivaient dans les libellés
// français de l'interface, dont ceux des cartes d'insights.
//
// Ce test ne regarde QUE le français : l'arabe utilise légitimement les
// chevrons, et un test qui rougit pour rien finit désactivé.

test("aucun chevron dans les libelles francais de l'interface", async () => {
  const { readFileSync } = await import("node:fs");
  // Les DEUX sources de francais ecrit a la main : les libelles de
  // l'app, et le dictionnaire de l'espace affilie.
  for (const rel of ["../../messages/fr.json", "../../app/affiliate/i18n/fr.ts"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    const trouves = src.split("\n").filter((l) => /[«»]/.test(l));
    assert.deepEqual(trouves, [], `des chevrons sont revenus dans ${rel}`);
  }
});

// ── L'ENTITÉ CASSÉE DE CHRISTIAN (1er septembre 2026) ────────────────
//
// Le titre de son 4e résultat revenait de la base en
// `Ce n'est pas parce que tu n'es pas doué...&nbsp<nbsp>;`, affiché tel
// quel sur sa page de résultat.
//
// La détection ne cherchait qu'une BALISE. Une chaîne peut porter une
// ENTITÉ sans porter la moindre balise, et c'était son cas : elle
// partait vers la version texte brut, qui insérait l'espace du français
// devant le `;` structurel de `&nbsp;`.

test("une entité SANS balise autour n'est plus cassée", () => {
  const brut = "Ce n'est pas parce que tu n'es pas doué...&nbsp;";
  assert.equal(applyFrenchTypography(brut, "fr"), brut);
});

test("les autres entités sans balise sont protégées aussi", () => {
  for (const e of ["&amp;", "&lt;", "&gt;", "&quot;", "&#39;", "&#x27;"]) {
    const brut = `Attention${e}`;
    assert.equal(applyFrenchTypography(brut, "fr"), brut, e);
  }
});

test("le texte VISIBLE garde bien sa règle française", () => {
  // On ne protège pas tout : ce qui est de la prose se corrige toujours.
  assert.equal(applyFrenchTypography("Prêt?", "fr"), "Prêt ?");
  assert.equal(applyFrenchTypography("Bravo!&nbsp;", "fr"), "Bravo !&nbsp;");
});

test("un champ déjà cassé se répare tout seul au prochain enregistrement", () => {
  // Une entité coupée en deux ne redevient pas une entité toute seule :
  // elle reste affichée telle quelle chez la cliente.
  assert.equal(
    applyFrenchTypography("doué...&nbsp ;", "fr"),
    "doué...&nbsp;",
  );
  assert.equal(reparerEntitesCassees("a&nbsp ;b"), "a&nbsp;b");
  assert.equal(reparerEntitesCassees("a&#233 ;b"), "a&#233;b");
});

test("la réparation ne touche PAS à de la prose qui ressemble à une entité", () => {
  // "M&M ;" est un texte légitime : le recoller changerait ce que la
  // cliente a écrit. Liste fermée d'entités connues, et rien d'autre.
  assert.equal(reparerEntitesCassees("des M&M ;"), "des M&M ;");
  assert.equal(reparerEntitesCassees("Pierre & Paul ;"), "Pierre & Paul ;");
});

test("rien de tout ça hors français", () => {
  assert.equal(applyFrenchTypography("Ready?&nbsp;", "en"), "Ready?&nbsp;");
});

test("le contenu profond d'un quiz est couvert", () => {
  const payload = {
    results: [{ title: "doué...&nbsp;", description: "<p>Alors?&nbsp;</p>" }],
  };
  const sortie = applyFrenchTypographyDeep(payload, "fr");
  assert.equal(sortie.results[0].title, "doué...&nbsp;");
  assert.equal(sortie.results[0].description, "<p>Alors ?&nbsp;</p>");
});

// ── LA RÈGLE NE DOIT JAMAIS MANGER SA PROPRE SORTIE ──────────────────
//
// Béné, 1er septembre 2026 : "ce genre de souci on l'a eu mille fois et
// il revient toujours, j'en ai marre de corriger toujours les mêmes
// choses."
//
// C'est ça, le vrai invariant. Une règle qui INSÈRE une espace est
// appliquée à chaque enregistrement : si sa sortie n'est pas un point
// fixe, le texte dérive un peu plus à chaque sauvegarde, et personne ne
// voit rien avant que ce soit illisible. On fige donc l'idempotence, et
// pas seulement les cas connus.

const BATTERIE = [
  "Prêt ?",
  "Prêt?",
  "Bravo !&nbsp;",
  "Ce n'est pas parce que tu n'es pas doué...&nbsp;",
  "<p>Alors&nbsp;? On y va&nbsp;!</p>",
  '<a href="https://exemple.fr/page?x=1&amp;y=2">un lien</a>',
  '<span style="color:red">rouge</span>',
  "Rendez-vous à 12:30 ; sans faute.",
  "Question : que faire ?",
  "Le taux est de 40 % ; c'est net.",
  "M&M ;",
  "&#233; et &#x27; passent",
];

test("appliquer deux fois donne exactement la même chose", () => {
  for (const brut of BATTERIE) {
    const une = applyFrenchTypography(brut, "fr");
    const deux = applyFrenchTypography(une, "fr");
    assert.equal(deux, une, `dérive sur : ${brut}`);
    // Et trois fois, parce qu'un cycle de période 2 passerait le test
    // ci-dessus sans être stable pour autant.
    assert.equal(applyFrenchTypography(deux, "fr"), une, `cycle sur : ${brut}`);
  }
});

test("ce qui est TECHNIQUE ne bouge pas d'un caractère", () => {
  // Chacun de ces cas a déjà cassé quelque chose quelque part.
  const intacts = [
    '<a href="https://exemple.fr/page?x=1">lien</a>',
    '<span style="color:red">rouge</span>',
    "&nbsp;",
    "&amp;",
    "&#233;",
  ];
  for (const s of intacts) {
    assert.equal(applyFrenchTypography(s, "fr"), s, s);
  }
});

// ── ET CE QUI EST DÉJÀ CASSÉ EN BASE S'AFFICHE JUSTE ─────────────────
//
// Corriger à l'enregistrement ne suffit pas : le texte abîmé est DÉJÀ
// chez des clientes. Sans réparation à l'affichage, chacune devrait
// rouvrir et ré-enregistrer chaque champ, un par un, pour faire
// disparaître un texte qu'elle n'a jamais tapé.

test("un titre déjà cassé s'affiche correctement, sans toucher à la base", async () => {
  const { sanitizeRichText, stripHtml } = await import("../../lib/richText.ts");
  const casse = "Ce n'est pas parce que tu n'es pas doué...&nbsp ;";

  assert.ok(
    !sanitizeRichText(casse).includes("&amp;nbsp"),
    "le rendu riche montre encore l'entité cassée",
  );
  assert.ok(
    !stripHtml(casse).includes("&nbsp"),
    "l'aperçu de partage montre encore l'entité cassée",
  );
});

test("la réparation à l'affichage ne réécrit pas de la prose", () => {
  assert.equal(reparerEntitesCassees("des M&M ; et voilà"), "des M&M ; et voilà");
});
