// scripts/storage-migrate.mjs
//
// RÉÉCRIT LES ADRESSES DES IMAGES : Supabase -> NOTRE serveur.
//
// -- POURQUOI (26 août 2026) -------------------------------------------
//
// L'alerte Supabase ne porte pas sur le stockage mais sur la BANDE
// PASSANTE : "Cached Egress Exceeded", 7,27 Go sur le cycle precedent,
// pour 719 Mo d'images. Chaque visiteur de quiz telecharge ces images
// DEPUIS SUPABASE, une dizaine de fois par fichier en moyenne.
//
// Basculer les nouvelles images sur notre serveur ne fait que ralentir
// la hausse. Ce qui fait TOMBER le compteur, c'est que les quiz DEJA EN
// LIGNE cessent de pointer vers Supabase. C'est ce que fait ce script.
//
// -- CE QU'IL NE FAIT JAMAIS -------------------------------------------
//
// **Il ne supprime RIEN, ni chez Supabase ni ailleurs.** Les fichiers
// restent dans le bucket : si une adresse nous echappe, l'image
// continue de s'afficher. On coupe la consommation, on ne coupe pas le
// filet.
//
// **Il ne reecrit une adresse que si le fichier existe VRAIMENT dans le
// dossier local.** Une adresse reecrite vers un fichier absent, c'est
// une image cassee sur le quiz d'une cliente, en ligne, sans que
// personne ne le voie. Le fichier manquant est signale, l'adresse reste
// sur Supabase.
//
// **Il ecrit une sauvegarde AVANT de toucher a quoi que ce soit** :
// table, cle primaire, colonne, valeur d'origine. C'est ce qui rend le
// retour en arriere possible ligne par ligne.
//
// **Et il ne fait RIEN par defaut.** Sans `--appliquer`, il montre ce
// qu'il ferait et s'arrete.
//
// -- USAGE -------------------------------------------------------------
//
//   node scripts/storage-migrate.mjs              # montre, n'ecrit rien
//   node scripts/storage-migrate.mjs --appliquer  # ecrit
//   node scripts/storage-migrate.mjs --appliquer --table quizzes
//
// Prealables, dans cet ordre :
//   1. l'archive est faite      (node scripts/storage-archive.mjs)
//   2. les fichiers sont copies dans le dossier servi par le serveur
//   3. NEXT_PUBLIC_ASSETS_BASE_URL est posee dans le .env

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
const BASE_ASSETS = readVar("NEXT_PUBLIC_ASSETS_BASE_URL").replace(/\/+$/, "");
const DOSSIER = (readVar("ASSETS_DIR") || "/srv/assets-tipote").replace(/\/+$/, "");
const BUCKET = "public-assets";

