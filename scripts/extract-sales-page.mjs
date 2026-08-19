// scripts/extract-sales-page.mjs
//
// PRÉPARE UNE PAGE DE VENTE CAPTURÉE POUR ÊTRE SERVIE PAR NOTRE SERVEUR.
//
//   node scripts/extract-sales-page.mjs <fichier-singlefile.html> <slug>
//
// SingleFile produit une page entièrement autonome, ce qui est parfait
// pour la fidélité mais désastreux pour le poids : sur la page de
// l'Atelier, 7 Mo sur 8 sont des POLICES encodées en base64, à
// retélécharger à chaque visite, sans jamais être mises en cache
// séparément.
//
// Ce script sort chaque ressource dans un vrai fichier sous
// `public/v/<slug>/` et remplace le `data:` par son chemin. La page
// tombe autour du mégaoctet, les polices et les images deviennent
// cachables, et le référencement y gagne : Google mesure la vitesse de
// rendu, et une page qui embarque 7 Mo avant d'afficher son premier mot
// est pénalisée.
//
// Ce que le script RETIRE aussi, et c'est volontaire :
//   - les mouchards de Systeme.io et Google Tag Manager, qui n'ont
//     rien à faire sur notre domaine et qu'on remplacera par le nôtre ;
//   - la balise `noindex` que Systeme.io pose sur les pages de test.
//
// Ce qu'il ne touche JAMAIS : le HTML de la page et ses 47 blocs de
// style. C'est ce qui garantit le rendu identique, et c'est le contenu
// de Béné.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [, , source, slug] = process.argv;
if (!source || !slug) {
  console.error("usage: node scripts/extract-sales-page.mjs <fichier.html> <slug>");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`slug invalide : ${slug} (a-z, 0-9 et tirets)`);
  process.exit(1);
}

const EXTENSIONS = {
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const racine = process.cwd();
const dossierAssets = path.join(racine, "public", "v", slug);
fs.mkdirSync(dossierAssets, { recursive: true });
fs.mkdirSync(path.join(racine, "content", "sales"), { recursive: true });

let html = fs.readFileSync(source, "utf8");
const depart = html.length;

// -- 1. Les ressources inlinées sortent dans des fichiers ----------------

let sorties = 0;
let octetsSortis = 0;
const dejaVu = new Map();

html = html.replace(
  /data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)/g,
  (entier, type, base64) => {
    const ext = EXTENSIONS[type];
    // Un type qu'on ne sait pas nommer reste inline : mieux vaut une
    // page lourde qu'une page à laquelle il manque un morceau.
    if (!ext) return entier;

    const empreinte = crypto.createHash("sha1").update(base64).digest("hex").slice(0, 12);
    if (dejaVu.has(empreinte)) return dejaVu.get(empreinte);

    const nom = `${empreinte}.${ext}`;
    const octets = Buffer.from(base64, "base64");
    fs.writeFileSync(path.join(dossierAssets, nom), octets);

    const chemin = `/v/${slug}/${nom}`;
    dejaVu.set(empreinte, chemin);
    sorties++;
    octetsSortis += octets.length;
    return chemin;
  },
);

// -- 2. Les mouchards qui ne sont pas les nôtres -------------------------

const MOUCHARDS = [
  /<script[^>]*googletagmanager[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*google-analytics[^>]*>[\s\S]*?<\/script>/gi,
  /<script[^>]*facebook\.net[^>]*>[\s\S]*?<\/script>/gi,
  /<noscript>\s*<iframe[^>]*googletagmanager[\s\S]*?<\/noscript>/gi,
];
let mouchards = 0;
for (const motif of MOUCHARDS) {
  html = html.replace(motif, () => {
    mouchards++;
    return "";
  });
}

// -- 3. Le `noindex` de la page de test ----------------------------------
//
// Systeme.io le pose sur les variantes ; sur notre domaine la page doit
// être indexable, c'est même une des raisons de la rapatrier.
const avantNoindex = html;
html = html.replace(/<meta[^>]*name=["']?robots["']?[^>]*noindex[^>]*>/gi, "");
const noindexRetire = html !== avantNoindex;

// -- 4. Le commentaire SingleFile, qui n'a plus de sens ici --------------
html = html.replace(/<!--\s*Page saved with SingleFile[\s\S]*?-->/gi, "");

fs.writeFileSync(path.join(racine, "content", "sales", `${slug}.html`), html, "utf8");

const meta = {
  slug,
  source: path.basename(source),
  extraitLe: new Date().toISOString().slice(0, 10),
  ressources: sorties,
  octetsSortis,
  htmlAvant: depart,
  htmlApres: html.length,
};
fs.writeFileSync(
  path.join(racine, "content", "sales", `${slug}.meta.json`),
  JSON.stringify(meta, null, 2) + "\n",
  "utf8",
);

console.log(`page      : content/sales/${slug}.html`);
console.log(`avant     : ${(depart / 1024 / 1024).toFixed(2)} Mo`);
console.log(`apres     : ${(html.length / 1024 / 1024).toFixed(2)} Mo`);
console.log(`ressources: ${sorties} fichiers, ${(octetsSortis / 1024 / 1024).toFixed(2)} Mo -> public/v/${slug}/`);
console.log(`mouchards : ${mouchards} retire(s)`);
console.log(`noindex   : ${noindexRetire ? "retire" : "absent"}`);
