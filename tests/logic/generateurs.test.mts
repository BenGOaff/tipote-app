// tests/logic/generateurs.test.mts
//
// LA PAGE GÉNÉRATEURS (Béné, 1er septembre 2026).
//
// "On va le faire pour les membres + et les beta/lifetime, ça doit être
// visible pour les membres gratuits et sans plus. On doit le faire bien,
// sur une page générateurs : l'user choisit quel générateur il veut
// utiliser, ensuite il choisit le quiz pour lequel il veut créer, comme
// sur l'Atelier."
//
// Ce test tient les deux décisions qui ne se voient pas à l'écran :
// quel générateur marche sur quel projet, et ce que le quiz sait déjà.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { QUIZ_LANGUAGES } from "@/lib/quizLanguages";
import {
  SEQUENCE_EMAILS,
  SEQUENCE_PROMO,
  planFixe,
  passeParLesPistes,
} from "@/lib/generateurs/sequences";

import {
  GENERATEURS,
  blocageGenerateur,
  demandeUneOffre,
  projetsUtilisables,
} from "@/lib/generateurs/catalogue";
import {
  construireBriefQuiz,
  rendreBriefPourPrompt,
} from "@/lib/generateurs/briefQuiz";
import {
  BLOCS,
  BLOCS_DU_GENERATEUR,
  MAX_PIECES,
  piecesDeLaPiste,
} from "@/lib/generateurs/blocs";
import { SOCLE_GENERATEURS } from "@/lib/prompts/generateurs/socle";
import {
  consigneLangue,
  consignePistes,
  consigneProduction,
  messagePourLeModele,
} from "@/lib/prompts/generateurs/consignes";
import { urlPubliqueProjet } from "@/lib/quiz/urlPublique";
import { inline, urlSure } from "@/lib/bonus/document";

const QUIZ_OK = {
  mode: "quiz",
  nbQuestions: 5,
  profils: [{ titre: "Team Capture", description: "Tu perds tes clients à l'entrée." }],
};

describe("Quel générateur marche sur quel projet", () => {
  test("un QUIZ complet ouvre les trois", () => {
    for (const id of GENERATEURS) {
      assert.equal(blocageGenerateur(id, QUIZ_OK), null, id);
    }
  });

  test("UN SONDAGE n'a pas de profil : bonus et emails sont fermés", () => {
    // Un bonus par profil et une séquence par profil n'ont aucun sens
    // là bas. Les proposer enverrait la créatrice se cogner à un écran
    // de saisie qui ne peut rien produire.
    const sondage = { mode: "survey", nbQuestions: 6, profils: [] };
    assert.equal(blocageGenerateur("bonus", sondage), "sondage");
    assert.equal(blocageGenerateur("emails", sondage), "sondage");
  });

  test("mais on peut PROMOUVOIR un sondage", () => {
    // On y parle du projet et de sa promesse, pas de ses résultats.
    const sondage = { mode: "survey", nbQuestions: 6, profils: [] };
    assert.equal(blocageGenerateur("promo", sondage), null);
  });

  test("des profils VIDES ferment le bonus et les emails", () => {
    // Sans titre ni description, le modèle inventerait le contenu du
    // quiz : c'est le contraire exact de la promesse.
    const vide = { mode: "quiz", nbQuestions: 5, profils: [{ titre: "", description: "" }] };
    assert.equal(blocageGenerateur("bonus", vide), "profils-vides");
    // UN SEUL profil rempli suffit : on écrit pour celui là.
    const partiel = {
      mode: "quiz",
      nbQuestions: 5,
      profils: [{ titre: "", description: "" }, { titre: "Team B", description: "" }],
    };
    assert.equal(blocageGenerateur("bonus", partiel), null);
  });

  test("UN QUIZ SANS QUESTION ne donne rien à exploiter", () => {
    const vide = { mode: "quiz", nbQuestions: 0, profils: QUIZ_OK.profils };
    assert.equal(blocageGenerateur("promo", vide), "quiz-vide");
    assert.equal(blocageGenerateur("bonus", vide), "quiz-vide");
  });

  test("LE SONDAGE PASSE AVANT LES PROFILS VIDES", () => {
    // Dire "tes profils sont vides" à propos d'un sondage enverrait la
    // créatrice remplir un écran qui n'existe pas. On nomme d'abord ce
    // qui ne se répare pas.
    const sondage = { mode: "survey", nbQuestions: 5, profils: [{ titre: "" }] };
    assert.equal(blocageGenerateur("bonus", sondage), "sondage");
  });

  test("le sélecteur ne propose jamais un cul-de-sac", () => {
    const projets = [
      { id: "a", mode: "quiz", nbQuestions: 5, profils: [{ titre: "A" }] },
      { id: "b", mode: "survey", nbQuestions: 5, profils: [] },
      { id: "c", mode: "quiz", nbQuestions: 0, profils: [{ titre: "C" }] },
    ];
    assert.deepEqual(projetsUtilisables("bonus", projets).map((p) => p.id), ["a"]);
    assert.deepEqual(projetsUtilisables("promo", projets).map((p) => p.id), ["a", "b"]);
  });

  test("SEULS le bonus et les emails demandent une offre", () => {
    // Le quiz ne sait rien de ce qu'elle vend : c'est la seule chose
    // qu'elle saisit. La demander pour promouvoir le quiz ferait
    // remplir un champ pour rien.
    assert.equal(demandeUneOffre("bonus"), true);
    assert.equal(demandeUneOffre("emails"), true);
    assert.equal(demandeUneOffre("promo"), false);
  });
});

