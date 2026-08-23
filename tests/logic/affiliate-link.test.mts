// tests/logic/affiliate-link.test.mts
//
// PHASE 0 DU PROGRAMME D'AFFILIATION : le lien nous appartient.
//
// Trois décisions y sont figées, et chacune vient d'un drame déjà payé
// dans ce dépôt :
//
//   - un ancien code ne meurt JAMAIS (des liens vivent dans des vidéos
//     YouTube déjà publiées) ;
//   - la liste des mots réservés ne contient QUE nos propres chemins
//     (leçon des slugs publics du 4 août : "on ne peut pas blacklister le
//     mot quiz, beaucoup vont l'utiliser, c'est LOGIQUE") ;
//   - le canal et la provenance sont DEUX informations, pas une.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  REF_MAX_LENGTH,
  REF_MIN_LENGTH,
  REF_RESERVED,
  isValidRef,
  refError,
  sanitizeRef,
  shortCodeFrom,
  suggestRef,
} from "../../lib/affiliate/ref.ts";
import {
  CHANNEL_MAX_LENGTH,
  resolveClickSource,
  sanitizeChannel,
} from "../../lib/affiliate/clickSource.ts";
import { AFFILIATE_LINK_MARKER, buildAffiliateLink } from "../../lib/affiliate/links.ts";
import {
  VISIT_COOKIE_MAX_AGE_SECONDS,
  parseVisit,
  serializeVisit,
} from "../../lib/affiliate/visitCookie.ts";

// -- Le code public ------------------------------------------------------

test("un prenom accentue devient un lien dictable", () => {
  assert.equal(sanitizeRef("Jocelyne Dupré"), "jocelyne-dupre");
  assert.equal(sanitizeRef("  BÉNÉ  "), "bene");
  assert.equal(sanitizeRef("marie_claire"), "marie-claire");
  assert.equal(sanitizeRef("a--b"), "a-b");
  assert.equal(sanitizeRef("-jo-"), "jo");
});

test("le nettoyage ne laisse jamais un tiret en bout, meme apres coupe", () => {
  // 20 caracteres pile, le 20e etant un tiret : la coupe ne doit pas
  // produire "un-nom-tres-tres-lon-" qui serait moche et inutilisable.
  const long = sanitizeRef("un-nom-tres-tres-long-vraiment");
  assert.ok(long.length <= REF_MAX_LENGTH);
  assert.ok(!long.endsWith("-"), long);
  assert.ok(!long.startsWith("-"), long);
});

test("on refuse en NOMMANT la raison, jamais avec une phrase", () => {
  // Le serveur renvoie la RAISON, l'interface sait comment le dire :
  // meme regle que la suppression d'un quiz et que l'import PDF.
  assert.equal(refError(""), "empty");
  assert.equal(refError("   "), "empty");
  assert.equal(refError("jo"), "too_short");
  assert.equal(refError("jocelyne@dupre"), "charset");
  assert.equal(refError("go"), "too_short"); // trop court AVANT d'etre reserve
  assert.equal(refError("admin"), "reserved");
  assert.equal(refError("a".repeat(REF_MAX_LENGTH + 1)), "too_long");
  assert.equal(refError("jocelyne"), null);
});

test("la saisie est jugee AVANT nettoyage sur les caracteres", () => {
  // Sinon "jocelyne@!!" passerait en silence sous le nom "jocelyne", et
  // elle ne comprendrait pas pourquoi son lien n'est pas celui qu'elle a
  // tape.
  assert.equal(refError("jocelyne@!!"), "charset");
  assert.equal(isValidRef("jocelyne@!!"), false);
});

test("la liste des mots reserves ne contient QUE nos chemins", () => {
  // Leçon du 4 aout : une liste d'interdits qui grossit finit par
  // interdire les mots que les gens veulent vraiment. Chaque ajout ici
  // retire un prenom ou un nom de marque a quelqu'un.
  for (const naturel of ["quiz", "tiquiz", "atelier", "marie", "coach", "bene", "formation"]) {
    assert.equal(refError(naturel), null, `"${naturel}" ne devrait pas etre refuse`);
  }
  assert.ok(REF_RESERVED.has("go"));
  assert.ok(REF_RESERVED.has("api"));
  assert.ok(REF_RESERVED.size <= 12, `${REF_RESERVED.size} mots reserves : la liste grossit`);
});

test("la proposition de code part du nom, sinon de l'email", () => {
  assert.equal(suggestRef("Jocelyne Dupré", "jd@exemple.fr"), "jocelyne-dupre");
  assert.equal(suggestRef(null, "jocelyne@exemple.fr"), "jocelyne");
  assert.equal(suggestRef("", ""), "");
  // Un nom trop court ne doit pas produire un code invalide.
  assert.equal(suggestRef("Jo", "jocelyne@exemple.fr"), "jocelyne");
});

