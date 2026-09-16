// tests/logic/plus-jamais-nbsp.test.mts
//
// `&nbsp;` EN CLAIR : LA CAUSE ÉTAIT NOTRE PROPRE SANITIZE
// (retour d'un client via Béné, 16 septembre 2026).
//
// « j'ai encore des putains de "Quelle note donneriez-vous à la structure
// de l'entreprise&nbsp;?" !!! Il faut vraiment faire le tour et supprimer
// ça aussi bien côté users que visiteurs, sans nicker les espaces
// nécessaires en français. [...] ça fait des MOIS que j'essaye de régler
// ce problème qui revient toujours quelque part, c'est infernal. »
//
// Et la phrase du client, qui contenait le diagnostic : « Y'a que
// celle-là et c'est pas sur la passation ! »
//
// CE QUI A ÉTÉ MESURÉ, avant d'écrire une ligne. Le sérialiseur de
// DOMPurify réencode U+00A0 en `&nbsp;` dès que le champ porte UNE
// balise :
//
//   sanitizeRichText("entreprise ?")          -> "entreprise ?"
//   sanitizeRichText("<b>x</b> entreprise ?") -> "<b>x</b> entreprise&nbsp;?"
//
// Or `lib/frenchTypography.ts` INSÈRE ce caractère devant `? ! : ;` à
// chaque enregistrement. Donc :
//
// 1. une question JAMAIS mise en forme garde le caractère, et elle va
//    bien : c'est exactement le « y'a que celle-là » ;
// 2. une question mise en forme repart de la base avec l'entité ;
// 3. le viewer public la rend en HTML, donc le visiteur ne voit rien :
//    c'est le « c'est pas sur la passation » ;
// 4. le moindre écran qui la rend en TEXTE BRUT l'affiche en clair.
//    Ici, les statistiques d'un sondage (`SurveyTrends`).
//
// C'est pour ça que « ça revient toujours » : nettoyer la base n'aurait
// servi à rien, l'entité serait revenue au premier enregistrement.
//
// LA CORRECTION EST DONC EN DEUX MOITIÉS, et il faut les deux :
// - on ne FABRIQUE plus l'entité (`sansEntiteInsecable`, au sortir de
//   DOMPurify) ;
// - il n'y a plus qu'UNE porte vers le texte brut (`lib/texteBrut.ts`),
//   et le balayage ci-dessous interdit d'en réécrire une autre.
//
// ET L'ESPACE FRANÇAISE EST PRÉSERVÉE, c'est sa contrainte : on rend le
// CARACTÈRE insécable, pas rien et pas une espace ordinaire. Une espace
// ordinaire laisserait le `?` tomber seul à la ligne suivante, le drame
// Damien du 27 août.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeRichText } from "@/lib/richText";
import { decodeHtmlEntities, sansEntiteInsecable, stripHtml } from "@/lib/texteBrut";
import { applyFrenchTypography, applyFrenchTypographyDeep } from "@/lib/frenchTypography";
import { sansCommentaires } from "./aide/sansCommentaires.mts";

const NBSP = " ";
const LA_QUESTION = "Quelle note donneriez-vous à la structure de l'entreprise";

// ── 1. On ne fabrique plus l'entité ──────────────────────────────────

test("ce que le client a vu : une question mise en forme ne repart plus avec l'entite", () => {
  const sortie = sanitizeRichText(`<b>${LA_QUESTION}</b>${NBSP}?`);
  assert.ok(!sortie.includes("&nbsp;"), sortie);
  assert.ok(sortie.includes(`${NBSP}?`), "l'espace insecable doit RESTER : " + sortie);
});

test("l'espace francaise est preservee, pas supprimee (sa contrainte)", () => {
  // "sans nicker les espaces necessaires en francais". Le caractere
  // insecable EST l'espace francaise : la retirer serait la faute
  // inverse, et une espace ordinaire laisserait le `?` tomber seul a la
  // ligne suivante.
  for (const signe of ["?", "!", ":", ";"]) {
    const sortie = sanitizeRichText(`<i>Alors</i>${NBSP}${signe}`);
    assert.ok(sortie.includes(NBSP + signe), `${signe} : ${sortie}`);
    assert.ok(!sortie.includes("&nbsp;"), `${signe} : ${sortie}`);
  }
});