describe("Le brief vient du quiz, on ne redemande rien", () => {
  const brief = () =>
    construireBriefQuiz({
      quiz: {
        title: '<div class="rt-field-fs" style="--rt-fs-m: 24px">Ton audience te lit ?</div>',
        introduction: "<p>Sache en 2 minutes si ta stratégie te fait perdre des leads.</p>",
        address_form: "vous",
        locale: "fr",
        sio_share_tag_name: "a-partage",
        bonus_description: "Le plan en 3 étapes",
      },
      resultats: [
        {
          title: '<strong>Team Capture</strong> : ton tunnel perd tes clients',
          description: "<p>Tu attires, tu ne captes pas.</p>",
          sio_tag_names: ["team-capture"],
        },
        { title: "", description: "", sio_tag_name: "team-b" },
      ],
      questions: [{}, {}, {}],
      urlPublique: "https://quiz.tipote.com/q/mon-quiz",
    });

  test("LE TEXTE RICHE EST NETTOYÉ, balises comprises", () => {
    // Sans ça, `<div class="rt-field-fs" ...>` part dans le prompt et le
    // modèle écrit du contenu autour de nos balises.
    const b = brief();
    assert.ok(!b.titre.includes("<"), b.titre);
    assert.ok(!b.titre.includes("rt-field-fs"), b.titre);
    assert.match(b.titre, /Ton audience te lit/);
    assert.ok(!b.profils[0].titre.includes("<"), b.profils[0].titre);
    assert.ok(!b.profils[0].description.includes("<"), b.profils[0].description);
  });

  test("le TON du quiz est repris, jamais deviné", () => {
    assert.equal(brief().adresse, "vous");
    // Tout ce qui n'est pas explicitement "vous" est du tutoiement :
    // c'est le défaut de la colonne.
    const tu = construireBriefQuiz({
      quiz: { address_form: null },
      resultats: [],
      questions: [],
      urlPublique: "",
      adresseParDefaut: null,
    });
    assert.equal(tu.adresse, "tu");
  });

  test("le tag d'un profil suit la règle des DEUX champs", () => {
    const b = brief();
    assert.equal(b.profils[0].tag, "team-capture");
    assert.equal(b.profils[1].tag, "team-b");
  });

  test("un profil sans titre garde son RANG", () => {
    const b = brief();
    assert.equal(b.profils[1].titre, "");
    assert.equal(b.profils[1].rang, 2);
  });

  test("L'URL PUBLIQUE VIENT DE L'APPELANT, jamais recalculée ici", () => {
    // Elle dépend du domaine (perso ou le nôtre), et cette décision vit
    // dans `buildPublicUrl`. La recalculer donnerait deux adresses pour
    // le même quiz, et c'est celle du contenu généré qui serait partagée.
    assert.equal(brief().urlPublique, "https://quiz.tipote.com/q/mon-quiz");
  });
});

