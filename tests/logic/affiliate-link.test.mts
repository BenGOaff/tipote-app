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
import { AFFILIATE_LINK_PARAM, buildAffiliateLink } from "../../lib/affiliate/links.ts";
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

// -- NOS LIENS PORTENT `?ref=`, PLUS JAMAIS `?sa=` -----------------------
//
// Bene, 24 aout 2026 : "je ne veux surtout pas de sa dans les nouveaux
// liens sinon y'a forcement un moment ou on va merder, trouver autre
// chose nom de zeus ! Y'a pas que ce systeme, c'est celui de systeme io
// c'est tout !!"
//
// Le `sa` reste la cle INTERNE des commissions (tout l'historique est
// dessus). Ce qui change, c'est qu'il ne sort plus dans une URL
// publique. Effet de bord decisif : le NOM DU PARAMETRE dit a lui seul
// la generation du lien, ce qui a permis de supprimer le marqueur
// `mo=1` du 23 aout.

test("un lien fabrique ici porte le code public, et RIEN d'autre", () => {
  const lien = buildAffiliateLink("fr", "/part-tiquiz", "jocelyne");
  assert.equal(lien, "https://www.tipote.fr/part-tiquiz?ref=jocelyne");

  // Une URL absolue (l'affiliee a choisi sa cible) le porte aussi.
  const article = buildAffiliateLink("en", "https://www.tipote.blog/x?utm=1", "jocelyne");
  assert.equal(article, "https://www.tipote.blog/x?utm=1&ref=jocelyne");

  // Le marche ne change que le domaine, jamais le parametre.
  assert.ok(buildAffiliateLink("en", "/part-tiquiz", "bene").endsWith("?ref=bene"));
});

test("AUCUN lien fabrique ici ne porte de `sa`", () => {
  // C'est la demande, mot pour mot. Un `?sa=` qui reviendrait ici
  // remelangerait les deux systemes, et la premiere consequence serait
  // d'offrir le mois sur des liens qui ne doivent pas l'ouvrir.
  for (const cible of ["/part-tiquiz", "/atelier-du-quiz", "", "https://exemple.fr/x"]) {
    const lien = buildAffiliateLink("fr", cible, "jocelyne");
    assert.ok(!/[?&]sa=/.test(lien), `un sa dans ${lien}`);
    assert.ok(!/[?&]mo=/.test(lien), `un marqueur mo dans ${lien}`);
  }
  assert.equal(AFFILIATE_LINK_PARAM, "ref");
});

test("le code est encode : un lien ne se casse pas sur un caractere", () => {
  // `sanitizeRef` ne laisse passer que [a-z0-9-], mais cette fonction
  // recoit une chaine, pas une garantie.
  const lien = buildAffiliateLink("fr", "/x", "a b");
  assert.ok(!lien.includes(" "), lien);
});

