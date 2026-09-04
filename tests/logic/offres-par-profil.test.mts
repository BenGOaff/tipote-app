// tests/logic/offres-par-profil.test.mts
//
// PLUSIEURS OFFRES, UNE PAR PROFIL, ET LE BRIEF DU BONUS.
//
// Béné, 3 septembre 2026, captures de l'Atelier à l'appui : "c'est où
// l'étape pour choisir quand sera envoyé le bonus, le type de bonus,
// pour un partage ou un quiz complété ??? Je t'ai pas demandé de
// l'à peu près je t'ai demandé PAREIL."
//
// Elle avait raison : l'écran des réglages n'avait qu'UNE offre et aucun
// des deux choix qui décident de ce que le bonus doit ÊTRE. Et mon
// propre `offre.ts` disait noir sur blanc "on ne reprend PAS ça ici, pas
// encore".
//
// -- CE FICHIER FIGE UN COMPORTEMENT, PAS UNE COPIE -------------------
//
// `lib/bonus/offers.ts` de l'Atelier ne peut pas être porté à l'octet
// près : il parle anglais et tout `lib/generateurs/` parle français. Les
// cas ci dessous rejouent donc, un par un, ceux de son
// `bonus-offers.test.mts`.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PLANS_BONUS,
  DECLENCHEURS,
  OFFRE_VIDE,
  bonusParProfil,
  offreParProfil,
  offreDuProfil,
  couvertureDesOffres,
  rendreOffresPourPrompt,
  type Offre,
} from "@/lib/generateurs/offre";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const LOCALES = ["fr", "en", "es", "it", "ar", "pt", "pt-BR"];

const offre = (promesse: string, profils: number[] = []): Offre => ({
  ...OFFRE_VIDE,
  promesse,
  profils,
});

describe("Les trois plans", () => {
  test("la quatrième combinaison est impossible par construction", () => {
    // Un bonus COMMUN qui mènerait vers des offres DIFFÉRENTES est
    // incohérent : un seul texte, lu par tout le monde, ne peut pas
    // pointer vers trois offres. Trois valeurs, donc, pas deux réglages.
    assert.equal(PLANS_BONUS.length, 3);
    assert.equal(bonusParProfil("commun"), false);
    assert.equal(bonusParProfil("par-profil"), true);
    assert.equal(bonusParProfil("par-profil-son-offre"), true);
    assert.equal(offreParProfil("commun"), false);
    assert.equal(offreParProfil("par-profil"), false);
    assert.equal(offreParProfil("par-profil-son-offre"), true);
  });
});

describe("L'offre d'un profil", () => {
  test("hors du plan à offres multiples, c'est toujours la première", () => {
    const l = [offre("A"), offre("B")];
    for (const plan of ["commun", "par-profil"] as const) {
      assert.equal(offreDuProfil(plan, l, 0)?.promesse, "A");
      assert.equal(offreDuProfil(plan, l, 3)?.promesse, "A");
    }
  });

  test("avec une offre par profil, chacun reçoit la SIENNE", () => {
    // C'est le retour de Monique (Atelier, 5 août 2026) : un quiz qui
    // oriente vers trois offres renvoyait les trois profils vers la
    // même, donc vers l'inverse de ce que le quiz venait de leur dire.
    const l = [offre("A", [0, 1]), offre("B", [2])];
    assert.equal(offreDuProfil("par-profil-son-offre", l, 1)?.promesse, "A");
    assert.equal(offreDuProfil("par-profil-son-offre", l, 2)?.promesse, "B");
  });

  test("un profil sans offre rend null, il n'emprunte pas celle du voisin", () => {
    const l = [offre("A", [0])];
    assert.equal(offreDuProfil("par-profil-son-offre", l, 1), null);
    assert.equal(offreDuProfil("commun", [], 0), null);
  });
});

