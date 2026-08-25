// tests/logic/alerte-admin.test.mts
//
// Béné, 25 août 2026, capture à l'appui : "je reçois toujours ce genre de
// mails en double c'est normal ? On grille du fric pour rien là ?"
//
// Non, ce n'était pas normal, et le mot "toujours" est la vraie
// information : la cause avait déjà été trouvée et corrigée UNE fois.
//
// Le fichier `lib/adminEmails.ts` portait ce commentaire, écrit le jour
// où le coach envoyait ses escalades en double :
//
//   "les deux adresses admin arrivent dans la meme boite, donc alerter
//    les deux = Bene recevait 2 emails pour une seule demande"
//
// La liste séparée avait été créée, et branchée SUR UN SEUL chemin. Deux
// autres bouclaient encore sur `ADMIN_EMAILS`, donc envoyaient toujours
// deux messages. Une correction appliquée à un endroit sur trois n'est
// pas une correction : c'est un piège, parce que la doc dit que c'est
// réglé.
//
// Ici la boucle reste (le `sendEmail` de ce depot ne prend qu'UNE
// adresse), mais elle porte sur la liste d'ALERTE, qui compte une seule
// entree. Le cron des seuils fiscaux envoyait QUATRE messages.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { ADMIN_ALERT_EMAILS, ADMIN_EMAILS } from "../../lib/adminEmails.ts";

const RACINE = new URL("../../", import.meta.url).pathname;

function sourcesDe(dossiers: string[]): string[] {
  const out: string[] = [];
  const parcours = (d: string) => {
    let entrees: string[];
    try {
      entrees = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entrees) {
      if (e === "node_modules" || e === ".next") continue;
      const complet = path.join(d, e);
      if (statSync(complet).isDirectory()) parcours(complet);
      else if (/\.tsx?$/.test(e)) out.push(complet);
    }
  };
  for (const d of dossiers) parcours(path.join(RACINE, d));
  return out;
}

test("prevenir n'est pas donner le droit d'entrer", () => {
  // Deux questions differentes, donc deux listes. Une seule liste pour
  // les deux, c'est exactement ce qui produisait les doublons.
  assert.ok(ADMIN_EMAILS.length >= 1);
  assert.ok(ADMIN_ALERT_EMAILS.length >= 1, "personne ne serait prevenu");
  assert.ok(
    ADMIN_ALERT_EMAILS.length <= ADMIN_EMAILS.length,
    "la liste d'alerte ne peut pas etre plus large que celle des admins",
  );
});

test("aucune adresse en double dans la liste d'alerte", () => {
  const vues = ADMIN_ALERT_EMAILS.map((e) => e.trim().toLowerCase());
  assert.deepEqual(vues, [...new Set(vues)], "une adresse repetee = un email de plus");
});

test("PERSONNE ne boucle sur ADMIN_EMAILS pour envoyer un email", () => {
  // C'est LA regression a interdire. Une boucle envoie un message par
  // adresse, avec un identifiant different a chaque fois : aucune boite
  // de reception ne peut les regrouper.
  const fautifs = sourcesDe(["app", "lib"]).filter((f) => {
    // On retire les COMMENTAIRES avant de chercher : ce fichier-ci decrit
    // le mauvais motif pour l'expliquer, et un test qui accuse une
    // explication est un test qu'on finit par desactiver.
    const src = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    return (
      /for\s*\(\s*const\s+\w+\s+of\s+ADMIN_EMAILS/.test(src) ||
      /ADMIN_EMAILS\s*\.\s*map\s*\(/.test(src)
    );
  });
  assert.deepEqual(
    fautifs.map((f) => f.replace(RACINE, "")),
    [],
    "ces fichiers envoient un email PAR adresse admin",
  );
});