if (!URL_BASE || !CLE) {
  console.error("Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!/^https:\/\//.test(BASE_ASSETS)) {
  console.error(
    "NEXT_PUBLIC_ASSETS_BASE_URL est absente ou n'est pas en https.\n" +
      "C'est elle qui dit vers QUOI reecrire : sans elle on ecrirait des\n" +
      "adresses mortes dans des quiz en ligne.",
  );
  process.exit(1);
}
if (!existsSync(DOSSIER)) {
  console.error(`Le dossier ${DOSSIER} n'existe pas. Copier d'abord les fichiers de l'archive dedans.`);
  process.exit(1);
}

const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}`, "Content-Type": "application/json" };

const appliquer = process.argv.includes("--appliquer");
const iTable = process.argv.indexOf("--table");
const SEULE = iTable >= 0 ? process.argv[iTable + 1] : null;

// Les deux formes d'adresse publique que Supabase produit. `render/image`
// est la version transformee : elle n'existe que sur les plans payants,
// mais une adresse a pu etre collee a la main.
const PREFIXES = [
  `${URL_BASE}/storage/v1/object/public/${BUCKET}/`,
  `${URL_BASE}/storage/v1/render/image/public/${BUCKET}/`,
];

/** Le fichier est-il VRAIMENT chez nous ? Sinon on ne touche pas. */
const present = new Map();
function fichierPresent(chemin) {
  if (present.has(chemin)) return present.get(chemin);
  const ok = existsSync(join(DOSSIER, chemin));
  present.set(chemin, ok);
  return ok;
}

const manquants = new Set();

/**
 * Remplace les adresses Supabase dans UNE chaine.
 *
 * Rend la chaine telle quelle si rien n'est remplacable : c'est ce qui
 * permet de ne PATCHer que les lignes qui changent vraiment.
 */
function reecrireTexte(s) {
  let sortie = s;
  for (const prefixe of PREFIXES) {
    let i = 0;
    while ((i = sortie.indexOf(prefixe, i)) !== -1) {
      const debut = i + prefixe.length;
      // La fin de l'adresse : le premier caractere qui ne peut pas en
      // faire partie. Ces adresses vivent dans du HTML, du JSON et du
      // texte : guillemets, chevrons, espaces et parentheses ferment.
      let fin = debut;
      while (fin < sortie.length && !/[\s"'<>)\\]/.test(sortie[fin])) fin += 1;
      const brut = sortie.slice(debut, fin);
      const chemin = decodeURIComponent(brut.split("?")[0].split("#")[0]);
      if (!chemin || !fichierPresent(chemin)) {
        if (chemin) manquants.add(chemin);
        i = fin;
        continue;
      }
      const neuf = `${BASE_ASSETS}/${chemin.split("/").map(encodeURIComponent).join("/")}`;
      sortie = sortie.slice(0, i) + neuf + sortie.slice(fin);
      i = i + neuf.length;
    }
  }
  return sortie;
}

/** Descend dans les objets et les tableaux (JSONB). */
function reecrireValeur(v) {
  if (typeof v === "string") return reecrireTexte(v);
  if (Array.isArray(v)) return v.map(reecrireValeur);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = reecrireValeur(x);
    return o;
  }
  return v;
}

/** Le schema, demande a la base : colonnes de texte + cle primaire. */
async function lireSchema() {
  const res = await fetch(`${URL_BASE}/rest/v1/`, { headers: entetes });
  if (!res.ok) {
    console.error(`Le schema n'a pas pu etre lu (${res.status}).`);
    process.exit(2);
  }
  const spec = await res.json();
  const tables = [];
  for (const [table, def] of Object.entries(spec?.definitions ?? {})) {
    const props = def?.properties ?? {};
    const colonnes = Object.entries(props)
      .filter(([, p]) => /text|char|json/i.test(String(p?.format ?? "")))
      .map(([nom]) => nom);
    // PostgREST annonce la cle primaire dans la description : "<pk/>".
    const pk = Object.entries(props)
      .filter(([, p]) => String(p?.description ?? "").includes("<pk/>"))
      .map(([nom]) => nom);
    if (colonnes.length > 0) tables.push({ table, colonnes, pk });
  }
  return tables.sort((a, b) => a.table.localeCompare(b.table));
}

const journal = [];
let lignesVues = 0;
let lignesAChanger = 0;
let ecrites = 0;
let echecs = 0;
const sansCle = [];

const tables = (await lireSchema()).filter((t) => !SEULE || t.table === SEULE);
if (SEULE && tables.length === 0) {
  console.error(`Table "${SEULE}" inconnue.`);
  process.exit(1);
}

console.log(
  `\n${appliquer ? "MIGRATION" : "SIMULATION (rien ne sera ecrit)"}\n` +
    `  depuis  ${URL_BASE}/storage/v1/object/public/${BUCKET}/\n` +
    `  vers    ${BASE_ASSETS}/\n` +
    `  dossier ${DOSSIER}\n` +
    `  ${tables.length} tables a parcourir\n`,
);

