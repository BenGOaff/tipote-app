# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Workflow Git — RÈGLE ABSOLUE

**Avant TOUT push, lire `CLAUDE_WORKFLOW.md`.**

Résumé : je ne pousse JAMAIS sur `main`. Je pousse uniquement sur la
branche `claude/busy-wright-501xR`. Béné est seule maître de
`main` côté GitHub.

## URLs canoniques prod — À NE PAS INVENTER (drame 3 juin 2026)

J'ai pondu `https://www.tipote.fr/tiquiz/api/cron/...` dans un curl alors
que c'était faux. À mémoriser une fois pour toutes :

| Domaine | Sert | Exemples |
|---|---|---|
| `https://app.tipote.com/` | App Tipote (dashboard authentifié) | `/admin`, `/api/cron/...` |
| `https://www.tipote.fr/` | Sales pages Tipote (Systeme.io) | `/commande`, `/elite` |
| `https://quiz.tipote.com/` | App Tiquiz (dashboard authentifié) | `/admin`, `/api/cron/...` |
| `https://www.tipote.fr/tiquiz` | Sales hub Tiquiz (Systeme.io) | — |
| `https://www.tipote.fr/tiquiz-mensuel` etc. | Pages plan Tiquiz spécifiques | `-gratuit`, `-mensuel`, `-mensuel-plus`, `-annuel`, `-annuel-plus` |
| `https://affiliate.tipote.com/` | Dashboard affilié (sous-domaine Tipote) | `/trial-tiquiz`, `/promouvoir` |

**Erreurs typiques à éviter** :
- ❌ `tipote.fr/tiquiz/api/...` (n'existe pas — Tiquiz est sur `quiz.tipote.com`)
- ❌ `tipote.fr/tiquiz/dashboard` (idem)
- ❌ `tipote.fr/tiquiz/commande` (la page d'accueil de vente est `tipote.fr/tiquiz` tout court)

## Migrations SQL — ALERTE OBLIGATOIRE (drame 2 juin 2026)

**Dès que je touche `supabase/migrations/*.sql`** (création OU
modification), mon message final à Béné DOIT contenir un bloc visuellement
visible :

```
🚨 MIGRATION À APPLIQUER SUR SUPABASE
   Fichier(s) : supabase/migrations/<YYYYMMDD_xxx>.sql
   Étapes : Studio → SQL Editor → coller le contenu → Run
   Vérification : npm run check:migrations-pending  (doit passer ✓)
```

Pourquoi non négociable :
- 18 mai → 2 juin 2026 : `quiz_events.meta` jamais appliquée sur Tiquiz →
  TOUTES les vues, starts, completes ont été perdues silencieusement
  pendant 15 jours. Stats fausses sur TOUS les quizzes.
- 2 juin matin : `quizzes.survey_thanks_*` jamais appliquée sur Tipote →
  TOUS les quiz publics ont retourné 404. App offline ~2h.
- 2 juin midi : table `quiz_events` entièrement absente sur Tipote
  (migration `20260521_tracking_foundation` jamais appliquée). Aucune
  stat depuis le lancement Tipote.

**Garde-fou auto** : `npm run check:migrations-pending` parse tous les
`.sql` du repo et liste ce qui manque en prod (sans intervention manuelle
nécessaire — contrairement à `check:schema` qui exige une liste
hand-curated). À lancer après chaque déploiement.

## Claude personal notes — pitfalls + conventions

**Avant de coder, lire `CLAUDE_PITFALLS.md` (pense-bête perso).**
Bugs récurrents identifiés + conventions implicites à respecter pour
ne pas casser l'existant. Ce fichier doit être mis à jour quand un
bug remonte plusieurs fois.

**Pour les chantiers rétention en cours : lire `ROADMAP_RETENTION.md`**
(audit Béné du 1er juin 2026 — phases 0 à 8). Contraintes business y
sont listées (pricing Tiquiz, bridge Tipote bloqué Systeme.io,
affiliate géré côté SIO, etc.) — ces contraintes sont aussi rappelées
en section AR du pitfalls.

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
