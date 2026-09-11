// scripts/check-cron-secret.mjs
//
// « unauthorized » SUR UN CRON : QUI A LA MAUVAISE VALEUR ?
//
// Béné, 11 septembre 2026, sur le serveur de Tipote :
//
//   ( set -a; . .env; set +a; curl -sS -X POST -H "X-Cron-Secret: $CRON_SECRET" \
//       https://app.tipote.com/api/cron/approuver-commissions )
//   {"ok":false,"reason":"unauthorized"}
//
// Le corps JSON prouve que la route est déployée (une route absente rend
// la page 404 de Next). Le refus vient donc d'une VALEUR, et il y en a
// trois, chacune posée à un endroit différent :
//
//   1. celle que le SOUS-SHELL envoie : `. .env` peut s'arrêter à
//      mi-chemin sur une ligne que bash ne sait pas lire (une clé d'API
//      avec des caractères spéciaux), et `$CRON_SECRET` est alors VIDE.
//      C'est exactement pour ça que `scripts/login-link.mjs` ne lit que
//      les deux clés dont il a besoin ;
//   2. celle que le PROCESSUS tient : PM2 la pousse dans l'environnement
//      (`--update-env`), et elle GAGNE sur tout fichier. Sinon, Next la
//      lit dans le `.env` copié dans `.next/standalone/` au build ;
//   3. celle du FICHIER `.env` du dépôt, la référence voulue.
//
// Les trois se ressemblent trait pour trait dans un `unauthorized`. Ce
// script les mesure séparément, puis fait ce que la commande d'origine
// faisait : il APPELLE la route, en local (sans Cloudflare) et en public,
// mais en GET, une méthode qui vérifie le secret et n'approuve RIEN.
//
// -- IL N'IMPRIME JAMAIS LE SECRET -------------------------------------
//
// Longueur, présence, et « identique / différent ». Un rapport finit dans
// un terminal, un historique, un copier-coller (règle du 22 août).
//
//   npm run check:cron-secret

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CLE = "CRON_SECRET";
const CHEMIN_ROUTE = "/api/cron/approuver-commissions";

/**
 * La valeur d'une clé dans le TEXTE d'un `.env`, sans l'exporter nulle
 * part. Guillemets d'enveloppe retirés, espaces de bord retirés : c'est
 * ce que `@next/env` lit, et ce que la route compare après `.trim()`.
 */
export function lireCleDuTexte(texte, cle) {
  const m = String(texte ?? "").match(new RegExp(`^\\s*(?:export\\s+)?${cle}=(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "").trim();
}

/**
 * Ce que le rapport doit dire, à partir des trois valeurs et des deux
 * appels. Pur : il ne lit rien, il ne compare que ce qu'on lui donne.
 *
 * `processus` vaut `null` quand aucun serveur n'a été trouvé, `""` quand
 * le serveur tourne sans la variable. `shell` vaut `null` quand bash n'a
 * pas pu être lancé. Un ping vaut un statut HTTP, ou une chaîne d'erreur.
 */
export function verdict({ fichier, shell, processus, standalone, pingLocal, pingPublic }) {
  const problemes = [];
  const lignes = [];

  lignes.push(`fichier .env        : ${fichier ? `présente, ${fichier.length} caractères` : "ABSENTE"}`);
  if (!fichier) {
    problemes.push(
      `${CLE} n'est pas dans le .env du dépôt. Aucun cron ne peut passer tant qu'elle n'y est pas.`,
    );
  }

  if (shell === null) {
    lignes.push("sous-shell bash     : non mesuré (bash introuvable)");
  } else {
    const etat = !shell ? "VIDE" : shell === fichier ? "identique au fichier" : `DIFFÉRENTE du fichier (${shell.length} caractères)`;
    lignes.push(`sous-shell bash     : ${etat}`);
    if (fichier && shell !== fichier) {
      problemes.push(
        `« ( set -a; . .env; set +a; ... ) » n'envoie pas la valeur du fichier : bash s'arrête\n` +
          `     sur une ligne du .env qu'il ne sait pas lire, ou en lit une autrement. C'est le\n` +
          `     sous-shell de la crontab qui est faux, pas la route. Lire la SEULE clé utile :\n` +
          `     curl -fsS -X POST -H "X-Cron-Secret: $(grep -m1 '^CRON_SECRET=' .env | cut -d= -f2- | tr -d '\"')" https://app.tipote.com${CHEMIN_ROUTE}`,
      );
    }
  }

  if (processus === null) {
    lignes.push("processus (PM2)     : aucun serveur standalone de ce dossier ne tourne");
  } else if (processus === "") {
    const viaFichier = standalone ? (standalone === fichier ? "identique au fichier" : "DIFFÉRENTE du fichier") : "ABSENTE";
    lignes.push(`processus (PM2)     : non transmise ; la route la lit dans .next/standalone/.env : ${viaFichier}`);
    if (!standalone) {
      problemes.push(
        `Le serveur tourne SANS ${CLE} : ni dans l'environnement PM2, ni dans .next/standalone/.env.\n` +
          `     La route répond « unauthorized » à tout le monde. Reconstruire (le postbuild copie le .env)\n` +
          `     puis redémarrer, depuis un terminal PROPRE :\n` +
          `     npm run build && pm2 restart tipote-prod --update-env`,
      );
    } else if (standalone !== fichier) {
      problemes.push(
        `.next/standalone/.env porte une autre valeur que le .env du dépôt : le build date d'avant\n` +
          `     la dernière modification du fichier. Reconstruire puis redémarrer :\n` +
          `     npm run build && pm2 restart tipote-prod --update-env`,
      );
    }
  } else {
    lignes.push(`processus (PM2)     : ${processus === fichier ? "identique au fichier" : `DIFFÉRENTE du fichier (${processus.length} caractères)`}`);
    if (processus !== fichier) {
      problemes.push(
        `Le processus tient une AUTRE valeur que le fichier, et c'est elle qui gagne (panne du\n` +
          `     22 août au soir : une valeur héritée d'un « --update-env » lancé depuis un terminal\n` +
          `     pollué). Un rebuild n'y change rien. Depuis le dossier du dépôt :\n` +
          `     ( export CRON_SECRET="$(grep -m1 '^CRON_SECRET=' .env | cut -d= -f2- | tr -d '\"')" ; pm2 restart tipote-prod --update-env )`,
      );
    }
  }

  for (const [nom, ping] of [["en local (sans Cloudflare)", pingLocal], ["en public (app.tipote.com)", pingPublic]]) {
    if (ping === undefined) continue;
    lignes.push(`GET ${nom.padEnd(27)}: ${typeof ping === "number" ? ping : `injoignable (${ping})`}`);
  }
  if (typeof pingLocal === "number" && pingLocal === 200 && typeof pingPublic === "number" && pingPublic === 401) {
    problemes.push(
      `Le secret du fichier passe en local et pas en public : l'en-tête n'arrive pas tel quel\n` +
        `     à travers Cloudflare, ou le public tape sur un autre serveur. À regarder dans les\n` +
        `     règles Cloudflare (Transform Rules) de app.tipote.com.`,
    );
  }
  if (typeof pingLocal === "number" && pingLocal === 404) {
    problemes.push(`La route ${CHEMIN_ROUTE} n'existe pas dans le build qui tourne : le code n'est pas déployé.`);
  }
  if (typeof pingLocal === "number" && pingLocal === 401 && problemes.length === 0) {
    problemes.push(
      `Le fichier, le sous-shell et le processus s'accordent, et la route refuse quand même.\n` +
        `     Ce script ne sait pas pourquoi : lire pm2 logs tipote-prod au moment de l'appel.`,
    );
  }

  const ok = problemes.length === 0 && (pingLocal === undefined || pingLocal === 200);
  return { ok, lignes, problemes };
}

