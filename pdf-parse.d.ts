// Adeline (1er juin 2026) : `pdf-parse` n'a pas de typings officiels
// (@types/pdf-parse n'est pas publié pour la version qu'on utilise).
// Le `next build` strict-TS plante avec "Could not find a declaration
// file for module 'pdf-parse'", même si `npx tsc --noEmit` passe.
//
// Cette ambient declaration suffit : on caste de toute façon vers la
// signature concrète `(b: Buffer) => Promise<{ text: string }>` dans
// `lib/quizImportExtract.ts` et `app/api/quiz/import/route.ts`.

declare module "pdf-parse";
