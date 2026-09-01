// tests/logic/generateurs-credits.test.mts
//
// CE QUE COÛTE UNE GÉNÉRATION (Béné, 1er septembre 2026).
//
// "Pour Tipote : dispo pour tout le monde qui paye, mais consomme des
// crédits. Calcule le nombre cohérent de crédits vis à vis de la
// consommation estimée de tokens pour chaque appel."
//
// Ce fichier n'existe QUE dans Tipote : Tiquiz n'a pas de crédits. Il
// fige les deux choses qui rendraient le barème faux sans que personne
// ne le voie : un bloc oublié (donc gratuit en silence) et un prix qui
// s'écarte de ce que le MÊME livrable coûte ailleurs dans l'app.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { BLOCS, type Piece } from "@/lib/generateurs/blocs";
import { GENERATEURS } from "@/lib/generateurs/catalogue";
import {
  COUT_INDICATIF,
  COUT_PAR_BLOC,
  COUT_PISTES,
  coutMorceau,
  coutTotalPiste,
} from "@/lib/generateurs/credits";

/**
 * LE BARÈME DE TIPOTE, relevé dans le code le 1er septembre 2026.
 *
 * Il n'est pas importable : chaque route porte le sien (`CREDIT_COSTS`
 * dans content/generate, un `6` en dur dans quiz/generate...). Le
 * recopier ici est donc le seul moyen de comparer, et c'est justement
 * ce que le test doit faire : si l'un des deux bouge, le nôtre doit
 * bouger avec, sinon le même livrable coûte deux prix selon l'écran où
 * on le demande.
 */
const BAREME_EXISTANT = {
  email: 1, // app/api/content/generate : un email de vente ou de newsletter
  post: 1, // idem : un post
  article: 4, // idem : un article de blog
  quizEntier: 6, // app/api/quiz/generate
  analyse: 1, // insights, persona, concurrence, sondage
};

describe("Le barème des générateurs", () => {
  test("aucun bloc n'est gratuit, et aucun n'est oublié", () => {
    // Un bloc absent de la table serait facturé par le repli, donc
    // silencieusement mal facturé. Un bloc à zéro serait un appel
    // Anthropic qu'on paie sans jamais le compter.
    for (const bloc of BLOCS) {
      assert.ok(bloc in COUT_PAR_BLOC, `le bloc "${bloc}" n'a pas de prix`);
      assert.ok(COUT_PAR_BLOC[bloc] > 0, `le bloc "${bloc}" est gratuit`);
    }
    assert.ok(COUT_PISTES > 0, "l'étape des pistes est gratuite");
  });

  test("un email de séquence coûte le même prix qu'un email écrit dans Créer", () => {
    // C'EST L'ARGUMENT QUI TIENT TOUT LE BARÈME. Plus cher ici, et la
    // créatrice écrit ses emails un par un dans l'autre écran, donc le
    // générateur ne sert à rien. Moins cher, et c'est "Créer" qui
    // devient le mauvais chemin.
    assert.equal(coutMorceau("email"), BAREME_EXISTANT.email);
  });

  test("le bonus entier coûte le prix d'un article de blog", () => {
    // C'est le même travail : un document long, structuré, qui se lit
    // hors ligne. ~4000 tokens de sortie des deux côtés.
    assert.equal(coutMorceau("contenu"), BAREME_EXISTANT.article);
  });

  test("un post coûte moins qu'un email : il est deux fois plus court", () => {
    assert.ok(coutMorceau("post") < coutMorceau("email"));
    // 0,5 existe déjà dans ce dépôt (chat d'idée, variantes genrées) :
    // le barème n'a pas besoin d'une granularité de plus.
    assert.equal(coutMorceau("post"), 0.5);
  });

  test("les documents courts du bonus sont au prix d'une analyse", () => {
    // ~1200 et ~900 tokens de sortie, comme une analyse IA (2000 de
    // plafond). Le calcul donnait 1,4 et 1,1 : on arrondit VERS LE BAS.
    // Sous-facturer coûte quelques centimes ; sur-facturer fait douter
    // du compteur, et un compteur en qui on n'a pas confiance empêche
    // d'utiliser l'outil.
    assert.equal(coutMorceau("guide"), BAREME_EXISTANT.analyse);
    assert.equal(coutMorceau("remise"), BAREME_EXISTANT.analyse);
  });

  test("le total d'une piste est la somme de ses morceaux", () => {
    const pieces: Piece[] = [
      { bloc: "email", index: 1, resume: "" },
      { bloc: "email", index: 2, resume: "" },
      { bloc: "post", index: 1, resume: "" },
    ];
    assert.equal(coutTotalPiste(pieces), 2.5);
    assert.equal(coutTotalPiste([]), 0);
  });

  test("les trois générateurs coûtent l'ordre de grandeur d'un quiz", () => {
    // On écrit tout ce qui vient APRÈS le quiz : ça ne doit pas coûter
    // beaucoup plus cher que le quiz lui même, sinon personne ne le
    // lance deux fois.
    for (const id of GENERATEURS) {
      const annonce = COUT_INDICATIF[id];
      assert.ok(annonce > 0, `${id} est annoncé gratuit`);
      assert.ok(
        annonce <= BAREME_EXISTANT.quizEntier + 2,
        `${id} annonce ${annonce} credits, soit bien plus qu'un quiz entier (${BAREME_EXISTANT.quizEntier})`,
      );
    }
  });

  test("le coût indicatif du bonus est celui de ses trois blocs imposés", () => {
    // Les trois blocs du bonus ne sont PAS choisis par le modèle : le
    // chiffre annoncé sur la carte est donc exact, pas approché.
    const impose: Piece[] = [
      { bloc: "contenu", index: 1, resume: "" },
      { bloc: "guide", index: 2, resume: "" },
      { bloc: "remise", index: 3, resume: "" },
    ];
    assert.equal(COUT_INDICATIF.bonus, COUT_PISTES + coutTotalPiste(impose));
  });

  test("les deux autres annoncent une composition qui existe vraiment", () => {
    // emails : une séquence de 5. promo : 3 emails et 4 posts.
    const sequence: Piece[] = Array.from({ length: 5 }, (_, i) => ({
      bloc: "email" as const,
      index: i + 1,
      resume: "",
    }));
    assert.equal(COUT_INDICATIF.emails, COUT_PISTES + coutTotalPiste(sequence));

    const campagne: Piece[] = [
      ...Array.from({ length: 3 }, (_, i) => ({ bloc: "email" as const, index: i + 1, resume: "" })),
      ...Array.from({ length: 4 }, (_, i) => ({ bloc: "post" as const, index: i + 1, resume: "" })),
    ];
    assert.equal(COUT_INDICATIF.promo, COUT_PISTES + coutTotalPiste(campagne));
  });
});
