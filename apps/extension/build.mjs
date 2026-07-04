// Build script extension Chrome + Firefox — esbuild + copies manifest et
// popup.html. Pas de framework de build dédié (CRX plugin, etc.) : quelques
// entrées indépendantes, copie de fichiers statiques, c'est tout.
//
// Usage : `node build.mjs` (one-shot Chrome) ou `node build.mjs --watch` (dev).
// `--firefox` (ou TIPOTE_TARGET=firefox) bascule sur la cible Firefox :
// output ./dist-firefox/ avec un manifest adapté (event page au lieu du
// service worker, bridge content script au lieu d'externally_connectable,
// browser_specific_settings.gecko). Le code source est LE MÊME — seules
// les différences imposées par Firefox sont gérées ici et par des gates
// runtime (cf. background.ts onMessageExternal).
//
// Chrome : chrome://extensions → developer mode → Load unpacked → dist/
// Firefox : about:debugging → This Firefox → Load Temporary Add-on →
//           sélectionner dist-firefox/manifest.json

import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const FIREFOX = process.argv.includes("--firefox") || process.env.TIPOTE_TARGET === "firefox";
const DIST = resolve(ROOT, FIREFOX ? "dist-firefox" : "dist");
const WATCH = process.argv.includes("--watch");
// L'environnement (= API URL) est INDÉPENDANT du mode watch. Par
// défaut on cible la prod (app.tipote.com) pour que l'extension chargée
// en "unpacked" sur Chrome marche directement contre le vrai backend.
// `--local` (ou TIPOTE_ENV=local) bascule sur http://localhost:3000
// pour ceux qui font tourner aussi Next.js en local.
const LOCAL = process.argv.includes("--local") || process.env.TIPOTE_ENV === "local";
const NODE_ENV = WATCH ? "development" : "production";
const TIPOTE_API_BASE = LOCAL ? "http://localhost:3000" : "https://app.tipote.com";

// Cible — modules ES2022, supports MV3 service worker + content script.
const COMMON = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  sourcemap: WATCH ? "inline" : false,
  minify: !WATCH,
  loader: { ".png": "file", ".svg": "file" },
  define: {
    "process.env.NODE_ENV": JSON.stringify(NODE_ENV),
    "process.env.TIPOTE_API_BASE": JSON.stringify(TIPOTE_API_BASE),
  },
};