test("le parametre est ecrit a UN seul endroit", () => {
  // Recopie ailleurs, il finirait par diverger, et le jour ou il diverge
  // plus personne n'est paye.
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
      // c'est un deuxieme endroit qui FABRIQUE un lien.
      const src = fs
        .readFileSync(complet, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // Un appel a NOTRE propre API (`/api/affiliate/ref?ref=...`) n'est
      // pas un lien d'affiliation : ce qu'on traque, c'est une deuxieme
      // fabrication de lien PUBLIC.
      const fabrique = src
        .split("\n")
        .some((l) => /[?&`]ref=\$\{/.test(l) && !l.includes("/api/"));
      if (fabrique) suspects.push(path.relative(racine, complet));
    }
  };
  parcourir(path.join(racine, "lib"));
  parcourir(path.join(racine, "app"));
  assert.deepEqual(suspects, [], `parametre recopie : ${suspects.join(", ")}`);
});

test("le `sa` reste la cle INTERNE, il n'est pas supprime", () => {
  // Toutes les commissions, conversions et versements sont dessus : le
  // retirer de la base perdrait l'historique. Ce qui est interdit, c'est
  // qu'il sorte dans une URL publique.
  const session = fs.readFileSync(
    path.join(process.cwd(), "lib/affiliate/session.ts"),
    "utf8",
  );
  assert.match(session, /sa: row\.sa/);
  assert.match(session, /ref: row\.ref/);
});

test("toute affiliee finit par avoir un code, meme inscrite avant", () => {
  // Sans code, `buildAffiliateLink` n'aurait rien a ecrire, et le repli
  // evident (son `sa`) ramenerait exactement ce qui vient d'etre refuse.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib/affiliate/refServer.ts"),
    "utf8",
  );
  assert.match(src, /export async function assurerRefAffiliee/);
  // Le code de repli est DETERMINISTE : deux onglets ouverts doivent
  // proposer le meme, sinon on ecrit deux codes pour la meme personne.
  assert.ok(!/randomBytes|Math\.random/.test(src), "le code de repli est tire au hasard");
});

test("les ecrans ne proposent AUCUN lien plutot qu'un lien muet", () => {
  // Un lien sans code se partage quand meme, et chaque partage est une
  // vente perdue que personne ne peut plus retrouver.
  for (const f of ["app/affiliate/promouvoir/page.tsx", "app/affiliate/page.tsx"]) {
    const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    assert.match(src, /refCode \? buildAffiliateLink/, `${f} : lien construit sans code`);
  }
});

test("une destination ajoutee en code n'exige plus de migration", () => {
  // Chaque nouvelle destination demandait un INSERT a passer a la main,
  // donc une migration de plus a ne pas oublier : exactement la
  // mecanique qui a coute 15 jours de stats en juin.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib/affiliate/linkDestinations.ts"),
    "utf8",
  );
  assert.match(src, /const manquants = FALLBACK\.filter\(\(f\) => !connus\.has\(f\.slug\)\)/);
  // Et ca ne ressuscite rien : l'admin desactive (enabled=false), il ne
  // supprime jamais une ligne.
  const admin = fs.readFileSync(
    path.join(process.cwd(), "app/affiliate/api/admin/links/route.ts"),
    "utf8",
  );
  assert.ok(!/\.delete\(\)/.test(admin), "l'admin supprime des lignes : le seed les ferait revenir");
});

// ── LES LIENS ATTERRISSENT SUR NOS DOMAINES (25 août 2026) ──────────
//
// Béné : "toutes, d'un bloc". Jusqu'ici 7 destinations sur 8 menaient à
// des tunnels Systeme.io, dont les pages ne nous transmettent RIEN de ce
// qu'on ajoute à l'URL : un `?ref=` posé dessus n'atteignait jamais
// notre bon de commande, donc ni notre commissionnement ni le mois
// offert.
//
// Ces tests portent sur le SEED, pas sur la base : c'est lui qui décide
// pour toute destination qu'une ligne n'a pas encore surchargée, et
// c'est lui qu'on lit quand on se demande où mène un lien.

/** Le seed, lu dans la source : il n'est pas exporté, et c'est voulu. */
function seedDestinations(): { slug: string; path: string }[] {
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib/affiliate/linkDestinations.ts"),
    "utf8",
  );
  const bloc = src.slice(src.indexOf("const FALLBACK"), src.indexOf("];", src.indexOf("const FALLBACK")));
  const lignes = [...bloc.matchAll(/slug:\s*"([a-z_]+)",\s*path:\s*"([^"]*)"/g)];
  return lignes.map((m) => ({ slug: m[1], path: m[2] }));
}

/** Les hôtes qui sont à NOUS, et sur lesquels un `?ref=` nous revient. */
const NOS_DOMAINES = ["tiquiz.fr", "quiz.tipote.com", "atelierduquiz.fr", "app.tipote.com"];

test("les 8 destinations du seed sont toujours la", () => {
  // Une destination qui disparait du seed est un lien mort dans des
  // videos deja publiees. Le test le dit avant la mise en ligne.
  const slugs = seedDestinations().map((d) => d.slug).sort();
  assert.deepEqual(slugs, [
    "atelier", "tiquiz_direct", "tiquiz_free", "tiquiz_main",
    "tiquiz_monthly", "tiquiz_monthly_plus", "tiquiz_yearly", "tiquiz_yearly_plus",
  ]);
});

/**
 * LES DEUX EXCEPTIONS, ET ELLES SONT NOMMÉES.
 *
 * - `tiquiz_free` : un optin, dont le formulaire cree le contact et pose
 *   le tag chez Systeme.io.
 * - `atelier` : l'Atelier a son PROPRE registre d'affiliés
 *   (`profiles.sio_affiliate_id` dans SA base, pas la table `affiliates`
 *   d'ici) et ne lit que `?sa=`. Repointer changerait QUI est payé.
 */
const RESTENT_CHEZ_SYSTEME_IO = ["tiquiz_free", "atelier"];

test("TOUTES les destinations menent chez nous, sauf deux exceptions nommees", () => {
  for (const d of seedDestinations()) {
    if (RESTENT_CHEZ_SYSTEME_IO.includes(d.slug)) continue;
    assert.ok(
      /^https?:\/\//i.test(d.path),
      `${d.slug} : un chemin relatif part sur le domaine de vente Systeme.io (${d.path})`,
    );
    const hote = new URL(d.path).hostname;
    assert.ok(
      NOS_DOMAINES.includes(hote),
      `${d.slug} pointe sur ${hote}, qui ne nous transmet pas le ?ref=`,
    );
  }
});

test("L'OPTIN GRATUIT RESTE chez Systeme.io, et c'est deliberé", () => {
  // Son formulaire cree le contact et pose le tag chez eux, et c'est le
  // seul evenement qui porte une URL de tunnel, donc le seul qui sait
  // d'ou vient l'inscrit. Le remplacer ferait disparaitre ces inscrits
  // de ses sequences email.
  const gratuit = seedDestinations().find((d) => d.slug === "tiquiz_free");
  assert.equal(gratuit?.path, "/part-tiquiz-gratuit");
  // Et l'Atelier, pour la raison ecrite juste au dessus.
  assert.equal(seedDestinations().find((d) => d.slug === "atelier")?.path, "/atelier-du-quiz");
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib/affiliate/linkDestinations.ts"),
    "utf8",
  );
  // Et la RAISON est ecrite a cote : sans elle, le prochain qui passe
  // "finit le travail" et casse le tunnel gratuit.
  assert.match(src, /RESTE chez Systeme\.io, et c'est deliberé/);
  assert.match(src, /son PROPRE registre d'affiliés/);
});

test("les paliers menent a NOTRE bon de commande, pas a une page morte", () => {
  // Les pages `-mensuel` de Systeme.io ne sont PAS des pages de vente :
  // ce sont leurs BONS DE COMMANDE, avec un `<form id="form-checkout">`
  // sans action, pilote par leur JavaScript. Les repliquer donnerait un
  // formulaire de paiement mort.
  const attendus: Record<string, string> = {
    tiquiz_monthly: "https://tiquiz.fr/commande/mensuel",
    tiquiz_monthly_plus: "https://tiquiz.fr/commande/mensuel-plus",
    tiquiz_yearly: "https://tiquiz.fr/commande/annuel",
    tiquiz_yearly_plus: "https://tiquiz.fr/commande/annuel-plus",
  };
  const seed = Object.fromEntries(seedDestinations().map((d) => [d.slug, d.path]));
  for (const [slug, path] of Object.entries(attendus)) {
    assert.equal(seed[slug], path, `${slug} ne mene plus a notre bon de commande`);
  }
});

test("le lien construit porte bien le ?ref= sur ces destinations", () => {
  // Le bout de chaine qui compte : une URL absolue est laissee telle
  // quelle, et le code public s'y ajoute quand meme.
  for (const d of seedDestinations()) {
    const lien = buildAffiliateLink("fr", d.path, "jocelyne");
    assert.match(
      lien,
      new RegExp(`[?&]${AFFILIATE_LINK_PARAM}=jocelyne$`),
      `${d.slug} : le lien ne porte pas le code public`,
    );
  }
});
