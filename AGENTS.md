# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Workflow Git — RÈGLE ABSOLUE

**Avant TOUT push, lire `CLAUDE_WORKFLOW.md`.**

Résumé : je ne pousse JAMAIS sur `main`. Je pousse uniquement sur la
branche `claude/setup-dev-guidelines-CmXl0`. Béné est seule maître de
`main` côté GitHub.

## Claude personal notes — pitfalls + conventions

**Avant de coder, lire `CLAUDE_PITFALLS.md` (pense-bête perso).**
Bugs récurrents identifiés + conventions implicites à respecter pour
ne pas casser l'existant. Ce fichier doit être mis à jour quand un
bug remonte plusieurs fois.

Checklist minimum :
- Migration SQL → `IF NOT EXISTS` + `NOTIFY pgrst, 'reload schema';` en fin.
- Nouvelle colonne sur `quizzes` → 7 endroits à toucher (cf. section A du pitfalls).
- Storage upload → bucket `public-assets`, path `<topic>/<auth.uid()>/<file>`.
- Image visiteur → `w-full h-auto`, jamais `max-h-* object-cover`.
- `RichTextEdit` Dialogs → rendre dans LES DEUX branches (editing + display).
- i18n namespace → **Tipote `quizDetail`** (différent de Tiquiz qui utilise `quizEditor`). Vérifier le `useTranslations(…)` du composant.
- `extractResultLabel(cleanPlaceholdersForLabel(text))` pour les labels admin.
- Compteurs `quizzes.*_count` auto-bumpés par trigger → ne JAMAIS UPDATE direct.
- Endpoints `/track` retournent 200 toujours (`{ok: false, reason}` pour soft fail).
- CSS classes rich-text : **Tipote `tipote-quiz-rich`** (différent de Tiquiz `tiquiz-rich`).
- Typecheck `npx tsc --noEmit` avant chaque commit, exit 0 obligatoire.
