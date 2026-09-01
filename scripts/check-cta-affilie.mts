// scripts/check-cta-affilie.mts
//
// « ON PEUT VÉRIFIER QUE L'URL DU CTA DU QUIZ SE VOIT BIEN ATTRIBUER
//   L'ID DE L'AFFILIÉ AU BON FORMAT ? » (Béné, 1er septembre 2026)
//
// Oui, et pas en le déduisant du code : ce script prend le lien tel
// qu'un affilié le partage, va chercher le VRAI quiz sur le serveur, et
// imprime exactement l'adresse que portera chaque bouton.
//
//   npm run check:cta-affilie -- "https://app.tipote.com/q/mon-quiz?sa=sa0007..."
//
// Il appelle les MÊMES fonctions que le viewer public
// (`lireAffiliateDuQuiz` puis `attacherAffiliate`). Un script qui
// réécrirait la règle finirait par dire le contraire de ce que le
// visiteur voit : c'est le défaut sorti six fois dans ces dépôts, celui
// de l'aperçu qui recalcule au lieu d'appeler.
//
// LES DEUX MOITIÉS, ET ELLES NE FONT PAS LA MÊME CHOSE (cf.
// `lib/quiz/affiliateRelay.ts`) :
//   1. ÉTIQUETER LE LEAD : qui a amené ce contact. C'est chez nous.
//   2. FAIRE PAYER : le bouton emmène l'identifiant sur la page de
//      vente, et c'est LE SYSTÈME DU VENDEUR qui pose son cookie.
// Ce script vérifie la deuxième, celle qui paie.

import { lireAffiliateDuQuiz, attacherAffiliate, affiliateAbsent } from "@/lib/quiz/affiliateRelay";

const argument = process.argv[2]?.trim() ?? "";

function mourir(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!argument) {
  mourir(
    "Donne le lien du quiz tel qu'un affilié le partage, entre guillemets :\n" +
      '  npm run check:cta-affilie -- "https://app.tipote.com/q/mon-quiz?sa=sa0007..."',
  );
}

let url: URL;
try {
  url = new URL(argument);
} catch {
  mourir(`Ce n'est pas une adresse web : ${argument}`);
}

const affilie = lireAffiliateDuQuiz(url.search);

console.log("");
console.log("CE QUE LE LIEN PORTE");
console.log(`  sa    : ${affilie.sa ?? "(aucun)"}`);
console.log(`  ref   : ${affilie.ref ?? "(aucun)"}`);
console.log(`  canal : ${affilie.canal ?? "(aucun)"}`);

// LE PIÈGE PRINCIPAL, ET C'EST POUR ÇA QUE LE SCRIPT EXISTE : un `sa`
// qui n'a pas la forme attendue est JETÉ SANS BRUIT (c'est voulu : il
// finit dans un versement). À l'écran, ça ne se voit pas : le bouton
// mène quelque part, il ne porte simplement rien.
if (affiliateAbsent(affilie)) {
  const brut = url.searchParams.get("sa");
  console.log("");
  console.log("AUCUN AFFILIÉ NE SERA TRANSPORTÉ.");
  if (brut) {
    console.log(`  Le lien porte bien ?sa=${brut}`);
    console.log("  mais cette valeur n'a pas la forme d'un identifiant Systeme.io :");
    console.log('  "sa" suivi de 20 à 80 caractères hexadécimaux (0-9, a-f).');
    console.log(`  Celle-ci fait ${brut.length} caractères.`);
    console.log("  -> demande à l'affilié le lien EXACT qu'il utilise.");
  } else {
    console.log("  Le lien ne porte ni ?sa= ni ?ref=.");
  }
  console.log("");
  process.exit(1);
}

// On va chercher le quiz REEL : les boutons sont ceux de la créatrice,
// pas ceux qu'on imagine.
const chemin = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
const identifiant = chemin[chemin.length - 1] ?? "";
if (!identifiant) mourir(`Impossible de lire l'identifiant du quiz dans ${url.pathname}`);

const api = `${url.origin}/api/quiz/${encodeURIComponent(identifiant)}/public`;
console.log("");
console.log(`LECTURE DU QUIZ : ${api}`);

let donnees: any;
try {
  const res = await fetch(api, { headers: { accept: "application/json" } });
  if (!res.ok) mourir(`  Le serveur répond ${res.status}. Le quiz est-il publié ?`);
  donnees = await res.json();
} catch (e) {
  mourir(`  Injoignable : ${e instanceof Error ? e.message : String(e)}`);
}

const quiz = donnees?.quiz ?? {};
const resultats: any[] = Array.isArray(donnees?.results) ? donnees.results : [];

const boutons: { ou: string; avant: string }[] = [];
if (quiz.cta_url) boutons.push({ ou: "bouton de fin (quiz / sondage)", avant: String(quiz.cta_url) });
for (const r of resultats) {
  if (r?.cta_url) boutons.push({ ou: `bouton du profil "${String(r.title ?? "").slice(0, 40)}"`, avant: String(r.cta_url) });
}
if (quiz.close_cta_url) boutons.push({ ou: "bouton du quiz fermé", avant: String(quiz.close_cta_url) });
if (quiz.close_redirect_url) boutons.push({ ou: "redirection du quiz fermé", avant: String(quiz.close_redirect_url) });

console.log("");
if (boutons.length === 0) {
  console.log("AUCUN BOUTON SORTANT SUR CE QUIZ.");
  console.log("  Il n'y a donc rien à commissionner : l'identifiant est bien");
  console.log("  transporté, mais aucun lien ne mène à une page de vente.");
  console.log("");
  process.exit(1);
}

console.log("CE QUE CHAQUE BOUTON PORTERA");
let manquants = 0;
for (const b of boutons) {
  const apres = attacherAffiliate(b.avant, affilie);
  const porte = affilie.sa ? apres.includes(`sa=${affilie.sa}`) : apres.includes(`ref=${affilie.ref}`);
  if (!porte) manquants += 1;
  console.log("");
  console.log(`  ${b.ou}`);
  console.log(`    avant : ${b.avant}`);
  console.log(`    après : ${apres}`);
  console.log(`    ${porte ? "OK" : "!! l'identifiant n'a PAS été ajouté"}`);
  if (!porte && /[?&]sa=/.test(b.avant)) {
    console.log("    (la créatrice a écrit son propre ?sa= dans ce bouton :");
    console.log("     c'est le sien qui compte, on ne le remplace jamais)");
  }
}

console.log("");
if (manquants === 0) {
  console.log("TOUS LES BOUTONS PORTENT L'IDENTIFIANT.");
  console.log("Reste la moitié qu'on ne contrôle pas : le système du vendeur");
  console.log("pose SON cookie quand le visiteur atterrit sur SA page.");
  console.log("");
  process.exit(0);
}
console.log(`${manquants} bouton(s) ne portent pas l'identifiant. Voir la raison ci-dessus.`);
console.log("");
process.exit(1);
