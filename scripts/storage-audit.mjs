// scripts/storage-audit.mjs
//
// COMBIEN PÈSE LE STOCKAGE, ET QUELS FICHIERS PLUS PERSONNE NE CITE.
//
// -- POURQUOI CE SCRIPT EXISTE (24 août 2026) --------------------------
//
// L'alerte Supabase portait sur le STOCKAGE (0,73 / 1 Go sur Tiquiz, avec
// 43 utilisateurs actifs), pas sur la base, qui était à 16 %. Ce n'est
// donc pas la base qu'il faut alléger : ce sont les FICHIERS.
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
// Il MESURE. Il liste ce qui est stocké, croise chaque fichier avec tout
// ce que la base cite encore, et dit combien pèse ce que plus personne
// ne référence.
//
// **Il ne supprime RIEN, et il n'en a pas le pouvoir.** Un fichier
// effacé par erreur, c'est l'image de couverture d'une cliente qui
// disparaît de son quiz en ligne, sans retour arrière. On regarde
// d'abord, on décide ensuite.
//
// -- PLUS AUCUNE LISTE DE COLONNES ÉCRITE À LA MAIN (26 août 2026) -----
//
// La première version portait une liste `SOURCES` de tables et de
// colonnes, et elle a rendu un verdict FAUX dès son premier passage :
//
//   - `quizzes.brand_favicon_url` n'existe pas (la colonne est sur
//     `profiles`). PostgREST refuse le SELECT ENTIER sur une colonne
//     inconnue, donc AUCUNE image de quiz n'a été lue ;
//   - `quiz_questions.image_url` n'existe pas non plus : les images des
//     questions et des réponses vivent dans le JSONB `options` ;
//   - et surtout, la moitié du bucket (`rich-content`, 373 Mo) est citée
//     DANS DU HTML de texte riche, à l'intérieur de colonnes de texte
//     qu'aucune liste de colonnes d'images n'aurait pensé à lire.
//
// Résultat annoncé : "642 fichiers ne sont cités NULLE PART". C'était
// l'inverse : le script n'avait pas su lire ce qui les citait. Une liste
// écrite à la main finit toujours par diverger du schéma, et ici la
// divergence se paie en contenus de clientes supprimés.
//
// **Règle : on demande son schéma à la base, et on lit TOUT ce qui peut
// contenir du texte.** Le contenu total de la base est de l'ordre de
// 80 Mo (16 % de 500 Mo) : la lire en entier coûte quelques secondes, et
// ça supprime définitivement la classe de bugs "colonne oubliée".
//
// **Et si une seule table n'a pas pu être lue, AUCUN verdict n'est
// rendu.** Un chiffre d'orphelins calculé sur une lecture partielle est
// pire que pas de chiffre : il a l'air d'une mesure.
//
// -- USAGE -------------------------------------------------------------
//
//   node scripts/storage-audit.mjs            # le resume
//   node scripts/storage-audit.mjs --detail   # + les 40 plus gros orphelins
//   node scripts/storage-audit.mjs --tables   # + ce qui a ete lu, table par table
//
// Pas besoin de sourcer le .env : le script le lit lui même, et
// seulement les deux lignes dont il a besoin (même raison que
// `login-link.mjs` : `set -a; . .env` fait interpréter TOUT le fichier
// par bash, et une seule valeur exotique fait échouer le chargement).

import { readFileSync } from "node:fs";

/**
 * TOUS les buckets, demandes a Supabase.
 *
 * `public-assets` etait ecrit en dur, et Tipote en a un SECOND
 * (`content-images`, les visuels du generateur de contenu) que l'audit
 * ne regardait donc pas du tout. Mesurer un bucket sur deux et annoncer
 * un total, c'est la meme faute que la liste de colonnes ecrite a la
 * main : un chiffre qui a l'air d'une mesure.
 */
async function lireBuckets() {
  const res = await fetch(`${URL_BASE}/storage/v1/bucket`, { headers: entetes });
  if (!res.ok) {
    console.error(`\nLa liste des buckets n'a pas pu etre lue (${res.status}) : ${(await res.text()).slice(0, 200)}`);
    process.exit(2);
  }
  const liste = await res.json();
  return (Array.isArray(liste) ? liste : []).map((b) => String(b?.name ?? "")).filter(Boolean).sort();
}

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
async function lister(bucket, prefixe) {
  const tout = [];
  const parPage = 1000;
  for (let offset = 0; ; offset += parPage) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: entetes,
      body: JSON.stringify({ prefix: prefixe, limit: parPage, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) {
      console.error(`Lecture de "${bucket}/${prefixe}" refusee (${res.status}) : ${(await res.text()).slice(0, 200)}`);
      return tout;
    }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) return tout;
    tout.push(...page);
    if (page.length < parPage) return tout;
  }
}

