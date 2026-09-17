// tests/logic/champs-capture.test.mts
//
// TOUT LE FORMULAIRE DE CAPTURE EST ÉDITABLE (Béné, 16 septembre 2026).
//
// « TOUT doit être éditable donc si je clique sur "Prénom" dans le quiz,
// je dois pouvoir écrire "Entre ton prénom" par exemple, avec l'éditeur
// de texte, pour mettre en gras, changer la taille etc ... et il faut
// mettre un placeholder, qu'on peut aussi personnaliser !! »
//
// Ce test tient les DEUX moitiés : ce que le module DÉCIDE, et le fait
// que le viewer et les deux aperçus l'APPELLENT. Un test qui ne tiendrait
// que la première passerait au vert sur un aperçu qui recompose le
// formulaire à la main, c'est à dire sur le défaut sorti six fois dans
// ces dépôts.
//
// Il est le MÊME dans les deux dépôts, et il s'adapte à ce que chacun
// porte : un garde-fou qui ne protège qu'un des deux jumeaux ne protège
// personne.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { SOURCE_EDITEUR_CAPTURE } from "./aide/editeurCapture.mts";
import {
  CLES_CHAMPS_INTEGRES,
  MAX_LIBELLE_RICHE,
  appliquerLibelle,
  appliquerPlaceholder,
  echapperHtml,
  elaguerLibelles,
  grouperEnLignes,
  resoudreChampsCapture,
  retirerChampPersonnalise,
  sanitizeLibellesCapture,
  texteNu,
  type LibellesCapture,
} from "@/lib/quiz/champsCapture";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

const lire = (p: string) => sansCommentaires(readFileSync(p, "utf8"));

const DEFAUTS = {
  first_name: "Prénom",
  last_name: "Nom",
  email: "Email",
  phone: "Téléphone",
  country: "Pays",
  emailPlaceholder: "ton@email.com",
};

const visiteur = (quiz: Record<string, unknown>, prenom = false) =>
  resoudreChampsCapture(quiz, {
    mode: "visiteur",
    prenomSurCapture: prenom,
    prenomObligatoire: false,
    defauts: DEFAUTS,
  });

const ville = { id: "cf_ab12cd", label: "Ta ville", placeholder: "Paris", required: true };

// ── Ce que le module décide ────────────────────────────────────────────

test("un quiz jamais retouché rend EXACTEMENT ce qu'il rendait", () => {
  const champs = visiteur({ capture_last_name: true, capture_phone: true, capture_country: true });
  assert.deepEqual(champs.map((c) => c.cle), ["last_name", "email", "phone", "country"]);
  // Les libellés sont les défauts, et ils ne sont PAS marqués personnalisés :
  // c'est ce qui permet à l'aperçu de ne rien enregistrer tant qu'on n'y
  // touche pas.
  assert.equal(champs.every((c) => c.labelPersonnalise === false), true);
  assert.equal(champs.find((c) => c.cle === "phone")?.labelHtml, "Téléphone");
  // L'email est toujours là et toujours obligatoire : c'est le formulaire
  // de capture.
  const email = champs.find((c) => c.cle === "email");
  assert.equal(email?.required, true);
  assert.equal(email?.type, "email");
  assert.equal(email?.placeholder, "ton@email.com");
});

test("le prénom est un PARAMÈTRE, jamais déduit ici", () => {
  assert.equal(visiteur({}, false).some((c) => c.cle === "first_name"), false);
  assert.equal(visiteur({}, true)[0].cle, "first_name");
});

test("un libellé riche gagne sur le défaut, un libellé qui ne DIT rien non", () => {
  const avec = visiteur({ capture_labels: { email: { label: "<b>Ton adresse</b>" } } });
  const e = avec.find((c) => c.cle === "email");
  assert.equal(e?.labelHtml, "<b>Ton adresse</b>");
  assert.equal(e?.labelPersonnalise, true);

  // `<p></p>` et `<br>` ne disent rien : on retombe sur le défaut, jamais
  // sur une ligne vide.
  const vide = visiteur({ capture_labels: { email: { label: "<p></p>" } } });
  assert.equal(vide.find((c) => c.cle === "email")?.labelHtml, "Email");
  assert.equal(vide.find((c) => c.cle === "email")?.labelPersonnalise, false);
});

