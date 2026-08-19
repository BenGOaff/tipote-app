// scripts/optimize-sales-assets.mjs
//
// ALLÈGE LES IMAGES D'UNE PAGE DE VENTE, SANS TOUCHER À SON ALLURE.
//
//   node scripts/optimize-sales-assets.mjs <slug> [--dry]
//
// -- CE QU'ON A TROUVÉ SUR LA PAGE TIQUIZ ------------------------------
//
// 26 Mo d'images, dont CINQ fichiers `.svg` de 2,8 Mo chacun. Ouverts,
// ils ne contiennent AUCUN tracé vectoriel : juste des PNG emballés dans
// une enveloppe SVG, en base64. C'est le pire des deux mondes, aucun
// bénéfice vectoriel, aucune compression, et l'encodage base64 rajoute
// un tiers par dessus.
//
// Google mesure la vitesse d'affichage : sur une page de vente, c'est le
// poste numéro un, très loin devant le reste.
//
// -- LA RÈGLE : ON NE CHANGE JAMAIS LA MISE EN PAGE --------------------
//
// Les SVG gardent leur structure, leurs dimensions et leur composition.
// On ne recompresse que les IMAGES QU'ILS CONTIENNENT, en place. Le
// navigateur affiche exactement la même chose, au même endroit, à la
// même taille.
//
// -- ET ON NE REMPLACE QUE SI ON GAGNE ---------------------------------
//
// Chaque conversion est comparée à l'original, et gardée seulement si
// elle est plus légère d'au moins 10%. Une image déjà bien compressée
// reste telle quelle : recompresser pour gagner 2% ne fait que dégrader.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [, , slug, ...options] = process.argv;
const simulation = options.includes("--dry");
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error("usage: node scripts/optimize-sales-assets.mjs <slug> [--dry]");
  process.exit(1);
}

const racine = process.cwd();
const dossier = path.join(racine, "public", "v", slug);
const pageHtml = path.join(racine, "content", "sales", `${slug}.html`);
if (!fs.existsSync(dossier)) {
  console.error(`dossier absent : public/v/${slug}`);
  process.exit(1);
}

/** Qualité WebP : 82 est le seuil au delà duquel l'oeil ne suit plus. */
const QUALITE = 82;
/** En dessous de ce gain, on garde l'original. */
const GAIN_MINIMUM = 0.1;

const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;
let avantTotal = 0;
let apresTotal = 0;
const renommages = new Map(); // ancien nom -> nouveau nom

/** Recompresse un buffer image en WebP, ou null si le gain est trop faible. */
async function versWebp(buffer) {
  try {
    const sortie = await sharp(buffer).webp({ quality: QUALITE, effort: 5 }).toBuffer();
    if (sortie.length >= buffer.length * (1 - GAIN_MINIMUM)) return null;
    return sortie;
  } catch {
    return null;
  }
}

// -- 1. Les images embarquées DANS les SVG -------------------------------

for (const nom of fs.readdirSync(dossier).filter((f) => f.endsWith(".svg"))) {
  const chemin = path.join(dossier, nom);
  let svg = fs.readFileSync(chemin, "utf8");
  const avant = Buffer.byteLength(svg);
  avantTotal += avant;

  const embarquees = [...svg.matchAll(/data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)/g)];
  if (embarquees.length === 0) {
    apresTotal += avant;
    continue;
  }

  let converties = 0;
  for (const [entier, , base64] of embarquees) {
    const brut = Buffer.from(base64, "base64");
    const webp = await versWebp(brut);
    if (!webp) continue;
    svg = svg.split(entier).join(`data:image/webp;base64,${webp.toString("base64")}`);
    converties++;
  }

  const apres = Buffer.byteLength(svg);
  apresTotal += apres;
  if (converties && !simulation) fs.writeFileSync(chemin, svg, "utf8");
  console.log(
    `${nom.padEnd(20)} ${ko(avant).padStart(9)} -> ${ko(apres).padStart(9)}  (${converties}/${embarquees.length} images converties)`,
  );
}

// -- 2. Les images posées en fichiers ------------------------------------

const IMAGES = /\.(png|jpe?g)$/i;
for (const nom of fs.readdirSync(dossier).filter((f) => IMAGES.test(f))) {
  const chemin = path.join(dossier, nom);
  const brut = fs.readFileSync(chemin);
  avantTotal += brut.length;

  const webp = await versWebp(brut);
  if (!webp) {
    apresTotal += brut.length;
    console.log(`${nom.padEnd(20)} ${ko(brut.length).padStart(9)} -> inchange (deja compact)`);
    continue;
  }

  const nouveau = nom.replace(IMAGES, ".webp");
  apresTotal += webp.length;
  renommages.set(nom, nouveau);
  if (!simulation) {
    fs.writeFileSync(path.join(dossier, nouveau), webp);
    fs.unlinkSync(chemin);
  }
  console.log(`${nom.padEnd(20)} ${ko(brut.length).padStart(9)} -> ${ko(webp.length).padStart(9)}  ${nouveau}`);
}

// -- 3. Les références suivent, dans le HTML ET dans les CSS -------------
//
// Oublier les CSS est le piège : une image de fond y vit en `url(...)`,
// et la page perdrait son décor sans qu'aucune balise ne le signale.

if (renommages.size && !simulation) {
  const aReecrire = [pageHtml, ...fs.readdirSync(dossier).filter((f) => f.endsWith(".css")).map((f) => path.join(dossier, f))];
  let touches = 0;
  for (const fichier of aReecrire) {
    if (!fs.existsSync(fichier)) continue;
    let contenu = fs.readFileSync(fichier, "utf8");
    const avant = contenu;
    for (const [ancien, nouveau] of renommages) contenu = contenu.split(ancien).join(nouveau);
    if (contenu !== avant) {
      fs.writeFileSync(fichier, contenu, "utf8");
      touches++;
    }
  }
  console.log(`\nreferences mises a jour dans ${touches} fichier(s)`);
}

const gain = avantTotal ? (1 - apresTotal / avantTotal) * 100 : 0;
console.log(
  `\nTOTAL ${simulation ? "(simulation) " : ""}: ${(avantTotal / 1024 / 1024).toFixed(2)} Mo -> ${(apresTotal / 1024 / 1024).toFixed(2)} Mo  (-${gain.toFixed(0)}%)`,
);

// Garde-fou : une image orpheline serait invisible et introuvable.
if (!simulation && renommages.size) {
  const html = fs.existsSync(pageHtml) ? fs.readFileSync(pageHtml, "utf8") : "";
  const restants = [...renommages.keys()].filter((a) => html.includes(a));
  if (restants.length) {
    console.warn(`\nATTENTION : ${restants.length} ancienne(s) reference(s) encore dans le HTML :`);
    for (const r of restants.slice(0, 5)) console.warn(`  ${r}`);
  }
}
