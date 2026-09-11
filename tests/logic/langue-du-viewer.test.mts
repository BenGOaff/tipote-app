// tests/logic/langue-du-viewer.test.mts
//
// Retour d'un client anglophone, 7 septembre 2026 : "some parts of the
// quiz UI were in French (eg. the message that your answers are saved)
// - I did set the language to English - this should be fixed." Et :
// "the quiz was just showing white, including the demo on the Tiquiz
// website... this made me lose the most confidence in the solution."
//
// Il avait raison sur les deux. Ce fichier fige ce qui a ete corrige,
// et il a ete verifie en rejouant les versions d'avant.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import {
  MESSAGES_APERCU,
  messagesApercu,
  repliLangue,
} from "@/lib/quiz/langueViewer";
import { MESSAGES_PANNE, messagePanne } from "@/lib/site/messagesPanne";

const racine = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Les commentaires sont retires AVANT toute mesure : un test qui cherche
// la presence de quelque chose dans un fichier tombe sinon sur sa propre
// explication (leçon du 3 septembre, trois fois).
const sansCommentaires = (t: string) =>
  t.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ").replace(/^\s*\/\/.*$/gm, " ");

const VIEWER = sansCommentaires(racine("components/quiz/PublicQuizClient.tsx"));
const PAGE_QUIZ = sansCommentaires(racine("app/q/[quizId]/page.tsx"));

