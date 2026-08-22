// scripts/check-supabase-keys.mjs
//
// « INVALID API KEY » : LE FICHIER DIT-IL LA MÊME CHOSE QUE LE BUILD ?
//
// Béné, 22 août au soir : "je n'ai aucun client côté Tipote", avec
// `Invalid API key` à l'écran et des 500 sur les routes serveur.
//
// Ce message vient de Supabase, et il veut dire UNE chose : la clé
// présentée n'appartient pas au projet interrogé. Trois causes possibles,
// et elles se corrigent à trois endroits différents :
//
//   1. la clé a été RÉVOQUÉE (rotation) et le `.env` porte encore
//      l'ancienne ;
//   2. le `.env` est à jour mais le BUILD porte encore l'ancienne :
//      `NEXT_PUBLIC_SUPABASE_ANON_KEY` est gravée dans le code au moment
//      du `next build`, donc changer le `.env` ne suffit PAS, il faut
//      reconstruire ;
//   3. la clé appartient à l'AUTRE projet (la panne du 22 août au matin).
//
// Sans ce contrôle, les trois se ressemblent trait pour trait.
//
// -- IL N'IMPRIME JAMAIS UNE CLÉ ---------------------------------------
//
// Une clé Supabase est un JWT : sa charge utile porte le projet (`ref`),
// le rôle et la date d'expiration, en clair, sans rien révéler de
// secret. On n'affiche QUE ces trois valeurs. Le rapport peut donc
// finir dans un terminal, un historique ou un copier-coller.
//
//   npm run check:supabase-keys

import { readFileSync, existsSync, readdirSync, readlinkSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));

