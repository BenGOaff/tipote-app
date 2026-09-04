// tests/logic/sortie-generateurs.test.mts
//
// RIEN N'EST TRONQUÉ, RIEN N'EST ANNULÉ.
//
// Béné, 4 septembre 2026 : "tout ce que je veux c'est que rien ne doit
// tronqué ni annulé : si la sortie doit faire 20000 mots ben elle en
// 20000 c'est tout. Un email qui demande à faire XX mots ben il sort XX
// mots, on ne détruit jamais la qualité."
//
// -- CE QUE CE FILET EXISTE POUR EMPÊCHER, ET C'ÉTAIT MOI -------------
//
// Le matin même, j'avais fait les deux fautes que cette phrase nomme :
//
//   1. RABOTÉ le contenu d'un bonus de 1800 à 1500 mots pour qu'il
//      tienne sous un plafond technique. C'est "détruire la qualité
//      pour économiser", et ça ne se voit sur aucun écran ;
//   2. ajouté un REFUS quand le texte dépassait quand même. Un refus,
//      c'est une annulation : elle repart avec rien.
//
// La limite réelle n'est pas une limite de CONTENU, c'est le temps
// qu'une requête a le droit de durer (~85 s derrière Cloudflare, mesuré
// côté Atelier : au delà de ~4500 jetons de sortie, un appel rend ZÉRO
// ligne). La réponse est donc d'écrire en PLUSIEURS TRANCHES et de
// recoller, jamais d'écrire moins.
//
// Les quatre tests qui comptent : aucune longueur ne baisse, aucun refus
// sur un texte qui continue, la suite reprend là où ça s'arrête, et ce
// qui est déjà écrit n'est jamais jeté.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MAX_TRANCHES,
  TRANCHE_MAX,
  consigneDeLongueur,
  couperPourReprendre,
  longueurDuMorceau,
} from "@/lib/generateurs/longueurSortie";
import { BLOCS_DU_GENERATEUR, type Bloc } from "@/lib/generateurs/blocs";
import { GENERATEURS, type GenerateurId } from "@/lib/generateurs/catalogue";
import { CONSIGNE_DE_SUITE, consigneProduction } from "@/lib/prompts/generateurs/consignes";
import { SOCLE_GENERATEURS } from "@/lib/prompts/generateurs/socle";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * UN TEST QUI MESURE LA PRÉSENCE OU L'ORDRE DE QUELQUE CHOSE DANS UN
 * FICHIER RETIRE D'ABORD LES COMMENTAIRES, sinon il tombe sur sa propre
 * explication et sort vert (ou rouge) pour rien. Payé trois fois cette
 * semaine.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Les couples (générateur, bloc) qui existent vraiment. */
const COUPLES: { id: GenerateurId; bloc: Bloc }[] = GENERATEURS.flatMap((id) =>
  BLOCS_DU_GENERATEUR[id].map((bloc) => ({ id, bloc })),
);

/**
 * LES LONGUEURS QUI ONT ÉTÉ DÉCIDÉES POUR LA QUALITÉ, pas pour le
 * budget. Ce sont des FAITS, pas une formulation : les figer est ce qui
 * empêche qu'on les rabote un jour pour tenir dans une contrainte
 * technique. Un email de 300 mots doit faire 300 mots.
 */
const MOTS_ATTENDUS: Record<string, { min: number; max: number }> = {
  "bonus:contenu": { min: 1200, max: 1800 },
  "bonus:guide": { min: 400, max: 700 },
  "bonus:remise": { min: 250, max: 450 },
  "emails:email": { min: 200, max: 300 },
  "promo:email": { min: 150, max: 250 },
  "promo:post": { min: 90, max: 150 },
};