describe("un quiz regle en anglais ne parle pas francais", () => {
  test("le repli de langue suit la base BCP-47, il ne retombe pas sur le defaut", () => {
    const table = { fr: "FR", pt: "PT", en: "EN" };
    // Le cas exact du bug : `pt-BR` est proposee dans le selecteur de
    // l'editeur, et RESUME_COPY n'avait pas de repli, donc un quiz
    // bresilien prenait la phrase FRANCAISE.
    assert.equal(repliLangue("pt-BR", table, "fr"), "PT");
    assert.equal(repliLangue("pt", table, "fr"), "PT");
    assert.equal(repliLangue("en", table, "fr"), "EN");
    assert.equal(repliLangue("ja", table, "fr"), "FR");
    assert.equal(repliLangue(null, table, "fr"), "FR");
    assert.equal(repliLangue("", table, "fr"), "FR");
  });

  test("chaque langue proposee dans l'editeur a ses phrases d'apercu", () => {
    for (const loc of SUPPORTED_LOCALES) {
      const m = messagesApercu(loc);
      assert.ok(m.brouillonTitre.length > 3, `apercu manquant pour ${loc}`);
      assert.ok(m.brouillonCorps.length > 20, `corps manquant pour ${loc}`);
      assert.ok(m.banniere(null).length > 5, `banniere manquante pour ${loc}`);
      if (loc !== "fr") {
        // Le repli sur le francais est exactement le bug qu'il a vu.
        assert.notEqual(
          m.brouillonCorps,
          MESSAGES_APERCU.fr.brouillonCorps,
          `${loc} retombe sur le texte francais`,
        );
      }
    }
  });

  test("les phrases anglaises ne portent aucun mot francais", () => {
    const en = messagesApercu("en");
    const suspect = /\b(le|la|les|ton|ta|tes|votre|pas|encore|depuis|aperçu|enregistré|publié)\b/i;
    assert.ok(!suspect.test(en.brouillonTitre), en.brouillonTitre);
    assert.ok(!suspect.test(en.brouillonCorps), en.brouillonCorps);
    assert.ok(!suspect.test(en.banniere("Ben")), en.banniere("Ben"));
  });

  test("le vouvoiement ne joue qu'en francais", () => {
    assert.notEqual(
      messagesApercu("fr", "vous").brouillonTitre,
      messagesApercu("fr", "tu").brouillonTitre,
    );
    assert.equal(
      messagesApercu("en", "vous").brouillonTitre,
      messagesApercu("en").brouillonTitre,
    );
  });

  test("le viewer DELEGUE : plus une seule phrase d'apercu ecrite en dur", () => {
    assert.ok(
      VIEWER.includes("messagesApercu("),
      "le viewer n'appelle pas messagesApercu",
    );
    // Les deux chaines exactes qui ont fuite. Elles ne doivent plus
    // exister nulle part dans le composant.
    assert.ok(!VIEWER.includes("Mode aperçu"), "la banniere est encore ecrite en dur");
    assert.ok(
      !VIEWER.includes("Aperçu de ton brouillon"),
      "le toast du brouillon est encore ecrit en dur",
    );
  });

  test("le bandeau de reprise passe par le MEME repli que le reste", () => {
    // C'est la phrase qu'il cite : "the message that your answers are
    // saved". RESUME_COPY n'avait aucun repli BCP-47, donc un quiz
    // `pt-BR` y prenait la ligne FRANCAISE au milieu d'un quiz portugais.
    assert.ok(
      /repliLangue\(\s*locale,\s*RESUME_COPY/.test(VIEWER),
      "RESUME_COPY n'est pas resolu par le repli partage",
    );
    assert.ok(
      !/RESUME_COPY\[locale/.test(VIEWER),
      "RESUME_COPY est encore indexe a la main, sans repli",
    );
  });

  test("les DEUX ecrans d'erreur du viewer ne parlent plus francais a tout le monde", () => {
    // `getT(null)` rend le francais. Sur un ecran d'erreur, la langue du
    // quiz est inconnue : on prend celle du navigateur.
    assert.ok(VIEWER.includes("getTErreur("), "getTErreur n'est pas appele");
    assert.ok(
      !/setError\(getT\(/.test(VIEWER),
      "un ecran d'erreur appelle encore getT directement",
    );
  });
});

describe("une page blanche dit toujours quelque chose", () => {
  test("les deux error boundary existent", () => {
    for (const p of ["app/global-error.tsx", "app/q/[quizId]/error.tsx"]) {
      const src = racine(p);
      assert.ok(src.includes('"use client"'), `${p} n'est pas un composant client`);
      assert.ok(src.includes("messagePanne("), `${p} n'affiche aucun message`);
      assert.ok(src.includes("reset"), `${p} ne propose pas de recharger`);
    }
  });

  test("chaque langue proposee dans l'editeur a son message de panne", () => {
    for (const loc of SUPPORTED_LOCALES) {
      const m = messagePanne(loc);
      assert.ok(m.titre.length > 5, `titre manquant pour ${loc}`);
      assert.ok(m.corps.length > 20, `corps manquant pour ${loc}`);
      assert.ok(m.recharger.length > 3, `bouton manquant pour ${loc}`);
      if (loc !== "fr") {
        assert.notEqual(m.corps, MESSAGES_PANNE.fr.corps, `${loc} retombe sur le francais`);
      }
    }
  });
});

describe("le JSON-LD et les pixels d'un quiz public etaient absents, en silence", () => {
  test("on ne demande plus a `quizzes` des colonnes qui n'y sont pas", () => {
    // `questions` vit dans la table `quiz_questions`, `content_locale`
    // vit sur `business_profiles` : le select entier etait rejete par
    // PostgREST, donc `full` valait null, donc la page ne rendait NI
    // JSON-LD NI pixels. Mesure du 7 septembre sur
    // app.tipote.com/q/chemindepuissance : zero balise ld+json.
    const selects = [...PAGE_QUIZ.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]);
    for (const sel of selects) {
      assert.ok(!/\bquestions\b/.test(sel), `select interdit sur quizzes : ${sel}`);
      assert.ok(!/\bcontent_locale\b/.test(sel), `select interdit sur quizzes : ${sel}`);
    }
  });

  test("le nombre de questions se COMPTE, il ne se telecharge pas", () => {
    assert.ok(
      /from\("quiz_questions"\)[\s\S]{0,200}head:\s*true/.test(PAGE_QUIZ),
      "le compte des questions ne passe pas par un head count",
    );
  });

  test("les erreurs de ces requetes sont LUES", () => {
    assert.ok(/fullErr/.test(PAGE_QUIZ), "l'erreur du select principal n'est pas lue");
    assert.ok(
      /nombre de questions illisible/.test(PAGE_QUIZ),
      "l'erreur du compte n'est pas lue",
    );
  });
});

describe("le domaine perso d'une creatrice ne sert que SES quiz", () => {
  // Porte de Tiquiz, 9 septembre 2026. `resolveCustomDomainScope`
  // rendait `null` aussi bien pour "on n'est pas sur un domaine perso"
  // que pour "la requete a echoue" : dans le second cas le controle de
  // locataire etait donc SAUTE, et le domaine d'une creatrice pouvait
  // servir le quiz de quelqu'un d'autre. Le module quiz de Tiquiz est
  // jumeau : un garde-fou qui ne protege qu'un des deux ne protege
  // personne.
  test("les trois etats sont distingues", () => {
    assert.match(PAGE_QUIZ, /surUnDomainePerso: false/);
    assert.match(PAGE_QUIZ, /surUnDomainePerso: true, lisible: false/);
    assert.match(PAGE_QUIZ, /surUnDomainePerso: true, lisible: true/);
  });

  test("un registre illisible ne sert RIEN", () => {
    // Le sens du repli est asymetrique : un 404 de trop pendant une
    // panne coute une page, servir sans verifier coute le quiz d'une
    // creatrice affiche chez une autre.
    assert.match(PAGE_QUIZ, /if \(!locataire\.lisible\) notFound\(\);/);
  });

  test("l'erreur du registre est CRIEE", () => {
    assert.match(PAGE_QUIZ, /registre des domaines perso illisible/);
  });
});

describe("aucun tiret cadratin dans ce qui est vu par un visiteur", () => {
  test("les deux tables de messages", () => {
    const tout = [
      ...Object.values(MESSAGES_APERCU).flatMap((m) => [m.brouillonTitre, m.brouillonCorps, m.banniere("X")]),
      ...Object.values(MESSAGES_PANNE).flatMap((m) => [m.titre, m.corps, m.recharger]),
    ];
    for (const s of tout) {
      assert.ok(!s.includes("—") && !s.includes("–"), `tiret cadratin : ${s}`);
    }
  });
});
