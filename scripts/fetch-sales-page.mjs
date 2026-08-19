// scripts/fetch-sales-page.mjs
//
// RAPATRIE UNE PAGE DE VENTE ET TOUT CE DONT ELLE A BESOIN.
//
//   node scripts/fetch-sales-page.mjs <url> <slug>
//
// Complément de `extract-sales-page.mjs`, qui part d'un export SingleFile
// fait à la main. Ici on part de l'URL en ligne : plus rien à exporter,
// et la page peut être rafraîchie d'une commande quand Béné la retouche
// dans l'éditeur de Systeme.io.
//
// -- CE QU'IL RAPATRIE -------------------------------------------------
//
// Les feuilles de style, les scripts, les polices et les images, y
// compris celles référencées DANS le CSS (`url(...)`), qui sont le piège
// classique : on croit avoir tout pris, et les polices manquent.
//
// Tout atterrit sous `public/v/<slug>/`, servi par notre domaine. La
// page ne dépend donc plus d'aucun CDN tiers : le jour où Systeme.io
// change une adresse ou coupe un compte, rien ne bouge chez nous.
//
// -- CE QU'IL NE RAPATRIE PAS, ET C'EST VOULU --------------------------
//
// Les mouchards tiers (Google Tag Manager, Facebook). Ils n'ont rien à
// faire sur notre domaine, ils ralentissent la page, et le suivi
// deviendra le nôtre.
//
// -- CE QU'IL GARDE INTACT ---------------------------------------------
//
// `quiz.tipote.com/embed/bridge.js` : c'est le script d'intégration des
// quiz de Béné, sur son propre domaine. Le rapatrier le figerait à sa
// version du jour, alors qu'il doit suivre l'app.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [, , url, slug] = process.argv;
if (!url || !slug) {
  console.error("usage: node scripts/fetch-sales-page.mjs <url> <slug>");
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`slug invalide : ${slug}`);
  process.exit(1);
}

/** Hôtes dont les scripts sont retirés au lieu d'être rapatriés. */
const MOUCHARDS = ["googletagmanager.com", "google-analytics.com", "connect.facebook.net", "doubleclick.net"];

/** Hôtes laissés en ligne : ce sont les nôtres et ils doivent suivre l'app. */
const LAISSER_EN_LIGNE = ["quiz.tipote.com", "app.tipote.com", "fonts.googleapis.com", "fonts.gstatic.com"];

const EXT_PAR_TYPE = {
  "text/css": "css",
  "application/javascript": "js",
  "text/javascript": "js",
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
const dossier = path.join(racine, "public", "v", slug);
fs.mkdirSync(dossier, { recursive: true });
fs.mkdirSync(path.join(racine, "content", "sales"), { recursive: true });

const rapatriees = new Map(); // url absolue -> chemin local
let echecs = 0;

function extensionDe(u, contentType) {
  const parExt = u.split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i);
  if (parExt) return parExt[1].toLowerCase();
  const type = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  return EXT_PAR_TYPE[type] ?? "bin";
}

