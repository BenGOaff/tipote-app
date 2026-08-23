// Post-build copy for Next.js standalone output.
//
// `output: "standalone"` ships everything the server needs in
// `.next/standalone/`, but Next does NOT copy `.next/static` (Webpack
// chunks) nor `public/` (static assets like favicon.png) into it —
// that responsibility is left to the deploy infra. We do it here so
// `pm2 start .next/standalone/server.js` Just Works.

const fs = require("fs");
const path = require("path");

function copyDir(srcRel, destRel, { required = true } = {}) {
  const src = path.join(process.cwd(), srcRel);
  const dest = path.join(process.cwd(), destRel);
  if (!fs.existsSync(src)) {
    if (required) {
      console.error(`❌ ${srcRel} introuvable`);
      process.exit(1);
    }
    console.log(`ℹ️  ${srcRel} absent (rien à copier)`);
    return;
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`✅ ${srcRel} → ${destRel}`);
}

copyDir(".next/static", ".next/standalone/.next/static");
copyDir("public", ".next/standalone/public", { required: false });

// ── LES FICHIERS D'ENVIRONNEMENT ──
//
// PANNE DU 22 AOÛT AU SOIR. Béné : "pourquoi j'ai tous mes contenus mais
// pas mes clients dans Tipote ?" La question était la bonne.
//
// `server.js` fait `process.chdir(__dirname)`, donc Next cherche ses
// fichiers d'environnement DANS `.next/standalone/`. Next n'y copie rien,
// et nous non plus jusqu'ici : l'app tournait donc uniquement sur ce que
// PM2 gardait en mémoire, parfois hérité d'un `--update-env` lancé des
// mois plus tôt. Un `pm2 restart --update-env` depuis un terminal qui
// portait les variables de l'AUTRE app y a écrit sa clé de service, et
// plus aucun rebuild ne pouvait la déloger.
//
// Symptôme exact, et il est instructif : les contenus s'affichaient (clé
// anon, GRAVÉE dans le build, donc juste) et les clients avaient disparu
// (clé de service, lue dans le processus, donc fausse).
//
// Vérifié en démarrant un vrai build standalone avec un `.env` posé à
// côté du `server.js` : il est bien lu.
//
// ATTENTION, ça ne dispense pas du garde-fou d'`instrumentation.ts` :
// `process.env` passe TOUJOURS devant ces fichiers. Une valeur fausse
// héritée de PM2 gagnera encore. Ce que ça change, c'est qu'une variable
// absente du processus a désormais une source fiable, versionnée avec le
// déploiement, au lieu de dépendre de la mémoire de PM2.

function copyEnvFile(nom) {
  const src = path.join(process.cwd(), nom);
  if (!fs.existsSync(src)) return;
  const dest = path.join(process.cwd(), ".next/standalone", nom);
  fs.copyFileSync(src, dest);
  // Ces fichiers portent des secrets. `.next/standalone/` n'est pas servi
  // sur le web (seuls `public/` et `.next/static` le sont), mais on ne
  // compte pas là dessus pour les permissions.
  fs.chmodSync(dest, 0o600);
  console.log(`✅ ${nom} → .next/standalone/${nom}`);
}

// Dans l'ordre de priorité de Next : `.env.local` gagne sur `.env`.
// On copie les deux pour que le serveur standalone se comporte comme le
// repo, sinon une variable qui ne vit que dans `.env.local` disparaît
// (c'est le `Missing env var POPQUIZ_TUS_URL` du journal de Tipote).
for (const nom of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  copyEnvFile(nom);
}
