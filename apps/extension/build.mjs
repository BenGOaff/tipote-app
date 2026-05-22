// Build script extension Chrome — esbuild + copies manifest et popup.html.
// Pas de framework de build dédié (CRX plugin, etc.) : 3 entrées
// indépendantes, copie de quelques fichiers statiques, c'est tout.
//
// Usage : `node build.mjs` (one-shot) ou `node build.mjs --watch` (dev).
// Output : ./dist/ → loadable comme "unpacked extension" dans Chrome
// (chrome://extensions → developer mode → Load unpacked → sélectionner dist).

import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(ROOT, "dist");
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
    // MV3 service worker = ESM, supporté nativement par Chrome 91+.
    format: "esm",
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
];

async function copyStatic() {
  // Manifest : on lit, on injecte localhost en mode --local pour permettre
  // le messaging frontend dev → extension, puis on écrit dans dist.
  // L'asset commit dans le repo reste "clean prod" (= ce qui passe en
  // review CWS), localhost n'apparaît jamais dans une release.
  const manifestSrc = JSON.parse(await readFile(resolve(ROOT, "manifest.json"), "utf-8"));
  if (LOCAL) {
    manifestSrc.host_permissions = [
      ...manifestSrc.host_permissions,
      "http://localhost/*",
      "http://localhost:3000/*",
    ];
    manifestSrc.externally_connectable = manifestSrc.externally_connectable ?? { matches: [] };
    manifestSrc.externally_connectable.matches = [
      ...manifestSrc.externally_connectable.matches,
      "http://localhost:3000/*",
    ];
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
  console.log(`[build] ${new Date().toLocaleTimeString()} — dist/ ready (api=${TIPOTE_API_BASE})`);
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