function lireDuFichier(cle) {
  for (const nom of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const chemin = join(RACINE, nom);
    if (!existsSync(chemin)) continue;
    const v = lireCleDuTexte(readFileSync(chemin, "utf8"), cle);
    if (v) return v;
  }
  return "";
}

/** Ce que `( set -a; . .env; set +a; ... )` donne VRAIMENT, dans un bash à part. */
function valeurDuSousShell(cle) {
  if (!existsSync(join(RACINE, ".env"))) return "";
  const r = spawnSync("bash", ["-c", `( set -a; . ./.env; set +a; printf %s "$${cle}" )`], {
    cwd: RACINE,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
  });
  if (r.error) return null;
  return (r.stdout ?? "").trim();
}

/** La valeur dans l'environnement que le noyau a donné au serveur, s'il tourne. */
function valeurDuProcessus(cle) {
  if (process.platform !== "linux" || !existsSync("/proc")) return null;
  const dossierServeur = join(RACINE, ".next", "standalone");
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
      continue;
    }
    if (cwd !== dossierServeur) continue;
    try {
      for (const ligne of readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")) {
        if (ligne.startsWith(`${cle}=`)) return ligne.slice(cle.length + 1).trim();
      }
      return "";
    } catch {
      continue;
    }
  }
  return null;
}

function valeurDuStandalone(cle) {
  const chemin = join(RACINE, ".next", "standalone", ".env");
  return existsSync(chemin) ? lireCleDuTexte(readFileSync(chemin, "utf8"), cle) : "";
}

async function ping(base, secret) {
  try {
    const r = await fetch(`${base}${CHEMIN_ROUTE}`, {
      method: "GET",
      headers: { "X-Cron-Secret": secret },
      signal: AbortSignal.timeout(8000),
      redirect: "manual",
    });
    return r.status;
  } catch (e) {
    return e instanceof Error ? e.name : String(e);
  }
}

async function main() {
  const fichier = lireDuFichier(CLE);
  const shell = valeurDuSousShell(CLE);
  const processus = valeurDuProcessus(CLE);
  const standalone = valeurDuStandalone(CLE);
  const port = process.env.PORT ?? "3000";
  const pingLocal = fichier ? await ping(`http://127.0.0.1:${port}`, fichier) : undefined;
  const pingPublic = fichier ? await ping("https://app.tipote.com", fichier) : undefined;

  const v = verdict({ fichier, shell, processus, standalone, pingLocal, pingPublic });
  console.log(`\n  ${CLE} : QUI TIENT QUELLE VALEUR\n`);
  for (const l of v.lignes) console.log(`  ${l}`);
  console.log("");
  if (v.ok) {
    console.log("  Rien à signaler : la route accepte le secret du fichier. La ligne de crontab peut être posée.\n");
  } else {
    for (const p of v.problemes) console.log(`  -> ${p}\n`);
  }
  process.exit(v.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