describe("La couverture", () => {
  test("elle ne dit rien hors du plan à offres multiples", () => {
    for (const plan of ["commun", "par-profil"] as const) {
      assert.equal(couvertureDesOffres(plan, [offre("A")], 4).ok, true);
    }
  });

  test("elle ne bloque pas sur une structure inconnue", () => {
    // Zéro profil : on ne bloque pas sur une donnée qu'on n'a pas.
    assert.equal(couvertureDesOffres("par-profil-son-offre", [offre("A")], 0).ok, true);
  });

  test("les trois défauts se NOMMENT séparément", () => {
    // Ils n'ont pas les mêmes conséquences : sans offre, le bonus ne
    // mène nulle part ; en double, on ne peut pas choisir à sa place ;
    // inutilisée, c'est presque toujours une case oubliée.
    const c = couvertureDesOffres(
      "par-profil-son-offre",
      [offre("A", [0, 1]), offre("B", [1]), offre("C", [9])],
      3,
    );
    assert.deepEqual(c.sansOffre, [2]);
    assert.deepEqual(c.enDouble, [1]);
    assert.deepEqual(c.inutilisees, [2]);
    assert.equal(c.ok, false);
  });

  test("une offre inutilisée ne BLOQUE pas", () => {
    const c = couvertureDesOffres("par-profil-son-offre", [offre("A", [0, 1]), offre("B", [7])], 2);
    assert.deepEqual(c.inutilisees, [1]);
    assert.equal(c.ok, true, "une case oubliée ne doit pas refuser la génération");
  });
});