test("un défaut qui contient un chevron est ÉCHAPPÉ, jamais rendu en balise", () => {
  const champs = resoudreChampsCapture({}, {
    mode: "visiteur",
    prenomSurCapture: false,
    prenomObligatoire: false,
    defauts: { ...DEFAUTS, email: "<script>x</script>" },
  });
  const html = champs.find((c) => c.cle === "email")?.labelHtml ?? "";
  assert.equal(html.includes("<script>"), false);
  assert.equal(html, echapperHtml("<script>x</script>"));
});

test("un champ personnalisé SANS NOM : caché au visiteur, montré dans l'aperçu", () => {
  const quiz = { custom_fields: [{ id: "cf_zz99zz", label: "", placeholder: "", required: false }] };
  assert.equal(visiteur(quiz).length, 1); // l'email, et lui seul
  const apercu = resoudreChampsCapture(quiz, {
    mode: "apercu",
    prenomSurCapture: false,
    prenomObligatoire: false,
    defauts: DEFAUTS,
  });
  const sansNom = apercu.find((c) => c.cle === "cf_zz99zz");
  assert.equal(sansNom?.sansNom, true);
  // Sinon la créatrice ne peut pas lui donner son nom en cliquant dessus.
});

test("grouperEnLignes : prénom et nom se partagent UNE ligne, l'email a la sienne", () => {
  const lignes = grouperEnLignes(visiteur({ capture_last_name: true, capture_phone: true }, true));
  assert.deepEqual(lignes.map((l) => l.map((c) => c.cle)), [["first_name", "last_name"], ["email"], ["phone"]]);
  // Un demi-largeur seul garde sa ligne : le prénom ne s'étire pas sur
  // toute la largeur quand le nom n'est pas demandé.
  const seul = grouperEnLignes(visiteur({}, true));
  assert.deepEqual(seul.map((l) => l.map((c) => c.cle)), [["first_name"], ["email"]]);
});

test("sanitizeLibellesCapture ne lève JAMAIS et jette ce qu'elle ne connaît pas", () => {
  for (const v of [null, undefined, 42, "x", [], { email: "pas un objet" }]) {
    assert.deepEqual(sanitizeLibellesCapture(v), {});
  }
  const out = sanitizeLibellesCapture({
    email: { label: "Ton adresse" },
    __proto__pollution: { label: "non" },
    "cf_pasunid!": { label: "non" },
    cf_ab12cd: { placeholder: "Paris" },
    phone: { label: "   ", placeholder: "  " },
  });
  assert.deepEqual(Object.keys(out).sort(), ["cf_ab12cd", "email"]);
  // Une entrée sans libellé ni placeholder est retirée : elle ne dirait rien.
  assert.equal("phone" in out, false);
});

test("un libellé est BORNÉ, et les retours à la ligne deviennent des espaces", () => {
  const long = sanitizeLibellesCapture({ email: { label: "a".repeat(MAX_LIBELLE_RICHE + 50) } });
  assert.equal(long.email.label?.length, MAX_LIBELLE_RICHE);
  const multi = sanitizeLibellesCapture({ email: { label: "Ton\nadresse" } });
  assert.equal(multi.email.label, "Ton adresse");
});

test("appliquerLibelle écrit LES DEUX : le HTML riche ET le nom en texte nu", () => {
  const apres = appliquerLibelle({ champs: [ville], libelles: {} }, "cf_ab12cd", "<b>Ta ville</b> préférée");
  assert.equal(apres.libelles["cf_ab12cd"].label, "<b>Ta ville</b> préférée");
  // Le NOM nu suit : c'est lui qui nomme la colonne du CSV, le champ de
  // contact chez Systeme.io / GoHighLevel, la ligne des statistiques.
  assert.equal(apres.champs[0].label, "Ta ville préférée");
  assert.equal(apres.champs[0].label.includes("<b>"), false);
});

test("un libellé vidé retombe sur le défaut, il ne laisse pas une ligne vide", () => {
  const avec: LibellesCapture = { email: { label: "<b>Ton adresse</b>" } };
  const apres = appliquerLibelle({ champs: [], libelles: avec }, "email", "<p></p>");
  assert.equal("email" in apres.libelles, false);
  // Et le placeholder posé à côté survit à l'effacement du libellé.
  const deux = appliquerLibelle(
    { champs: [], libelles: { email: { label: "<b>x</b>", placeholder: "ton@email.com" } } },
    "email",
    "",
  );
  assert.deepEqual(deux.libelles.email, { placeholder: "ton@email.com" });
});