for (const { table, colonnes, pk } of tables) {
  const aChanger = [];
  for (let offset = 0; ; offset += 1000) {
    const select = [...new Set([...pk, ...colonnes])].join(",");
    const params = new URLSearchParams({ select, limit: "1000", offset: String(offset) });
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?${params}`, { headers: entetes });
    if (!res.ok) {
      console.error(`  ${table} illisible (${res.status}), ignoree.`);
      break;
    }
    const lignes = await res.json();
    if (!Array.isArray(lignes) || lignes.length === 0) break;
    lignesVues += lignes.length;
    for (const l of lignes) {
      const patch = {};
      for (const c of colonnes) {
        const avant = l[c];
        if (avant == null) continue;
        const apres = reecrireValeur(avant);
        if (JSON.stringify(apres) !== JSON.stringify(avant)) {
          patch[c] = apres;
          journal.push({ table, cle: Object.fromEntries(pk.map((k) => [k, l[k]])), colonne: c, avant });
        }
      }
      if (Object.keys(patch).length > 0) aChanger.push({ ligne: l, patch });
    }
    if (lignes.length < 1000) break;
  }

  if (aChanger.length === 0) continue;
  lignesAChanger += aChanger.length;

  if (pk.length === 0) {
    // Sans cle primaire on ne peut designer AUCUNE ligne en particulier :
    // ecrire reviendrait a reecrire toute la table. On le DIT.
    sansCle.push(`${table} (${aChanger.length} lignes concernees)`);
    continue;
  }

  console.log(`  ${table.padEnd(28)} ${String(aChanger.length).padStart(5)} lignes a reecrire`);
  if (!appliquer) continue;

  for (const { ligne, patch } of aChanger) {
    const filtre = pk
      .map((k) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(String(ligne[k]))}`)
      .join("&");
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?${filtre}`, {
      method: "PATCH",
      headers: { ...entetes, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (res.ok) ecrites += 1;
    else {
      echecs += 1;
      console.error(`    ECHEC ${table} ${JSON.stringify(ligne[pk[0]])} : ${res.status} ${(await res.text()).slice(0, 120)}`);
    }
  }
}

// La sauvegarde est ecrite MEME en simulation : c'est elle qui permet de
// relire ce qui allait etre touche avant de se lancer.
if (journal.length > 0) {
  const chemin = join(DOSSIER, "..", `_urls-avant-migration-${appliquer ? "applique" : "simulation"}.json`);
  try {
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, JSON.stringify(journal, null, 2));
    console.log(`\nSauvegarde des valeurs d'origine : ${chemin}`);
  } catch (e) {
    console.error(`\nLa sauvegarde n'a pas pu etre ecrite (${e.message}).`);
    if (appliquer) {
      console.error("On ne devrait PAS ecrire sans filet. Relancer une fois le dossier accessible.");
      process.exit(2);
    }
  }
}

console.log(
  `\n${lignesVues} lignes lues, ${lignesAChanger} lignes a reecrire.` +
    (appliquer ? `\n${ecrites} ecrites, ${echecs} en echec.` : ""),
);

if (manquants.size > 0) {
  console.log(
    `\n${manquants.size} images citees par la base sont ABSENTES de ${DOSSIER} :\n` +
      `leur adresse reste sur Supabase, elles continuent de s'afficher.\n` +
      [...manquants].slice(0, 10).map((c) => `  ${c}`).join("\n") +
      (manquants.size > 10 ? `\n  ... et ${manquants.size - 10} autres` : ""),
  );
}

if (sansCle.length > 0) {
  console.log(
    `\nCes tables portent des adresses mais n'ont pas de cle primaire\n` +
      `lisible, donc RIEN n'y a ete ecrit :\n` +
      sansCle.map((t) => `  ${t}`).join("\n"),
  );
}

if (!appliquer) {
  console.log("\nRien n'a ete ecrit. Relancer avec --appliquer pour le faire.\n");
} else {
  console.log(
    "\nAUCUN FICHIER N'A ETE SUPPRIME chez Supabase : si une adresse nous a\n" +
      "echappe, l'image s'affiche toujours. On coupe la consommation, pas le filet.\n",
  );
}