describe("Ce qui part dans le prompt", () => {
  const profils = [{ titre: "Team Capture" }, { titre: "Team Contenu" }];

  test("écrire POUR un profil n'envoie que SON offre", () => {
    const out = rendreOffresPourPrompt({
      plan: "par-profil-son-offre",
      offres: [offre("la formation A", [0]), offre("l'accompagnement B", [1])],
      profils,
      profilIndex: 1,
      declencheur: "completion",
    });
    assert.match(out, /accompagnement B/);
    assert.ok(!out.includes("formation A"), out);
  });

  test("à l'étape des pistes, la carte COMPLÈTE part", () => {
    // On n'écrit encore pour personne : c'est ce qui permet de proposer
    // un format qui tienne pour tous les profils.
    const out = rendreOffresPourPrompt({
      plan: "par-profil-son-offre",
      offres: [offre("la formation A", [0]), offre("l'accompagnement B", [1])],
      profils,
      profilIndex: null,
      declencheur: "completion",
    });
    assert.match(out, /CHAQUE PROFIL MÈNE VERS SA PROPRE OFFRE/);
    assert.match(out, /Team Capture -> la formation A/);
    assert.match(out, /Team Contenu -> l'accompagnement B/);
  });

  test("un profil sans offre est DIT, jamais tu", () => {
    // Le taire ferait inventer une offre au modèle, ce qui est le seul
    // résultat pire que l'absence de bonus.
    const out = rendreOffresPourPrompt({
      plan: "par-profil-son-offre",
      offres: [offre("la formation A", [0])],
      profils,
      profilIndex: null,
      declencheur: "completion",
    });
    assert.match(out, /Team Contenu -> \(aucune offre associée\)/);
  });

  test("LE DÉCLENCHEMENT PART DANS LE PROMPT, et il change le bonus", () => {
    // À la fin du quiz il prolonge un résultat qu'on vient de lire ;
    // après un partage il récompense un geste, donc il doit valoir le
    // geste. Le taire laisse le modèle écrire pour le cas moyen.
    const fin = rendreOffresPourPrompt({
      plan: "commun",
      offres: [offre("A")],
      profils,
      profilIndex: null,
      declencheur: "completion",
    });
    const partage = rendreOffresPourPrompt({
      plan: "commun",
      offres: [offre("A")],
      profils,
      profilIndex: null,
      declencheur: "share",
    });
    assert.match(fin, /À LA FIN DU QUIZ/i);
    assert.match(partage, /APRÈS UN PARTAGE/i);
    assert.notEqual(fin, partage);
  });

  test("aucune offre remplie : rien, jamais une ligne à trou", () => {
    // Une ligne "OFFRE : -" apprendrait au modèle qu'il a le droit d'en
    // inventer une.
    assert.equal(
      rendreOffresPourPrompt({
        plan: "commun",
        offres: [OFFRE_VIDE],
        profils,
        profilIndex: null,
        declencheur: "completion",
      }),
      "",
    );
  });
});

describe("L'écran du brief suit celui de l'Atelier", () => {
  const ecran = lire("app/generateurs/[generateur]/GenerateurClient.tsx");
  const src = ecran.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  test("les deux choix existent, et en CARTES, pas en menu déroulant", () => {
    // "Plus lisible qu'un menu déroulant pour un choix qui change le
    // résultat en profondeur" : ici on ne remplit pas un champ, on
    // décide de ce que le bonus sera.
    assert.match(src, /<Choix\b/, "le composant de cartes a disparu");
    assert.match(src, /t\("plan\.label"\)/, "le plan ne se choisit plus");
    assert.match(src, /t\("declencheur\.label"\)/, "le déclenchement ne se choisit plus");
    assert.ok(!/plan\.label[\s\S]{0,200}<select/.test(src), "le plan est redevenu un menu");
  });

  test("LE PLAN EST POSÉ AVANT LES OFFRES", () => {
    // Béné, Atelier, 5 août : "c'est ce que reçoit chaque profil qui
    // doit aller en premier, avant les offres, c'est plus logique". Et
    // ça règle une dépendance : ce choix décide si les pastilles de
    // profils existent dans les cartes d'offre.
    const plan = src.indexOf('t("plan.label")');
    const offres = src.indexOf('t("offre.rang"');
    const decl = src.indexOf('t("declencheur.label")');
    assert.ok(plan > 0 && offres > plan, "les offres passent avant le plan");
    assert.ok(decl > offres, "le déclenchement ne ferme plus l'écran");
  });

  test("on peut ajouter et retirer une offre, et cocher ses profils", () => {
    assert.match(src, /onClick=\{ajouterOffre\}/);
    assert.match(src, /onClick=\{\(\) => retirerOffre\(i\)\}/);
    assert.match(src, /basculerProfilDOffre/);
  });

  test("un profil n'appartient qu'à UNE offre", () => {
    // Le cocher ailleurs le retire d'où il était : sans ça on fabrique
    // l'ambiguïté qu'on vient de rendre bloquante.
    const fn = src.indexOf("function basculerProfilDOffre");
    assert.ok(fn > 0, "basculerProfilDOffre a disparu");
    const corps = src.slice(fn, src.indexOf("\n  }", fn));
    assert.match(corps, /profils: o\.profils\.filter\(\(x\) => x !== profil\)/);
  });

  test("la couverture est DITE, avec le nom des profils", () => {
    // "Il manque une offre" oblige à comparer soi même pour savoir
    // lesquels.
    assert.match(src, /couvertureDesOffres\(plan, offres/);
    assert.match(src, /t\("offre\.sansOffre"/);
    assert.match(src, /t\("offre\.enDouble"/);
    assert.match(src, /couverture\.ok/, "rien ne bloque sur une couverture incomplète");
  });

  test("le CONTENU s'écrit une fois par profil, et la clé le porte", () => {
    // Sans le profil dans la clé, écrire le 2e profil ÉCRASE le 1er, et
    // elle ne s'en aperçoit qu'en rouvrant.
    assert.match(src, /function parProfil\(p: Piece\): boolean/);
    assert.match(src, /p\.bloc === "contenu" && bonusParProfil\(plan\)/);
    assert.match(src, /parProfil\(p\) \? `:\$\{profil\}` : ""/);
    // Et le sélecteur vit DANS le dossier, comme dans l'Atelier.
    assert.match(src, /t\("profil\.celuiQueTuPrepares"\)/);
    assert.match(src, /t\("profil\.ecrit"\)/);
  });

  test("le serveur REFUSE une couverture incomplète, il ne devine pas", () => {
    const route = lire("app/api/generateurs/route.ts");
    assert.match(route, /couvertureDesOffres\(input\.plan, offres, brief\.profils\.length\)/);
    assert.match(route, /refus\("couverture_offres"/);
  });

  test("les libellés existent dans les 7 langues", () => {
    for (const loc of LOCALES) {
      const g = (
        JSON.parse(lire(`messages/${loc}.json`)) as {
          generateurs: Record<string, Record<string, unknown>>;
        }
      ).generateurs;
      const plan = g.plan as { label: string; options: Record<string, { titre: string }> };
      const decl = g.declencheur as { label: string; options: Record<string, { titre: string }> };
      assert.ok((plan.label ?? "").trim().length > 0, `${loc} : plan.label`);
      assert.ok((decl.label ?? "").trim().length > 0, `${loc} : declencheur.label`);
      for (const v of PLANS_BONUS) {
        assert.ok((plan.options[v]?.titre ?? "").trim().length > 0, `${loc} : plan ${v}`);
      }
      for (const v of DECLENCHEURS) {
        assert.ok((decl.options[v]?.titre ?? "").trim().length > 0, `${loc} : declencheur ${v}`);
      }
      const err = g.erreurs as Record<string, string>;
      assert.ok((err.couverture_offres ?? "").trim().length > 0, `${loc} : erreurs`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// LES MOTS ET LES GESTES DE SON LABO, RELEVÉS UN PAR UN
// ─────────────────────────────────────────────────────────────────────
//
// Béné, 3 septembre 2026 : "tu peux pas chercher par toi-même ce qui ne
// serait pas strictement identique pour le corriger ? Tu as TOUS les
// codes pour le faire."
//
// Si. J'ai donc extrait chaque phrase visible de son labo et cherché
// l'équivalent chez nous : 26 n'en avaient pas. Ce bloc fige celles qui
// portent un GESTE, pas seulement un mot.

describe("Les mots et les gestes de son labo", () => {
  const fr = JSON.parse(lire("messages/fr.json")) as {
    generateurs: Record<string, Record<string, unknown>>;
  };
  const g = fr.generateurs;
  const ecran = lire("app/generateurs/[generateur]/GenerateurClient.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("ses libellés, mot pour mot", () => {
    // Trois gestes que Tiquiz nommait autrement. Elle a dit "pareil" :
    // ce sont ses mots qui gagnent, pas les miens.
    assert.equal((g.pistes as Record<string, string>).lancer, "Proposer 3 pistes");
    assert.equal((g.pistes as Record<string, string>).encours, "Je cherche tes pistes...");
    assert.equal((g.pistes as Record<string, string>).choisir, "Je prends celle-ci");
    assert.equal((g.etapes as Record<string, string>).offre, "Ton offre payante");
  });

  test("LES TROIS DOSSIERS DU BONUS ONT LEUR PHRASE", () => {
    // Mes cartes affichaient l'intention de la pièce, qui est VIDE sur
    // le bonus : trois cartes sans un mot pour dire ce qu'il y a dedans.
    // "Pour toi / pour ton visiteur" est ce qui évite d'ouvrir les trois
    // pour savoir lequel est lequel.
    const aides = g.aides as Record<string, string>;
    assert.match(aides.contenu!, /Pour ton visiteur/);
    assert.match(aides.guide!, /Pour toi/);
    assert.match(aides.remise!, /5 puces promesses/);
    assert.match(ecran, /function aideDuBloc/, "les dossiers n'ont plus de phrase");
    assert.match(ecran, /t\(`aides\.\$\{piece\.bloc\}`\)/);
  });

  test("UN DOSSIER VIDE DIT LE GESTE, pas l'état de l'écran", () => {
    // "Rien n'a encore été écrit" décrit l'écran ; "Génère ton guide de
    // création" dit quoi faire.
    const vides = g.vides as Record<string, string>;
    for (const b of ["contenu", "guide", "remise"]) {
      assert.match(vides[b]!, /Génère/, `le vide de ${b} ne dit pas le geste`);
    }
    assert.match(ecran, /function videDuBloc/);
  });

  test("UNE PISTE QUI COÛTE SON TEMPS PAR PERSONNE LE DIT", () => {
    // Porté de `needsHerTime`. Le socle interdit déjà ce qui demande son
    // temps à chaque visiteur ; quand un format en vaut quand même la
    // peine, le prix se DIT. Caché derrière le mot "personnalisé", il ne
    // se découvre qu'au quarantième lead.
    assert.match(ecran, /p\.tempsParPersonne \?/, "l'avertissement n'est plus affiché");
    assert.match(ecran, /amber/, "il ne se voit plus comme un avertissement");
    const consignes = lire("lib/prompts/generateurs/consignes.ts");
    assert.match(consignes, /tempsParPersonne/, "le prompt ne le demande plus");
    assert.match(consignes, /PAR PERSONNE/, "le prompt ne dit plus ce qu'il attend");
    const route = lire("app/api/generateurs/route.ts");
    assert.match(route, /tempsParPersonne: txt\(o\.tempsParPersonne\)/, "le lecteur le jette");
  });

  test("UNE OFFRE DE TROIS MOTS NE PASSE PAS", () => {
    // Son labo refuse en dessous de 10 caractères, avec la phrase qui
    // dit quoi corriger.
    assert.match(g.offre.tropCourte as string, /une phrase/);
    assert.match(ecran, /length < 10/, "rien ne refuse plus une offre trop courte");
    assert.match(ecran, /offreTropCourte/);
  });

  test("LA CARTE PARTAGE DIT QUE L'ÉTAPE N'EST PAS ACTIVÉE", () => {
    // Proposer un déclenchement qui n'existe pas sur ce quiz là ferait
    // écrire un bonus que personne ne recevra jamais.
    const d = g.declencheur as { options: Record<string, Record<string, string>> };
    assert.match(d.options.share!.aidePasActive!, /pas encore activée/);
    assert.match(ecran, /!projet\.partageActive/, "l'écran ne le dit plus");
    // Et la donnée vient VRAIMENT du quiz, pas d'une supposition.
    const page = lire("app/generateurs/[generateur]/page.tsx");
    assert.match(page, /virality_enabled/, "le drapeau n'est plus lu en base");
    assert.match(page, /partageActive: q\.virality_enabled === true/);
  });

  test("UNE COPIE QUI ÉCHOUE DIT LA SORTIE", () => {
    assert.match(g.production.copieEchouee as string, /à la main/);
    assert.match(ecran, /t\("production\.copieEchouee"\)/);
  });

  test("tout ça existe dans les 7 langues", () => {
    for (const loc of LOCALES) {
      const m = (
        JSON.parse(lire(`messages/${loc}.json`)) as {
          generateurs: Record<string, Record<string, unknown>>;
        }
      ).generateurs;
      for (const b of ["contenu", "guide", "remise"]) {
        assert.ok(
          String((m.aides as Record<string, string>)[b] ?? "").trim().length > 0,
          `${loc} : aides.${b}`,
        );
        assert.ok(
          String((m.vides as Record<string, string>)[b] ?? "").trim().length > 0,
          `${loc} : vides.${b}`,
        );
      }
      assert.ok(String(m.offre.tropCourte ?? "").trim().length > 0, `${loc} : offre.tropCourte`);
      assert.ok(
        String(m.production.copieEchouee ?? "").trim().length > 0,
        `${loc} : production.copieEchouee`,
      );
      const d = m.declencheur as { options: Record<string, Record<string, string>> };
      assert.ok(
        String(d.options.share?.aidePasActive ?? "").trim().length > 0,
        `${loc} : aidePasActive`,
      );
    }
  });
});