test("le placeholder vit sur le CHAMP pour un personnalisé, dans les libellés sinon", () => {
  const perso = appliquerPlaceholder({ champs: [ville], libelles: {} }, "cf_ab12cd", "Lyon");
  assert.equal(perso.champs[0].placeholder, "Lyon");
  assert.equal("cf_ab12cd" in perso.libelles, false);

  const integre = appliquerPlaceholder({ champs: [], libelles: {} }, "email", "ton@email.com");
  assert.equal(integre.libelles.email.placeholder, "ton@email.com");
});

test("elaguerLibelles retire le libellé d'un champ supprimé, jamais une clé intégrée", () => {
  const avant: LibellesCapture = {
    email: { label: "<b>Ton adresse</b>" },
    cf_ab12cd: { label: "<b>Ta ville</b>" },
    cf_disparu1: { label: "<b>Parti</b>" },
  };
  const apres = elaguerLibelles([ville], avant);
  assert.deepEqual(Object.keys(apres).sort(), ["cf_ab12cd", "email"]);
  // Les cinq clés intégrées n'appartiennent à aucun champ de la liste :
  // les élaguer effacerait le travail de la créatrice.
  const integres: LibellesCapture = {};
  for (const c of CLES_CHAMPS_INTEGRES) integres[c] = { label: "x" };
  assert.deepEqual(elaguerLibelles([], integres), integres);
});

test("retirerChampPersonnalise emporte le champ ET son libellé", () => {
  const apres = retirerChampPersonnalise(
    { champs: [ville], libelles: { cf_ab12cd: { label: "x" }, email: { label: "y" } } },
    "cf_ab12cd",
  );
  assert.deepEqual(apres.champs, []);
  assert.deepEqual(Object.keys(apres.libelles), ["email"]);
});

test("texteNu DÉLÈGUE à la porte commune, liste fermée d'entités comprise", () => {
  // Ce module portait sa propre liste d'entités, écrite à la main : une
  // de plus et il divergeait de `lib/texteBrut.ts`. La liste est FERMÉE
  // et c'est voulu (`M&M ;` est de la prose légitime).
  assert.equal(texteNu("<b>Prénom</b>&nbsp;:"), "Prénom :");
  assert.equal(texteNu("Ton&#160;adresse"), "Ton adresse");
  assert.equal(texteNu("a &amp; b"), "a & b");
  assert.equal(texteNu("&eacute;"), "&eacute;");
});

// ── Ce que les écrans DOIVENT appeler ──────────────────────────────────

const MODULE = "lib/quiz/champsCapture.ts";

test("le module est identique à l'octet près chez le jumeau", () => {
  // Le jumeau, c'est l'AUTRE dépôt : `../tiquiz` depuis Tipote existe,
  // et `../tiquiz` depuis Tiquiz existe AUSSI (c'est nous). Un test qui
  // se compare à lui-même ne peut plus échouer, donc on écarte le chemin
  // qui désigne le fichier qu'on vient de lire.
  const ici = resolve(MODULE);
  const jumeau = ["../tiquiz/" + MODULE, "../tipote-app/" + MODULE]
    .map((p) => resolve(p))
    .find((p) => p !== ici && existsSync(p));
  if (!jumeau) return; // l'autre dépôt n'est pas monté ici
  assert.equal(
    readFileSync(ici, "utf8"),
    readFileSync(jumeau, "utf8"),
    "lib/quiz/champsCapture.ts a divergé entre les deux dépôts",
  );
});

