// scripts/storage-audit.mjs
//
// COMBIEN PÈSE LE STOCKAGE, ET COMBIEN DE FICHIERS NE SERVENT PLUS.
//
// -- POURQUOI CE SCRIPT EXISTE (24 août 2026) --------------------------
//
// Le stockage Supabase est à 73 % du plan gratuit (0,73 / 1 Go) avec 43
// utilisateurs actifs. La base, elle, est à 16 %. Ce n'est donc pas la
// base qu'il faut alléger : ce sont les FICHIERS.
//
// La cause est structurelle et elle est dans le code :
//
//   const path = `quiz-backgrounds/${user.id}/${quizId}-${Date.now()}.${ext}`;
//
// **Chaque chemin porte l'horodatage de l'envoi.** Changer l'image de
// fond d'un quiz dix fois écrit donc dix fichiers, et les neuf premiers
// restent là pour toujours. Le `upsert: true` posé à côté ne remplace
// jamais rien, puisque le chemin est neuf à chaque fois.
//
// Et **AUCUN fichier n'est jamais supprimé** : ni quand une créatrice
// remplace une image, ni quand elle supprime le quiz qui la portait.
// Le stockage ne peut donc que grossir.
//
// -- CE QUE CE SCRIPT FAIT, ET CE QU'IL NE FAIT PAS --------------------
//
// Il MESURE. Il liste ce qui est stocké, croise chaque fichier avec les
// colonnes qui pourraient le citer, et dit combien pèse ce que plus
// personne ne référence.
//
// **Il ne supprime RIEN, et il n'en a pas le pouvoir.** Un fichier
// effacé par erreur, c'est l'image de couverture d'une cliente qui
// disparaît de son quiz en ligne, sans retour arrière. On regarde
// d'abord, on décide ensuite.
//
// -- USAGE -------------------------------------------------------------
//
//   cd ~/tiquiz-app
//   node scripts/storage-audit.mjs            # le resume
//   node scripts/storage-audit.mjs --detail   # + les 40 plus gros orphelins
//
// Pas besoin de sourcer le .env : le script le lit lui même, et
// seulement les deux lignes dont il a besoin (même raison que
// `login-link.mjs` : `set -a; . .env` fait interpréter TOUT le fichier
// par bash, et une seule valeur exotique fait échouer le chargement).

import { readFileSync } from "node:fs";

const BUCKET = "public-assets";

/** Les colonnes qui peuvent citer un fichier. Une oubliée = un faux orphelin. */
const SOURCES = [
  { table: "quizzes", colonnes: ["bonus_image_url", "og_image_url", "background_image_url", "intro_image_url", "split_image_url", "brand_logo_url"] },
  { table: "quiz_results", colonnes: ["image_url"] },
  { table: "quiz_questions", colonnes: ["image_url"] },
  // Tipote stocke aussi les visuels des contenus generes.
  { table: "content_item", colonnes: ["image_url"] },
];

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
  console.error(
    "Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Le script les cherche dans l'environnement, puis dans le .env du dossier.",
  );
  process.exit(1);
}

