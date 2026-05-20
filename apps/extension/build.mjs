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

// Cible — modules ES2022, supports MV3 service worker + content script.
const COMMON = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  sourcemap: WATCH ? "inline" : false,
  minify: !WATCH,
  loader: { ".png": "file", ".svg": "file" },
  define: { "process.env.NODE_ENV": JSON.stringify(WATCH ? "development" : "production") },
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
    name: "popup",
    entryPoints: [resolve(ROOT, "src/popup/main.tsx")],
    outfile: resolve(DIST, "popup.js"),
    format: "iife",
    jsx: "automatic",
    jsxImportSource: "preact",
  },
];

async function copyStatic() {
  await cp(resolve(ROOT, "manifest.json"), resolve(DIST, "manifest.json"));
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
  console.log(`[build] ${new Date().toLocaleTimeString()} — dist/ ready`);
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
  console.log(`[watch] dist/ ready — press Ctrl+C to stop`);
  // Empêche le process de mourir.
  await new Promise(() => {});
} else {
  await rebuildAll();
}

// Note : `readFile` est importé mais pas utilisé directement — on le
// garde pour les futures étapes (copie/transformation conditionnelle
// du manifest, ex : remplacer la version par celle du package.json).
void readFile;