/** Descend récursivement : le bucket est rangé en `<topic>/<uid>/<fichier>`. */
async function listerRecursif(bucket, prefixe, profondeur = 0) {
  const entrees = await lister(bucket, prefixe);
  const fichiers = [];
  for (const e of entrees) {
    const chemin = prefixe ? `${prefixe}/${e.name}` : e.name;
    // Un DOSSIER n'a pas de métadonnées. C'est la seule façon de les
    // distinguer, l'API ne le dit pas autrement.
    if (!e.metadata) {
      if (profondeur < 4) fichiers.push(...(await listerRecursif(bucket, chemin, profondeur + 1)));
      continue;
    }
    fichiers.push({ bucket, chemin, cle: `${bucket}/${chemin}`, taille: Number(e.metadata.size ?? 0), cree: e.created_at ?? null });
  }
  return fichiers;
}

/**
 * Le schéma, demandé à la base.
 *
 * PostgREST publie son OpenAPI à la racine : chaque table y porte ses
 * colonnes et leur format. On ne devine plus rien.
 */
async function lireSchema() {
  const res = await fetch(`${URL_BASE}/rest/v1/`, { headers: entetes });
  if (!res.ok) {
    console.error(`\nLe schema n'a pas pu etre lu (${res.status}) : ${(await res.text()).slice(0, 200)}`);
    process.exit(2);
  }
  const spec = await res.json();
  const definitions = spec?.definitions ?? {};
  const tables = [];
  for (const [table, def] of Object.entries(definitions)) {
    const colonnes = Object.entries(def?.properties ?? {})
      // Tout ce qui peut PORTER du texte : text, varchar, citext, json,
      // jsonb, et leurs tableaux. Un nombre ou une date ne peut pas
      // contenir une URL, les lire ne ferait que grossir la reponse.
      .filter(([, p]) => /text|char|json/i.test(String(p?.format ?? "")))
      .map(([nom]) => nom);
    if (colonnes.length > 0) tables.push({ table, colonnes });
  }
  return tables.sort((a, b) => a.table.localeCompare(b.table));
}

/**
 * Toutes les références au bucket, où qu'elles soient.
 *
 * On descend dans les objets et les tableaux : une image de réponse vit
 * dans le JSONB `options`, une image de texte riche vit dans un `<img
 * src>` au milieu d'une colonne de texte. Chercher `/public-assets/`
 * dans la valeur BRUTE les attrape toutes les deux, sans avoir à savoir
 * laquelle est où.
 */
let MOTIF = null;

/** Construit le motif une fois les buckets connus. */
function armerMotif(buckets) {
  const noms = buckets.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  MOTIF = new RegExp(`/(${noms})/([^\\s"'<>)\\\\]+)`, "g");
}