describe("on ne rabote JAMAIS la longueur d'un morceau", () => {
  test("chaque morceau garde la longueur décidée pour lui", () => {
    for (const { id, bloc } of COUPLES) {
      const attendu = MOTS_ATTENDUS[`${id}:${bloc}`];
      assert.ok(attendu, `${id}:${bloc} : longueur attendue inconnue, complète la table`);
      const { mots } = longueurDuMorceau(id, bloc);
      assert.deepEqual(
        mots,
        attendu,
        `${id}:${bloc} : la longueur a bougé. Elle ne se raccourcit pas pour tenir ` +
          "dans une tranche : c'est la tranche qui s'adapte, jamais le contenu.",
      );
    }
  });

  test("la tranche est la MÊME pour tous : elle ne dépend pas du contenu", () => {
    // Une tranche plus petite pour un bloc "court" serait un rabot
    // déguisé : c'est le budget de temps qui la fixe, et il est le même
    // pour tout le monde.
    for (const { id, bloc } of COUPLES) {
      assert.equal(longueurDuMorceau(id, bloc).trancheMax, TRANCHE_MAX, `${id}:${bloc}`);
    }
  });

  test("un morceau inconnu n'est pas amputé non plus", () => {
    const l = longueurDuMorceau("promo" as GenerateurId, "guide" as Bloc);
    assert.equal(l.trancheMax, TRANCHE_MAX);
    assert.ok(l.mots.max > 0);
  });

  test("la consigne DIT la longueur, et autorise à la dépasser", () => {
    for (const { id, bloc } of COUPLES) {
      const l = longueurDuMorceau(id, bloc);
      const texte = consigneProduction({
        id,
        piece: { bloc, index: 1, resume: "", cle: undefined },
      });
      assert.ok(
        texte.includes(`entre ${l.mots.min} et ${l.mots.max} mots`),
        `${id}:${bloc} : la consigne n'annonce pas sa longueur`,
      );
    }
    const phrase = consigneDeLongueur(longueurDuMorceau("bonus", "contenu"));
    // Une consigne qui dit "coupe" fait rendre un sommaire à la place
    // d'un contenu : c'est exactement la qualité qu'on refuse de perdre.
    assert.match(phrase, /si le sujet demande plus, tu écris plus/);
    assert.doesNotMatch(phrase, /tu coupes/);
  });

  test("AUCUN nombre de mots n'est réécrit à la main dans les consignes", () => {
    const src = sansCommentaires(lire("lib/prompts/generateurs/consignes.ts"));
    const enDur = src.match(/\d+\s*mots/g) ?? [];
    assert.deepEqual(
      enDur,
      [],
      `une longueur écrite en dur dans consignes.ts : ${enDur.join(", ")}`,
    );
  });
});

