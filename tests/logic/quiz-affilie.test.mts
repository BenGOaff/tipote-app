// tests/logic/quiz-affilie.test.mts
//
// UN QUIZ PORTE L'AFFILIÉ QUI L'A PARTAGÉ (demande Maurice, 27 août).
//
// Il dupliquait son quiz une fois par affilié pour savoir qui lui
// amenait quel contact. Il n'en faut qu'un : l'affilié colle son
// identifiant à la fin du lien, et le quiz le transporte jusqu'au bout.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  affiliateAbsent,
  attacherAffiliate,
  etiquetteSource,
  lireAffiliateDuQuiz,
  lireAffiliateEnregistre,
} from "@/lib/quiz/affiliateRelay";

const SA = "sa" + "a1b2c3d4e5f6a7b8c9d0";

test("le lien du quiz rend le sa, le ref et le canal", () => {
  const a = lireAffiliateDuQuiz(`?sa=${SA}&ref=jocelyne&c=youtube`);
  assert.equal(a.sa, SA);
  assert.equal(a.ref, "jocelyne");
  assert.equal(a.canal, "youtube");
});

test("une valeur qui n'a pas la forme attendue est jetée sans bruit", () => {
  // Ces valeurs viennent d'une URL publique : n'importe qui peut en
  // poser n'importe laquelle.
  const a = lireAffiliateDuQuiz("?sa=nimportequoi&ref=A%20B%20C");
  assert.equal(a.sa, null);
  assert.equal(a.ref, null);
  assert.equal(affiliateAbsent(a), true);
});

test("sa et ref ne se devinent jamais l'un l'autre", () => {
  // Le jour où une affiliée choisit un code qui RESSEMBLE à un sa, le
  // deviner à la forme paierait la mauvaise personne.
  const a = lireAffiliateDuQuiz(`?ref=${SA}`);
  assert.equal(a.sa, null, "un ref ne devient pas un sa");
  const b = lireAffiliateDuQuiz(`?sa=${SA}`);
  assert.equal(b.ref, null, "un sa ne devient pas un ref");
});

test("le bouton de fin emporte l'identifiant sur la page de vente", () => {
  // C'est la moitié qui PAIE : le systeme du vendeur pose son cookie
  // quand le visiteur atterrit sur SA page.
  const a = lireAffiliateDuQuiz(`?sa=${SA}`);
  assert.equal(
    attacherAffiliate("https://maurice.com/offre", a),
    `https://maurice.com/offre?sa=${SA}`,
  );
  // Une query existante est conservée.
  assert.equal(
    attacherAffiliate("https://maurice.com/offre?utm_source=quiz", a),
    `https://maurice.com/offre?utm_source=quiz&sa=${SA}`,
  );
});

test("les deux identifiants voyagent, on ne choisit pas à la place de la créatrice", () => {
  // On ne sait pas vers quel système pointe son bouton, et chaque
  // système ignore le paramètre qu'il ne connaît pas.
  const a = lireAffiliateDuQuiz(`?sa=${SA}&ref=jocelyne`);
  const url = attacherAffiliate("https://exemple.com/vente", a);
  assert.ok(url.includes(`sa=${SA}`));
  assert.ok(url.includes("ref=jocelyne"));
});

test("un paramètre déjà écrit par la créatrice n'est JAMAIS remplacé", () => {
  // C'est son lien. Si elle y a mis son propre sa, c'est le sien qui
  // compte.
  const a = lireAffiliateDuQuiz(`?sa=${SA}`);
  const sien = "sa" + "0000000000000000000f";
  assert.equal(
    attacherAffiliate(`https://maurice.com/offre?sa=${sien}`, a),
    `https://maurice.com/offre?sa=${sien}`,
  );
});