test("le code court evite les caracteres qu'on confond a l'oral", () => {
  const code = shortCodeFrom([0, 1, 2, 3, 4, 5, 6, 7], 5);
  assert.equal(code.length, 5);
  assert.ok(/^[a-z2-9]+$/.test(code), code);
  for (const confus of ["0", "1", "l", "o", "i"]) {
    assert.ok(!code.includes(confus), `${code} contient ${confus}`);
  }
  // Deterministe : les memes octets donnent le meme code.
  assert.equal(shortCodeFrom([0, 1, 2, 3, 4], 5), shortCodeFrom([0, 1, 2, 3, 4], 5));
});

// -- D'où vient le clic --------------------------------------------------

test("la provenance se lit sur l'HOTE, jamais sur l'URL entiere", () => {
  // `exemple.com/mon-article-sur-youtube` n'est pas un clic venu de
  // YouTube : c'est le piege classique d'un `includes` sur l'URL.
  assert.equal(resolveClickSource("https://exemple.com/mon-article-sur-youtube"), "web");
  assert.equal(resolveClickSource("https://www.youtube.com/watch?v=abc"), "youtube");
  assert.equal(resolveClickSource("https://youtu.be/abc"), "youtube");
});

test("les reseaux, les webmails et les moteurs sont distingues", () => {
  const attendu: Record<string, string> = {
    "https://www.instagram.com/p/x": "instagram",
    "https://l.instagram.com/?u=x": "instagram",
    "https://www.facebook.com/": "facebook",
    "https://www.tiktok.com/@x": "tiktok",
    "https://www.linkedin.com/feed/": "linkedin",
    "https://www.pinterest.fr/pin/1": "pinterest",
    "https://t.co/abc": "x",
    "https://www.threads.net/@x": "threads",
    "https://www.reddit.com/r/x": "reddit",
    "https://mail.google.com/mail/u/0": "email",
    "https://outlook.live.com/mail": "email",
    "https://www.google.com/search?q=x": "search",
    "https://duckduckgo.com/?q=x": "search",
    "https://un-blog-quelconque.fr/article": "web",
  };
  for (const [referrer, source] of Object.entries(attendu)) {
    assert.equal(resolveClickSource(referrer), source, referrer);
  }
});

test("mail.google gagne sur google : l'ordre de la table compte", () => {
  // Un webmail Gmail n'est PAS une recherche Google. Si l'ordre bascule,
  // toutes les newsletters sont comptees comme du trafic de recherche.
  assert.equal(resolveClickSource("https://mail.google.com/x"), "email");
  assert.notEqual(resolveClickSource("https://mail.google.com/x"), "search");
});

test("fail-open : un referrer illisible ne casse rien", () => {
  assert.equal(resolveClickSource(null), "direct");
  assert.equal(resolveClickSource(""), "direct");
  assert.equal(resolveClickSource("   "), "direct");
  assert.equal(resolveClickSource("pas une url"), "web");
  assert.equal(resolveClickSource("javascript:alert(1)"), "web");
});

test("le canal vide rend null, pas la chaine vide", () => {
  // `''` et `null` seraient deux canaux differents dans un `group by`,
  // donc deux lignes pour la meme chose dans le tableau de l'affilie.
  assert.equal(sanitizeChannel(""), null);
  assert.equal(sanitizeChannel("   "), null);
  assert.equal(sanitizeChannel("!!!"), null);
  assert.equal(sanitizeChannel("Story Mardi"), "story-mardi");
  assert.equal(sanitizeChannel("YouTube"), "youtube");
  const long = sanitizeChannel("a".repeat(CHANNEL_MAX_LENGTH + 10));
  assert.equal(long?.length, CHANNEL_MAX_LENGTH);
});

// -- Le cookie de visite -------------------------------------------------

test("la duree du cookie est EXACTEMENT la fenetre d'attribution", () => {
  // 90 jours des deux cotes. Un cookie plus court perdrait des ventes que
  // la regle dit attribuables ; un cookie plus long promettrait une
  // attribution que la regle refuse.
  assert.equal(VISIT_COOKIE_MAX_AGE_SECONDS, 90 * 24 * 60 * 60);
});

test("la visite se relit telle qu'on l'a ecrite", () => {
  const visite = { ref: "jocelyne", channel: "youtube", linkId: "abc-123" };
  assert.deepEqual(parseVisit(serializeVisit(visite)), visite);

  const sansCanal = { ref: "jocelyne", channel: null, linkId: null };
  assert.deepEqual(parseVisit(serializeVisit(sansCanal)), sansCanal);
});

test("un cookie abime ne fait jamais lever", () => {
  // Il doit juste ne rien attribuer : le visiteur passe avant la donnee.
  for (const casse of [null, undefined, "", "   ", "|||", "|youtube|abc"]) {
    assert.equal(parseVisit(casse), null, JSON.stringify(casse));
  }
});