test("le passage est idempotent : deux et trois fois rendent la meme chose", () => {
  // Une regle qui tourne a CHAQUE enregistrement doit etre un point fixe,
  // sinon le texte derive un peu plus a chaque sauvegarde et personne ne
  // voit rien avant que ce soit illisible (lecon du 1er septembre).
  const un = sanitizeRichText(`<b>x</b>${NBSP}? &amp; <span>y</span>`);
  assert.equal(sanitizeRichText(un), un);
  assert.equal(sanitizeRichText(sanitizeRichText(un)), un);
});

test("les entites STRUCTURELLES restent encodees", () => {
  // `&amp;` `&lt;` `&gt;` ne sont pas cosmetiques : les decoder casserait
  // le HTML. Seule `&nbsp;` a un caractere equivalent qui s'affiche a
  // l'identique.
  const sortie = sanitizeRichText("<b>a</b> & puis < et >");
  assert.ok(sortie.includes("&amp;"), sortie);
  assert.ok(sortie.includes("&lt;"), sortie);
  assert.ok(sortie.includes("&gt;"), sortie);
});

test("une creatrice qui ecrit vraiment le texte `&nbsp;` le garde", () => {
  // Il arrive en `&amp;nbsp;` : le motif exige un `&` colle devant
  // `nbsp;`, et il y a `amp;` entre les deux. On ne reecrit pas ce
  // qu'elle a tape.
  const sortie = sanitizeRichText("<b>on ecrit</b> &amp;nbsp; dans le code");
  assert.ok(sortie.includes("&amp;nbsp;"), sortie);
});

test("les formes numeriques de l'insecable sont couvertes", () => {
  assert.equal(sansEntiteInsecable("a&#160;b"), `a${NBSP}b`);
  assert.equal(sansEntiteInsecable("a&#xa0;b"), `a${NBSP}b`);
  assert.equal(sansEntiteInsecable("a&#x00A0;b"), `a${NBSP}b`);
});

// ── 2. La porte vers le texte brut ───────────────────────────────────

test("stripHtml ne laisse AUCUNE entite, et garde l'espace", () => {
  const stocke = `<span style="color:red">${LA_QUESTION}</span>&nbsp;?`;
  const nu = stripHtml(stocke);
  assert.equal(nu, `${LA_QUESTION} ?`);
  assert.ok(!nu.includes("&"), nu);
});

test("decodeHtmlEntities rend l'INSECABLE, pas une espace ordinaire", () => {
  // Le commentaire d'avant disait "un noeud de texte n'a pas besoin de
  // l'insecable pour ne pas couper". C'est FAUX : un noeud de texte
  // coupe sur une espace ordinaire comme n'importe ou ailleurs. On
  // aurait retire l'espace francaise qu'on venait d'inserer.
  assert.equal(decodeHtmlEntities("Prêt&nbsp;?"), `Prêt${NBSP}?`);
  assert.equal(decodeHtmlEntities("a &amp; b"), "a & b");
});

// ── 3. Le pipeline REEL, bout en bout ────────────────────────────────

test("bout en bout : ce qui part en base ne porte plus l'entite", () => {
  // L'ordre du PATCH : on sanitize, puis on applique la typographie
  // francaise. Les deux ordres sont surs maintenant, et c'est teste dans
  // les deux sens.
  const tape = `<b>${LA_QUESTION}</b>?`;

  const enBase1 = applyFrenchTypography(sanitizeRichText(tape), "fr");
  assert.ok(!enBase1.includes("&nbsp;"), enBase1);
  assert.ok(enBase1.includes(`${NBSP}?`), enBase1);

  const enBase2 = sanitizeRichText(applyFrenchTypography(tape, "fr"));
  assert.ok(!enBase2.includes("&nbsp;"), enBase2);
  assert.ok(enBase2.includes(`${NBSP}?`), enBase2);

  // Et ce que lit un ecran en TEXTE BRUT, c'est ce que le client aurait
  // du lire des le premier jour.
  assert.equal(stripHtml(enBase1), `${LA_QUESTION} ?`);
});

test("bout en bout : la passe profonde du PATCH ne fabrique rien non plus", () => {
  const payload = {
    title: sanitizeRichText("<b>Mon sondage</b>?"),
    questions: [{ question_text: sanitizeRichText(`<i>${LA_QUESTION}</i>?`) }],
  };
  const sortie = applyFrenchTypographyDeep(payload, "fr") as typeof payload;
  const tout = JSON.stringify(sortie);
  assert.ok(!tout.includes("&nbsp;"), tout);
  assert.ok(sortie.questions[0].question_text.includes(`${NBSP}?`));
});

// ── 4. Le balayage : plus qu'UNE porte dans tout le depot ─────────────

