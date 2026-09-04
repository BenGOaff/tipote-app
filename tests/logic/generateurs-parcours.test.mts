// tests/logic/generateurs-parcours.test.mts
//
// LE PARCOURS, LA SÉQUENCE FIXE, ET LA BIBLIOTHÈQUE.
//
// Béné, 2 septembre 2026, quatre reproches sur les générateurs :
//   - "le générateur de bonus ne fonctionne pas j'ai un message
//      d'erreur c'est relou" ;
//   - "tu n'as pas repris la belle mise en page facile de l'Atelier
//      [...] fais plutôt plusieurs étapes qui s'enchaînent qu'une longue
//      page qui empile les infos" ;
//   - "il faut que les users retrouvent leurs créations" ;
//   - "le générateur d'emails ne génère pas 'des pistes' mais des emails
//      putain t'as fait n'imp".

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { GENERATEURS, type GenerateurId } from "@/lib/generateurs/catalogue";
import {
  ETAPES,
  etapesDuParcours,
  peutAvancer,
  precedente,
  suivante,
  etapeValide,
} from "@/lib/generateurs/parcours";
import { SEQUENCE_EMAILS, SEQUENCE_PROMO, planFixe, passeParLesPistes } from "@/lib/generateurs/sequences";
import { parseBonusDoc, inline } from "@/lib/bonus/document";
import {
  classerParGenerateur,
  etiquetteContenu,
  lireContenu,
  parDateDesc,
  resumeMorceaux,
  cleLivraison,
  type ContenuGenere,
} from "@/lib/generateurs/bibliotheque";
import { cleAnthropic } from "@/lib/ai/cleAnthropic";

const RACINE = process.cwd();
const lire = (p: string) => fs.readFileSync(path.join(RACINE, p), "utf8");

// ---------------------------------------------------------------------
// LA CLÉ ANTHROPIC : le générateur était le SEUL à ne pas la trouver.
// ---------------------------------------------------------------------

describe("La clé Anthropic se lit à un seul endroit", () => {
  const NOMS = ["CLAUDE_API_KEY_OWNER", "ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY_OWNER"] as const;

  function sansCles<T>(f: () => T): T {
    const avant = NOMS.map((n) => [n, process.env[n]] as const);
    for (const n of NOMS) delete process.env[n];
    try {
      return f();
    } finally {
      for (const [n, v] of avant) {
        if (v === undefined) delete process.env[n];
        else process.env[n] = v;
      }
    }
  }

  test("les TROIS noms qui circulent dans ce dépôt sont essayés", () => {
    // La route des générateurs ne lisait que `ANTHROPIC_API_KEY`, alors
    // que trois noms circulent ici et que deux fichiers ne les lisent
    // même pas dans le même ordre. C'était la SEULE fonction IA
    // incapable de trouver une clé posée sous un autre nom.
    for (const n of NOMS) {
      sansCles(() => {
        process.env[n] = "  la-cle  ";
        assert.equal(cleAnthropic(), "la-cle", `${n} n'est pas lu`);
      });
    }
    assert.equal(sansCles(() => cleAnthropic()), "");
  });

  test("deux clés DIFFÉRENTES ne se départagent pas en silence", () => {
    // L'ordre déciderait laquelle est facturée : c'est une question pour
    // un humain, pas pour du code (règle des versements, 25 août).
    const src = lire("lib/ai/cleAnthropic.ts");
    assert.ok(src.includes("console.error"), "aucun cri sur deux clés qui divergent");
    assert.ok(!/\$\{[^}]*valeur[^}]*\}/.test(src), "le journal imprime une clé");
  });

  test("la route des générateurs passe par le module", () => {
    const route = lire("app/api/generateurs/route.ts");
    assert.ok(route.includes("cleAnthropic()"), "la route relit la variable à la main");
    assert.ok(
      !/const apiKey = \(process\.env\./.test(route),
      "la route lit encore une variable d'environnement directement",
    );
  });
});

// ---------------------------------------------------------------------
// LE PARCOURS : des étapes, pas une page qui empile.
// ---------------------------------------------------------------------