// -- Le routage ----------------------------------------------------------

test("les routes de redirection existent la ou le sous-domaine les cherche", () => {
  // Piege documente depuis le drame Gwenn du 8 juin :
  // `affiliate.tipote.com/<path>` est reecrit vers `/affiliate/<path>`.
  // Une route posee ailleurs repondrait 404 en prod alors qu'elle marche
  // en local.
  const racine = process.cwd();
  for (const route of [
    "app/affiliate/go/[ref]/[[...rest]]/route.ts",
    "app/affiliate/j/[code]/route.ts",
  ]) {
    assert.ok(fs.existsSync(path.join(racine, route)), `route absente : ${route}`);
  }
});

test("la redirection ne se met JAMAIS en cache", () => {
  // Une redirection mise en cache par un navigateur ou un intermediaire
  // ne repasserait plus par nous : les clics suivants seraient perdus,
  // en silence, et l'affiliee verrait ses compteurs stagner.
  const racine = process.cwd();
  for (const route of [
    "app/affiliate/go/[ref]/[[...rest]]/route.ts",
    "app/affiliate/j/[code]/route.ts",
  ]) {
    const src = fs.readFileSync(path.join(racine, route), "utf8");
    assert.ok(src.includes("no-store"), `${route} ne pose pas Cache-Control: no-store`);
  }
});

test("le `?sa=` reste propage tant que Systeme.io encaisse", () => {
  // L'attribution passe encore par lui : la redirection ne doit surtout
  // pas le retirer le jour du deploiement, sinon toutes les ventes en
  // cours cessent d'etre attribuees.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib/affiliate/goRedirect.ts"),
    "utf8",
  );
  assert.ok(src.includes("buildAffiliateLink"), "la destination ne porte plus le ?sa=");
});

// -- Le marqueur du systeme courant --------------------------------------
//
// Bene, 23 aout 2026 : le mois offert vaut "uniquement avec le systeme
// d'affiliation en cours et pas sur les anciens liens systeme io (qui
// restent valides mais ne seront plus ceux a utiliser dans le futur)".
//
// Les deux generations de liens portent le MEME `?sa=` : sans ce
// marqueur, elles sont indiscernables une fois arrivees chez nous, et
// le cadeau s'ouvrirait sur les anciens liens.

test("tout lien fabrique ici porte le marqueur, et le `sa` d'abord", () => {
  const sa = "sa1234567890abcdef1234";
  const lien = buildAffiliateLink("fr", "/part-tiquiz", sa);
  assert.equal(lien, `https://www.tipote.fr/part-tiquiz?sa=${sa}&${AFFILIATE_LINK_MARKER}`);

  // Une URL absolue (l'affiliee a choisi sa cible) le porte aussi.
  const article = buildAffiliateLink("en", "https://www.tipote.blog/x?utm=1", sa);
  assert.equal(article, `https://www.tipote.blog/x?utm=1&sa=${sa}&${AFFILIATE_LINK_MARKER}`);

  // Le marche ne change que le domaine, jamais le marqueur.
  assert.ok(buildAffiliateLink("en", "/part-tiquiz", sa).endsWith(AFFILIATE_LINK_MARKER));
});

test("le marqueur est ecrit a UN seul endroit", () => {
  // Recopie ailleurs, il finirait par manquer sur un ecran et par
  // promettre un cadeau que le serveur refuserait.
  const racine = process.cwd();
  const suspects: string[] = [];
  const parcourir = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
      const complet = path.join(dir, e.name);
      if (e.isDirectory()) { parcourir(complet); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      if (complet.endsWith("lib/affiliate/links.ts")) continue;
      if (complet.includes("/tests/")) continue;
      // Les commentaires ont le droit de le NOMMER : ce qu'on traque,
      // c'est un deuxieme endroit qui le FABRIQUE.
      const src = fs
        .readFileSync(complet, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (/["'`&?]mo=1/.test(src)) suspects.push(path.relative(racine, complet));
    }
  };
  parcourir(path.join(racine, "lib"));
  parcourir(path.join(racine, "app"));
  assert.deepEqual(suspects, [], `marqueur recopie : ${suspects.join(", ")}`);
});

test("la destination sur NOTRE domaine existe : sans elle le cadeau est mort", () => {
  // Les tunnels Systeme.io ne nous transmettent rien de ce qu'on ajoute
  // a l'URL. Le marqueur ne peut arriver chez nous que par un lien qui
  // atterrit sur un de nos domaines.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib/affiliate/linkDestinations.ts"),
    "utf8",
  );
  assert.ok(src.includes('"tiquiz_direct"'), "slug tiquiz_direct absent du type");
  assert.ok(src.includes("https://tiquiz.fr/"), "destination tiquiz.fr absente du seed");
});
