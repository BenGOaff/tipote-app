// tests/logic/reprise-generateurs.test.mts
//
// ON REPREND UN CONTENU LÀ OÙ ON L'A LAISSÉ (Béné, 3 septembre 2026).
//
// "Au final je veux exactement la même chose sur l'atelier et sur
// tiquiz. Pareil. Ni plus, ni moins." Puis, sur le seul écart qui
// restait après le portage : "oui fais la migration."
//
// La bibliothèque LISAIT le travail sans pouvoir le continuer : corriger
// un email, en générer un sixième ou écrire le contenu du 3e profil
// demandait de tout resaisir et de REPAYER les pistes.
//
// CE QUE CE FILET FIGE, et rien d'autre :
//   - ce qui a le droit d'entrer en base (le JSONB est libre) ;
//   - qu'une ligne écrite AVANT la migration reste lisible et le DISE ;
//   - que le repli existe si la migration n'est pas encore passée ;
//   - qu'une seule fonction compose la clé d'un morceau ;
//   - que la reprise ne rouvre jamais le travail de quelqu'un d'autre.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  assainirProjet,
  meriteEtreGarde,
  peutEtreRepris,
  type ProjetEnregistre,
} from "@/lib/generateurs/projet";
import { lireContenu } from "@/lib/generateurs/bibliotheque";
import { cleMorceau } from "@/lib/generateurs/blocs";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const LOCALES = ["fr", "en", "es", "it", "ar", "pt", "pt-BR"];

/** La source sans ses commentaires : un test d'ORDRE tombe sinon sur sa propre explication. */
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const projetPlein: ProjetEnregistre = {
  brief: {
    plan: "par-profil",
    declencheur: "share",
    offres: [{ promesse: "Ma formation", format: "formation", prix: "97 €", profils: [0, 1] }],
  },
  pistes: [
    {
      titre: "Le kit",
      format: "checklist",
      punchline: "En dix minutes",
      pourquoi: "Parce que",
      tempsParPersonne: "",
      pieces: [{ bloc: "contenu", index: 1, resume: "" }],
    },
  ],
  piste: {
    titre: "Le kit",
    format: "checklist",
    punchline: "En dix minutes",
    pourquoi: "Parce que",
    tempsParPersonne: "",
    pieces: [{ bloc: "contenu", index: 1, resume: "" }],
  },
};

