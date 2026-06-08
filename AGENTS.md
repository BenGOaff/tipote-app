# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Espace affilié = sous-domaine, le pathname N'A PAS /affiliate (drame Gwenn 8 juin 2026)

`affiliate.tipote.com/<path>` est rewrité vers `/affiliate/<path>`
(next.config.ts, beforeFiles). MAIS le `usePathname()` côté client
renvoie le path SANS préfixe (ex. `/promouvoir`, pas
`/affiliate/promouvoir`). Conséquence : tout gate du type
`pathname.startsWith("/affiliate")` est **MORT en prod** sur le
sous-domaine.

Bugs déjà causés par ce piège :
- `CoachWidget` (bouton chat IA Tipote) qui fuit sur les pages affiliées.
- `TutorialOverlay` (overlay gris du didacticiel Tipote) qui grise les
  sous-pages affiliées (l'overview semblait OK car ces widgets
  s'auto-masquent sur `pathname === "/"`).

**Règle :** pour gater un composant hors de l'espace affilié, détecter
le HOST, pas (seulement) le pathname :
- côté serveur (root layout) : `headers().get("host").startsWith("affiliate.")`
  → passé en prop (`isAffiliateHost`) à `Providers`.
- défense en profondeur côté client : `window.location.hostname.startsWith("affiliate.")`
  EN PLUS du `pathname.startsWith("/affiliate")` (qui couvre le dev où
  l'affilié est servi en direct sous /affiliate).

**Auth affilié :** après `signInWithPassword` / `exchangeCodeForSession`,
faire une navigation DURE (`window.location.assign`) et PAS
`router.push/replace`. Sinon le SSR du layout affilié s'exécute avant
que le cookie de session soit lisible côté serveur → `getAffiliateSession()`
renvoie null → sidebar absente jusqu'au refresh.

## Anti-IA writing — JAMAIS de tiret long (drame 7 juin 2026)

Béné a une règle absolue dans tout le contenu user-visible (emails
affiliés, posts, i18n messages, copy UI) : **aucun em-dash `—` ni
en-dash `–`**. Ces caractères sont une signature stylistique des LLM
qui trahit immédiatement le texte généré par IA et casse la crédibilité
de la communication "rédigée par Béné".

À utiliser à la place :
- En remplacement de listes/bullets : `-` (hyphen simple)
- En remplacement d'une parenthèse stylistique : `,` ou `:` ou `(...)`
- En remplacement d'une pause forte : `.` (nouvelle phrase)
- En remplacement d'une plage de valeurs : `à` ou `-` simple

Scan rapide avant tout commit qui touche au contenu user-visible :
```bash
grep -rn "—\|–" messages app/affiliate/promouvoir/content app/affiliate/i18n
```
Doit retourner ZÉRO ligne. Sinon, `sed -i 's/—/-/g; s/–/-/g' fichier`.

Cette règle s'applique aux contenus USER-VISIBLE uniquement. Les
commentaires de code (`//`, `/* */`) peuvent contenir des em-dash sans
souci - le user ne les voit jamais.

## Distribution par résultat — RÈGLE UNIQUE (drame Gwenn 8 juin 2026)

Tout endroit qui affiche la distribution des leads par résultat de quiz
DOIT suivre cette règle exacte. La répétition de bugs (entrées
dupliquées, résultats oubliés, anciens noms) vient TOUJOURS d'une
ré-implémentation partielle qui zappe une étape.

**Citation Béné 8 juin :** "je veux que mes users voient leur quiz
EXISTANT, en temps réel, pas des anciennes versions ou des versions
tronquées." → source de vérité = `quiz_results` actuel.

**Algorithme obligatoire :**
1. **SEED** `byTitle` avec TOUS les profils actuels de `quiz_results`,
   `count = 0` inclus (pas de filtre zero). Source de vérité.
2. Pour chaque lead, tenter d'attribuer à un profil current :
   - via `quiz_result_id` (ou `result_id`) → `quiz_results.title` LIVE
     (suit les renames)
   - sinon via le snapshot `quiz_result_title`/`result_title` SI ce
     titre existe encore dans `currentTitles`
   - **sinon : on EXCLUT silencieusement** (orphan / ancien nom après
     rename / profil supprimé). Pas de bucket "Anciens profils" affiché.
3. Le dénominateur des `%` = somme des leads MATCHÉS (pas `leads.length`),
   pour que les pourcentages affichés somment exactement à 100%.
4. Sort par count desc.

**Endroits à respecter (Tipote) :**
- `app/api/quiz/[quizId]/analytics/route.ts` — table `leads`, colonnes
  `quiz_result_id` + `quiz_result_title`
- `components/quiz/QuizResultsAnalytics.tsx` — table `quiz_leads`,
  colonnes `result_id` + `result_title`
- `app/api/quiz/[quizId]/public/route.ts` (capture) DOIT écrire ET
  `quiz_result_id` ET `quiz_result_title`
- Toute nouvelle UI affichant des compteurs par résultat

**Anti-patterns INTERDITS :**
- Ne PAS seeder avec `quiz_results` actuels → profils à 0 lead absents.
- Afficher un bucket "Anciens profils" ou "Sans résultat" → bruit visuel
  que Béné refuse.
- Calculer le `%` sur `leads.length` au lieu de `matchedTotal` → la
  somme ne fait pas 100% quand il y a des orphans exclus.
- `groupBy(result_title)` sans match au titre LIVE → anciens noms
  apparaissent en double après rename.

## Fichier env sur le serveur prod — À NE PAS CONFONDRE (drame 3 juin 2026)

Sur le serveur prod, **les deux apps utilisent `.env`** (pas `.env.local`).
`.env.local` est une convention de DEV Next.js uniquement.

| Repo | Sur prod (à sourcer pour le shell) | En dev local |
|---|---|---|
| `~/tipote-app/` | **`.env`** | `.env.local` |
| `~/tiquiz-app/` | **`.env`** | `.env.local` |

Pour avoir `CRON_SECRET` (et toutes les autres vars) dans le shell :
```bash
cd ~/tiquiz-app && set -a; . .env; set +a
echo "CRON_SECRET = '$CRON_SECRET'"   # doit afficher une valeur, pas ''
```

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