describe("Le brief écrit pour le prompt", () => {
  test("UN CHAMP VIDE EST OMIS, jamais rendu avec un tiret", () => {
    // Une ligne "BONUS ACTUEL : -" apprend au modèle qu'il a le droit
    // d'inventer.
    const rendu = rendreBriefPourPrompt(
      construireBriefQuiz({
        quiz: { title: "Mon quiz" },
        resultats: [],
        questions: [{}],
        urlPublique: "",
      }),
    );
    assert.ok(!rendu.includes("BONUS DEJA PROMIS"), rendu);
    assert.ok(!rendu.includes("CE QU'IL PROMET"), rendu);
    assert.ok(!/:\s*-\s*$/m.test(rendu), rendu);
  });

  test("le TON est écrit en toutes lettres, pas en code", () => {
    // "TON : vous" laisserait le modèle décider ce que ça veut dire.
    const vous = rendreBriefPourPrompt(
      construireBriefQuiz({
        quiz: { title: "Q", address_form: "vous" },
        resultats: [],
        questions: [{}],
        urlPublique: "",
      }),
    );
    assert.match(vous, /vouvoiement/i);
  });

  test("les profils sortent NUMÉROTÉS, dans l'ordre", () => {
    const rendu = rendreBriefPourPrompt(
      construireBriefQuiz({
        quiz: { title: "Q" },
        resultats: [{ title: "A", description: "da" }, { title: "B" }],
        questions: [{}],
        urlPublique: "",
      }),
    );
    assert.match(rendu, /1\. A : da/);
    assert.match(rendu, /2\. B/);
  });

  test("un profil sans titre est nommé par son rang, pas laissé vide", () => {
    const rendu = rendreBriefPourPrompt(
      construireBriefQuiz({
        quiz: { title: "Q" },
        resultats: [{ title: "", description: "sans nom" }],
        questions: [{}],
        urlPublique: "",
      }),
    );
    assert.match(rendu, /1\. Profil 1 : sans nom/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Les morceaux : ce qui protège la créatrice d'un JSON brut à l'écran
// ─────────────────────────────────────────────────────────────────────

describe("Les morceaux à produire, un par un", () => {
  test("le bonus impose SES trois blocs, le modèle ne décide pas", () => {
    // Un modèle à qui on demanderait de quoi il a besoin en oublierait
    // un une fois sur trois, et la créatrice se retrouverait avec un
    // bonus qu'elle ne sait pas livrer (retour Béné, 5 août).
    const pieces = piecesDeLaPiste("bonus", [{ bloc: "email", resume: "n'importe quoi" }]);
    assert.deepEqual(
      pieces.map((p) => p.bloc),
      ["contenu", "guide", "remise"],
    );
  });

  test("le générateur d'emails écrit des EMAILS, pas des pistes", () => {
    // Béné, 2 septembre 2026 : "le générateur d'emails ne génère pas
    // 'des pistes' mais des emails putain t'as fait n'imp." J'avais fait
    // passer les TROIS générateurs par l'étape des pistes, alors qu'elle
    // ne veut dire quelque chose que pour le bonus (une CRÉATION à
    // choisir). Une séquence post-quiz a des temps fixes : elle se
    // déroule, elle ne se choisit pas.
    assert.equal(passeParLesPistes("bonus"), true);
    assert.equal(passeParLesPistes("emails"), false);
    assert.equal(passeParLesPistes("promo"), false);
  });

  test("la séquence est FIXE, et ce que le modèle propose est ignoré", () => {
    // Même en lui envoyant n'importe quoi, on obtient les cinq temps.
    const pieces = piecesDeLaPiste("emails", [
      { bloc: "post", index: 9, resume: "n'importe quoi" },
      { bloc: "contenu", index: 1, resume: "et encore autre chose" },
    ]);
    assert.equal(pieces.length, SEQUENCE_EMAILS.length);
    assert.deepEqual(
      pieces.map((p) => p.index),
      [1, 2, 3, 4, 5],
    );
    assert.ok(pieces.every((p) => p.bloc === "email"), "un temps n'est pas un email");
  });

  test("chaque temps porte SON intention, sinon le modèle réécrit le premier", () => {
    const pieces = piecesDeLaPiste("emails", []);
    const intentions = new Set(pieces.map((p) => p.resume));
    assert.equal(intentions.size, pieces.length, "deux temps portent la même intention");
    for (const p of pieces) {
      assert.ok(p.resume.length > 40, "une intention trop courte ne distingue rien");
      assert.ok(p.cle, "un temps sans clé ne peut pas être traduit");
    }
  });

  test("un SEUL email de la séquence vend, et c'est le quatrième", () => {
    // C'est ce qui rend les trois premiers credibles. Porté de
    // l'Atelier, où les cinq temps sont enseignés dans la formation.
    const vendeurs = SEQUENCE_EMAILS.filter((t) => /appel à l'action commercial/i.test(t.intention));
    assert.equal(vendeurs.length, 1);
    assert.equal(SEQUENCE_EMAILS.indexOf(vendeurs[0]), 3);
  });

  test("la promo numérote ses emails et ses posts SÉPARÉMENT", () => {
    const pieces = piecesDeLaPiste("promo", []);
    const emails = pieces.filter((p) => p.bloc === "email").map((p) => p.index);
    const posts = pieces.filter((p) => p.bloc === "post").map((p) => p.index);
    assert.deepEqual(emails, [1, 2, 3]);
    assert.deepEqual(posts, [1, 2, 3, 4]);
  });

  test("les quatre posts de promo attaquent par quatre angles différents", () => {
    // Quatre posts qui disent la même chose autrement, c'est un post
    // publié quatre fois, et l'audience le voit.
    const posts = SEQUENCE_PROMO.filter((t) => t.bloc === "post");
    assert.equal(new Set(posts.map((t) => t.cle)).size, posts.length);
    assert.equal(new Set(posts.map((t) => t.intention)).size, posts.length);
  });

  test("un plan fixe ne déborde jamais de son plafond", () => {
    for (const id of ["emails", "promo"] as const) {
      assert.ok(
        piecesDeLaPiste(id, []).length <= MAX_PIECES[id],
        `${id} produit plus de morceaux que son plafond`,
      );
    }
  });

  test("le bonus, lui, garde ses pistes et ses trois blocs", () => {
    const pieces = piecesDeLaPiste("bonus", []);
    assert.deepEqual(
      pieces.map((p) => p.bloc),
      ["contenu", "guide", "remise"],
    );
    assert.equal(planFixe("bonus"), null, "le bonus s'est vu poser un plan fixe");
  });

  test("chaque générateur a au moins un bloc, et tous sont connus", () => {
    for (const id of GENERATEURS) {
      const blocs = BLOCS_DU_GENERATEUR[id];
      assert.ok(blocs.length > 0, `${id} ne produit rien`);
      for (const b of blocs) assert.ok(BLOCS.includes(b), `${id} : bloc inconnu ${b}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Le prompt est du CODE : il se teste (règle du 3 août)
// ─────────────────────────────────────────────────────────────────────

const BRIEF_TEST = construireBriefQuiz({
  quiz: {
    title: "Quel est ton style de vente",
    introduction: "Découvre ce qui bloque tes ventes",
    address_form: "tu",
    locale: "fr",
  },
  resultats: [
    { title: "La discrète", description: "tu n'oses pas proposer" },
    { title: "La bavarde", description: "tu expliques trop" },
  ],
  questions: [1, 2, 3, 4, 5],
  urlPublique: "https://quiz.tipote.com/q/style-de-vente",
});

describe("Le socle des générateurs", () => {
  test("il est assez long pour que le cache d'Anthropic s'accroche", () => {
    // 1024 tokens minimum pour Sonnet. En dessous, Anthropic ignore le
    // cache_control EN SILENCE : aucune erreur, juste une facture
    // pleine. ~4 caractères par token en français, donc 4096 au plancher
    // strict ; on exige large pour ne pas passer dessous au premier
    // paragraphe retiré.
    assert.ok(
      SOCLE_GENERATEURS.length > 5000,
      `socle trop court (${SOCLE_GENERATEURS.length} caracteres) : le cache ne prendra pas`,
    );
  });

  test("il n'interpole RIEN : c'est ce qui le rend cachable", () => {
    // Le cache est un préfixe EXACT. Une seule valeur du brief glissée
    // ici et le socle change à chaque appel : on paie l'écriture du
    // cache sans jamais le relire, donc pire que pas de cache.
    assert.ok(!/\$\{/.test(SOCLE_GENERATEURS), "le socle porte une interpolation");
  });

  test("il ne montre pas au modèle ce qu'il lui interdit", () => {
    // Faute trouvée le 3 août dans le prompt de génération de quiz : un
    // tiret cadratin dans le gabarit de sortie, dix lignes sous la
    // règle qui les bannit.
    assert.ok(!SOCLE_GENERATEURS.includes("—"), "tiret cadratin dans le socle");
    assert.ok(!SOCLE_GENERATEURS.includes("–"), "tiret demi-cadratin dans le socle");
  });

  test("il dit les trois règles qui coûtent le plus cher quand on les oublie", () => {
    assert.match(SOCLE_GENERATEURS, /LANGUE DU QUIZ/i);
    assert.match(SOCLE_GENERATEURS, /tiret cadratin/i);
    assert.match(SOCLE_GENERATEURS, /FÉMININ/i);
  });

  // -- CE QUI FAIT LA QUALITÉ, ET QUI MANQUAIT (Béné, 3 septembre 2026)
  //
  // "T'es sûr d'avoir utilisé les mêmes prompts pour les générateurs de
  // bonus et les emails ? Je les trouve moins bien que sur l'Atelier."
  //
  // Elle avait raison, et c'était mesurable : les cinq temps de la
  // séquence étaient bien portés mot pour mot, mais le reste du prompt
  // était une RÉÉCRITURE, et trois blocs de l'Atelier n'y étaient pas du
  // tout. Ces trois tests les figent : sans eux, la prochaine passe les
  // reperdrait sans qu'une seule ligne rougisse.

  test("il porte le test qui tranche : le texte d'un concurrent avec un autre logo", () => {
    assert.match(SOCLE_GENERATEURS, /changeant son logo/i);
  });

  test("il porte les puces promesses en DEUX temps", () => {
    assert.match(SOCLE_GENERATEURS, /CONSÉQUENCE CONCRÈTE/i);
    // Le deuxième temps est ce qui sépare une promesse d'un sommaire.
    assert.match(SOCLE_GENERATEURS, /table des matières/i);
  });

  test("il nomme le moment psychologique, pas seulement le métier", () => {
    // Sans lui, le modèle écrit du contenu de blog : correct, et qui
    // ignore que la personne vient de recevoir un résultat sur elle même.
    assert.match(SOCLE_GENERATEURS, /prise de conscience/i);
  });
});

describe("Les consignes de chaque étape", () => {
  test("le bonus reçoit les 4 piliers, et eux seuls les reçoivent", () => {
    // Portés de l'Atelier (lib/prompts/bonus.ts). Ils sont dans la partie
    // VARIABLE et pas dans le socle : les coller dans le socle les ferait
    // payer sur chaque email et chaque post, qui n'en ont que faire.
    const bonus = consignePistes("bonus", BRIEF_TEST);
    for (const pilier of ["URGENCE", "SPÉCIFICITÉ", "ACCESSIBILITÉ", "CONTINUITÉ"]) {
      assert.ok(bonus.includes(pilier), `le pilier ${pilier} a disparu de la consigne bonus`);
    }
    // CONTINUITÉ est celui qui fait qu'un bonus VEND : un bonus qui se
    // suffit à lui même ne mène à rien.
    assert.match(bonus, /vide que SEULE l'offre payante comble/i);
    assert.ok(
      !SOCLE_GENERATEURS.includes("LES 4 PILIERS"),
      "les piliers sont bonus-spécifiques : ils n'ont rien à faire dans le socle",
    );
  });

  test("la langue est NOMMÉE, et c'est le catalogue des 100 qui la nomme", () => {
    // Béné, 2 septembre 2026 : "on doit offrir la même qualité à toutes
    // les langues prises en charge". J'avais écrit ici une table de SEPT
    // langues, celles de l'interface : un quiz en japonais sortait avec
    // "la langue de code ja". `buildLanguageDirective` couvre les 100 du
    // catalogue, avec le nom natif et les notes régionales.
    assert.match(consigneLangue("pt-BR"), /Portuguese|Português/);
    assert.match(consigneLangue("ar"), /Arabic|العربية/);
    assert.match(consigneLangue("es"), /Spanish|Español/);
    // Une langue hors interface est servie AUSSI BIEN que les sept.
    assert.match(consigneLangue("ja"), /Japanese|日本語/);
    assert.match(consigneLangue("de"), /German|Deutsch/);
  });

  test("les notes régionales partent avec la langue", () => {
    // C'est ce qui distingue "ordenador" de "computadora", et c'est ce
    // que la table à sept entrées ne pouvait pas dire.
    const avecNotes = QUIZ_LANGUAGES.filter((l) => (l.regionalNotes ?? "").trim().length > 0);
    assert.ok(avecNotes.length > 0, "le catalogue ne porte plus de notes régionales");
    for (const l of avecNotes.slice(0, 5)) {
      assert.ok(
        consigneLangue(l.code).includes(l.regionalNotes!.slice(0, 30)),
        `${l.code} perd ses notes régionales en route`,
      );
    }
  });

  test("une langue inconnue ne retombe PAS sur le français", () => {
    // Servir du français à quelqu'un qui écrit dans une langue qu'on ne
    // connaît pas a l'air de marcher, et c'est pire qu'une erreur
    // (leçon du robot d'aide, 31 août).
    const c = consigneLangue("zz-ZZ");
    assert.ok(!/français|French/i.test(c), c);
    assert.match(c, /zz-ZZ/);
  });

  test("le ton du quiz est imposé, pas redemandé", () => {
    const vous = { ...BRIEF_TEST, adresse: "vous" as const };
    assert.match(consignePistes("bonus", vous), /VOUVOIES/);
    assert.match(consignePistes("bonus", BRIEF_TEST), /TUTOIES/);
  });

  test("le gabarit JSON des pistes n'a pas de tiret cadratin", () => {
    for (const id of GENERATEURS) {
      const c = consignePistes(id, BRIEF_TEST);
      assert.ok(!c.includes("—"), `${id} : tiret cadratin dans la consigne`);
    }
  });

  test("seuls les générateurs à série demandent des `pieces` au modèle", () => {
    // Le bonus a ses trois blocs imposés : les lui redemander lui
    // apprendrait qu'il a le droit d'en choisir d'autres.
    assert.ok(!consignePistes("bonus", BRIEF_TEST).includes('"pieces"'));
    assert.ok(consignePistes("emails", BRIEF_TEST).includes('"pieces"'));
    assert.ok(consignePistes("promo", BRIEF_TEST).includes('"pieces"'));
  });

  test("la production dit POUR QUI on écrit quand il y a un profil", () => {
    const c = consigneProduction({
      id: "emails",
      brief: BRIEF_TEST,
      piece: { bloc: "email", index: 2, resume: "lever l'objection du temps" },
      piste: { titre: "Trois jours", format: "sequence", punchline: "", pourquoi: "", pieces: [] },
      profil: BRIEF_TEST.profils[0],
    });
    assert.match(c, /La discrète/);
    assert.match(c, /lever l'objection du temps/);
    // Sans ça, l'email 2 réécrit l'email 1 sous un autre titre.
    assert.match(c, /N'empiète pas sur eux/);
  });

  test("le lien du quiz n'est donné QUE là où il doit apparaître", () => {
    const piste = { titre: "x", format: "", punchline: "", pourquoi: "", pieces: [] };
    const promo = consigneProduction({
      id: "promo",
      brief: BRIEF_TEST,
      piece: { bloc: "post", index: 1, resume: "" },
      piste,
    });
    assert.match(promo, /style-de-vente/);

    // Le CONTENU du bonus se lit hors ligne : y coller l'adresse du quiz
    // ferait renvoyer le lecteur vers le quiz qu'il vient de finir.
    const bonus = consigneProduction({
      id: "bonus",
      brief: BRIEF_TEST,
      piece: { bloc: "contenu", index: 1, resume: "" },
      piste,
    });
    assert.ok(!bonus.includes("style-de-vente"), bonus);
  });

  test("le message porte l'offre quand il y en a une, et rien sinon", () => {
    const avec = messagePourLeModele({
      brief: BRIEF_TEST,
      offres: [
        { promesse: "un programme de 6 semaines", format: "groupe", prix: "497 €", profils: [] },
      ],
      demande: "Vas y.",
    });
    assert.match(avec, /6 semaines/);
    assert.match(avec, /497 €/);

    const sans = messagePourLeModele({ brief: BRIEF_TEST, offres: [], demande: "Vas y." });
    assert.ok(!sans.includes("OFFRE PAYANTE"), sans);
    // Une ligne "OFFRE : -" apprendrait au modèle qu'il a le droit d'en
    // inventer une.
    assert.ok(!/\n-\s*$/m.test(sans), sans);
  });
});

// ─────────────────────────────────────────────────────────────────────
// L'adresse publique : la MÊME règle que l'éditeur
// ─────────────────────────────────────────────────────────────────────

describe("L'adresse publique d'un projet", () => {
  test("sur notre domaine, le chemin porte son préfixe", () => {
    assert.equal(
      urlPubliqueProjet({
        origine: "https://quiz.tipote.com",
        kind: "q",
        segment: "mon-quiz",
        surDomainePerso: false,
      }),
      "https://quiz.tipote.com/q/mon-quiz",
    );
  });

  test("sur un domaine perso, le slug est servi à la racine", () => {
    // Le middleware réécrit vers /s/<slug> : l'adresse vue par le
    // visiteur, elle, n'a pas de préfixe (note du 4 août).
    assert.equal(
      urlPubliqueProjet({
        origine: "https://exemple.fr",
        kind: "q",
        segment: "mon-quiz",
        surDomainePerso: true,
      }),
      "https://exemple.fr/mon-quiz",
    );
  });

  test("la mécanique est un PARAMÈTRE, jamais devinée à la forme de l'adresse", () => {
    // Deviner marcherait aujourd'hui et casserait le jour où quelqu'un
    // branche un domaine qui ressemble au nôtre.
    const memeOrigine = { origine: "https://quiz.tipote.com", kind: "q" as const, segment: "x" };
    assert.notEqual(
      urlPubliqueProjet({ ...memeOrigine, surDomainePerso: true }),
      urlPubliqueProjet({ ...memeOrigine, surDomainePerso: false }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Le contenu s'AFFICHE : on ne montre jamais notre format de travail
// ─────────────────────────────────────────────────────────────────────

describe("Le rendu d'un contenu généré", () => {
  // -- LE MÊME RENDU PARTOUT, ET IL EST TESTABLE ----------------------
  //
  // Béné, 3 septembre 2026 : "je veux exactement la même chose sur
  // l'atelier et sur tiquiz. Pareil. Ni plus, ni moins."
  //
  // `markdownVersHtml` était notre rendu à nous, à côté de celui de
  // l'Atelier : le même contenu s'affichait de deux façons selon l'app
  // où on le lisait. Il est SUPPRIMÉ, pas laissé sans appelant : un
  // module mort est un piège que le prochain passage rebranche en
  // croyant réparer.

  test("le gras, l'italique, le code et les liens sont rendus", () => {
    for (const cible of ["ecran", "impression"] as const) {
      assert.match(inline("un **mot** en gras", cible), /<strong>mot<\/strong>/);
      assert.match(inline("un *mot* en italique", cible), /<em>mot<\/em>/);
      assert.match(inline("du `code` ici", cible), /<code>code<\/code>/);
      assert.match(
        inline("[le quiz](https://quiz.tipote.com/q/x)", cible),
        /<a href="https:\/\/quiz\.tipote\.com\/q\/x"/,
      );
    }
  });

  test("un lien écrit par un modèle ne peut pas exécuter de script", () => {
    // Ce texte vient d'un modèle, donc d'ailleurs, et il finit dans un
    // `innerHTML`. C'est une règle de SÉCURITÉ.
    for (const cible of ["ecran", "impression"] as const) {
      for (const mauvais of ["javascript:alert(1)", "data:text/html,<script>", "vbscript:x"]) {
        assert.doesNotMatch(inline(`[clique](${mauvais})`, cible), /<a /, mauvais);
      }
      const html = inline('Attention <script>alert("x")</script>', cible);
      assert.doesNotMatch(html, /<script/);
      assert.match(html, /&lt;script&gt;/);
      assert.match(inline('il a dit "oui"', cible), /&quot;oui&quot;/);
    }
    assert.equal(urlSure("javascript:alert(1)"), null);
    assert.equal(urlSure("https://quiz.tipote.com"), "https://quiz.tipote.com");
  });

  test("à l'écran un lien ouvre un onglet, à l'impression non", () => {
    // Un visiteur ne doit jamais perdre sa page ; sur une feuille
    // imprimée, `target` ne veut rien dire. C'est un PARAMÈTRE, pas une
    // déduction.
    assert.match(inline("[a](https://x.fr)", "ecran"), /target="_blank" rel="noopener noreferrer"/);
    assert.doesNotMatch(inline("[a](https://x.fr)", "impression"), /target="_blank"/);
  });
});