// ─────────────────────────────────────────────────────────────────────
describe("Ce qui a le droit d'entrer en base", () => {
  test("une valeur illisible retombe sur son défaut, elle ne casse pas la reprise", () => {
    const p = assainirProjet({
      brief: { plan: "n'importe quoi", declencheur: "jamais", offres: [{ format: "licorne" }] },
    });
    // Un plan ou un déclencheur illisible en base ne doit pas rendre un
    // contenu impossible à rouvrir : on retombe sur le cas le plus
    // courant et le moins surprenant.
    assert.equal(p.brief.plan, "commun");
    assert.equal(p.brief.declencheur, "completion");
    assert.equal(p.brief.offres[0]!.format, "formation");
  });

  test("un bloc inconnu est LAISSÉ TOMBER, pas affiché", () => {
    const p = assainirProjet({
      piste: { titre: "x", pieces: [{ bloc: "licorne", index: 1 }, { bloc: "contenu", index: 2 }] },
    });
    // Un bloc inconnu désignerait un dossier qui n'existe pas à l'écran,
    // donc une carte vide qu'aucun bouton ne peut remplir.
    assert.deepEqual(
      p.piste!.pieces.map((x) => x.bloc),
      ["contenu"],
    );
  });

  test("les tailles sont bornées : ce JSONB vient d'un corps de requête", () => {
    const p = assainirProjet({
      brief: { offres: new Array(50).fill({ promesse: "x".repeat(5000) }) },
      pistes: new Array(50).fill({ titre: "t".repeat(5000) }),
      piste: { titre: "t", pieces: new Array(80).fill({ bloc: "email", index: 1 }) },
    });
    assert.equal(p.brief.offres.length, 12);
    assert.equal(p.pistes.length, 6);
    assert.ok(p.brief.offres[0]!.promesse.length <= 600);
    assert.ok(p.pistes[0]!.titre.length <= 300);
    assert.ok(p.piste!.pieces.length <= 20);
  });

  test("elle ne lève JAMAIS, même sur n'importe quoi", () => {
    for (const entree of [null, undefined, 0, "texte", [], { brief: 42 }, { pistes: "non" }]) {
      const p = assainirProjet(entree);
      assert.equal(p.brief.plan, "commun");
      assert.deepEqual(p.pistes, []);
      assert.equal(p.piste, null);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Peut-on reprendre, et le dire honnêtement", () => {
  test("une ligne d'AVANT la migration ne se reprend pas", () => {
    // Elle porte ses morceaux mais pas son brief : rouvrir afficherait un
    // écran vide en prétendant reprendre son travail.
    assert.equal(peutEtreRepris({ generateur: "bonus", projet: null }), false);
    assert.equal(peutEtreRepris({ generateur: "emails", projet: null }), false);
  });

  test("le seuil est la PISTE pour le bonus, le brief pour les deux autres", () => {
    const sansPiste = { ...projetPlein, piste: null };
    assert.equal(peutEtreRepris({ generateur: "bonus", projet: projetPlein }), true);
    assert.equal(peutEtreRepris({ generateur: "bonus", projet: sansPiste }), false);
    // Les emails et la promo n'ont PAS de piste : leur plan est fixe
    // (`sequences.ts`), exiger une piste les rendrait irreprenables.
    assert.equal(peutEtreRepris({ generateur: "emails", projet: sansPiste }), true);
    const sansOffre = { ...sansPiste, brief: { ...projetPlein.brief, offres: [] } };
    assert.equal(peutEtreRepris({ generateur: "emails", projet: sansOffre }), false);
  });

  test("on ne garde pas un écran ouvert puis quitté", () => {
    // Sinon la bibliothèque se remplit de brouillons vides, et elle
    // cherche son vrai contenu au milieu. Le seuil est le premier ACTE.
    assert.equal(meriteEtreGarde({ pistes: [], morceaux: [] }), false);
    assert.equal(meriteEtreGarde({ pistes: [], morceaux: [{ markdown: "   " }] }), false);
    assert.equal(meriteEtreGarde({ pistes: [{}], morceaux: [] }), true);
    assert.equal(meriteEtreGarde({ pistes: [], morceaux: [{ markdown: "Salut" }] }), true);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("La lecture d'une ligne", () => {
  const ligneDeBase = {
    id: "11111111-1111-1111-1111-111111111111",
    generateur: "bonus",
    quiz_id: "22222222-2222-2222-2222-222222222222",
    quiz_titre: "Mon quiz",
    titre: "Le kit",
    profil_index: null,
    profil_titre: "",
    pieces: [{ bloc: "contenu", index: 1, markdown: "Texte", profil: 2 }],
    created_at: "2026-09-03T10:00:00Z",
  };

  test("un brief VIDE n'est pas un brief : `projet` vaut null", () => {
    // `{}` est le défaut de la colonne, donc une ligne d'avant la
    // migration. On ne fabrique pas un brief vide qui rouvrirait un
    // écran sans rien dedans.
    assert.equal(lireContenu({ ...ligneDeBase, brief: {} })?.projet, null);
    assert.equal(lireContenu(ligneDeBase)?.projet, null);
  });

  test("un brief renseigné rend un projet reprenable", () => {
    const c = lireContenu({
      ...ligneDeBase,
      brief: projetPlein.brief,
      pistes: projetPlein.pistes,
      piste: projetPlein.piste,
    });
    assert.ok(c?.projet);
    assert.equal(c!.projet!.brief.plan, "par-profil");
    assert.equal(peutEtreRepris(c!), true);
  });

  test("le PROFIL vit sur le morceau, pas sur la ligne", () => {
    // Mettre le bonus dans une ligne par profil séparerait un guide de
    // son contenu, et la reprise rouvrirait un projet à moitié.
    const c = lireContenu(ligneDeBase);
    assert.equal(c!.profilIndex, null);
    assert.equal(c!.morceaux[0]!.profil, 2);
    // Un morceau sans profil rend `null`, jamais 0 : 0 est un vrai
    // profil, et le confondre écraserait le contenu du premier.
    const sans = lireContenu({
      ...ligneDeBase,
      pieces: [{ bloc: "guide", index: 1, markdown: "x" }],
    });
    assert.equal(sans!.morceaux[0]!.profil, null);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Une seule fonction compose la clé d'un morceau", () => {
  test("l'écran et le serveur appellent `cleMorceau`, ils ne recomposent pas", () => {
    // Deux façons de composer une clé finiraient par ne plus se
    // retrouver, et un contenu déjà écrit s'afficherait comme jamais
    // généré.
    const src = lire("app/generateurs/[generateur]/GenerateurClient.tsx");
    const page = lire("app/generateurs/[generateur]/page.tsx");
    assert.match(src, /cleMorceau\(\{ generateur, plan, bloc: p\.bloc/);
    assert.match(page, /cleMorceau\(\{/);
    // La forme historique, écrite à la main, ne doit plus vivre nulle
    // part : c'est elle qu'on remplace.
    assert.doesNotMatch(src, /`\$\{p\.bloc\}-\$\{p\.index\}/);
  });

  test("la clé porte le profil UNIQUEMENT quand le morceau en a un", () => {
    const k = (plan: "commun" | "par-profil", bloc: "contenu" | "guide", profil: number) =>
      cleMorceau({ generateur: "bonus", plan, bloc, index: 1, profil });
    assert.equal(k("commun", "contenu", 3), "contenu-1");
    assert.equal(k("par-profil", "contenu", 3), "contenu-1:3");
    assert.equal(k("par-profil", "guide", 3), "guide-1");
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("L'enregistrement, et le repli sur la migration", () => {
  const store = lire("lib/generateurs/contenusStore.ts");
  const nu = sansCommentaires(store);

  test("les trois colonnes de la reprise sont écrites, ASSAINIES", () => {
    assert.match(nu, /brief: propre\.brief, pistes: propre\.pistes, piste: propre\.piste/);
    assert.match(nu, /assainirProjet\(projet\)/);
  });

  test("une colonne inconnue ne fait PAS perdre le contenu", () => {
    // PostgREST rejette l'écriture ENTIÈRE sur une colonne qu'il ne
    // connaît pas : sans repli, un déploiement en avance sur la
    // migration ferait perdre tous les contenus, en silence, alors que
    // la bibliothèque marchait la veille (drame `quiz_events.meta`).
    assert.match(nu, /creation avec la reprise/);
    assert.match(nu, /insert\(ligne\)/);
    assert.match(nu, /mise a jour avec la reprise/);
    assert.match(nu, /update\(base\)/);
  });

  test("le remplacement d'un morceau tient compte du PROFIL", () => {
    // Sans lui, écrire le contenu du 2e profil d'un bonus décliné
    // effacerait celui du 1er, et elle ne s'en apercevrait qu'en
    // rouvrant.
    assert.match(nu, /memeProfil\(m\.profil, morceau\.profil\)/);
  });

  test("la lecture d'UNE ligne filtre par personne DANS la requête", () => {
    // C'est ce filtre, et pas un `if` au dessus, qui empêche de rouvrir
    // le travail de quelqu'un d'autre avec un identifiant deviné.
    const bloc = nu.slice(nu.indexOf("lireContenuParId"));
    const requete = bloc.slice(0, bloc.indexOf("maybeSingle"));
    assert.match(requete, /\.eq\("id", id\)/);
    assert.match(requete, /\.eq\("user_id", userId\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("Les deux écrans", () => {
  test("la page refuse de rouvrir ce qui n'est pas reprenable", () => {
    const page = sansCommentaires(lire("app/generateurs/[generateur]/page.tsx"));
    assert.match(page, /lireContenuParId\(user\.id, repriseId\)/);
    // Le générateur de l'adresse doit être celui de la ligne : sinon on
    // rouvrirait un bonus dans l'écran des emails.
    assert.match(page, /contenu\.generateur === id/);
    assert.match(page, /peutEtreRepris\(contenu\)/);
  });

  test("l'écran repart du brief enregistré et atterrit sur les contenus", () => {
    const src = sansCommentaires(lire("app/generateurs/[generateur]/GenerateurClient.tsx"));
    assert.match(src, /useState<string>\(reprise\?\.projetId \?\? ""\)/);
    assert.match(src, /reprise\?\.plan \?\? "commun"/);
    assert.match(src, /reprise\?\.declencheur \?\? "completion"/);
    assert.match(src, /reprise\?\.offres\.length \? reprise\.offres/);
    assert.match(src, /useState<Piste\[\]>\(reprise\?\.pistes \?\? \[\]\)/);
    assert.match(src, /useState<Piste \| null>\(reprise\?\.piste \?\? null\)/);
    assert.match(src, /reprise\?\.contenus \?\? \{\}/);
    // ON ATTERRIT SUR LE TRAVAIL : ouvrir sur l'étape du projet
    // obligerait à retraverser trois écrans déjà remplis pour corriger
    // un mot.
    assert.match(src, /useState<Etape>\(reprise \? "contenus" : parcours\[0\]!\)/);
  });

  test("la bibliothèque montre le bouton, et DIT quand il n'y est pas", () => {
    const src = lire("app/generateurs/mes-contenus/MesContenusClient.tsx");
    assert.match(src, /peutEtreRepris\(contenu\)/);
    assert.match(src, /reprise=\$\{contenu\.id\}/);
    // Un bouton absent se justifie sur la ligne (règle du 22 août) :
    // sans un mot, elle le cherche.
    assert.match(src, /!reprenable[\s\S]{0,200}?bibliotheque\.pasReprenable/);
  });

  test("les deux libellés existent dans les 7 langues", () => {
    for (const loc of LOCALES) {
      const b = (
        JSON.parse(lire(`messages/${loc}.json`)) as {
          generateurs: { bibliotheque: Record<string, string> };
        }
      ).generateurs.bibliotheque;
      for (const k of ["reprendre", "pasReprenable"]) {
        assert.ok((b[k] ?? "").trim().length > 0, `${loc} : bibliotheque.${k}`);
        assert.doesNotMatch(b[k]!, /[—–]/, `${loc} : tiret cadratin dans ${k}`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("La migration", () => {
  const sql = lire("supabase/migrations/20260903_generateurs_reprise.sql");

  test("elle est rejouable, et elle recharge le schéma de PostgREST", () => {
    for (const col of ["brief", "pistes", "piste"]) {
      assert.match(sql, new RegExp(`add column if not exists\\s+${col}\\b`));
    }
    // Sans ça, la première écriture après le déploiement échoue sur une
    // colonne "inconnue" alors qu'elle existe.
    assert.match(sql, /notify pgrst, 'reload schema';/);
  });

  test("aucune ligne existante ne bouge", () => {
    // Les trois colonnes ont un défaut : un contenu écrit avant se relit
    // exactement comme avant, il ne se REPREND simplement pas.
    assert.match(sql, /default '\{\}'::jsonb/);
    assert.match(sql, /default '\[\]'::jsonb/);
    assert.doesNotMatch(sql, /\bupdate\s+public\.generateur_contenus\b/i);
    assert.doesNotMatch(sql, /\bdrop\s+(column|table)\b/i);
  });
});
