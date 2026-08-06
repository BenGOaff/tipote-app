// tests/logic/alias-hooks.mjs
//
// Résolution de l'alias `@/` pour le runner de tests natif.
//
// POURQUOI. `npm run test:logic` est volontairement du `node --test` sans
// bundler : ~1 seconde, zéro dépendance, donc personne n'a d'excuse pour
// le sauter avant un push. Le revers est que Node ne connaît pas l'alias
// `@/` du tsconfig, alors que tout le code applicatif s'en sert.
//
// Tant que les règles métier vivaient dans des modules `lib/` sans import
// croisé, ça ne se voyait pas. Mais un prompt EST du code, et
// `lib/prompts/quiz/system.ts` importe `@/lib/quizLanguages` : sans ce
// hook, il est intestable. Or c'est justement le fichier où trois
// incohérences ont vécu sans que personne les voie (3 août 2026).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Ordre d'essai identique à celui de TypeScript / Next.
const CANDIDATES = ["", ".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx"];

function premierFichier(base) {
  for (const ext of CANDIDATES) {
    const candidat = base + ext;
    if (fs.existsSync(candidat) && fs.statSync(candidat).isFile()) return candidat;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const trouve = premierFichier(path.join(ROOT, specifier.slice(2)));
    if (trouve) return next(pathToFileURL(trouve).href, context);
    // Rien trouvé : on laisse Node échouer avec SON message, qui nomme le
    // fichier importateur. Un message maison ferait perdre cette info.
  }

  // ET LES IMPORTS RELATIFS SANS EXTENSION (`./offers`), que TypeScript
  // accepte et que Node refuse. Sans ça, un module de `lib/` qui en
  // importe un autre de la même famille reste hors de portée du runner,
  // donc non testé, donc exactement là où les bugs s'installent : c'est
  // le cas qui a bloqué `lib/support/knowledgeBase.ts` le 6 août 2026,
  // c'est à dire tout ce que le bot d'aide sait des deux apps.
  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    const trouve = premierFichier(base);
    if (trouve) return next(pathToFileURL(trouve).href, context);
  }

  return next(specifier, context);
}