describe("Le parcours d'un générateur", () => {
  test("chaque générateur a son propre chemin", () => {
    assert.deepEqual(etapesDuParcours("bonus"), ["projet", "reglages", "pistes", "contenus"]);
    // Les emails n'ont pas de pistes, la promo n'a ni pistes ni réglages :
    // traverser une étape vide est un clic pour rien.
    assert.deepEqual(etapesDuParcours("emails"), ["projet", "reglages", "contenus"]);
    assert.deepEqual(etapesDuParcours("promo"), ["projet", "contenus"]);
  });

  test("tout parcours commence par le projet et finit par les contenus", () => {
    for (const id of GENERATEURS) {
      const l = etapesDuParcours(id);
      assert.equal(l[0], "projet", `${id} ne commence pas par le projet`);
      assert.equal(l[l.length - 1], "contenus", `${id} ne finit pas par les contenus`);
      assert.equal(new Set(l).size, l.length, `${id} répète une étape`);
      for (const e of l) assert.ok(ETAPES.includes(e), `${id} porte une étape inconnue`);
    }
  });

  test("on n'avance pas vers un écran qui ne peut rien produire", () => {
    const rien = { projetPret: false, profilPret: false, offrePrete: false, pistesPretes: false };
    assert.equal(peutAvancer("projet", rien), false);
    assert.equal(peutAvancer("projet", { ...rien, projetPret: true }), true);
    // Les réglages exigent les DEUX : un profil choisi et une offre
    // décrite. Sans offre, le modèle en inventerait une, et elle
    // publierait une promesse qu'elle ne tient pas.
    assert.equal(peutAvancer("reglages", { ...rien, profilPret: true }), false);
    assert.equal(peutAvancer("reglages", { ...rien, profilPret: true, offrePrete: true }), true);
    assert.equal(peutAvancer("contenus", { ...rien, projetPret: true }), false);
  });

  test("on peut revenir en arrière, et le retour s'arrête", () => {
    for (const id of GENERATEURS) {
      const l = etapesDuParcours(id);
      assert.equal(precedente(id, l[0]!), null, `${id} remonte au dessus de la première étape`);
      assert.equal(suivante(id, l[l.length - 1]!), null, `${id} continue après la dernière`);
      for (let i = 1; i < l.length; i++) {
        assert.equal(precedente(id, l[i]!), l[i - 1]);
        assert.equal(suivante(id, l[i - 1]!), l[i]);
      }
    }
  });

  test("une étape qui n'existe pas retombe sur la PREMIÈRE", () => {
    // Jamais sur la dernière : arriver sur "contenus" sans projet
    // montrerait un écran vide sans dire pourquoi.
    assert.equal(etapeValide("promo", "pistes"), "projet");
    assert.equal(etapeValide("emails", "n'importe quoi"), "projet");
    assert.equal(etapeValide("bonus", "pistes"), "pistes");
  });
});

// ---------------------------------------------------------------------
// L'ÉCRAN N'AFFICHE PLUS TOUT EN MÊME TEMPS.
// ---------------------------------------------------------------------

describe("L'écran suit le parcours", () => {
  // ON RETIRE LES COMMENTAIRES : un test qui mesure la présence ou
  // l'ORDRE de quelque chose dans un fichier tombe sinon sur sa propre
  // explication écrite juste au dessus. C'est la faute déjà payée le
  // 2 septembre sur la reprise du quiz de la page de vente.
  const src = lire("app/generateurs/[generateur]/GenerateurClient.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("chaque section est gatée sur son étape", () => {
    for (const e of ["projet", "reglages", "pistes", "contenus"]) {
      assert.ok(src.includes(`etape === "${e}"`), `la section ${e} n'est pas gatée`);
    }
  });

  test("l'écran ne recalcule pas la liste des étapes", () => {
    assert.ok(src.includes("etapesDuParcours(generateur)"), "l'écran n'appelle pas le module");
    assert.ok(src.includes("passeParLesPistes(generateur)"), "l'écran devine s'il y a des pistes");
  });

  test("l'intention du modèle n'est JAMAIS affichée telle quelle", () => {
    // Sur un plan fixe, `resume` porte la consigne envoyée au modèle,
    // en français, dans un écran qui existe en 7 langues.
    // ON VISE LE FAIT, PAS LA FORME. Deux versions de ce test ont déjà
    // été fausses : la première figeait le JSX au caractère près, la
    // seconde regardait LIGNE PAR LIGNE et rougissait donc sur un garde
    // posé à la ligne d'au dessus, c'est à dire sur du code correct.
    //
    // Le fait est : `piece.resume` ne se lit QUE dans `aideDuBloc`, et
    // `aideDuBloc` rend le rôle TRADUIT dès que la pièce en a un.
    const fn = src.indexOf("function aideDuBloc");
    assert.ok(fn > 0, "aideDuBloc a disparu : où l'intention est-elle gardée ?");
    const corps = src.slice(fn, src.indexOf("\n  }", fn));
    assert.match(corps, /if \(piece\.cle\) return t\(`temps\.\$\{piece\.cle\}`\)/);

    const ailleurs = (src.slice(0, fn) + src.slice(fn + corps.length)).match(/\.resume\b/g);
    assert.equal(
      ailleurs,
      null,
      "l'intention brute se lit ailleurs que dans aideDuBloc, donc sans garde",
    );
  });

  test("la bibliothèque et les générateurs sont deux entrées distinctes", () => {
    const accueil = lire("app/generateurs/GenerateursClient.tsx");
    assert.ok(accueil.includes('href="/generateurs/nouveau"'), "on ne peut plus générer");
    assert.ok(accueil.includes('href="/generateurs/mes-contenus"'), "on ne retrouve rien");
    // L'accueil ne montre PLUS les trois cartes : c'est l'étape qu'elle
    // a demandé d'ajouter.
    // Sur le RENDU, pas sur le fichier : l'accueil importe le bandeau
    // de verrou depuis ce module, donc son nom apparaît dans un chemin
    // d'import. Troisième fois dans ces dépôts qu'un contrôle mesure
    // autre chose que ce qu'il croit.
    assert.ok(!accueil.includes("<CartesGenerateurs"), "l'accueil saute l'étape du choix");
  });

  test("la grille des trois cartes n'existe qu'à UN endroit", () => {
    // Recopier la grille dans le nouvel écran aurait donné deux versions
    // à tenir : c'est ce qui a répandu le bandeau bleu en doublon.
    const nouveau = lire("app/generateurs/nouveau/NouveauClient.tsx");
    assert.ok(nouveau.includes("<CartesGenerateurs"), "l'écran redessine les cartes");
    assert.ok(!/gap-4 sm:grid-cols-2 lg:grid-cols-3/.test(nouveau), "la grille est recopiée");
  });
});