test("le viewer public appelle le module, il ne recompose plus le formulaire", () => {
  const src = lire("components/quiz/PublicQuizClient.tsx");
  assert.match(src, /resoudreChampsCapture\(/, "le viewer n'appelle plus resoudreChampsCapture");
  assert.match(src, /grouperEnLignes\(/, "le viewer regroupe les champs à la main");
  assert.match(src, /mode: "visiteur"/, "le viewer doit dire QUI regarde");
  // Les cinq champs intégrés ne se rendent plus un par un : c'est ça qui
  // laissait le libellé de la créatrice hors de l'écran.
  for (const mort of ["t.firstNamePlaceholder}", "t.lastNamePlaceholder}", "t.phonePlaceholder}", "t.countryPlaceholder}"]) {
    assert.equal(src.includes(mort), false, `le viewer rend encore ${mort} en dur`);
  }
});

test("les deux aperçus appellent le MÊME module, en mode apercu", () => {
  for (const f of ["components/quiz/QuizDetailClient.tsx", "components/quiz/SurveyDetailClient.tsx"]) {
    const src = lire(f);
    assert.match(src, /resoudreChampsCapture\(/, `${f} ne demande pas la liste au module`);
    assert.match(src, /mode: "apercu"/, `${f} doit dire QUI regarde`);
    // Le libellé s'édite en texte riche, le placeholder dans la case grise.
    assert.match(src, /majLibelleCapture\(/, `${f} : le libellé n'est pas éditable`);
    assert.match(src, /majPlaceholderCapture\(/, `${f} : le placeholder n'est pas éditable`);
    // Et les deux écritures passent par le module, jamais par deux
    // setState posés à la main dans le JSX.
    assert.match(src, /appliquerLibelle\(/, `${f} écrit le libellé sans passer par le module`);
    assert.match(src, /appliquerPlaceholder\(/, `${f} écrit le placeholder sans passer par le module`);
    // Un champ supprimé emporte son libellé : l'éditeur de champs rend un
    // tableau entier, c'est ici qu'on rattrape.
    assert.match(src, /elaguerLibelles\(/, `${f} laisse le libellé d'un champ supprimé`);
  }
});

test("le nom d'un champ personnalisé ne s'écrit qu'à UN endroit", () => {
  // La colonne de réglages portait un champ texte pour le nom et un pour
  // l'exemple. Depuis que le libellé est du texte riche posé sur le
  // formulaire, le riche GAGNE à l'affichage : taper dans la colonne
  // n'aurait plus rien changé à l'écran, en silence. Elle garde ce que
  // l'aperçu ne peut pas dire (ajouter, retirer, rendre obligatoire).
  const src = SOURCE_EDITEUR_CAPTURE;
  assert.equal(/modifier\(c\.id, \{ label:/.test(src), false, "le nom se tape encore dans la colonne");
  assert.equal(/modifier\(c\.id, \{ placeholder:/.test(src), false, "l'exemple se tape encore dans la colonne");
  // Ce qui reste, et qui n'a pas sa place dans l'aperçu.
  assert.match(src, /required: e\.target\.checked/, "la colonne doit garder l'obligatoire");
  assert.match(src, /nouvelIdChamp\(/, "la colonne doit garder l'ajout");
  assert.match(src, /champs\.filter\(/, "la colonne doit garder le retrait");
});

test("capture_labels entre dans l'instantané ET dans ses dépendances", () => {
  // Le bug du 16 septembre : la valeur était dans l'objet du memo et pas
  // dans ses dépendances, donc le memo ne se recalculait jamais, donc
  // écrire un libellé ne déclenchait AUCUN enregistrement. Rien ne le
  // disait, et le commentaire promettait l'inverse.
  for (const f of ["components/quiz/QuizDetailClient.tsx", "components/quiz/SurveyDetailClient.tsx"]) {
    const src = lire(f);
    const memo = src.slice(src.indexOf("EditorSnapshot({"));
    const objet = memo.indexOf("capture_labels: captureLabels,");
    const deps = memo.indexOf("}), [");
    assert.notEqual(objet, -1, `${f} : capture_labels absent de l'instantané`);
    assert.notEqual(deps, -1, `${f} : instantané introuvable`);
    assert.equal(objet < deps, true, `${f} : capture_labels doit être DANS l'objet`);
    const listeDeps = memo.slice(deps, memo.indexOf("]);", deps));
    assert.match(listeDeps, /\bcaptureLabels\b/, `${f} : captureLabels manque aux dépendances du memo`);
  }
});

test("la colonne peut ne pas exister : le PATCH se replie et le dit", () => {
  const src = lire("app/api/quiz/[quizId]/route.ts");
  assert.match(src, /sanitizeLibellesCapture\(/, "le serveur écrit capture_labels sans le nettoyer");
  assert.match(src, /capture_labels: _pendingLibelles/, "pas de repli si la migration n'est pas passée");
});