test("on ne touche jamais à un lien qui n'est pas une adresse web", () => {
  const a = lireAffiliateDuQuiz(`?sa=${SA}`);
  // mailto: et tel: n'ont pas de query.
  assert.equal(attacherAffiliate("mailto:bonjour@exemple.com", a), "mailto:bonjour@exemple.com");
  assert.equal(attacherAffiliate("tel:+33600000000", a), "tel:+33600000000");
  // Et surtout : y coller un paramètre reviendrait à fabriquer du code.
  assert.equal(attacherAffiliate("javascript:alert(1)", a), "javascript:alert(1)");
});

test("un lien interne reste interne", () => {
  // Rendre une URL absolue sur un chemin relatif enverrait le visiteur
  // sur un domaine qui n'est pas celui du quiz.
  const a = lireAffiliateDuQuiz("?ref=jocelyne");
  assert.equal(attacherAffiliate("/merci", a), "/merci?ref=jocelyne");
  assert.equal(attacherAffiliate("/merci#bas", a), "/merci?ref=jocelyne#bas");
});

test("sans affilié, le lien de la créatrice ne bouge pas d'un caractère", () => {
  const vide = lireAffiliateDuQuiz("");
  assert.equal(attacherAffiliate("https://maurice.com/offre", vide), "https://maurice.com/offre");
  assert.equal(attacherAffiliate("https://maurice.com/offre", null), "https://maurice.com/offre");
});

test("une URL illisible est rendue telle quelle", () => {
  // Un bouton qui mène quelque part vaut mieux qu'un bouton mort.
  const a = lireAffiliateDuQuiz("?ref=jocelyne");
  assert.equal(attacherAffiliate("http://[oups", a), "http://[oups");
});

test("le tag des statistiques dit le canal avant le code", () => {
  // Quand l'affilié a pris la peine d'écrire ?c=youtube, c'est cette
  // réponse là qu'il est venu chercher.
  assert.equal(
    etiquetteSource({ sa: SA, ref: "jocelyne", canal: "youtube" }, "sans affilié"),
    "youtube",
  );
  assert.equal(etiquetteSource({ sa: SA, ref: "jocelyne", canal: null }, "sans affilié"), "jocelyne");
  assert.equal(etiquetteSource({ sa: SA, ref: null, canal: null }, "sans affilié"), SA);
  // Une case vide se lit comme une donnée manquante, alors que c'est
  // une information.
  assert.equal(etiquetteSource(null, "sans affilié"), "sans affilié");
  assert.equal(etiquetteSource({ sa: null, ref: null, canal: null }, "sans affilié"), "sans affilié");
});

test("un affilié relu du stockage repasse par les mêmes contrôles", () => {
  // LE PIÈGE : un champ enregistré à `null` revient en chaîne "null",
  // qui a exactement la forme d'un code public valide. Sans ce
  // re-contrôle, les leads seraient attribués à un affilié nommé
  // "null", et ça ne se verrait qu'au moment d'un versement.
  assert.deepEqual(
    lireAffiliateEnregistre(JSON.stringify({ sa: null, ref: null, canal: null })),
    { sa: null, ref: null, canal: null },
  );
  assert.deepEqual(
    lireAffiliateEnregistre(JSON.stringify({ sa: SA, ref: "jocelyne", canal: "youtube" })),
    { sa: SA, ref: "jocelyne", canal: "youtube" },
  );
});

test("un stockage abîmé ne casse pas le quiz du visiteur", () => {
  for (const brut of ["", null, undefined, "pas du json", "[]", '"texte"', "42"]) {
    assert.deepEqual(lireAffiliateEnregistre(brut), { sa: null, ref: null, canal: null });
  }
});

// -- LA PLOMBERIE, AUX ENDROITS OU L'OUBLI NE SE VOIT PAS -------------

test("une capture ne peut PAS échouer parce que la migration n'est pas passée", () => {
  // PostgREST rejette l'écriture ENTIÈRE sur une colonne inconnue. Sans
  // repli, un déploiement en avance sur la base ferait échouer TOUTES
  // les captures, sur tous les quiz, pendant que l'écran continue
  // d'afficher un formulaire qui a l'air de marcher. C'est le drame
  // `quiz_events.meta` de juin, en pire : des leads, pas des compteurs.
  const src = readFileSync("app/api/quiz/[quizId]/public/route.ts", "utf8");
  assert.match(src, /function colonneInconnue/);
  assert.match(src, /colonneInconnue\(error\)/);
  assert.match(src, /ecrireLead\(\{\}\)/, "aucun second essai sans les colonnes d'affilié");
});

