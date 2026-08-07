// tests/logic/pdf-import.test.mts
//
// L'IMPORT PDF N'AVAIT JAMAIS MARCHÉ.
//
// François Xavier, 7 août 2026 : "Quand j'importe le quiz au format pdf,
// j'ai ce message d'erreur : Erreur lors de la lecture du fichier :
// r is not a function."
//
// -- CE QUI S'ÉTAIT PASSÉ ----------------------------------------------
//
// `pdf-parse` v1 s'appelait comme une fonction. La v2, installée le 27
// juillet, exporte une CLASSE et n'a plus de default export. Le code
// appelait donc un objet. En prod, le nom de la variable est minifié :
// `pdfParse is not a function` devient `r is not a function`, ce qui
// ressemble à un problème de fichier alors que c'est notre code.
//
// -- POURQUOI RIEN NE L'AVAIT VU ---------------------------------------
//
// `tsc` le disait : "Module has no default export". L'ancien code forçait
// le silence avec un `as unknown as`, qui n'adapte rien et se contente
// d'interdire la vérification. D'où le dernier test de ce fichier.
//
// La vraie protection reste le premier test : il lit un VRAI PDF. Aucune
// assertion sur la forme du code ne remplace un aller-retour complet, et
// c'est le seul qui survivra au prochain changement d'API.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  IMPORT_FAILURE_REASONS,
  asImportFailureReason,
  classifyPdfError,
} from "../../lib/quiz/importFailure.ts";
import { detectKind, extractImportText } from "../../lib/quizImportExtract.ts";

/**
 * Fabrique un PDF minimal mais VALIDE, au flux de texte non compressé.
 *
 * Il est construit ici plutôt que rangé en fixture binaire : le déploiement
 * de Béné est un copier-coller de fichiers texte, et un .pdf de test
 * n'arriverait jamais sur le serveur.
 */
function pdfDeTest(lignes: string[]): Buffer {
  const flux =
    "BT /F1 14 Tf 72 720 Td 18 TL\n" +
    lignes.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join("\n") +
    "\nET";
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objets.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("un vrai PDF rend son texte", async () => {
  const lignes = [
    "Quel est ton profil de createur ?",
    "A. Je fonce sans plan",
    "B. Je planifie tout",
  ];
  const res = await extractImportText(pdfDeTest(lignes), "pdf");

  assert.equal(res.ok, true, `l'import PDF echoue : ${JSON.stringify(res)}`);
  if (!res.ok) return;
  for (const ligne of lignes) {
    assert.ok(res.text.includes(ligne), `ligne absente du texte extrait : ${ligne}`);
  }
  assert.equal(res.kind, "pdf");
});

test("le marqueur de page de la librairie ne part pas dans le prompt IA", async () => {
  // La v2 termine chaque page par "-- 1 of 3 --" quand on ne dit rien.
  // Ce n'est pas du contenu : l'IA en ferait une question.
  const res = await extractImportText(pdfDeTest(["Une seule ligne."]), "pdf");
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.ok(!/-- \d+ of \d+ --/.test(res.text), `marqueur de page trouve : ${res.text}`);
});

test("un fichier qui n'est pas un PDF donne une raison, pas une exception", async () => {
  const res = await extractImportText(Buffer.from("ceci n'est pas un PDF"), "pdf");
  assert.equal(res.ok, false);
  if (res.ok) return;
  // Peu importe laquelle, mais elle doit etre connue et traduisible.
  assert.ok(
    IMPORT_FAILURE_REASONS.includes(res.reason),
    `raison inconnue : ${res.reason}`,
  );
});

test("un fichier vide est nomme comme tel", async () => {
  const res = await extractImportText(Buffer.from("   \n  "), "txt");
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.reason, "empty_file");
});