const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}`, "Content-Type": "application/json" };

const mo = (octets) => `${(octets / 1024 / 1024).toFixed(1)} Mo`;

/**
 * Liste TOUT un dossier, page par page.
 *
 * L'API rend 100 entrées par défaut et ne dit pas qu'il en reste : sans
 * pagination on mesurerait une fraction du bucket en croyant l'avoir vu
 * en entier, ce qui est pire que ne pas mesurer.
 */
async function lister(prefixe) {
  const tout = [];
  const parPage = 1000;
  for (let offset = 0; ; offset += parPage) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: entetes,
      body: JSON.stringify({ prefix: prefixe, limit: parPage, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) {
      console.error(`Lecture de "${prefixe}" refusee (${res.status}) : ${(await res.text()).slice(0, 200)}`);
      return tout;
    }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) return tout;
    tout.push(...page);
    if (page.length < parPage) return tout;
  }
}

/** Descend récursivement : le bucket est rangé en `<topic>/<uid>/<fichier>`. */
async function listerRecursif(prefixe, profondeur = 0) {
  const entrees = await lister(prefixe);
  const fichiers = [];
  for (const e of entrees) {
    const chemin = prefixe ? `${prefixe}/${e.name}` : e.name;
    // Un DOSSIER n'a pas de métadonnées. C'est la seule façon de les
    // distinguer, l'API ne le dit pas autrement.
    if (!e.metadata) {
      if (profondeur < 3) fichiers.push(...(await listerRecursif(chemin, profondeur + 1)));
      continue;
    }
    fichiers.push({ chemin, taille: Number(e.metadata.size ?? 0), cree: e.created_at ?? null });
  }
  return fichiers;
}

/** Toutes les URL citées par une colonne, en une requête paginée. */
async function urlsCitees() {
  const citees = new Set();
  // UNE SEULE TABLE ILLISIBLE INTERDIT DE CONCLURE.
  //
  // Si on n'a pas pu lire `quiz_results`, tous les fichiers qu'elle cite
  // paraissent orphelins. Rendre ce chiffre quand meme, c'est proposer
  // de supprimer les images de resultat de toutes les clientes. Une
  // connaissance partielle ne doit JAMAIS ressembler a une connaissance
  // complete : le script le dit et refuse le verdict.
  const rates = [];
  for (const { table, colonnes } of SOURCES) {
    for (let offset = 0; ; offset += 1000) {
      const params = new URLSearchParams({ select: colonnes.join(","), limit: "1000", offset: String(offset) });
      const res = await fetch(`${URL_BASE}/rest/v1/${table}?${params}`, { headers: entetes });
      if (!res.ok) {
        rates.push(`${table} (${(await res.text()).slice(0, 100)})`);
        break;
      }
      const lignes = await res.json();
      if (!Array.isArray(lignes) || lignes.length === 0) break;
      for (const l of lignes) {
        for (const c of colonnes) {
          const v = l[c];
          if (typeof v === "string" && v.includes(`/${BUCKET}/`)) {
            citees.add(decodeURIComponent(v.split(`/${BUCKET}/`)[1].split("?")[0]));
          }
        }
      }
      if (lignes.length < 1000) break;
    }
  }
  return { citees, rates };
}

const detail = process.argv.includes("--detail");

console.log(`\nStockage de ${URL_BASE.replace(/^https?:\/\//, "").split(".")[0]}, bucket "${BUCKET}"\n`);

const fichiers = await listerRecursif("");
if (fichiers.length === 0) {
  console.log("Aucun fichier lu. Verifie que la cle de service est bien celle de CE projet.");
  process.exit(0);
}

const total = fichiers.reduce((s, f) => s + f.taille, 0);
console.log(`${fichiers.length} fichiers, ${mo(total)} au total.\n`);

// Par dossier de tête : c'est ce qui dit OÙ ça pèse.
const parTopic = new Map();
for (const f of fichiers) {
  const topic = f.chemin.split("/")[0];
  const e = parTopic.get(topic) ?? { n: 0, taille: 0 };
  e.n += 1;
  e.taille += f.taille;
  parTopic.set(topic, e);
}
console.log("Par dossier :");
for (const [topic, e] of [...parTopic].sort((a, b) => b[1].taille - a[1].taille)) {
  console.log(`  ${topic.padEnd(20)} ${String(e.n).padStart(5)} fichiers   ${mo(e.taille).padStart(10)}`);
}

console.log("\nCroisement avec ce que la base cite encore...");
const { citees, rates } = await urlsCitees();

if (rates.length > 0) {
  console.error(
    `\nLECTURE INCOMPLETE, AUCUN VERDICT RENDU.\n\n` +
      `Ces sources n'ont pas pu etre lues :\n` +
      rates.map((r) => `  - ${r}`).join("\n") +
      `\n\nTout fichier qu'elles citent paraitrait orphelin. Corriger la liste\n` +
      `SOURCES en tete du script, puis relancer. Le poids total et la\n` +
      `repartition par dossier, eux, restent justes : ils sont au dessus.\n`,
  );
  process.exit(2);
}

const orphelins = fichiers.filter((f) => !citees.has(f.chemin));
const poidsOrphelins = orphelins.reduce((s, f) => s + f.taille, 0);

console.log(
  `\n${citees.size} fichiers cites par une ligne vivante.\n` +
    `${orphelins.length} fichiers ne sont cites NULLE PART : ${mo(poidsOrphelins)} ` +
    `(${total > 0 ? Math.round((poidsOrphelins / total) * 100) : 0} % du bucket).`,
);

if (detail && orphelins.length > 0) {
  console.log("\nLes 40 plus gros orphelins :");
  for (const f of [...orphelins].sort((a, b) => b.taille - a.taille).slice(0, 40)) {
    console.log(`  ${mo(f.taille).padStart(10)}  ${f.cree?.slice(0, 10) ?? "?"}  ${f.chemin}`);
  }
}

console.log(
  "\nCE SCRIPT NE SUPPRIME RIEN.\n" +
    "Un orphelin peut etre cite par une colonne que SOURCES ne connait pas :\n" +
    "verifier cette liste AVANT de supprimer quoi que ce soit.\n",
);