/** Tous les fichiers de code servis, hors tests et hors build. */
function fichiersServis(): string[] {
  const sortie: string[] = [];
  const parcourir = (dossier: string) => {
    for (const nom of readdirSync(dossier)) {
      if (nom === "node_modules" || nom.startsWith(".")) continue;
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (/\.(ts|tsx)$/.test(nom)) sortie.push(chemin);
    }
  };
  for (const racine of ["app", "components", "lib"]) parcourir(racine);
  return sortie;
}

// LES EXEMPTIONS SONT NOMMEES, ET LEUR RAISON EST ECRITE A COTE. Une
// exemption sans raison est une exemption que le prochain passage prend
// pour un oubli.
const EXEMPTES: Record<string, string> = {
  // C'est LA porte : c'est ici que le strip vit.
  "lib/texteBrut.ts": "le module qui porte la regle",
  // Jumeau a l'octet pres du dossier `lib/bonus/` de l'Atelier (`cmp` le
  // prouve). Il convertit du markdown, pas du texte riche de quiz, et il
  // a son propre `decodeEntities` juste a cote.
  "lib/bonus/markdownHtml.ts": "jumeau a l'octet pres de l'Atelier, et il decode a cote",
};

test("aucun fichier ne reecrit son propre retrait de balises", () => {
  const fautifs: string[] = [];
  for (const f of fichiersServis()) {
    const chemin = f.replace(/\\/g, "/");
    if (EXEMPTES[chemin]) continue;
    // Les commentaires sont retires AVANT de chercher : sinon le test
    // tombe sur les explications qui citent le motif (lecon des 20
    // decoupeurs du 8 septembre).
    if (/replace\(\s*\/<\[\^>\]\*>\/g/.test(sansCommentaires(readFileSync(f, "utf8")))) {
      fautifs.push(chemin);
    }
  }
  assert.deepEqual(
    fautifs,
    [],
    "ces fichiers retirent les balises a la main, donc ils ne decodent aucune entite :\n" +
      fautifs.join("\n") +
      "\nLa porte est `stripHtml` de `lib/texteBrut.ts`.",
  );
});

test("l'exemption de `markdownHtml` reste JUSTIFIEE", () => {
  // Un test qui ne peut plus echouer ment : si le fichier disparait ou
  // cesse de decoder, l'exemption n'a plus lieu d'etre.
  const src = readFileSync("lib/bonus/markdownHtml.ts", "utf8");
  assert.match(src, /decodeEntities/, "l'exemption tenait a son propre decodeur");
});

const CHAMPS_RICHES =
  "question_text|introduction|insight|projection|bridge|cta_text|capture_heading|capture_subtitle|consent_text";

test("aucun champ riche n'est rendu en enfant JSX sans passer par la porte", () => {
  // C'est le rendu EXACT qui a produit le retour : `SurveyTrends` faisait
  // `<span>{question.question_text}</span>`.
  // UN RENDU, PAS UNE CONDITION. Le motif exige que l'expression se
  // FERME sur le champ (avec au plus un repli `|| ...`) : sans ce garde,
  // il rougissait sur `{r.insight && stripHtml(r.insight) && (...)}`,
  // c'est a dire sur du code juste. Un controle qui crie pour rien finit
  // desactive.
  const motif = new RegExp(
    String.raw`[>}]\s*\{\s*[a-zA-Z_][\w.?\[\]]*\.(?:${CHAMPS_RICHES})\s*(?:\|\|[^}&]*)?\}`,
    "g",
  );
  const fautifs: string[] = [];
  for (const f of fichiersServis()) {
    if (!f.endsWith(".tsx")) continue;
    for (const m of sansCommentaires(readFileSync(f, "utf8")).match(motif) ?? []) {
      fautifs.push(`${f.replace(/\\/g, "/")} : ${m.trim()}`);
    }
  }
  assert.deepEqual(
    fautifs,
    [],
    "ces ecrans rendent un champ riche en texte brut sans `stripHtml` :\n" + fautifs.join("\n"),
  );
});

test("la porte est un module PUR : rien a charger pour l'appeler", () => {
  // Un module qui tire DOMPurify ou `supabaseAdmin` n'est pas importable
  // par un module de decision ni par un email, et c'est exactement ce qui
  // a fait recopier le strip partout.
  const src = readFileSync("lib/texteBrut.ts", "utf8");
  for (const interdit of ["dompurify", "supabaseAdmin", "server-only", "next/"]) {
    assert.ok(
      !new RegExp(`from ["'][^"']*${interdit}`, "i").test(src),
      `lib/texteBrut.ts ne doit pas importer ${interdit}`,
    );
  }
});
