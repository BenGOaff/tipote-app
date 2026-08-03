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

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = path.join(ROOT, specifier.slice(2));
    for (const ext of CANDIDATES) {
      const candidate = base + ext;
      if (ext !== "" || fs.existsSync(candidate)) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return next(pathToFileURL(candidate).href, context);
        }
      }
    }
    // Rien trouvé : on laisse Node échouer avec SON message, qui nomme le
    // fichier importateur. Un message maison ferait perdre cette info.
  }
  return next(specifier, context);
}