function recolter(valeur, citees) {
  if (valeur == null) return;
  if (typeof valeur === "string") {
    for (const m of valeur.matchAll(MOTIF)) {
      let chemin = m[2].split("?")[0].split("#")[0];
      // Le HTML de texte riche est stocké échappé : un `&amp;` ou un
      // `&quot;` collé à la fin du src ferait un chemin qui n'existe pas.
      chemin = chemin.replace(/&(amp|quot|apos|lt|gt|#\d+);.*$/i, "");
      try {
        chemin = decodeURIComponent(chemin);
      } catch {
        /* une URL mal encodee reste lisible telle quelle */
      }
      if (chemin) citees.add(`${m[1]}/${chemin}`);
    }
    return;
  }
  if (Array.isArray(valeur)) {
    for (const v of valeur) recolter(v, citees);
    return;
  }
  if (typeof valeur === "object") {
    for (const v of Object.values(valeur)) recolter(v, citees);
  }
}

async function urlsCitees(tables, montrerTables) {
  const citees = new Set();
  const rates = [];
  const lues = [];
  for (const { table, colonnes } of tables) {
    let n = 0;
    let echec = null;
    for (let offset = 0; ; offset += 1000) {
      const params = new URLSearchParams({ select: colonnes.join(","), limit: "1000", offset: String(offset) });
      let res;
      try {
        res = await fetch(`${URL_BASE}/rest/v1/${table}?${params}`, { headers: entetes });
      } catch (e) {
        echec = String(e?.message ?? e).slice(0, 120);
        break;
      }
      if (!res.ok) {
        echec = `${res.status} ${(await res.text()).slice(0, 120)}`;
        break;
      }
      const lignes = await res.json();
      if (!Array.isArray(lignes) || lignes.length === 0) break;
      n += lignes.length;
      for (const l of lignes) recolter(l, citees);
      if (lignes.length < 1000) break;
    }
    if (echec) rates.push(`${table} (${echec})`);
    else lues.push({ table, n, colonnes: colonnes.length });
  }
  if (montrerTables) {
    console.log("\nCe qui a ete lu :");
    for (const l of lues) {
      console.log(`  ${l.table.padEnd(34)} ${String(l.n).padStart(7)} lignes   ${String(l.colonnes).padStart(3)} colonnes de texte`);
    }
  }
  return { citees, rates };
}

const detail = process.argv.includes("--detail");
const montrerTables = process.argv.includes("--tables");

const projet = URL_BASE.replace(/^https?:\/\//, "").split(".")[0];
console.log(`\nStockage de ${projet}\n`);

const buckets = await lireBuckets();
if (buckets.length === 0) {
  console.log("Aucun bucket lu. Verifie que la cle de service est bien celle de CE projet.");
  process.exit(0);
}
armerMotif(buckets);

const fichiers = [];
for (const b of buckets) fichiers.push(...(await listerRecursif(b, "")));
if (fichiers.length === 0) {
  console.log(`Les ${buckets.length} buckets sont vides : ${buckets.join(", ")}`);
  process.exit(0);
}

const total = fichiers.reduce((s, f) => s + f.taille, 0);
console.log(`${fichiers.length} fichiers, ${mo(total)} au total, dans ${buckets.length} bucket(s).\n`);

/** Regroupe et affiche, du plus lourd au plus leger. */
function repartition(titre, cle) {
  const par = new Map();
  for (const f of fichiers) {
    const k = cle(f);
    const e = par.get(k) ?? { n: 0, taille: 0 };
    e.n += 1;
    e.taille += f.taille;
    par.set(k, e);
  }
  console.log(`${titre} :`);
  for (const [k, e] of [...par].sort((a, b) => b[1].taille - a[1].taille)) {
    console.log(`  ${k.padEnd(34)} ${String(e.n).padStart(5)} fichiers   ${mo(e.taille).padStart(10)}`);
  }
}

repartition("Par bucket", (f) => f.bucket);
console.log("");
repartition("Par dossier", (f) => `${f.bucket}/${f.chemin.split("/")[0]}`);

const tables = await lireSchema();
console.log(`\nCroisement avec ce que la base cite encore (${tables.length} tables)...`);
const { citees, rates } = await urlsCitees(tables, montrerTables);

if (rates.length > 0) {
  console.error(
    `\nLECTURE INCOMPLETE, AUCUN VERDICT RENDU.\n\n` +
      `Ces tables n'ont pas pu etre lues :\n` +
      rates.map((r) => `  - ${r}`).join("\n") +
      `\n\nTout fichier qu'elles citent paraitrait orphelin, et un fichier\n` +
      `supprime a tort est le contenu d'une cliente qui disparait de son\n` +
      `quiz en ligne. Le poids total et la repartition, eux, restent justes :\n` +
      `ils sont au dessus.\n`,
  );
  process.exit(2);
}

const presents = new Set(fichiers.map((f) => f.cle));
const orphelins = fichiers.filter((f) => !citees.has(f.cle));
const poidsOrphelins = orphelins.reduce((s, f) => s + f.taille, 0);
const citeesReelles = [...citees].filter((c) => presents.has(c)).length;
const citeesFantomes = citees.size - citeesReelles;

console.log(
  `\n${citeesReelles} fichiers sont cites par une ligne vivante.\n` +
    `${orphelins.length} fichiers ne sont cites NULLE PART : ${mo(poidsOrphelins)} ` +
    `(${total > 0 ? Math.round((poidsOrphelins / total) * 100) : 0} % du stockage).`,
);
if (citeesFantomes > 0) {
  console.log(
    `\n${citeesFantomes} URL citees par la base ne correspondent a AUCUN fichier :\n` +
      `ce sont des images deja cassees a l'ecran, a regarder de pres.`,
  );
}

if (detail && orphelins.length > 0) {
  console.log("\nLes 40 plus gros orphelins :");
  for (const f of [...orphelins].sort((a, b) => b.taille - a.taille).slice(0, 40)) {
    console.log(`  ${mo(f.taille).padStart(10)}  ${f.cree?.slice(0, 10) ?? "?"}  ${f.cle}`);
  }
}

console.log(
  "\nCE SCRIPT NE SUPPRIME RIEN, ET RIEN NE DOIT ETRE SUPPRIME SUR SA SEULE FOI.\n" +
    "Il lit la base a un instant donne : un brouillon en cours d'edition, une\n" +
    "sauvegarde qui n'est pas encore partie, une table ajoutee depuis, et le\n" +
    "fichier parait orphelin sans l'etre. On ARCHIVE (storage:archive), on ne\n" +
    "supprime pas.\n",
);