// ---------------------------------------------------------------------
// LA BIBLIOTHÈQUE.
// ---------------------------------------------------------------------

const CONTENU = (o: Partial<Record<string, unknown>> = {}) =>
  lireContenu({
    id: "abc",
    generateur: "emails",
    quiz_id: "q1",
    quiz_titre: "Mon quiz",
    titre: "",
    profil_index: 2,
    profil_titre: "La perfectionniste",
    pieces: [{ bloc: "email", index: 1, cle: "sonResultat", markdown: "coucou" }],
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T11:00:00Z",
    ...o,
  })!;

describe("Mes contenus générés", () => {
  test("une ligne inexploitable ne casse pas l'écran", () => {
    assert.equal(lireContenu(null), null);
    assert.equal(lireContenu({ id: "x", generateur: "n'importe quoi" }), null);
    assert.equal(lireContenu({ generateur: "emails" }), null, "une ligne sans id passe");
  });

  test("un morceau vide est écarté, il ne fait pas croire à un trou", () => {
    const c = CONTENU({ pieces: [{ bloc: "email", index: 1, markdown: "   " }] });
    assert.equal(c.morceaux.length, 0);
  });

  test("les trois blocs sont TOUJOURS là, même vides", () => {
    // Un bloc vide dit que le générateur existe : le masquer ferait
    // croire qu'il n'y en a que deux (leçon du vide muet, 24 août).
    const blocs = classerParGenerateur([CONTENU()]);
    assert.deepEqual(blocs.map((b) => b.generateur), [...GENERATEURS]);
    assert.equal(blocs.find((b) => b.generateur === "bonus")!.contenus.length, 0);
  });

  test("le plus récent en premier : c'est celui qu'on vient d'écrire", () => {
    const vieux = CONTENU({ id: "v", updated_at: "2026-08-01T10:00:00Z" });
    const neuf = CONTENU({ id: "n", updated_at: "2026-09-02T10:00:00Z" });
    assert.deepEqual([vieux, neuf].sort(parDateDesc).map((c) => c.id), ["n", "v"]);
  });

  test("l'étiquette nomme le PROFIL avant le quiz", () => {
    // Sinon cinq séquences écrites pour cinq profils du même quiz
    // donnent cinq lignes identiques.
    const { principale, secondaire } = etiquetteContenu(CONTENU());
    assert.equal(principale, "La perfectionniste");
    assert.equal(secondaire, "Mon quiz");
    // Et le titre de la piste passe devant le profil quand il existe.
    const avecTitre = etiquetteContenu(CONTENU({ titre: "La checklist des 7 jours" }));
    assert.equal(avecTitre.principale, "La checklist des 7 jours");
  });

  test("un morceau coupé est COMPTÉ, donc affichable", () => {
    const c = CONTENU({
      pieces: [
        { bloc: "email", index: 1, markdown: "ok" },
        { bloc: "email", index: 2, markdown: "coupe", tronque: true },
      ],
    });
    assert.deepEqual(resumeMorceaux(c), { total: 2, tronques: 1 });
  });

  test("deux profils du même quiz sont deux livraisons", () => {
    const base = { generateur: "emails" as GenerateurId, quizId: "q1", titre: "" };
    assert.notEqual(
      cleLivraison({ ...base, profilIndex: 0 }),
      cleLivraison({ ...base, profilIndex: 1 }),
    );
  });

  test("un quiz supprimé n'emporte pas ce qu'on a écrit pour lui", () => {
    // Le titre est RECOPIÉ à l'enregistrement, et `quiz_id` est en
    // ON DELETE SET NULL : les emails ont peut-être déjà été programmés.
    const migration = lire("supabase/migrations/20260902_generateurs_contenus.sql");
    assert.match(migration, /quiz_id[\s\S]*on delete set null/i);
    assert.match(migration, /quiz_titre/);
    const c = CONTENU({ quiz_id: null });
    assert.equal(c.quizId, null);
    assert.equal(c.quizTitre, "Mon quiz");
  });

  test("le morceau est rangé au fur et à mesure, pas à la fin", () => {
    // Une génération dure une minute et demie : l'onglet fermé au
    // septième morceau ne doit pas tout emporter.
    const route = lire("app/api/generateurs/route.ts");
    assert.ok(route.includes("await rangerMorceau("), "rien n'est enregistré");
    assert.ok(
      route.indexOf("await rangerMorceau(") < route.lastIndexOf("NextResponse.json({\n    ok: true,"),
      "l'enregistrement passe après la réponse",
    );
  });

  test("le store ne prend AUCUNE décision", () => {
    // Il importe `supabaseAdmin`, donc aucun test ne peut le charger :
    // c'est exactement là que les bugs s'installent (24 août).
    const store = lire("lib/generateurs/contenusStore.ts");
    assert.ok(store.includes("supabaseAdmin"), "le store ne parle plus à la base");
    assert.ok(store.includes("lireContenu"), "le store relit les lignes à sa façon");
    const pur = lire("lib/generateurs/bibliotheque.ts");
    // Sur le CODE : l'en-tête du module PARLE du store qui, lui,
    // importe `supabaseAdmin`.
    const codePur = pur.split("\nimport ").slice(1).join("\nimport ");
    assert.ok(!codePur.includes("supabaseAdmin"), "le module pur touche à la base");
  });

  test("la suppression filtre par personne DANS la requête", () => {
    const store = lire("lib/generateurs/contenusStore.ts");
    const bloc = store.slice(store.indexOf("export async function supprimerContenu"));
    assert.ok(bloc.includes('.eq("user_id", userId)'), "on peut supprimer le travail d'un autre");
  });
});