describe("un texte plus long qu'une tranche CONTINUE, il ne s'annule pas", () => {
  const route = sansCommentaires(lire("app/api/generateurs/route.ts"));

  test("aucun refus quand le morceau dépasse", () => {
    assert.doesNotMatch(
      route,
      /refus\("coupe"\)/,
      "un morceau long serait ANNULÉ : elle repartirait avec rien",
    );
  });

  test("AUCUN prefill assistant : il répond 400 sur le modèle des générateurs", () => {
    // Le réflexe pour une reprise est de reposer le texte en dernier
    // message `assistant`. C'est ce que j'avais écrit, et le prefill est
    // RETIRÉ de la famille 4.6+ : `claude-sonnet-4-6` répond 400, donc
    // chaque suite aurait échoué en disant "refusé".
    assert.doesNotMatch(
      route,
      /role: "assistant"/,
      "un prefill assistant : 400 sur claude-sonnet-4-6, chaque suite echoue",
    );
  });

  test("la suite part dans le MESSAGE, avec la consigne de ne rien répéter", () => {
    assert.match(route, /CONSIGNE_DE_SUITE/);
    assert.match(route, /suiteDe/);
    // Sans ces interdictions, le modèle recommence son texte depuis le
    // début : on paierait deux fois le même contenu.
    assert.match(CONSIGNE_DE_SUITE, /Tu ne répètes rien de ce qui est déjà écrit/);
    assert.match(CONSIGNE_DE_SUITE, /uniquement la suite/);
  });

  test("les tranches s'enchaînent, et on recolle à une frontière propre", () => {
    assert.match(route, /for \(let tranche = 0; tranche < MAX_TRANCHES; tranche\+\+\)/);
    assert.match(
      route,
      /couperPourReprendre\(/,
      "sans frontière propre, la suite reprendrait au milieu d'un mot",
    );
  });

  test("une tranche qui échoue ne jette pas ce qui est déjà écrit", () => {
    assert.match(
      route,
      /if \(!out\.ok\) \{\s*if \(!texte\) return refus\(out\.failure\);\s*break;/,
      "un échec en cours de route effacerait le texte déjà payé",
    );
  });

  test("et on ne relance une tranche que s'il reste de quoi l'écrire", () => {
    // Sans ce garde, la tranche suivante dépasserait le budget et
    // rendrait zéro ligne : on aurait échangé une suite contre rien.
    assert.match(route, /if \(budgetLeft\(\) < 45_000\) break;/);
  });

  test("ce qui est enregistré est TOUT ce qui a été écrit", () => {
    // Le morceau est réécrit à chaque requête avec le texte CUMULÉ :
    // fermer l'onglet entre deux tranches ne perd donc rien, et la
    // reprise repart de ce qui existe.
    assert.match(route, /markdown = sanitizeAiText\(texte\)/);
    const enregistre = route.indexOf("await rangerMorceau(");
    const calcule = route.indexOf("markdown = sanitizeAiText(texte)");
    assert.ok(calcule > 0 && enregistre > calcule, "on enregistre avant d'avoir le texte complet");
  });
});

describe("on recule jusqu'à une frontière propre, sans rien perdre", () => {
  test("on repart du dernier paragraphe", () => {
    const t = "Premier paragraphe entier.\n\nDeuxième paragraphe coupé au mil";
    const r = couperPourReprendre(t);
    assert.equal(r.garde, "Premier paragraphe entier.");
    assert.equal(r.joint, "\n\n");
  });

  test("sans paragraphe, on repart de la dernière phrase finie", () => {
    const t = "Une phrase finie. Une deuxième aussi finie. Et une troisième cou";
    const r = couperPourReprendre(t);
    assert.equal(r.garde, "Une phrase finie. Une deuxième aussi finie.");
    assert.equal(r.joint, " ");
  });

  test("un texte SANS aucune frontière est gardé ENTIER", () => {
    // Une couture imparfaite vaut mieux qu'un texte jeté : c'est la
    // règle de la journée.
    const t = "un seul bloc sans ponctuation finale ni saut de ligne qui continue";
    assert.equal(couperPourReprendre(t).garde, t);
  });

  test("et on ne recule jamais jusqu'à presque tout jeter", () => {
    // Un paragraphe de deux mots au tout début ne doit pas faire
    // effacer les mille mots qui suivent.
    const t = "Titre\n\n" + "du texte qui continue longtemps ".repeat(30) + "et coup";
    assert.ok(
      couperPourReprendre(t).garde.length > t.length / 2,
      "on a jeté plus de la moitié du texte pour trouver une frontière",
    );
  });
});

describe("l'écran ne laisse jamais un demi contenu", () => {
  const client = lire("app/generateurs/[generateur]/GenerateurClient.tsx");

  test("il enchaîne les tranches tout seul", () => {
    assert.match(
      sansCommentaires(client),
      /for \(let tranche = 0; tranche < MAX_TRANCHES; tranche\+\+\)/,
    );
    assert.match(client, /suiteDe: texte/);
  });

  test("une suite n'est pas décomptée une deuxième fois", () => {
    // Le serveur ne débite pas une suite (côté Tipote) : l'écran ne doit
    // pas non plus retirer un crédit à chaque tranche.
    assert.match(sansCommentaires(client), /if \(!texte\) retirer\(data\)/);
  });

  test("et quand il en reste, elle a un BOUTON, pas juste un constat", () => {
    assert.match(client, /production\.ecrireLaSuite/);
    assert.match(client, /ecrireUn\(travail!, indexOuvert, contenuOuvert\.markdown\)/);
  });

  test("la raison `coupe` n'existe plus nulle part", () => {
    // Un libellé que plus rien ne rend est un piège que le prochain
    // passage rebranche en croyant réparer.
    assert.doesNotMatch(client, /"coupe"/);
    for (const loc of ["fr", "en", "es", "it", "ar", "pt", "pt-BR"]) {
      const m = JSON.parse(lire(`messages/${loc}.json`)) as {
        generateurs: { erreurs: Record<string, string> };
      };
      assert.equal(m.generateurs.erreurs.coupe, undefined, `${loc} : raison coupe restée`);
    }
  });

  test("les deux phrases de la suite existent dans les 7 langues", () => {
    for (const loc of ["fr", "en", "es", "it", "ar", "pt", "pt-BR"]) {
      const m = JSON.parse(lire(`messages/${loc}.json`)) as {
        generateurs: { production: Record<string, string> };
      };
      const suite = m.generateurs.production.ecrireLaSuite;
      const reste = m.generateurs.production.tronque;
      assert.ok(suite && suite.trim().length > 2, `${loc} : bouton absent`);
      assert.ok(reste && reste.trim().length > 20, `${loc} : phrase absente`);
      for (const p of [suite, reste]) {
        assert.ok(!/—|–/.test(p), `${loc} : tiret cadratin`);
      }
    }
  });
});

describe("ce qui ne se paie pas et qu'on retire quand même", () => {
  test("le socle interdit la conclusion sur le travail", () => {
    // Le préambule était déjà interdit, la CONCLUSION non : "n'hésite
    // pas à adapter" est de la sortie payée qui ne sert à personne. Ça
    // ne retire pas une ligne de contenu, seulement du remplissage.
    assert.match(SOCLE_GENERATEURS, /n'hésite pas à adapter/);
    assert.match(SOCLE_GENERATEURS, /Le dernier mot du texte est le dernier mot du contenu/);
  });

  test("et la borne de tranches laisse la place à un très long contenu", () => {
    // 6 tranches x 4500 jetons, c'est ~18000 mots pour UN morceau. Au
    // delà, l'écran propose encore d'écrire la suite : on ne s'arrête
    // jamais sur un refus.
    assert.ok(MAX_TRANCHES >= 4, "trop peu de tranches pour un contenu long");
    assert.ok(TRANCHE_MAX >= 4000);
  });
});
