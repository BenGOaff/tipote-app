// scripts/check-build-env.mjs
//
// REFUSE DE CONSTRUIRE SI LE SHELL CONTREDIT LE `.env` DU REPO.
//
// Branché en `prebuild` : npm le lance tout seul avant `npm run build`,
// sans rien avoir à retenir.
//
// -- LA PANNE DU 22 AOÛT 2026 ------------------------------------------
//
// Les deux apps ont servi la base Supabase de l'AUTRE pendant plusieurs
// heures. Tiquiz affichait les quiz de Tipote, Tipote répondait
// "Could not find the table 'public.content_item'". Les deux `.env`
// étaient pourtant justes.
//
// La cause : un `set -a; . .env; set +a` lancé dans le terminal pour
// lire une variable. `set -a` EXPORTE tout le fichier dans la session.
// Le terminal a servi ensuite aux deux apps, et Next lit `process.env`
// AVANT `.env` (node_modules/next/dist/docs/01-app/02-guides/
// environment-variables.md : "stopping once the variable is found").
// Le `npm run build` suivant a donc gravé les valeurs de l'autre app,
// et `pm2 restart --update-env` a poussé le shell pollué dans le
// processus.
//
// Rien dans le code ne pouvait le voir : le `.env` était bon, le build
// était faux. D'où ce contrôle, qui compare les DEUX.
//
// -- CE QU'IL REGARDE ---------------------------------------------------
//
// Toute clé définie dans les fichiers d'environnement du repo ET
// présente dans le shell avec une valeur DIFFÉRENTE. Une clé que le
// shell ne porte pas ne pose aucun problème : c'est le cas normal.
//
// -- CE QU'IL N'AFFICHE JAMAIS ------------------------------------------
//
// La valeur d'une clé qui ressemble à un secret. Le rapport dit "les
// deux valeurs diffèrent" et s'arrête là : ce message finit dans un
// terminal, dans un historique, parfois dans un copier-coller. Les URL
// et les `NEXT_PUBLIC_*` sont affichées en clair, ce sont elles qui
// rendent le diagnostic évident.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ce que le shell a le droit de dire autrement que le `.env` : des
 * réglages d'exécution, jamais une adresse ni une clé.
 */
export const CLES_TOLEREES = new Set([
  "NODE_ENV",
  "NODE_OPTIONS",
  "PORT",
  "HOST",
  "HOSTNAME",
  "CI",
  "TZ",
  "ANALYZE",
  "VISUAL_TEST",
  "NEXT_TELEMETRY_DISABLED",
]);

/** Les fichiers d'environnement, dans l'ordre de priorité de Next. */
export function fichiersEnv(nodeEnv = "production") {
  return [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"];
}

/** Un nom de clé qui ne doit jamais voir son contenu imprimé. */
export function estSecret(cle) {
  return /(_KEY|_SECRET|_TOKEN|PASSWORD|SERVICE_ROLE|CREDENTIAL|_PWD)/i.test(cle);
}

/**
 * Lecture d'un fichier `.env`. Volontairement modeste : une ligne, une
 * clé. Une valeur exotique mal lue ne peut pas déclencher de fausse
 * alerte, puisqu'on ne compare que les clés que le shell porte AUSSI.
 */
export function parseEnvFile(texte) {
  const out = new Map();
  for (const ligneBrute of String(texte).split(/\r?\n/)) {
    const ligne = ligneBrute.trim();
    if (!ligne || ligne.startsWith("#")) continue;
    const sansExport = ligne.startsWith("export ") ? ligne.slice(7).trim() : ligne;
    const eq = sansExport.indexOf("=");
    if (eq <= 0) continue;
    const cle = sansExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cle)) continue;
    let valeur = sansExport.slice(eq + 1).trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"') && valeur.length > 1) ||
      (valeur.startsWith("'") && valeur.endsWith("'") && valeur.length > 1)
    ) {
      valeur = valeur.slice(1, -1);
    } else {
      // Commentaire de fin de ligne, uniquement hors guillemets.
      const diese = valeur.indexOf(" #");
      if (diese >= 0) valeur = valeur.slice(0, diese).trim();
    }
    if (!out.has(cle)) out.set(cle, valeur);
  }
  return out;
}

/**
 * Les valeurs que Next retiendrait des FICHIERS du repo, premier
 * fichier gagnant, comme lui.
 */
export function lireEnvDuRepo(dossier, nodeEnv = "production") {
  const valeurs = new Map();
  const lus = [];
  for (const nom of fichiersEnv(nodeEnv)) {
    const chemin = join(dossier, nom);
    if (!existsSync(chemin)) continue;
    lus.push(nom);
    let texte = "";
    try {
      texte = readFileSync(chemin, "utf8");
    } catch {
      continue;
    }
    for (const [cle, valeur] of parseEnvFile(texte)) {
      if (!valeurs.has(cle)) valeurs.set(cle, valeur);
    }
  }
  return { valeurs, fichiers: lus };
}

/**
 * Les contradictions entre le fichier et le shell.
 *
 * Une clé absente du shell n'est pas un conflit : c'est le cas normal,
 * et c'est Next qui ira la chercher dans le fichier.
 */
export function trouverConflits(valeursFichier, shell, tolerees = CLES_TOLEREES) {
  const conflits = [];
  for (const [cle, attendue] of valeursFichier) {
    if (tolerees.has(cle)) continue;
    const duShell = shell[cle];
    if (typeof duShell !== "string") continue;
    if (duShell === attendue) continue;
    conflits.push({ cle, fichier: attendue, shell: duShell });
  }
  return conflits.sort((a, b) => a.cle.localeCompare(b.cle));
}

/** Le rapport imprimé, secrets masqués. */
export function formaterRapport(conflits, fichiers) {
  const source = fichiers.length ? fichiers.join(", ") : "aucun fichier";
  const lignes = [
    "",
    "  BUILD REFUSE : ton terminal contredit le fichier d'environnement.",
    "",
    `  Fichier(s) lu(s) : ${source}`,
    "",
  ];
  for (const c of conflits) {
    lignes.push(`  ${c.cle}`);
    if (estSecret(c.cle)) {
      lignes.push("     fichier et terminal portent deux valeurs differentes");
    } else {
      lignes.push(`     fichier  : ${c.fichier}`);
      lignes.push(`     terminal : ${c.shell}`);
    }
    lignes.push("");
  }
  lignes.push("  C'est le terminal qui gagnerait, et l'app serait construite");
  lignes.push("  avec ces valeurs la. Ferme ce terminal, ouvre en un neuf,");
  lignes.push("  puis relance le build.");
  lignes.push("");
  return lignes.join("\n");
}

/** Le contrôle complet. Rend `null` si tout va bien, le rapport sinon. */
export function verifier(dossier, shell, nodeEnv = "production") {
  const { valeurs, fichiers } = lireEnvDuRepo(dossier, nodeEnv);
  if (!valeurs.size) return null;
  const conflits = trouverConflits(valeurs, shell);
  if (!conflits.length) return null;
  return formaterRapport(conflits, fichiers);
}

// ---------------------------------------------------------------------
// Exécution directe (le `prebuild`).
// ---------------------------------------------------------------------

const lanceDirectement =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (lanceDirectement) {
  const racine = dirname(dirname(fileURLToPath(import.meta.url)));
  const rapport = verifier(racine, process.env, process.env.NODE_ENV || "production");
  if (rapport) {
    console.error(rapport);
    process.exit(1);
  }
}