// ---------------------------------------------------------------------
// LA SÉQUENCE FIXE, VUE DE L'ÉCRAN.
// ---------------------------------------------------------------------

describe("Les séquences fixes", () => {
  test("le nombre de morceaux est connu AVANT de lancer", () => {
    // Le coût se dit avant, jamais après : l'écran doit donc savoir
    // combien de morceaux il va écrire sans appeler le serveur.
    assert.equal(planFixe("emails")!.length, SEQUENCE_EMAILS.length);
    assert.equal(planFixe("promo")!.length, SEQUENCE_PROMO.length);
    assert.equal(planFixe("bonus"), null);
  });

  test("chaque temps porte une clé i18n, et elles sont toutes distinctes", () => {
    for (const plan of [SEQUENCE_EMAILS, SEQUENCE_PROMO]) {
      const cles = plan.map((t) => t.cle);
      assert.equal(new Set(cles).size, cles.length, "deux temps partagent une clé");
      for (const c of cles) assert.match(c, /^[a-zA-Z]+$/, `clé i18n douteuse : ${c}`);
    }
  });

  test("les clés existent dans les 7 langues", () => {
    const locales = ["fr", "en", "es", "it", "ar", "pt", "pt-BR"];
    const cles = [...SEQUENCE_EMAILS, ...SEQUENCE_PROMO].map((t) => t.cle);
    for (const l of locales) {
      const d = JSON.parse(lire(`messages/${l}.json`)) as Record<string, any>;
      const temps = d.generateurs?.temps ?? {};
      for (const c of cles) {
        assert.ok(String(temps[c] ?? "").trim(), `${l} n'a pas de libellé pour « ${c} »`);
      }
      for (const e of ETAPES) {
        assert.ok(
          String(d.generateurs?.parcours?.[e] ?? "").trim(),
          `${l} n'a pas de libellé pour l'étape « ${e} »`,
        );
      }
    }
  });

  test("aucun tiret cadratin dans ce qui s'affiche", () => {
    for (const l of ["fr", "en", "es", "it", "ar", "pt", "pt-BR"]) {
      const d = JSON.parse(lire(`messages/${l}.json`)) as Record<string, any>;
      const texte = JSON.stringify({
        temps: d.generateurs?.temps,
        parcours: d.generateurs?.parcours,
        accueil: d.generateurs?.accueil,
        bibliotheque: d.generateurs?.bibliotheque,
      });
      assert.ok(!/[—–]/.test(texte), `${l} porte un tiret cadratin`);
    }
  });

  test("la route refuse l'étape des pistes là où elle n'existe pas", () => {
    // Un écran resté sur l'ancienne version dépenserait des jetons pour
    // rien et afficherait trois "pistes d'emails" que personne n'a
    // demandées.
    const route = lire("app/api/generateurs/route.ts");
    assert.ok(route.includes('if (!passeParLesPistes(id)) return refus("pas_de_pistes")'));
  });

  test("les trois générateurs sont d'accord sur qui a des pistes", () => {
    for (const id of GENERATEURS) {
      assert.equal(
        passeParLesPistes(id),
        planFixe(id) === null,
        `${id} : plan fixe et pistes disent le contraire`,
      );
    }
  });
});