test("le serveur revalide l'affilié au lieu de croire le navigateur", () => {
  const src = readFileSync("app/api/quiz/[quizId]/public/route.ts", "utf8");
  assert.match(src, /lireAffiliateObjet\(/);
});

test("un lead sans affilié n'écrase pas celui du premier passage", () => {
  // L'upsert se fait sur (quiz_id, email) : un visiteur qui revient par
  // un lien nu ne doit pas effacer l'affilié qui l'a amené.
  const src = readFileSync("app/api/quiz/[quizId]/public/route.ts", "utf8");
  assert.match(src, /affiliateAbsent\(affiliate\)\s*\?\s*\{\}/);
});

test("le lien légal ne porte JAMAIS l'identifiant d'affilié", () => {
  // Un lien vers la politique de confidentialité avec un ?sa= dessus
  // est au mieux du bruit, au pire suspect au moment précis où on
  // demande à quelqu'un de faire confiance.
  const src = readFileSync("components/quiz/PublicQuizClient.tsx", "utf8");
  assert.ok(
    !/lienSortant\(privacyUrl\)/.test(src),
    "l'affilié est collé sur le lien de confidentialité",
  );
  assert.match(src, /ensureExternalUrl\(privacyUrl\)/);
  // Et il EST bien collé sur le bouton qui mène à la vente.
  assert.match(src, /lienSortant\(ctaUrl\)/);
});

test("on n'ecrit PLUS l'affilie sur la fiche contact Systeme.io", () => {
  // Béné, 27 août : Systeme.io porte DÉJÀ l'affilié nativement sur le
  // contact ("Identifiant affilié" et "Affilié" sur sa fiche), rempli
  // tout seul quand la personne arrive par un lien qui porte ?sa=.
  // Un champ personnalisé en plus n'ajoutait rien, demandait au vendeur
  // de le créer, et échouait EN SILENCE s'il ne le faisait pas.
  const src = readFileSync("app/api/quiz/[quizId]/public/route.ts", "utf8");
  assert.ok(!/tiquiz_affiliate/.test(src), "le champ personnalisé est revenu");
  assert.ok(!/marquerAffilieSio/.test(src));
});

test("la carte des sources ne s'affiche pas sans trafic affilié", () => {
  // Une carte à une seule ligne à 100% est du bruit pour toutes les
  // créatrices qui n'ont pas de programme d'affiliation.
  const src = readFileSync("components/quiz/QuizResultsAnalytics.tsx", "utf8");
  assert.match(src, /if \(avecAffilie === 0\) return \[\];/);
});

test("un code d'URL doit déjà être canonique, on ne le reforme pas", () => {
  // `sanitizeRef` est fait pour une SAISIE À LA MAIN ("Jocelyne Dupré"
  // -> jocelyne-dupre). Appliqué à une URL publique, il transformerait
  // `?ref=A B C` en `a-b-c` et créditerait un affilié qui s'appelle
  // vraiment `a-b-c` et qui n'a rien fait. Le lien est fabriqué par
  // buildAffiliateLink, donc déjà propre.
  assert.equal(lireAffiliateDuQuiz("?ref=A%20B%20C").ref, null);
  assert.equal(lireAffiliateDuQuiz("?ref=jocelyne_dupre").ref, null);
  // La casse et le blanc autour ne réécrivent aucun code : eux passent.
  assert.equal(lireAffiliateDuQuiz("?ref=JOCELYNE").ref, "jocelyne");
  assert.equal(lireAffiliateDuQuiz("?ref=%20jocelyne%20").ref, "jocelyne");
});
