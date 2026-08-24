// scripts/storage-archive.mjs
//
// COPIE LES FICHIERS DU BUCKET SUR CE SERVEUR. NE SUPPRIME RIEN.
//
// Béné, 26 août 2026 : "on ne supprime rien des clients à ce stade. On
// peut archiver l'existant quelque part pour le retrouver en cas de
// besoin ?"
//
// Oui, et l'endroit est ce serveur : 47 Go utilisés sur 400, un CPU à
// 1 %, 0,1 To de bande passante sur 32. Le bucket entier pèse moins
// d'un giga.
//
// -- CE QUE ÇA FAIT ----------------------------------------------------
//
// Télécharge chaque fichier du bucket dans un dossier local, en gardant
// EXACTEMENT l'arborescence du bucket, et écrit un manifeste JSON à
// côté. Le manifeste est ce qui rend l'archive utile : sans lui on a un
// tas de fichiers dont personne ne sait à quel quiz ils appartenaient.
//
// -- CE QUE ÇA NE FAIT PAS, ET C'EST VOLONTAIRE ------------------------
//
// **Aucune suppression, ni ici ni ailleurs.** Ce script ne connaît que
// la lecture. Vider le bucket est une décision séparée, qui se prend
// une fois l'archive vérifiée, et avec une commande qu'on écrira ce
// jour là.
//
// **Aucune réécriture d'URL.** Les quiz en ligne continuent de pointer
// vers Supabase : l'archive est un filet, pas un déménagement.
//
// -- USAGE -------------------------------------------------------------
//
//   cd ~/tiquiz-app
//   node scripts/storage-archive.mjs                      # tout, vers /srv/storage-archive/<projet>
//   node scripts/storage-archive.mjs --dest /autre/chemin
//   node scripts/storage-archive.mjs --reprendre          # ne retelecharge pas ce qui est deja la
//
// Relançable sans risque : avec `--reprendre`, un fichier deja present
// et de la bonne taille est saute. Une coupure reseau ne coute donc que
// ce qui restait a faire.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const BUCKET = "public-assets";

function readVar(name) {
  const fromEnv = (process.env[name] ?? "").trim();
  if (fromEnv) return fromEnv;
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return "";
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim().replace(/^export\s+/, "");
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0 || t.slice(0, eq).trim() !== name) continue;
    return t.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2").trim();
  }
  return "";
}

const URL_BASE = readVar("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const CLE = readVar("SUPABASE_SERVICE_ROLE_KEY");
if (!URL_BASE || !CLE) {
  console.error("Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const PROJET = URL_BASE.replace(/^https?:\/\//, "").split(".")[0];
const args = process.argv.slice(2);
const iDest = args.indexOf("--dest");
const DEST = resolve(iDest >= 0 ? args[iDest + 1] : `/srv/storage-archive/${PROJET}`);
const REPRENDRE = args.includes("--reprendre");

const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}`, "Content-Type": "application/json" };
const mo = (o) => `${(o / 1024 / 1024).toFixed(1)} Mo`;

async function lister(prefixe) {
  const tout = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: entetes,
      body: JSON.stringify({ prefix: prefixe, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) {
      // On ARRÊTE au lieu de continuer : une archive incomplète qui se
      // croit complète est pire que pas d'archive du tout, parce qu'on
      // supprimerait ensuite en confiance.
      throw new Error(`Lecture de "${prefixe}" refusee (${res.status}) : ${(await res.text()).slice(0, 200)}`);
    }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) return tout;
    tout.push(...page);
    if (page.length < 1000) return tout;
  }
}

async function listerRecursif(prefixe, profondeur = 0) {
  const fichiers = [];
  for (const e of await lister(prefixe)) {
    const chemin = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (!e.metadata) {
      if (profondeur < 4) fichiers.push(...(await listerRecursif(chemin, profondeur + 1)));
      continue;
    }
    fichiers.push({ chemin, taille: Number(e.metadata.size ?? 0), type: e.metadata.mimetype ?? null, cree: e.created_at ?? null });
  }
  return fichiers;
}

console.log(`\nArchivage de "${BUCKET}" (projet ${PROJET})\n  vers ${DEST}\n`);

const fichiers = await listerRecursif("");
const total = fichiers.reduce((s, f) => s + f.taille, 0);
console.log(`${fichiers.length} fichiers, ${mo(total)} a copier.\n`);
if (fichiers.length === 0) process.exit(0);

mkdirSync(DEST, { recursive: true });

const manifeste = [];
let copies = 0;
let sautes = 0;
let rates = 0;
let octets = 0;

for (const [i, f] of fichiers.entries()) {
  const cible = join(DEST, f.chemin);
  mkdirSync(dirname(cible), { recursive: true });

  if (REPRENDRE) {
    try {
      if (statSync(cible).size === f.taille) {
        sautes += 1;
        manifeste.push({ ...f, archive: true, saute: true });
        continue;
      }
    } catch {
      // Absent : on le telecharge, c'est le cas normal.
    }
  }

  try {
    const res = await fetch(
      `${URL_BASE}/storage/v1/object/${BUCKET}/${f.chemin.split("/").map(encodeURIComponent).join("/")}`,
      { headers: { apikey: CLE, Authorization: `Bearer ${CLE}` } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    // ON VERIFIE LA TAILLE. Une reponse tronquee s'ecrirait sans bruit,
    // et l'archive mentirait au moment ou on lui fait confiance.
    if (f.taille > 0 && buf.length !== f.taille) {
      throw new Error(`taille ${buf.length} au lieu de ${f.taille}`);
    }

    await writeFile(cible, buf);
    manifeste.push({
      ...f,
      archive: true,
      // De quoi verifier plus tard que le fichier n'a pas bouge, et
      // reperer les doublons exacts (le meme visuel envoye dix fois).
      sha256: createHash("sha256").update(buf).digest("hex"),
    });
    copies += 1;
    octets += buf.length;
  } catch (e) {
    rates += 1;
    manifeste.push({ ...f, archive: false, erreur: String(e.message ?? e) });
    console.error(`  RATE  ${f.chemin} : ${e.message ?? e}`);
  }

  if ((i + 1) % 50 === 0 || i + 1 === fichiers.length) {
    process.stdout.write(`\r  ${i + 1}/${fichiers.length}  (${mo(octets)} copies)   `);
  }
}

const chemin = join(DEST, "_manifeste.json");
writeFileSync(
  chemin,
  JSON.stringify(
    {
      projet: PROJET,
      bucket: BUCKET,
      // Aucune date generee ici : la commande qui archive doit pouvoir
      // se relancer et produire le meme manifeste. L'horodatage du
      // fichier suffit a dater l'archive.
      fichiers: manifeste,
    },
    null,
    2,
  ),
);

console.log(
  `\n\n${copies} copies, ${sautes} deja presents, ${rates} en echec.\n` +
    `Manifeste : ${chemin}\n`,
);

if (rates > 0) {
  console.error(
    `ARCHIVE INCOMPLETE : ${rates} fichier(s) manquent.\n` +
      `NE RIEN SUPPRIMER tant que ce nombre n'est pas zero. Relancer avec\n` +
      `--reprendre ne retelechargera que ce qui manque.\n`,
  );
  process.exit(2);
}

console.log(
  "Archive complete. RIEN N'A ETE SUPPRIME chez Supabase : les quiz en\n" +
    "ligne continuent de pointer vers le bucket, comme avant.\n",
);