test("les exceptions de la librairie sont classees sur leur nom", () => {
  // Sur le NOM, jamais `instanceof` : un bundler qui duplique un module
  // donne deux classes pour le meme nom et `instanceof` repond faux.
  const err = (name: string) => Object.assign(new Error("x"), { name });
  assert.equal(classifyPdfError(err("PasswordException")), "pdf_password");
  assert.equal(classifyPdfError(err("InvalidPDFException")), "pdf_damaged");
  assert.equal(classifyPdfError(err("FormatError")), "pdf_damaged");
  assert.equal(classifyPdfError(err("QuelqueChoseDeNouveau")), "extract_failed");
  assert.equal(classifyPdfError(undefined), "extract_failed");
  assert.equal(classifyPdfError("une chaine"), "extract_failed");
});

test("une raison inconnue ne produit jamais un toast vide", () => {
  // Cas reel : le serveur est deploye, la page de la creatrice est restee
  // ouverte depuis la version d'avant. Sans garde, elle lirait le nom brut
  // de la cle i18n, ou rien du tout.
  assert.equal(asImportFailureReason("pdf_password"), "pdf_password");
  assert.equal(asImportFailureReason("raison_du_futur"), "extract_failed");
  assert.equal(asImportFailureReason(undefined), "extract_failed");
  assert.equal(asImportFailureReason(null), "extract_failed");
  assert.equal(asImportFailureReason(42), "extract_failed");
});

test("chaque raison est traduite dans les 7 langues", () => {
  const dir = path.join(process.cwd(), "messages");
  const locales = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.equal(locales.length, 7, "le nombre de langues a change");

  for (const fichier of locales) {
    const messages = JSON.parse(fs.readFileSync(path.join(dir, fichier), "utf8"));
    const ns = messages.importErrors;
    assert.ok(ns, `namespace importErrors absent de ${fichier}`);
    for (const raison of IMPORT_FAILURE_REASONS) {
      const texte = ns[raison];
      assert.equal(typeof texte, "string", `${fichier} : ${raison} manquant`);
      assert.ok(texte.trim().length > 5, `${fichier} : ${raison} trop court`);
      // Regle Béné du 7 juin : aucun tiret cadratin dans le user-visible.
      assert.ok(!/[—–]/.test(texte), `${fichier} : ${raison} contient un tiret long`);
    }
  }
});

test("l'extraction ne rebaillonne pas le compilateur", () => {
  // C'est la double assertion qui a laisse passer le changement d'API :
  // `as unknown as` n'adapte pas une valeur, il interdit de la verifier.
  const src = fs.readFileSync(
    path.join(process.cwd(), "lib/quizImportExtract.ts"),
    "utf8",
  );
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  assert.ok(
    !/as\s+unknown\s+as/.test(code),
    "un `as unknown as` est revenu : c'est exactement ce qui a cache le bug",
  );
});

test("la config qui fait marcher le PDF en prod est toujours la", () => {
  // Ces deux lignes ne servent A RIEN en local : le test ci-dessus passe
  // sans elles, le build aussi. Elles ne comptent qu'une fois l'app
  // compilee, ou le worker de pdfjs est charge par un import construit a
  // l'execution que Next ne voit pas passer.
  //
  // Verifie le 7 aout 2026 en envoyant un vrai PDF au serveur de
  // production : sans elles, "Setting up fake worker failed", donc
  // exactement le bug de François Xavier sous un autre nom.
  const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  assert.match(
    config,
    /serverExternalPackages:\s*\[[^\]]*"pdf-parse"/,
    "pdf-parse doit rester hors du bundle, sinon son worker est introuvable",
  );
  assert.match(
    config,
    /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs/,
    "le worker pdfjs doit etre copie dans la sortie standalone",
  );
});

test("les trois formats annonces sont bien reconnus", () => {
  assert.equal(detectKind("mon-quiz.pdf", ""), "pdf");
  assert.equal(detectKind("MON-QUIZ.PDF", ""), "pdf");
  assert.equal(detectKind("sans-extension", "application/pdf"), "pdf");
  assert.equal(detectKind("notes.docx", ""), "docx");
  assert.equal(detectKind("notes.txt", ""), "txt");
  assert.equal(detectKind("photo.png", "image/png"), null);
});