/** Lit une clé du `.env` SANS l'exporter dans le shell. */
function lireDuFichier(cle) {
  for (const nom of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const chemin = join(RACINE, nom);
    if (!existsSync(chemin)) continue;
    const m = readFileSync(chemin, "utf8").match(new RegExp(`^\\s*(?:export\\s+)?${cle}=(.*)$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

/** L'identifiant de projet contenu dans une URL Supabase. */
export function refDepuisUrl(url) {
  const m = String(url ?? "").match(/^https?:\/\/([a-z0-9]+)\.supabase\./i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Ce qu'une clé Supabase raconte d'elle même.
 *
 * Rend `null` pour une valeur qui n'est pas un JWT : c'est le cas des
 * nouvelles clés `sb_publishable_...` et `sb_secret_...`, qui ne portent
 * rien de lisible. On le DIT au lieu de faire semblant de savoir.
 */
export function lireJwt(valeur) {
  const v = String(valeur ?? "").trim();
  if (!v) return { etat: "absente" };
  if (/^sb_(publishable|secret)_/.test(v)) return { etat: "nouveau-format" };
  const parts = v.split(".");
  if (parts.length !== 3) return { etat: "illisible" };
  try {
    const charge = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    return {
      etat: "jwt",
      ref: String(charge.ref ?? "?"),
      role: String(charge.role ?? "?"),
      // `exp` est en secondes.
      expire: charge.exp ? new Date(charge.exp * 1000).toISOString().slice(0, 10) : "?",
      perime: charge.exp ? charge.exp * 1000 < Date.now() : false,
    };
  } catch {
    return { etat: "illisible" };
  }
}

/**
 * Les projets Supabase GRAVÉS dans le build.
 *
 * `NEXT_PUBLIC_*` est inliné au moment du `next build` : le navigateur
 * envoie donc la clé du build, pas celle du `.env`. C'est exactement ce
 * qui a croisé les deux apps le 22 août au matin, et c'est aussi ce qui
 * fait qu'une rotation de clé ne prend effet qu'après reconstruction.
 *
 * On ne cherche QUE des identifiants de projet, jamais des clés.
 */
function refsDuBuild() {
  const dossier = join(RACINE, ".next");
  if (!existsSync(dossier)) return null;
  const trouves = new Set();
  const vus = new Set();

  const parcourir = (chemin, profondeur) => {
    if (profondeur > 6 || vus.size > 4000) return;
    let entrees = [];
    try {
      entrees = readdirSync(chemin);
    } catch {
      return;
    }
    for (const e of entrees) {
      const complet = join(chemin, e);
      let s;
      try {
        s = statSync(complet);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (e === "cache" || e === "node_modules") continue;
        parcourir(complet, profondeur + 1);
      } else if (/\.(js|mjs|json)$/.test(e) && s.size < 12_000_000) {
        vus.add(complet);
        let texte = "";
        try {
          texte = readFileSync(complet, "utf8");
        } catch {
          continue;
        }
        for (const m of texte.matchAll(/https?:\/\/([a-z0-9]{15,})\.supabase\.co/gi)) {
          trouves.add(m[1].toLowerCase());
        }
      }
    }
  };

  parcourir(dossier, 0);
  return [...trouves];
}

const url = lireDuFichier("NEXT_PUBLIC_SUPABASE_URL");
const refFichier = refDepuisUrl(url);
const anon = lireJwt(lireDuFichier("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
const service = lireJwt(lireDuFichier("SUPABASE_SERVICE_ROLE_KEY"));

function decrire(nom, k, ou = "du .env") {
  if (k.etat === "absente") return `${nom.padEnd(10)} absente ${ou}`;
  if (k.etat === "illisible") return `${nom.padEnd(10)} illisible (ni JWT, ni nouveau format)`;
  if (k.etat === "nouveau-format")
    return `${nom.padEnd(10)} nouveau format (sb_...), projet non vérifiable ici`;
  return (
    `${nom.padEnd(10)} projet ${k.ref} · rôle ${k.role} · expire ${k.expire}` +
    (k.perime ? "  <-- PÉRIMÉE" : "")
  );
}

console.log("\n  CLÉS SUPABASE : LE FICHIER\n");
console.log(`  URL        projet ${refFichier ?? "(introuvable dans le .env)"}`);
console.log(`  ${decrire("anon", anon)}`);
console.log(`  ${decrire("service", service)}`);

const problemes = [];

// ── LE TERMINAL ──
//
// C'est la colonne qui manquait, et c'est celle qui a mis Tipote par
// terre le 22 août au soir. Une variable exportée dans le shell gagne
// sur le fichier (Next lit `process.env` en premier), et surtout un
// `pm2 restart --update-env` la pousse DANS le processus. Le fichier
// pouvait donc être parfait et l'app servir l'autre base.
//
// On compare le terminal au fichier uniquement quand le fichier a
// quelque chose à dire : un terminal vide est le cas NORMAL, pas une
// alerte.
const refTerminal = refDepuisUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const serviceTerminal = lireJwt(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
console.log("\n  CLÉS SUPABASE : CE TERMINAL\n");
if (!refTerminal && serviceTerminal.etat === "absente") {
  console.log("  Rien d'exporté ici. C'est le cas normal : le fichier gagne.");
} else {
  console.log(`  URL        projet ${refTerminal ?? "(non exportée)"}`);
  console.log(`  ${decrire("service", serviceTerminal, "de ce terminal")}`);
  const contredit =
    (refTerminal && refFichier && refTerminal !== refFichier) ||
    (serviceTerminal.etat === "jwt" && refFichier && serviceTerminal.ref !== refFichier);
  if (contredit) {
    problemes.push(
      `Ce terminal porte les variables d'une AUTRE app que ce dossier.\n` +
        `     Il gagne sur le .env, et un « pm2 restart --update-env » lancé ici\n` +
        `     les pousserait dans l'app. Fermer ce terminal, en ouvrir un neuf.`,
    );
  }
}
for (const [nom, k] of [
  ["anon", anon],
  ["service", service],
]) {
  if (k.etat === "jwt" && refFichier && k.ref !== refFichier) {
    problemes.push(
      `La clé ${nom} appartient au projet ${k.ref}, alors que l'URL pointe ${refFichier}.\n` +
        `     C'est exactement le message "Invalid API key". Corriger la clé dans le .env.`,
    );
  }
  if (k.etat === "jwt" && k.perime) {
    problemes.push(`La clé ${nom} est périmée depuis le ${k.expire}. En générer une nouvelle.`);
  }
}

const build = refsDuBuild();
console.log("\n  CLÉS SUPABASE : LE BUILD\n");
if (build === null) {
  console.log("  Pas de dossier .next : rien à comparer (l'app n'a pas encore été construite).");
} else if (build.length === 0) {
  console.log("  Aucune URL Supabase trouvée dans le build.");
} else {
  for (const r of build) console.log(`  projet ${r}${r === refFichier ? "" : "   <-- DIFFÉRENT du .env"}`);
  const etrangers = build.filter((r) => r !== refFichier);
  if (etrangers.length) {
    problemes.push(
      `Le build pointe ${etrangers.join(", ")} alors que le .env dit ${refFichier}.\n` +
        `     NEXT_PUBLIC_* est gravé au moment du build : changer le .env ne suffit pas,\n` +
        `     il faut RECONSTRUIRE (npm run build) puis redémarrer.`,
    );
  }
}

// ── LE PROCESSUS QUI TOURNE ──
//
// LA COLONNE QUI A MANQUÉ TOUTE LA SOIRÉE DU 22 AOÛT.
//
// Le fichier était juste, le build était juste, le terminal était propre,
// et l'app répondait quand même `Invalid API key`. La mauvaise valeur
// vivait dans le PROCESSUS, poussée là par un `pm2 restart --update-env`
// lancé depuis un terminal pollué, et plus rien ne pouvait l'en déloger :
// `--update-env` remplace les variables que le nouveau terminal DÉFINIT,
// et un terminal propre n'en définit aucune.
//
// `pm2 env <id>` affichait encore l'ancienne clé alors que le processus
// tournait déjà avec la bonne. `/proc/<pid>/environ`, lui, ne ment pas :
// c'est l'environnement que le noyau a donné au processus.
function refsDuProcessus() {
  if (process.platform !== "linux" || !existsSync("/proc")) return null;
  // On reconnaît le serveur à son DOSSIER DE TRAVAIL, pas à sa ligne de
  // commande : `server.js` fait `process.chdir(__dirname)`, donc son cwd
  // est toujours `.next/standalone`, que PM2 l'ait lancé avec un chemin
  // absolu ou relatif. Se fier à la ligne de commande ratait le second
  // cas, ce qui est exactement ce qu'un contrôle ne doit pas faire.
  const dossierServeur = join(RACINE, ".next", "standalone");
  const trouves = [];
  let pids = [];
  try {
    pids = readdirSync("/proc").filter((p) => /^\d+$/.test(p));
  } catch {
    return null;
  }
  for (const pid of pids) {
    let cwd = "";
    try {
      cwd = readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      // Un processus qui ne nous appartient pas, ou qui vient de mourir.
      continue;
    }
    if (cwd !== dossierServeur) continue;
    let brut = "";
    try {
      brut = readFileSync(`/proc/${pid}/environ`, "utf8");
    } catch {
      continue;
    }
    const env = new Map();
    for (const ligne of brut.split("\0")) {
      const eq = ligne.indexOf("=");
      if (eq > 0) env.set(ligne.slice(0, eq), ligne.slice(eq + 1));
    }
    trouves.push({
      pid,
      url: refDepuisUrl(env.get("NEXT_PUBLIC_SUPABASE_URL")),
      service: lireJwt(env.get("SUPABASE_SERVICE_ROLE_KEY")),
    });
  }
  return trouves;
}

const procs = refsDuProcessus();
console.log("\n  CLÉS SUPABASE : LE PROCESSUS QUI TOURNE\n");
if (procs === null) {
  console.log("  Lecture impossible ici (pas de /proc). Sur le serveur, elle marche.");
} else if (procs.length === 0) {
  console.log("  Aucun serveur standalone de ce dossier ne tourne en ce moment.");
} else {
  for (const p of procs) {
    console.log(`  pid ${p.pid}`);
    console.log(`    URL       projet ${p.url ?? "(non transmise, valeur du build)"}`);
    console.log(`    ${decrire("service", p.service, "du processus")}`);
    // On compare au FICHIER : c'est lui la référence voulue, et l'écart
    // avec le processus est exactement la panne du 22 août au soir.
    if (p.service.etat === "jwt" && refFichier && p.service.ref !== refFichier) {
      problemes.push(
        `Le processus ${p.pid} tourne avec une clé de service du projet ${p.service.ref},\n` +
          `     alors que le .env dit ${refFichier}. C'est « Invalid API key » sur tout ce qui\n` +
          `     passe par la clé de service, et RIEN sur le reste : les contenus s'affichent,\n` +
          `     les comptes disparaissent.\n` +
          `     Un rebuild n'y change rien. Depuis le dossier du repo :\n` +
          `     ( export SUPABASE_SERVICE_ROLE_KEY="$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-)" ; pm2 restart <app> --update-env )`,
      );
    }
  }
}

console.log("");
if (problemes.length === 0) {
  console.log("  Rien à signaler : le fichier, le build et le processus s'accordent.\n");
} else {
  for (const p of problemes) console.log(`  -> ${p}\n`);
}
process.exit(0);
