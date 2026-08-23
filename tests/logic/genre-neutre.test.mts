// tests/logic/genre-neutre.test.mts
//
// ON NE VEND PAS QU'À DES FEMMES.
//
// Béné, 24 août 2026 : "'Toute affiliée' arrête de penser que je n'ai
// que des users féminines putain !!! d'où ça vient cette merde ??"
//
// Elle avait déjà tranché la veille, sur la page de remerciement du bon
// de commande de Tiquiz : "c'est genré automatiquement ou tu pars du
// principe que je ne vends qu'à des femmes ?? Ce qui n'est PAS le cas
// évidemment." Les prénoms de ces dépôts le disent tout seuls : François
// Xavier, Éric, Maurice, Ivan.
//
// Le filet vivait côté Tiquiz seulement, et Tipote portait exactement les
// mêmes fautes : "Tu n'es pas connectée" sur le retour de connexion,
// "Bienvenido/a" et "Benvenuto/a" à l'accueil et dans l'espace affilié,
// "Prêt·e à booster" sur le tableau de bord. Un garde-fou qui ne protège
// qu'un des deux dépôts jumeaux ne protège personne : c'est la leçon des
// deux versions divergentes de `pdf-parse` (7 août).
//
// **La sortie n'est ni le point médian ni la double forme.** "Prêt·e"
// n'existe qu'en français, et "Lista/o" ne fait que lister les deux
// genres au lieu de n'en imposer aucun. On TOURNE LA PHRASE : "On booste
// ton business aujourd'hui ?", "Te damos la bienvenida", "Ta session
// n'est pas active". Rien à accorder, donc rien à oublier dans les 7
// langues.
//
// Ce test ne regarde que l'ADRESSE DIRECTE au lecteur. Un accord avec un
// nom féminin ("analyse prête", "vidéo prête", "la campagne prête à
// envoyer") est correct et ne doit pas le faire rougir : un filet qui
// crie pour rien finit désactivé.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const LOCALES = ["fr", "en", "es", "it", "pt", "pt-BR", "ar"] as const;
const DICTS_AFFILIE = ["fr", "en", "es", "it", "pt", "ar"] as const;

function lire(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Tout ce que lit un utilisateur : les 7 langues + l'espace affilié. */
function corpus(): { fichier: string; source: string }[] {
  return [
    ...LOCALES.map((l) => ({ fichier: `messages/${l}.json`, source: lire(`messages/${l}.json`) })),
    ...DICTS_AFFILIE.map((l) => ({
      fichier: `app/affiliate/i18n/${l}.ts`,
      source: lire(`app/affiliate/i18n/${l}.ts`),
    })),
  ];
}

/** Les phrases exactes qui s'adressaient au lecteur en le genrant. */
const INTERDITS: readonly { fichier: string; motif: RegExp; quoi: string }[] = [
  { fichier: "messages/fr.json", motif: /Tu n'es pas connectée/, quoi: "retour de connexion accordé au féminin" },
  { fichier: "messages/es.json", motif: /Bienvenido\/a/, quoi: "accueil espagnol en double forme" },
  { fichier: "messages/it.json", motif: /Benvenuto\/a/, quoi: "accueil italien en double forme" },
  { fichier: "app/affiliate/i18n/es.ts", motif: /Bienvenido\/a/, quoi: "espace affilié espagnol en double forme" },
  { fichier: "app/affiliate/i18n/it.ts", motif: /Benvenuto\/a/, quoi: "espace affilié italien en double forme" },
  { fichier: "app/affiliate/i18n/pt.ts", motif: /Bem-vindo\/a/, quoi: "espace affilié portugais en double forme" },
];

test("aucun accord au feminin dans ce que lit un utilisateur", () => {
  for (const { fichier, motif, quoi } of INTERDITS) {
    assert.ok(!motif.test(lire(fichier)), `${fichier} : ${quoi}`);
  }
});

test("on ne s'adresse jamais au lecteur en accordant au feminin", () => {
  // Le motif général, pour attraper ce qu'on n'a pas encore écrit.
  // Restreint à l'ADRESSE DIRECTE ("tu es connectée") : voir l'en-tête.
  const motif = /\b[Tt]u (?:es|n'es pas|as été|seras|étais|sois) [a-zà-ÿ' ]{0,12}ée\b/g;
  const fautes: string[] = [];
  for (const { fichier, source } of corpus()) {
    for (const t of source.match(motif) ?? []) fautes.push(`${fichier} : ${t}`);
  }
  assert.deepEqual(fautes, [], `adresse genrée :\n${fautes.join("\n")}`);
});

/** Ce que le quiz sait faire pour SA créatrice n'est pas notre copy. */
const EXCEPTIONS_INCLUSIF: readonly RegExp[] = [
  // L'éditeur propose d'insérer une variante selon le genre dans le
  // texte d'un quiz : cette aide DOIT montrer un exemple ("cher·e"),
  // sinon la fonctionnalité ne s'explique pas.
  /Insérer une variante selon le genre/,
  // "CHF/año", "Faturação/visitante" : un slash de liste ou d'unité, pas
  // une double forme. Le motif exige une LETTRE isolée après le slash,
  // donc "año" ne le déclenche pas : c'est le rôle du lookahead.
];

test("aucun point median ni double forme dans ce que lit un utilisateur", () => {
  const motif = /"[^"]*(?:[A-Za-zÀ-ÿ]·[a-zà-ÿ]{1,3}|[A-Za-zÀ-ÿ]{3,}\/[ao](?![A-Za-zÀ-ÿ]))[^"]*"/g;
  const fautes: string[] = [];
  for (const { fichier, source } of corpus()) {
    for (const ligne of source.match(motif) ?? []) {
      if (EXCEPTIONS_INCLUSIF.some((e) => e.test(ligne))) continue;
      fautes.push(`${fichier} : ${ligne}`);
    }
  }
  assert.deepEqual(fautes, [], `tourner la phrase au lieu d'accorder :\n${fautes.join("\n")}`);
});

test("les tournures neutres sont bien la, pas juste l'ancien texte efface", () => {
  // Un test qui vérifie seulement une ABSENCE passe au vert si quelqu'un
  // supprime la phrase. On vérifie donc aussi ce qui doit s'y trouver.
  assert.match(lire("messages/fr.json"), /Ta session n'est pas active/, "le retour de connexion a changé");
  assert.match(lire("messages/fr.json"), /On booste ton business aujourd'hui/, "la rotation du dashboard a changé");
  assert.match(lire("messages/es.json"), /Te damos la bienvenida a Tipote/, "l'accueil espagnol a changé");
  assert.match(lire("messages/it.json"), /Ti diamo il benvenuto su Tipote/, "l'accueil italien a changé");
  assert.match(lire("app/affiliate/i18n/es.ts"), /Te damos la bienvenida/, "l'espace affilié espagnol a changé");
  assert.match(lire("app/affiliate/i18n/it.ts"), /Ti diamo il benvenuto/, "l'espace affilié italien a changé");
  assert.match(lire("app/affiliate/i18n/pt.ts"), /Damos-te as boas-vindas/, "l'espace affilié portugais a changé");
});