// ── LE CHOIX DU PROJET EST UN MENU DEROULANT (Béné, 3 septembre 2026)
//
// Une carte par projet donne une page interminable des qu'on en a vingt,
// et le geste ici est un CHOIX dans une liste, pas une exploration.
//
// CE QUI NE DOIT PAS SE PERDRE : un projet bloqué DIT pourquoi. Le
// griser sans un mot se lit comme un bug, et la créatrice cherche
// (règle du 22 août). Une <option> tient sur une ligne, donc la raison
// y est dite en version COURTE.
// ─────────────────────────────────────────────────────────────────────
// ON LANCE DEPUIS LES RÉGLAGES, ON ATTERRIT SUR LES PISTES
// ─────────────────────────────────────────────────────────────────────
//
// Béné, 3 septembre 2026 : "cette étape est inutile : autant générer les
// trois pistes directement ! Pourquoi t'as pas repris exactement ce
// qu'on a codé dans l'atelier ?"
//
// Elle avait raison, et c'était mesurable : l'étape des pistes s'ouvrait
// VIDE, avec un titre, une phrase et un bouton. Deux clics pour un seul
// geste. Le labo de l'Atelier n'a jamais fait ça : son écran de brief
// finit par "Proposer 3 pistes", et le clic mène à un écran qui MONTRE
// les trois pistes (`askPistes` puis `setStep("pistes")`).

