// tests/logic/aide/editeurCapture.mts
//
// OU VIT LA COLONNE QUI REGLE LE FORMULAIRE DE CAPTURE, CHERCHEE ET PAS
// RECOPIEE.
//
// Quatre tests figeaient le chemin
// `components/quiz/ChampsPersonnalisesEditor.tsx`. Le 17 septembre 2026,
// les champs personnalises ont rejoint les champs integres dans UNE seule
// rangee (Bene : "un seul endroit ou on trouve TOUT"), le composant a pris
// le nom de ce qu'il fait (`ChampsCaptureEditor`), et les quatre sont
// sortis ROUGES sur une correction juste.
//
// C'est la lecon deja payee par `pageDuSite.mts` et `chargePublique.mts` :
// **un chemin sur disque n'est pas un fait**. On CHERCHE donc le composant
// a son marqueur, et on refuse les deux cas qui comptent : introuvable (il
// a vraiment disparu), ou trouve deux fois (deux colonnes de reglages,
// donc deux endroits ou nommer la meme chose, ce que ce chantier vient
// justement de fermer).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));

/** Le marqueur : le composant qui fabrique un champ personnalise. */
const MARQUEUR = "nouvelIdChamp(";

function fichiers(dossier: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dossier)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dossier, e);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function trouver(): { chemin: string; source: string } {
  const candidats = fichiers(join(RACINE, "components")).filter((p) =>
    readFileSync(p, "utf8").includes(MARQUEUR),
  );
  if (candidats.length === 0) {
    throw new Error(
      `Aucun composant ne porte "${MARQUEUR}" : la colonne qui ajoute un champ a disparu ou a ete renommee.`,
    );
  }
  if (candidats.length > 1) {
    throw new Error(
      `DEUX colonnes ajoutent un champ personnalise : ${candidats.join(", ")}. ` +
        "Deux endroits pour la meme question finissent toujours par ne plus dire la meme chose.",
    );
  }
  return { chemin: candidats[0].slice(RACINE.length), source: readFileSync(candidats[0], "utf8") };
}

const trouve = trouver();

/** Le chemin du composant, pour les messages d'erreur. */
export const CHEMIN_EDITEUR_CAPTURE = trouve.chemin;
/** La source du composant qui regle le formulaire de capture. */
export const SOURCE_EDITEUR_CAPTURE = trouve.source;