/** Télécharge une ressource et rend son chemin local, ou null si échec. */
async function rapatrier(absolue) {
  if (rapatriees.has(absolue)) return rapatriees.get(absolue);

  const hote = (() => {
    try {
      return new URL(absolue).hostname;
    } catch {
      return "";
    }
  })();
  if (!hote) return null;
  if (LAISSER_EN_LIGNE.some((h) => hote === h || hote.endsWith(`.${h}`))) return null;
  if (MOUCHARDS.some((h) => hote.endsWith(h))) return null;

  try {
    const r = await fetch(absolue, { redirect: "follow", signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const octets = Buffer.from(await r.arrayBuffer());
    const ext = extensionDe(absolue, r.headers.get("content-type"));
    const nom = `${crypto.createHash("sha1").update(absolue).digest("hex").slice(0, 12)}.${ext}`;
    fs.writeFileSync(path.join(dossier, nom), octets);
    const local = `/v/${slug}/${nom}`;
    rapatriees.set(absolue, local);

    // Une feuille de style référence ses propres polices et images :
    // c'est LE piège. On la traite récursivement, en résolvant chaque
    // `url(...)` par rapport à l'adresse de la feuille elle-meme.
    if (ext === "css") {
      let css = octets.toString("utf8");
      const refs = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
      for (const ref of refs) {
        if (ref.startsWith("data:")) continue;
        let cible;
        try {
          cible = new URL(ref, absolue).toString();
        } catch {
          continue;
        }
        const localRef = await rapatrier(cible);
        if (localRef) css = css.split(ref).join(localRef);
      }
      fs.writeFileSync(path.join(dossier, nom), css, "utf8");
    }

    return local;
  } catch (e) {
    echecs++;
    console.warn(`  echec ${absolue} : ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

console.log(`page   : ${url}`);
const reponse = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60000) });
if (!reponse.ok) {
  console.error(`la page repond ${reponse.status}`);
  process.exit(1);
}
let html = await reponse.text();
const depart = html.length;

// -- 1. Les mouchards partent avant tout le reste ------------------------
let mouchards = 0;
for (const hote of MOUCHARDS) {
  const motif = new RegExp(
    `<script[^>]*${hote.replace(/\./g, "\\.")}[^>]*>[\\s\\S]*?<\\/script>|<script[^>]*>[^<]*${hote.replace(/\./g, "\\.")}[\\s\\S]*?<\\/script>`,
    "gi",
  );
  html = html.replace(motif, () => {
    mouchards++;
    return "";
  });
}
html = html.replace(/<noscript>\s*<iframe[^>]*googletagmanager[\s\S]*?<\/noscript>/gi, "");

// -- 2. Chaque adresse absolue trouvée dans le HTML ----------------------
const adresses = [...new Set(html.match(/https?:\/\/[^"'\s)<>\\]+/g) ?? [])]
  .filter((a) => /\.(css|js|mjs|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|ico)(\?|#|$)/i.test(a));

console.log(`assets : ${adresses.length} adresses a rapatrier`);
for (const a of adresses) {
  const local = await rapatrier(a);
  if (local) html = html.split(a).join(local);
}

// -- 3. Les chemins RELATIFS À LA RACINE du domaine d'origine ------------
//
// Systeme.io sert les images de Béné en `/473100/xxx.png`. Servis depuis
// notre domaine, ces chemins pointeraient dans le vide.
const origine = new URL(url).origin;
const relatifs = [...new Set(html.match(/["'(](\/[0-9]{4,}\/[^"')\s]+\.(?:png|jpe?g|webp|gif|svg|ico))/gi) ?? [])].map(
  (m) => m.slice(1),
);
console.log(`assets : ${relatifs.length} chemins relatifs a rapatrier`);
for (const r of relatifs) {
  const local = await rapatrier(`${origine}${r}`);
  if (local) html = html.split(r).join(local);
}

fs.writeFileSync(path.join(racine, "content", "sales", `${slug}.html`), html, "utf8");
fs.writeFileSync(
  path.join(racine, "content", "sales", `${slug}.meta.json`),
  JSON.stringify(
    {
      slug,
      source: url,
      rapatrieLe: new Date().toISOString().slice(0, 10),
      ressources: rapatriees.size,
      echecs,
      htmlAvant: depart,
      htmlApres: html.length,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

const restantes = [...new Set(html.match(/https?:\/\/[^"'\s)<>\\]+\.(?:css|js|woff2?|ttf|png|jpe?g|webp|svg)/gi) ?? [])];
console.log(`page      : content/sales/${slug}.html (${(html.length / 1024).toFixed(0)} Ko)`);
console.log(`rapatrie  : ${rapatriees.size} fichiers -> public/v/${slug}/`);
console.log(`mouchards : ${mouchards} retire(s)`);
console.log(`echecs    : ${echecs}`);
if (restantes.length) {
  console.log(`RESTE EN LIGNE (${restantes.length}) :`);
  for (const r of restantes.slice(0, 15)) console.log(`  ${r}`);
}