const ENTRIES = [
  {
    name: "background",
    entryPoints: [resolve(ROOT, "src/background.ts")],
    outfile: resolve(DIST, "background.js"),
    // Chrome : MV3 service worker = ESM, supporté nativement par Chrome 91+.
    // Firefox : pas de service worker MV3 — event page classique déclarée
    // via background.scripts. IIFE pour ne dépendre d'aucun module loader.
    format: FIREFOX ? "iife" : "esm",
  },
  {
    name: "content",
    entryPoints: [resolve(ROOT, "src/content.ts")],
    outfile: resolve(DIST, "content.js"),
    // Content script doit être IIFE : pas d'import statique au runtime
    // possible (Chrome ne fournit pas le module loader dans le contexte
    // isolé du content script).
    format: "iife",
  },
  {
    name: "injected",
    entryPoints: [resolve(ROOT, "src/injected.ts")],
    outfile: resolve(DIST, "injected.js"),
    // S'exécute dans le MAIN world de LinkedIn (pas l'isolated world du
    // content script). Doit être IIFE, ne peut PAS utiliser chrome.*
    // (le world page n'y a pas accès). Communique avec le content via
    // window.postMessage.
    format: "iife",
  },
  {
    name: "popup",
    entryPoints: [resolve(ROOT, "src/popup/main.tsx")],
    outfile: resolve(DIST, "popup.js"),
    format: "iife",
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  // Firefox only : externally_connectable n'existe pas → un content script
  // "bridge" sur app.tipote.com relaie ping/sync via window.postMessage.
  ...(FIREFOX
    ? [
        {
          name: "bridge",
          entryPoints: [resolve(ROOT, "src/bridge.ts")],
          outfile: resolve(DIST, "bridge.js"),
          format: "iife",
        },
      ]
    : []),
];

/** Hosts sur lesquels le bridge Firefox est injecté. Doit rester un
 *  sous-ensemble des host_permissions du manifest (sinon Firefox refuse
 *  d'injecter le content script). */
const BRIDGE_MATCHES = ["https://app.tipote.com/*", "https://tipote.com/*"];

/** Transforme le manifest Chrome (source de vérité committée) en manifest
 *  Firefox. Différences imposées par Firefox MV3 :
 *  - background.service_worker non supporté → event page background.scripts
 *  - externally_connectable non supporté → supprimé, remplacé par le
 *    content script bridge.js sur les hosts Tipote
 *  - browser_specific_settings.gecko obligatoire pour la soumission AMO
 *    (id stable + version minimale + déclaration data collection, requise
 *    par AMO pour toute nouvelle extension depuis novembre 2025)
 *  Le reste (permissions, host_permissions, content_scripts réseaux,
 *  web_accessible_resources, CSP) est identique. Note : sur Firefox MV3
 *  les host_permissions sont OPT-IN côté user — le popup affiche un
 *  onboarding "Autoriser l'accès" tant qu'elles ne sont pas accordées. */
function toFirefoxManifest(manifest) {
  const fx = structuredClone(manifest);
  fx.background = { scripts: ["background.js"] };
  delete fx.externally_connectable;
  fx.content_scripts = [
    ...fx.content_scripts,
    {
      matches: BRIDGE_MATCHES,
      js: ["bridge.js"],
      // document_start : le bridge doit être à l'écoute avant que le
      // React de la page /boost monte et envoie son ping de détection.
      run_at: "document_start",
    },
  ];
  fx.browser_specific_settings = {
    gecko: {
      id: "boost@tipote.com",
      // 140 = ESR courante (juin 2025). Donne : promesses sur chrome.*,
      // event pages MV3 stables, UI data_collection_permissions.
      strict_min_version: "140.0",
      data_collection_permissions: {
        // L'extension envoie au backend Tipote : identité LinkedIn du
        // membre (nom, headline, URN) + activité de boost (posts likés /
        // commentés). Déclaration exigée par AMO.
        required: ["personallyIdentifyingInfo", "websiteActivity"],
      },
    },
  };
  return fx;
}

async function copyStatic() {
  // Manifest : on lit, on injecte localhost en mode --local pour permettre
  // le messaging frontend dev → extension, puis on écrit dans dist.
  // L'asset commit dans le repo reste "clean prod" (= ce qui passe en
  // review CWS), localhost n'apparaît jamais dans une release.
  let manifestSrc = JSON.parse(await readFile(resolve(ROOT, "manifest.json"), "utf-8"));
  if (FIREFOX) {
    manifestSrc = toFirefoxManifest(manifestSrc);
  }
  if (LOCAL) {
    manifestSrc.host_permissions = [
      ...manifestSrc.host_permissions,
      "http://localhost/*",
      "http://localhost:3000/*",
    ];
    if (FIREFOX) {
      // Pas d'externally_connectable sur Firefox : c'est le bridge qui
      // doit tourner sur le frontend dev.
      const bridgeEntry = manifestSrc.content_scripts.find((cs) => cs.js?.includes("bridge.js"));
      bridgeEntry.matches = [...bridgeEntry.matches, "http://localhost:3000/*"];
    } else {
      manifestSrc.externally_connectable = manifestSrc.externally_connectable ?? { matches: [] };
      manifestSrc.externally_connectable.matches = [
        ...manifestSrc.externally_connectable.matches,
        "http://localhost:3000/*",
      ];
    }
  }
  await writeFile(resolve(DIST, "manifest.json"), JSON.stringify(manifestSrc, null, 2));

  await cp(resolve(ROOT, "src/popup/popup.html"), resolve(DIST, "popup.html"));
  if (existsSync(resolve(ROOT, "public/icons"))) {
    await cp(resolve(ROOT, "public/icons"), resolve(DIST, "icons"), { recursive: true });
  }
}

async function rebuildAll() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  for (const e of ENTRIES) {
    const { name: _name, ...opts } = e;
    await build({ ...COMMON, ...opts });
  }
  await copyStatic();
  // Stamp file pour aider les rechargements manuels.
  await writeFile(resolve(DIST, ".build-stamp"), new Date().toISOString());
  console.log(`[build] ${new Date().toLocaleTimeString()} — ${FIREFOX ? "dist-firefox" : "dist"}/ ready (api=${TIPOTE_API_BASE})`);
}

if (WATCH) {
  // Mode watch : on lance N contexts esbuild en parallèle + un watcher
  // qui re-copie les statics à chaque rebuild.
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await copyStatic();
  for (const e of ENTRIES) {
    const { name, ...opts } = e;
    const ctx = await context({ ...COMMON, ...opts });
    await ctx.watch();
    console.log(`[watch] ${name}`);
  }
  // Re-copy statics quand manifest ou popup.html change.
  const { watch } = await import("node:fs");
  for (const file of ["manifest.json", "src/popup/popup.html"]) {
    watch(resolve(ROOT, file), async () => {
      await copyStatic();
      console.log(`[watch] static ${file} re-copied`);
    });
  }
  console.log(`[watch] dist/ ready (api=${TIPOTE_API_BASE}) — press Ctrl+C to stop`);
  // Empêche le process de mourir.
  await new Promise(() => {});
} else {
  await rebuildAll();
}