describe("les pistes : le lancement vit au pied des réglages", () => {
  const ecran = lire("app/generateurs/[generateur]/GenerateurClient.tsx");
  const sansCommentaires = ecran
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("obtenir des pistes fait AVANCER, ça ne remplit pas l'écran courant", () => {
    const debut = sansCommentaires.indexOf("async function demanderPistes");
    assert.ok(debut > 0, "demanderPistes a disparu");
    const bloc = sansCommentaires.slice(debut, sansCommentaires.indexOf("\n  }", debut));
    assert.match(bloc, /setEtape\("pistes"\)/, "on ne bascule plus sur l'étape des pistes");
  });

  test("l'étape des pistes ne porte AUCUN bouton primaire de lancement", () => {
    const debut = sansCommentaires.indexOf('etape === "pistes" && projet');
    const fin = sansCommentaires.indexOf('etape === "contenus"', debut);
    assert.ok(debut > 0 && fin > debut, "l'étape des pistes a changé de forme");
    const bloc = sansCommentaires.slice(debut, fin);
    assert.ok(!bloc.includes('t("pistes.lancer")'), "l'écran vide avec son bouton est revenu");
  });

  test("la relance AJOUTE une piste, elle ne remplace pas les trois", () => {
    // Béné, Atelier, 6 août 2026 : "aucune ne te convainc ?" Une relance
    // qui remplace est un bouton sur lequel on ne clique jamais, parce
    // qu'on craint de perdre les trois qui sont à l'écran.
    const debut = sansCommentaires.indexOf('etape === "pistes" && projet');
    const bloc = sansCommentaires.slice(debut, sansCommentaires.indexOf('etape === "contenus"', debut));
    assert.match(bloc, /onClick=\{unePisteDePlus\}/, "la relance ne rend plus une seule piste");
    assert.ok(!bloc.includes("onClick={demanderPistes}"), "l'écran des pistes relance encore les trois");
    assert.match(bloc, /pistes\.length < MAX_PISTES/, "rien ne borne le nombre de pistes");

    // Et elle AJOUTE vraiment, dans l'appel : un `setPistes([data.piste])`
    // remplacerait, et le libellé du bouton mentirait.
    const fn = sansCommentaires.indexOf("async function unePisteDePlus");
    assert.ok(fn > 0, "unePisteDePlus a disparu");
    const corps = sansCommentaires.slice(fn, sansCommentaires.indexOf("\n  }", fn));
    assert.match(corps, /setPistes\(\(l\) => \[\.\.\.l, data\.piste/, "la relance écrase les pistes");
    // CE QU'ELLE A DÉJÀ SOUS LES YEUX part dans l'appel : sans ça on
    // paie une génération pour un doublon.
    assert.match(corps, /connues:/, "on ne dit plus au modèle ce qu'elle a déjà");
  });

  test("le pied des réglages lance les pistes, il ne dit pas Suivant", () => {
    const debut = sansCommentaires.indexOf('apres === "pistes"');
    assert.ok(debut > 0, "le pied de parcours ne connaît plus l'étape des pistes");
    const bloc = sansCommentaires.slice(debut, debut + 1200);
    assert.match(bloc, /onClick=\{demanderPistes\}/, "le bouton du pied ne lance pas les pistes");
    assert.match(bloc, /t\("pistes\.lancer"\)/, "le pied ne porte pas le libellé de lancement");
  });

  test("le coût de la relance est dit, ici comme au pied des réglages", () => {
    // "Proposer trois autres pistes" REFACTURE. Une relance gratuite en
    // apparence est la meilleure façon de vider un compteur sans
    // comprendre pourquoi.
    const occurrences = sansCommentaires.split('t("credits.coutPistes"').length - 1;
    assert.equal(occurrences, 2, "le prix des pistes n'est plus dit aux deux endroits");
  });

  test("la recommandation passe AU DESSUS des cartes", () => {
    const bloc = sansCommentaires.slice(
      sansCommentaires.indexOf('etape === "pistes" && projet'),
      sansCommentaires.indexOf('etape === "contenus"'),
    );
    const reco = bloc.indexOf("pourquoiRecommandee");
    const cartes = bloc.indexOf("pistes.map(");
    assert.ok(reco > 0 && cartes > 0, "l'écran des pistes a changé de forme");
    assert.ok(reco < cartes, "la recommandation se lit après les cartes, donc trop tard");
  });

  test("le titre et la phrase existent dans les 7 langues", () => {
    for (const loc of ["fr", "en", "es", "it", "ar", "pt", "pt-BR"]) {
      const m = JSON.parse(lire(`messages/${loc}.json`)) as Record<string, never>;
      const p = (m as Record<string, Record<string, Record<string, string>>>)
        .generateurs.pistes;
      for (const cle of ["titre", "aide", "recommandation"]) {
        assert.ok((p[cle] ?? "").trim().length > 0, `${loc} : generateurs.pistes.${cle} manque`);
      }
      assert.match(p.recommandation!, /\{rang\}/, `${loc} : la recommandation ne nomme pas la piste`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// L'ÉCRAN DE PRODUCTION : DES DOSSIERS, PAS UNE PILE
// ─────────────────────────────────────────────────────────────────────
//
// Béné, 3 septembre 2026 : "au final je veux exactement la même chose
// sur l'atelier et sur tiquiz. Pareil. Ni plus, ni moins. En visible et
// en invisible pour les users."
//
// Le labo de l'Atelier montre une GRILLE de dossiers, un clic en ouvre
// un, la flèche remonte, et le document ouvert s'édite sur place avant
// de partir en PDF. Ici tout était empilé, en lecture seule, sans
// export. Ces tests figent les cinq gestes, un par un.

describe("l'écran de production suit le labo de l'Atelier", () => {
  const ecran = lire("app/generateurs/[generateur]/GenerateurClient.tsx");
  const src = ecran.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  test("une grille de dossiers, et un seul document ouvert à la fois", () => {
    assert.match(src, /ouvert === null/, "la grille de dossiers a disparu");
    assert.match(src, /setOuvert\(k\)/, "un dossier ne s'ouvre plus");
    assert.match(src, /production\.retourDossiers/, "on ne peut plus remonter aux dossiers");
    // Une pile de documents longs est exactement ce qu'on retire : le
    // rendu ne s'affiche que pour la pièce OUVERTE.
    assert.ok(
      !/pieces\.map\([\s\S]{0,600}RenduGenere/.test(src),
      "les contenus sont de nouveau empilés",
    );
  });

  test("un texte généré est un BROUILLON : il s'édite sur place", () => {
    // "On tombe sur le markdown au lieu d'un bel éditeur alors qu'on l'a
    // partout cet éditeur" (Béné, Atelier, 5 août 2026). Ici l'éditeur
    // qu'on a partout est `RichTextEdit`, celui de l'éditeur de quiz.
    assert.match(src, /<RichTextEdit/, "on ne peut plus corriger un texte généré");
    // LE MARKDOWN RESTE LA SOURCE DE VÉRITÉ : le pont traduit dans les
    // deux sens, sinon le rendu et le PDF divergeraient de l'écran.
    assert.match(src, /markdownToEditorHtml\(/, "l'éditeur ne lit plus le markdown");
    assert.match(src, /editorHtmlToMarkdown\(/, "ce qu'elle écrit ne revient plus en markdown");
  });

  test("un contenu SANS titre de section garde sa mise en forme", () => {
    // Béné, 3 septembre 2026 : "ça ne va pas supprimer ce qui s'écrivait
    // en markdown ? Les users doivent voir en beau, bien mis en forme."
    //
    // Elle avait raison de se méfier. Un repli "pas de section -> rendu
    // simple" rendait le texte TEL QUEL : le gras ressortait en
    // `**mot**`, un lien en `[texte](url)`, et une LISTE DISPARAISSAIT.
    // Un email et un post court n'ont pas de `##`, donc c'était le cas
    // le plus fréquent ici.
    //
    // MESURÉ sur un email réel avant correction : la liste rendait une
    // chaîne vide, et "**Team Capture**" s'affichait avec ses étoiles.
    const doc = parseBonusDoc(
      "Salut,\n\nTu es **Team Capture**.\n\n- un point\n- deux\n\n[le quiz](https://x.fr)",
    );
    assert.equal(doc.sections.length, 0, "ce cas doit bien être sans section");
    assert.deepEqual(
      doc.lead.map((b) => b.kind),
      ["para", "para", "list", "para"],
      "la liste n'est plus lue comme une liste",
    );
    // Et le moteur de rendu la met en forme : gras, lien, puces.
    assert.match(inline("Tu es **Team Capture**.", "ecran"), /<strong>Team Capture<\/strong>/);
    assert.match(inline("[le quiz](https://x.fr)", "ecran"), /<a href="https:\/\/x\.fr"/);

    // ET LE REPLI NE DOIT PAS REVENIR. Les deux écrans appellent
    // `BonusDocument` sans condition : il rend `doc.lead` avec le même
    // moteur que les sections, donc il n'y a rien à replier.
    for (const f of [
      "app/generateurs/[generateur]/GenerateurClient.tsx",
      "app/generateurs/mes-contenus/MesContenusClient.tsx",
    ]) {
      const code = lire(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.ok(!code.includes("hasStructure"), `${f} branche encore sur hasStructure`);
      assert.match(code, /<BonusDocument doc=\{parseBonusDoc\(markdown\)\} \/>/, f);
    }
  });

  test("le rendu et le PDF lisent les MÊMES modules", () => {
    // Repartir du markdown dans le PDF donnerait deux mises en forme qui
    // finiraient par diverger : c'est le défaut sorti six fois dans ces
    // dépôts (l'aperçu de l'éditeur contre le viewer).
    // ON VISE L'APPEL, PAS L'IMPORT : un import qui reste alors que
    // l'appel a disparu laisserait ce test vert sur un PDF mort.
    assert.match(src, /parseBonusDoc\(/, "le rendu ne passe plus par le document");
    assert.match(src, /buildPrintableHtml\(/, "le PDF a disparu");
    assert.match(src, /production\.popupBloquee/, "une fenêtre bloquée ne se dit plus");
  });

  test("choisir une piste n'écrit RIEN : chaque dossier a son bouton", () => {
    const fn = src.indexOf("function choisirPiste");
    assert.ok(fn > 0, "choisirPiste a disparu");
    const corps = src.slice(fn, src.indexOf("\n  }", fn));
    assert.ok(!corps.includes("ecrireUn"), "choisir une piste écrit encore tout d'un coup");
    assert.match(src, /production\.generer/, "un dossier n'a plus son bouton Générer");
    assert.match(src, /production\.refaire/, "on ne peut plus refaire un morceau");
  });

  test("les quatre modules de l'Atelier sont importés, pas réécrits", () => {
    // Deux copies d'une même règle finissent toujours par diverger, et
    // ici la divergence coûte un PDF qui ne ressemble plus à l'écran.
    for (const mod of [
      "@/lib/bonus/document",
      "@/lib/bonus/markdownHtml",
      "@/lib/bonus/printable",
      "@/components/BonusDocument",
    ]) {
      assert.ok(ecran.includes(mod), `${mod} n'est plus importé`);
    }
  });

  test("l'avancement se dit sous le titre, et il ne se recompte pas ici", () => {
    // La règle vit dans `lib/generateurs/avancement.ts`, en fonction
    // pure : un écran qui recompte finit par annoncer autre chose que ce
    // que la grille montre.
    assert.match(src, /avancement\(clesDuTravail, contenus\)/, "l'avancement se recalcule à l'écran");
    for (const cle of ["rien", "partiel", "complet"]) {
      assert.match(src, new RegExp(`production\\.avancement\\.${cle}`), `l'état ${cle} ne se dit plus`);
    }
  });

  test("les libellés de production existent dans les 7 langues", () => {
    for (const loc of ["fr", "en", "es", "it", "ar", "pt", "pt-BR"]) {
      const m = JSON.parse(lire(`messages/${loc}.json`)) as Record<string, never>;
      const p = (m as Record<string, Record<string, Record<string, string>>>)
        .generateurs.production;
      for (const k of [
        "aGenerer",
        "pret",
        "retourDossiers",
        "generer",
        "refaire",
        "modifier",
        "termine",
        "pdf",
        "popupBloquee",
      ]) {
        assert.ok((p[k] ?? "").trim().length > 0, `${loc} : generateurs.production.${k} manque`);
      }
    }
  });
});

describe("le choix du projet", () => {
  const ecran = lire("app/generateurs/[generateur]/GenerateurClient.tsx");

  test("c'est un menu déroulant, plus une grille de cartes", () => {
    // On vise la portion qui rend l'étape projet, pas le fichier entier :
    // les profils, les pistes et les contenus gardent leurs grilles, et
    // c'est voulu.
    const debut = ecran.indexOf('etape === "projet"');
    const fin = ecran.indexOf('etape === "reglages"', debut);
    assert.ok(debut > 0 && fin > debut, "l'étape projet a changé de forme");
    const bloc = ecran.slice(debut, fin);

    assert.match(bloc, /<select/, "le projet ne se choisit pas dans un menu");
    assert.doesNotMatch(bloc, /grid-cols/, "la grille de cartes est revenue");
  });

  test("un projet bloqué est grisé ET dit pourquoi", () => {
    const debut = ecran.indexOf('etape === "projet"');
    const fin = ecran.indexOf('etape === "reglages"', debut);
    const bloc = ecran.slice(debut, fin);

    assert.match(bloc, /disabled=\{Boolean\(b\)\}/, "un projet bloqué reste choisissable");
    assert.match(
      bloc,
      /projet\.bloqueCourt\./,
      "il est grisé sans un mot : ça se lit comme un bug",
    );
  });

  test("les 7 langues savent dire les 3 raisons courtes", () => {
    for (const loc of ["fr", "en", "es", "it", "ar", "pt", "pt-BR"]) {
      const d = JSON.parse(lire(`messages/${loc}.json`)) as {
        generateurs?: { projet?: { choisir?: string; indisponible?: string; bloqueCourt?: Record<string, string> } };
      };
      const proj = d.generateurs?.projet ?? {};
      assert.ok(proj.choisir?.trim(), `${loc} : le menu n'a pas de libellé d'attente`);
      assert.ok(proj.indisponible?.includes("{titre}"), `${loc} : l'option perd le titre du projet`);
      assert.ok(proj.indisponible?.includes("{raison}"), `${loc} : l'option perd la raison`);
      for (const r of ["sondage", "profils-vides", "quiz-vide"]) {
        assert.ok(proj.bloqueCourt?.[r]?.trim(), `${loc} : la raison ${r} n'a pas de version courte`);
      }
    }
  });

  test("le cul-de-sac muet est ferme : tous bloqués se dit", () => {
    // `projets.length === 0` ne distinguait pas "tu n'as aucun projet" de
    // "aucun ne peut servir", alors que la phrase affichee dit la SECONDE.
    // Avec un menu, une liste dont toutes les options sont grisees serait
    // un cul-de-sac sans un mot.
    assert.match(ecran, /const utilisables = useMemo/, "rien ne calcule ce qui est choisissable");
    assert.match(
      ecran,
      /utilisables\.length === 0/,
      "l'ecran teste encore la liste brute au lieu de ce qui est utilisable",
    );
  });
});

