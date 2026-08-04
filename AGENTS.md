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

**Frontière serveur / client (drame 1er août 2026) :** un composant marqué
`"use client"` ne peut PAS recevoir une référence de fonction depuis une
page serveur. `FolderCard` prenait une icône en prop (`icon={GraduationCap}`,
donc un composant React) : marqué côté client, /contenus plantait en prod
sur "An error occurred in the Server Components render", sans message utile.
Deux sorties possibles : garder le composant côté serveur quand il n'a ni
état ni gestionnaire d'événement (choix retenu pour `ContentNav.tsx`), ou
passer une clé sérialisable et résoudre l'icône côté client. Le typecheck
ne voit RIEN de tout ça : ça ne pète qu'au rendu.

**Gabarit de page :** la largeur, les marges et le padding de l'espace
affilié vivent UNE seule fois, dans `app/affiliate/layout.tsx`
(`max-w-6xl px-6 py-8`). Une page ne définit que son rythme vertical
(`space-y-*`). Avant, chaque page avait son propre conteneur et Promouvoir
paraissait plus étroite que les autres sans raison.

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

## Funnel par question - RÈGLE UNIQUE (drame Adeline 1er août 2026)

Tout affichage "où décrochent les répondants" DOIT être recalé sur la
liste ACTUELLE des questions, jamais sur les seuls events.

Adeline supprime sa 10e question. Les lignes de `quiz_question_events`
gardent `question_index = 9`, et la RPC `quiz_question_funnel_detail`
liste les index PRÉSENTS DANS LES EVENTS. Résultat : une "Question 10"
fantôme, une "pire chute : 59% Q9 -> Q10" qui désigne une question
supprimée, et un "restés jusqu'au bout" calculé sur elle.

**Algorithme obligatoire :** passer par `buildLiveFunnel()`
(`lib/quiz/funnel.ts`), qui :
1. SEED les étapes sur les questions actuelles (0 à count-1) ;
2. exclut les index >= count (questions supprimées) et les compte dans
   `removedQuestions`, que l'UI affiche honnêtement ;
3. marque `hasData: false` les questions vivantes sans event (ajoutées
   après coup) : l'UI montre "pas encore de donnée", jamais "0 visiteur",
   et ces étapes sont exclues du calcul de la pire chute ;
4. `reachedLastQuestion()` pour "restés jusqu'au bout" : la dernière
   question QUI A de la donnée.

Fail-open : si le nombre de questions est inconnu (0), on renvoie les
lignes brutes. Mieux vaut la donnée telle quelle qu'un écran vide.

**Endroits à respecter (Tipote) :** `app/api/quiz/[quizId]/analytics/route.ts`,
`lib/quiz/insights.ts` (l'IA commentait la question fantôme),
`components/quiz/QuizAnalyticsClient.tsx`. Le module quiz est jumeau de
celui de Tiquiz : toute correction ici doit être portée là-bas, et
réciproquement.

## Identité stable des questions - RÈGLE UNIQUE (1er août 2026)

Le recalage sur les questions vivantes (section ci-dessus) supprime la
question fantôme mais ne réaligne rien : une question supprimée ou
insérée AU MILIEU décale les index de tout l'historique postérieur. La
correction définitive est l'identité stable, et elle tient en 3 pièces.
Les trois sont obligatoires, en zapper une remet le bug.

**1. `quiz_questions.id` est DURABLE.** Le PATCH `/api/quiz/[quizId]`
fait UPDATE des lignes déjà connues, INSERT des nouvelles, DELETE de
celles que l'éditeur ne renvoie plus (exactement comme `quiz_results`).
Il ne fait PLUS `delete().eq("quiz_id")` + `insert(all)`, qui régénérait
tous les ids à chaque sauvegarde.
-> Corollaire : **tout éditeur DOIT renvoyer `id` dans le payload
`questions`** (`QuizDetailClient`, `SurveyDetailClient`). Sans l'id,
la question est traitée comme nouvelle et perd son historique.

**2. Ce qu'on écrit porte l'id.**
- `quiz_question_events.question_id` (route `/track`, le viewer envoie
  `questionId`) ;
- `quiz_leads.answers[].question_id` (le viewer envoie `question_id`
  dans chaque réponse).
L'index reste écrit à côté : c'est le repli des lignes historiques.
L'INSERT du `/track` retombe sur la version sans `question_id` si la
colonne n'existe pas encore en prod (jamais de tracking perdu en
silence, cf. drame `quiz_events.meta`).

**3. Tout lecteur traduit l'id en POSITION ACTUELLE** via
`lib/quiz/questionIdentity.ts` :
- `buildQuestionPositions(questions)` -> Map id -> position ;
- `resolveQuestionPosition(ref, positions, count)` -> position ou null ;
- `indexAnswersByPosition(answers, positions, count)` -> Map position ->
  réponse.
Ordre de résolution : `question_id` connu -> position actuelle ; id
inconnu -> question supprimée, on EXCLUT ; pas d'id -> on garde l'index
tant qu'il désigne une question vivante. Fail-open si la structure est
inconnue (0 question) : on renvoie l'index brut.

Côté SQL, les RPC font la même traduction (`left join` sur
`question_id`, `row_number()` pour la position) et renvoient une **ligne
sentinelle `question_index = -1`** dont `views` porte le nombre de
questions disparues. `buildLiveFunnel()` la lit et la transforme en
`removedQuestions`, que l'UI affiche honnêtement.

**Tri de référence : `order by sort_order, id`.** Les RPC l'utilisent ;
les requêtes JS qui construisent des positions doivent l'utiliser aussi
(`.order("sort_order").order("id")`), sinon deux lecteurs peuvent
calculer des positions différentes en cas d'égalité de `sort_order`.

**Anti-patterns INTERDITS :**
- `answers.find(a => a.question_index === qIdx)` : c'est exactement le
  bug. Passer par `indexAnswersByPosition`.
- Un éditeur qui renvoie `questions` sans `id`.
- Un nouveau lecteur d'`answers` qui n'importe pas
  `lib/quiz/questionIdentity.ts`.

**Endroits à respecter (Tipote) :** `app/api/quiz/[quizId]/route.ts`
(PATCH), `app/api/quiz/[quizId]/track/route.ts`,
`components/quiz/PublicQuizClient.tsx`, `QuizDetailClient.tsx`,
`SurveyDetailClient.tsx`, `QuizResultsAnalytics.tsx`, `SurveyTrends.tsx`,
`lib/survey/format.ts`, `lib/survey/analysis.ts`, `lib/leadAnswers.ts`,
`app/api/quiz/[quizId]/survey-results/route.ts`,
`app/api/quiz/[quizId]/public/route.ts` (tags SIO par réponse),
`supabase/migrations/20260801_question_identity.sql`.
Le module quiz de Tiquiz est jumeau : toute correction ici doit être
portée là-bas, et réciproquement.

## Réponses sans options - à ne pas oublier (retour Jocelyne 1er août 2026)

`free_text`, `rating_scale` et `star_rating` n'ont pas d'options. Toute
synthèse par question qui ne compte que `option_index` / `option_indices`
les fait DISPARAÎTRE de l'écran (leur `totalAnswered` reste à 0), alors
que les réponses sont bien en base dans `quiz_leads.answers[].text` /
`.rating` / `.stars`. Traiter les trois familles :
- options -> compteur par option (existant) ;
- texte libre -> la liste des réponses écrites + un bouton Copier ;
- échelle -> répartition des notes + moyenne.

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

## Tests visuels design/UX — RÈGLE (demande Béné 27 juillet 2026)

Tout changement design/UX du module quiz doit passer par le filet visuel
Playwright. Le harness vit dans le repo TIQUIZ (`npm run test:visual`,
`tests/visual/`) : les deux viewers étant jumeaux, un changement porté ici
doit être validé là-bas. Porter le harness dans ce repo au prochain gros
chantier design du module quiz.

## Taille de police d'un champ : UNE seule enveloppe (drame Jocelyne 1er août 2026)

La taille de police au niveau du champ vit dans un `<div
class="rt-field-fs" style="--rt-fs-m: Xpx; --rt-fs-d: Ypx">` qui
enveloppe tout le contenu (cf. `RichTextEdit`, section dual-device).

**Le piège :** le navigateur restructure le contenu d'un `contentEditable`
à la moindre commande. Aligner, coller, appuyer sur Entrée enveloppe le
bloc dans un `<div>`, et l'enveloppe de taille n'est alors PLUS enfant
direct du champ. Le code cherchait `:scope > .rt-field-fs` : il ne la
trouvait plus, en créait une SECONDE par-dessus, et comme la plus
profonde porte sa propre variable CSS, c'est ELLE qui gagne. Résultat :
le menu affiche la nouvelle taille, l'écran garde l'ancienne, et
l'utilisatrice conclut que le bouton ne marche pas. Reproduit côté
Tiquiz sur la 6e réponse d'une question, celle qui avait été centrée.

**Règle :** `applyFieldFontSize()` cherche les enveloppes PARTOUT dans le
champ (`querySelectorAll`), reprend les tailles de la **plus profonde**
(celle qui gagne en CSS, donc celle que l'utilisatrice voit), les retire
TOUTES, puis en recrée UNE SEULE en enfant direct. Un `<div>` qui
n'existait que pour porter la taille est déballé ; un `<div>` qui porte
autre chose (un alignement) est conservé tel quel. Effet de bord voulu :
un champ déjà cassé se répare tout seul au premier clic sur une taille.

**Ne jamais** revenir à un `:scope >` ni supposer que le DOM d'un
contentEditable ressemble à ce qu'on y a écrit. Le module Tiquiz est
jumeau : toute correction ici se porte là-bas.

## Quiz scoré : les contrôles "profil" ne s'appliquent PAS (drame Véronique 1er août 2026)

Deux mécaniques d'attribution du résultat coexistent, et elles ne se
mélangent jamais :

| Mode | Le résultat est choisi par | Ce qui compte sur l'option |
|---|---|---|
| profils (défaut) | `option.result_index` le plus voté | `result_index` |
| scoring | la TRANCHE `[min_score, max_score]` | `points` |

En scoring, `result_index` ne veut rien dire. Or deux analyses de
l'éditeur sont bâties dessus :
- `resultCoverage` ("combien de questions mènent à ce résultat") ;
- `tieAnalysis` (ex-æquo entre profils).

Sur un quiz scoré, elles répondaient zéro pour tout le monde, d'où le
bandeau rouge **"Ce résultat ne peut jamais être attribué"** sur un quiz
parfaitement fonctionnel : Véronique testait, obtenait le bon résultat,
et voyait quand même l'alerte. Deux jours perdus, et un bouton
"Rééquilibrer avec l'IA" qui aurait réécrit des `result_index` inutiles.

**Règle : les deux analyses sortent en `ok` / vide dès que
`quiz.mode === "scoring"`.** Le contrôle équivalent en scoring existe
déjà et lui est correct : `trancheCoverage` (trous et chevauchements
entre les tranches, comparés à la plage réellement atteignable via
`computeReachableRange`).

**Avant d'ajouter un contrôle de cohérence sur les résultats**, se
demander de quelle mécanique il parle, et le gater sur `isScoring`. Le
module Tipote est jumeau : toute correction ici se porte là-bas.

## Filet de tests logique : OBLIGATOIRE avant push (1er août 2026)

Trois bugs de suite sont partis en prod sous les yeux de vraies
clientes : le funnel fantôme d'Adeline, la taille de police de Jocelyne,
la fausse alerte de Véronique. Aucun n'était une faute de frappe. Tous
les trois sont le MÊME défaut :

> une logique écrite pour un cas est appliquée telle quelle à un autre,
> et rien ne le contredit avant que la cliente ne le découvre.

- Adeline : un index positionnel appliqué à un historique dont la
  structure a bougé.
- Jocelyne : un `:scope >` appliqué à un DOM que le navigateur a
  restructuré.
- Véronique : une analyse "profils" appliquée à un quiz scoré.

Le filet visuel ne pouvait rien voir : il photographie le viewer public,
alors que ces trois bugs vivent dans des fonctions.

**La règle :**

```bash
npm run test:logic     # runner natif Node, ~1s, aucune dependance
npm run test:visual    # 90/90, uniquement si le design/UX bouge
npx tsc --noEmit       # exit 0
```

`npm run test:logic` tourne AVANT chaque push, sans exception et sans
qu'on le demande. Les tests vivent dans `tests/logic/*.test.mts` et
portent le nom de la cliente et ce qu'elle a vu : un test rouge, c'est
une cliente qui va perdre confiance.

**Corollaire, plus important que les tests eux-mêmes :** une logique
enfermée dans un composant React n'est pas testable, donc elle n'est pas
testée. Toute règle métier (cohérence, statistiques, manipulation DOM,
conversion de format) sort dans `lib/` en fonction pure, et le composant
se contente de l'appeler. C'est ce qui a été fait pour
`lib/quizCoherence.ts` et `lib/richTextFieldSize.ts`.

**Et quand un cas a deux mécaniques, la mécanique est un PARAMÈTRE
OBLIGATOIRE**, pas une variable devinée à l'intérieur (cf.
`analyzeResultCoverage(mode, ...)`). On ne peut plus appeler la fonction
sans avoir dit de quoi on parle : c'est la seule protection qui survit
au prochain qui touchera au fichier.

**Un test qui clignote est pire que pas de test.** Le 1er août, une
capture visuelle est sortie rouge puis verte au retry (hauteur de page
pas encore stable). Corrigé à la source par `settle()` dans le spec :
on attend que la hauteur du document ne bouge plus, au lieu d'un
`waitForTimeout` qui dépend de la charge machine.

## Flèche retour = hiérarchie, jamais l'historique (drame Gwenn 1er août 2026)

Gwenn clique sur les stats depuis Mes projets. La flèche des stats la
ramène sur le quiz, la flèche du quiz la ramène sur les stats. "Et je
tourne en boucle entre les deux, sans pouvoir en sortir."

La page stats pointait EN DUR vers l'éditeur ; l'éditeur faisait
`router.back()`, donc revenait aux stats. `router.back()` n'est pas une
hiérarchie, c'est un historique : il renvoie là d'où on vient, y compris
vers un écran qui renverra ici. Deux écrans qui se citent l'un l'autre =
cycle, et la seule sortie (le bouton retour du navigateur) rejoue la
même boucle.

**Règle :** la flèche retour d'un écran de projet passe par
`projectBackHref()` (`lib/nav/projectBack.ts`) et remonte à Mes contenus
(`/contents` ici, `/quizzes` côté Tiquiz).
La navigation LATÉRALE (stats <-> éditeur) existe toujours, mais par un
lien nommé ("Modifier"), jamais par la flèche.

**INTERDIT :** `router.back()` sur une flèche retour, et une destination
qui dépend du referrer ou de `window.history`. Le test
`tests/logic/project-navigation.test.mts` remonte de parent en parent et
exige que ça s'arrête : un futur écran qui recréerait un cycle le fait
rougir avant la cliente.

## "Ne pas afficher le score" (retour Véronique 1er août 2026)

Véronique décoche tout en mode Score, et le pourcentage reste affiché.
Deux causes, les deux dans la même famille que les drames précédents :
une combinaison de réglages relue à trois endroits du viewer.

1. Sans jauge, la page affichait `X / Y` **et** une ligne de
   pourcentage, alors que le panneau promet "à la place du simple texte
   X / Y".
2. Le sélecteur d'affichage était gaté par `showScoreGauge ||
   scoringAxesEdit.length > 0` : sans jauge ni axes, elle n'avait
   AUCUN contrôle.

**Règle :** la décision vit dans `resolveScoreDisplay(mode, showGauge)`
et `resolveAxisScoreDisplay(mode)` (`lib/quizScoring.ts`), jamais dans
le JSX. `score_display_mode` vaut `"percent" | "label" | "hidden"`
(pas de migration : la colonne existait). `"hidden"` retire le score
GLOBAL et les barres d'axes ; les axes restent éditables (ils alimentent
les variables `{score_axe}` et les tags Systeme.io).

Le module Tiquiz est jumeau : toute correction ici se porte là-bas.

## Boutons de partage : les réseaux cochés, ou TOUS (retour Béné 1er août 2026)

Deux problèmes distincts, sur le même bouton.

**1. "Partager mes résultats ne déclenche rien."** Le bouton appelait
`navigator.share`, absent des navigateurs desktop, retombait sur un
`navigator.clipboard.writeText`, et TOUT échec était avalé par un
`catch {}` silencieux. Sur desktop, au mieux un toast discret, au pire
rien du tout. Il ouvre maintenant un panneau de boutons par réseau,
comme l'écran bonus le faisait déjà.

**2. Le repli oubliait 4 réseaux sur 9.** La liste par défaut était
codée en dur à deux endroits :
`["x", "facebook", "linkedin", "whatsapp", "threads"]`. Une créatrice
qui ne cochait AUCUN réseau (le cas par défaut) privait ses visiteurs
d'Instagram, Pinterest, Reddit et email sans le savoir.

**Règle :** `resolveShareNetworks()` (`lib/quiz/shareNetworks.ts`), une
seule fonction testée pour tous les écrans. Sélection non vide -> elle,
dans SON ordre. Rien de coché, colonne nulle, valeur illisible -> TOUS
les réseaux (`ALLOWED_SHARE_NETWORKS`). Une sélection qui ne contient
que des réseaux inconnus retombe sur tous, jamais sur zéro bouton.
L'aperçu de l'éditeur passe par la MÊME fonction, sinon il ment.

**Ne pas ré-écrire de liste de réseaux en dur**, nulle part, y compris
dans un aperçu. C'est comme ça que le bug est né.

L'URL partagée depuis l'écran de résultat est celle du profil obtenu
(`?rp=`) : `getShareData` / `shareOn` / `copyShareLink` prennent un
`urlOverride`. Instagram, qui n'a pas d'URL de partage web, copie ce
même lien (pas celui du quiz).

Le partage de fin de quiz reste désactivable : `show_result_share`,
toggle "Afficher le bouton de partage" dans l'éditeur.

## Un lien envoyé par email pointe sur NOTRE domaine (drame Véronique sur Tiquiz, 2 août 2026)

"Je demande un nouveau mot de passe, je clique sur le bouton, et
j'arrive sur `localhost n'autorise pas la connexion`. Bref, je tourne en
rond. PS : je n'ai pas de proxy et pas de pare-feu."

Elle avait raison sur toute la ligne : le lien lui demandait vraiment
d'ouvrir un serveur sur SA machine.

**Pourquoi.** Le lien reçu portait
`redirect_to=http://localhost:3000/auth/callback`. Ce n'était pas un
repli de Supabase : c'est NOUS qui l'avions écrit. En prod,
`NEXT_PUBLIC_APP_URL` vaut `http://localhost:3000`, et le code faisait
`process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tipote.com"`. Un `??`
ne protège que du MANQUANT, jamais du FAUX.

**Le `??` avec une valeur par défaut est un faux garde-fou.** Quand une
variable a une valeur INTERDITE, il faut la valider, pas lui donner un
défaut. Tout ce qui produit un lien VU par un humain (emails de cron,
notifications, invitations admin, login, sitemap/robots/llms) passe
maintenant par `resolveAppUrl()` / `resolvePublicUrl()`
(`lib/authLinks.ts`).

**Exception assumée : les `redirect_uri` OAuth et les `callback_url` de
webhooks ne sont PAS filtrés.** Ils doivent correspondre au caractère
près à ce qui est enregistré chez le fournisseur, et `localhost` y est
légitime en développement. Les réécrire casserait les connexions
sociales en local.

**Règle : on n'envoie jamais le lien Supabase.** On envoie le nôtre,
construit avec `properties.hashed_token` :
`${APP_URL}/auth/callback?token_hash=...&type=recovery`. `/auth/callback`
consomme le jeton lui-même (`verifyOtp`). Plus de liste blanche, plus de
Site URL entre l'utilisatrice et son compte.

**Et le domaine ne vient jamais d'une constante de build seule.**
`resolveAppUrl()` (`lib/authLinks.ts`) refuse toute adresse locale
(localhost, 127.x, ::1, .local) et retombe sur l'origine de la requête,
puis sur le domaine canonique. Un `.env` de prod mal renseigné ne peut
plus produire un email cassé. Côté client, `window.location.origin`
remplace `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` :
le domaine où l'utilisatrice navigue vraiment.

**Restent dépendants de la config Supabase** (rien à faire côté code) :
les emails que Supabase envoie lui-même, c'est à dire le lien magique et
la confirmation d'inscription. Vérifier dans le dashboard que le Site
URL est `https://app.tipote.com` et que les Redirect URLs contiennent
`https://app.tipote.com/auth/callback`.

## Mode scoring : le visiteur ne doit JAMAIS voir une page vide

Trouvé en auditant le scoring. Le viewer faisait
`ranges.find(...) ?? null` : un score qui tombe dans un TROU entre deux
tranches, ou un quiz dont aucun résultat n'a de tranche (le cas d'une
débutante qui n'a pas encore touché aux bornes), donnait
`resultProfile = null`. Tout l'écran de résultat étant en
`resultProfile?.`, le visiteur répondait à tout, laissait son email, et
arrivait sur une page sans titre, sans texte, sans bouton. En silence.

**Règle : `pickScoringResultIndex()` (`lib/quizScoring.ts`) rend toujours
un résultat dès qu'il en existe un.** Tranche qui contient le score,
sinon la tranche la plus proche, sinon le premier résultat.
`analyzeTrancheCoverage` reste là pour prévenir la créatrice : il
l'avertit, il ne sauve pas le visiteur.

**Et poser des tranches est un calcul, pas une décision de créatrice.**
La plage de points atteignable est affichée en permanence (plus seulement
quand quelque chose cloche), et un bouton "Répartir les tranches" découpe
la plage en tranches contiguës via `splitRangeIntoTranches()`, la MÊME
fonction que la finalisation d'un quiz généré par l'IA.

## Un `ok: false` produit TOUJOURS quelque chose à l'écran (3 août 2026)

Côté Tiquiz, Béné supprime un projet : rien. Elle recommence : rien. La
seule trace était un `400` nu dans la console. Le quiz n'était PAS
supprimé : `popquiz_cues.quiz_id` référence `quizzes(id)` en **ON DELETE
RESTRICT** (20260504_popquiz_module.sql), Postgres refusait, la
transaction était annulée. Le même code vivait ici.

Deux fautes empilées, et la deuxième est la plus grave : la migration
promettait un avertissement dans l'éditeur qui n'a jamais existé, et le
client ne montrait rien du tout dans le cas `ok: false`.

**Règle : une réponse `ok: false` DOIT produire un message visible.** Un
échec silencieux coûte plus cher que le bug qu'il masque, parce qu'il
envoie l'utilisatrice chercher au mauvais endroit.

**Règle : un refus n'est pas une panne.** `classifyDeleteError()`
(`lib/quizDelete.ts`) traduit l'erreur Postgres en raison exploitable ;
la route répond **409** (l'état des données s'y oppose) et jamais 400,
avec un `reason` que le client traduit et le nom des vidéos qui
retiennent le quiz. Le serveur renvoie la RAISON, jamais la phrase :
l'interface existe en 7 langues.

## Le chrome d'édition n'hérite jamais de l'aperçu (drame Jocelyne 3 août 2026)

"Je voudrais grossir les polices sur les boutons, mais ce n'est pas
possible, menu déroulant vide."

Le menu n'était pas vide : il s'ouvrait avec ses 11 tailles, écrites en
BLANC sur un panneau BLANC. L'éditeur est du WYSIWYG, donc la toolbar de
`RichTextEdit` vit DANS l'aperçu, donc à l'intérieur du
`<button class="text-white">` du CTA. Les entrées du menu n'avaient
aucune classe de couleur : elles héritaient du blanc. Seul l'en-tête, qui
porte `text-muted-foreground`, restait visible. Et ça n'arrivait QUE sur
les boutons, les seuls endroits où l'aperçu force une couleur de texte.

**Règle : la classe `rt-chrome` (globals.css) est posée à la RACINE de
tout élément de chrome rendu dans l'aperçu** (toolbar, popovers, barre
d'image). Elle neutralise les propriétés HÉRITÉES (couleur, taille,
graisse, casse, interlettrage, alignement) : les descendants qui
imposent la leur gagnent comme avant.

**Ne pas recolorer un menu à la fois** : le prochain popover ajouté à la
toolbar ramènerait le bug. Et **ne pas utiliser `--foreground`** : le
`<main>` de l'aperçu le réécrit avec la couleur de texte du quiz, ce qui
rejouerait le bug pour toute créatrice ayant choisi un texte clair. D'où
la variable dédiée `--rt-chrome-fg`, définie en clair ET en sombre.
Garde-fou : `tests/logic/editor-chrome.test.mts`.

## Moins de réponses que de profils (escalade Véronique 3 août 2026)

"Configuration 2 axes croisés pour 4 profils. Comme il n'y a que 3
réponses possibles par question et 4 résultats, forcément ça déconne."

Elle a raison. En mode profils, une voix ne peut venir que d'une option
portant le `result_index` du profil. Une question à 3 réponses ne peut
voter que pour 3 profils sur 4 : à cette question, le 4e est hors course.
Répété sur tout le quiz, ça donne le bandeau rouge "Ce résultat ne peut
jamais être attribué".

Trois corrections, et les trois comptent :

1. **À la source.** Le prompt de génération demande, en mode profils,
   EXACTEMENT `resultCount` options par question de choix, avec les
   `resultCount` result_index apparaissant chacun UNE fois.
2. **Nommer la cause.** `analyzeOptionSupply(mode, questions, count)`
   (`lib/quizCoherence.ts`) détecte le cas, et l'alerte dit qu'il MANQUE
   des réponses. "Ajuste les options ou demande à l'IA de rééquilibrer"
   était vrai mais indevinable : déplacer un `result_index` d'un profil
   vers un autre laisse toujours un profil découvert.
3. **Rendre l'action capable.** `/rebalance` ne savait que DÉPLACER des
   `result_index`. Il renvoie maintenant aussi des `additions` (nouvelles
   réponses rédigées dans la langue et le ton de la question), validées
   côté serveur : jamais plus d'une réponse par profil, jamais un doublon
   d'une réponse existante, jamais sur une question déjà complète.

**Il n'ajoute JAMAIS de question** : leur nombre est une décision de la
créatrice, pas un trou à combler.

`analyzeOptionSupply` est gaté sur le mode : en scoring, `result_index`
ne veut rien dire. `yes_no` et les types sans options (`free_text`,
`rating_scale`, `star_rating`) sont exclus : deux réponses ou zéro
réponse, c'est leur principe, pas un manque.

Le module quiz de Tiquiz est jumeau : ces trois corrections y vivent
aussi, toute évolution se porte des deux côtés.

## Titre et sous-titre partagent UN bord, calculé UNE fois (drame Béné 3 août 2026)

"Je ne comprends pas pourquoi il y a toujours ce décalage entre le titre
et le sous-titre. On a déjà parlé de ça mille fois et ça n'a pas été
corrigé. Je veux juste que si j'aligne mon texte à gauche, le titre et le
sous-titre commencent au même endroit à gauche, je ne veux pas de
décalage par défaut."

Le "mille fois" est la vraie information. Le décalage venait d'un
`max-w-xl mx-auto` écrit en dur sur le sous-titre : `max-w-xl` borne la
longueur de ligne (utile, il reste), mais `mx-auto` CENTRE le bloc quoi
qu'il arrive. Tant que le titre est centré, invisible. Dès qu'elle aligne
son titre à gauche, le titre part du bord et le sous-titre reste centré,
donc commence plus à droite.

Et si ça n'avait jamais été corrigé partout, c'est que la règle
n'existait nulle part : elle était réécrite en ternaires dans chaque
écran de chaque composant. Le viewer avait été corrigé, l'éditeur non.
L'écran de question avait été corrigé, l'écran d'accueil non. Chaque
passage en oubliait un, donc le bug revenait.

**Règle : `lib/quiz/textAlign.ts`, et personne ne réécrit de ternaire
d'alignement.**

- `resolveBlockAlign(ownHtml, titleHtml, layout)` : son propre alignement
  -> celui du TITRE -> la disposition. Le titre sert de référence parce
  que c'est lui qui donne le ton de l'écran ; l'alignement propre du bloc
  passe devant parce qu'aligner le sous-titre exprès est un choix.
- `alignTextClass` / `alignBlockMarginClass` / `alignJustifyClass` pour
  le texte, la marge du bloc (JAMAIS `mx-auto` en dur) et les conteneurs
  flex (logo, bouton).
- `richTextAlign` renvoie `null` quand la créatrice n'a jamais touché à
  l'alignement du champ. Ce null n'est pas un détail : sans lui, un champ
  jamais aligné imposerait la gauche et recasserait tous les quiz
  centrés.

**Endroits à respecter :** `PublicQuizClient.tsx` (écran d'accueil),
`QuizDetailClient.tsx` et `SurveyDetailClient.tsx` (aperçu d'accueil).
Le module quiz de Tiquiz est jumeau : toute évolution se porte des deux
côtés.
Exception assumée : en disposition "couverture" (image plein écran), le
viewer centre tout sans condition, et l'aperçu fait pareil.

**INTERDIT :** `mx-auto` sur un bloc de texte de l'écran d'accueil, et
tout `align === "center" ? … : …` recopié dans un composant. Le test
`tests/logic/intro-align.test.mts` fige la règle.

Corollaire général, déjà vrai pour les réseaux de partage et le score :
**quand l'aperçu de l'éditeur recalcule une décision au lieu d'appeler la
même fonction que le viewer, il finit toujours par mentir.**

## La page de résultat suit les 4 temps de l'Atelier (3 août 2026)

Béné : "je voudrais retravailler la page résultat des quiz pour intégrer
cette logique : le miroir, la cause, le chemin, le pont. Comme ça on met
Tiquiz raccord avec ce qui est enseigné dans l'Atelier, ce qui n'est pas
le cas avec la présentation actuelle."

Le décalage était réel, et il ne venait pas d'un manque de champs : trois
des quatre temps existaient DÉJÀ en base, sous des noms produit qui ne
disaient pas à quoi ils servent.

| Temps | Champ | Ce qu'il fait |
|---|---|---|
| le miroir | `title` + `description` | il se reconnaît, donc il continue à lire |
| la cause | `insight` (+ `insight_heading`) | ce qui bloque vraiment, souvent autre chose que ce qu'il croyait |
| le chemin | `projection` (+ `projection_heading`) | les étapes, il voit que c'est faisable |
| le pont | `bridge` (+ `bridge_heading`) **nouveau** | l'offre comme suite logique, pas comme une pub |

Ce qui manquait vraiment, c'était le PONT (`cta_text` est le libellé du
bouton, 3 à 6 mots : il ne peut pas porter de bénéfices) et surtout
l'INTENTION : le prompt ne disait nulle part que ces blocs forment une
progression, donc l'IA écrivait quatre paragraphes interchangeables.

**Règle : `lib/quiz/resultBeats.ts` décide, personne d'autre.**
`buildResultBeats()` dit quels blocs, dans quel ordre, avec quel titre ;
`beatShell()` dit à quoi ils ressemblent. Le viewer public ET l'aperçu de
l'éditeur appellent les deux. Un aperçu qui recalcule l'allure du viewer
finit toujours par mentir (les réseaux de partage, le score, l'alignement
du sous-titre : trois fois le même bug).

**Règle : `quizzes.result_layout` porte la garantie "on ne touche pas aux
quiz existants".** Défaut `'classic'` en base, et `resultLayoutMode()` ne
renvoie `'beats'` que sur la valeur explicite. Colonne absente, valeur
inconnue, migration pas encore passée : page historique. Un quiz naît en
`'beats'` uniquement quand le contenu reçu porte VRAIMENT un pont
(`hasBridgeContent`), donc jamais sur un import ni une création manuelle.

**Le visuel :** trois temps sobres (filet vertical à la couleur de
marque, aucun fond), le pont seul en bloc plein. C'est la réponse à
"sans forcément créer 4 cartes de couleurs trop IA" : le rythme se voit,
un seul bloc appelle l'oeil, et tout est dérivé de `primary` donc
n'importe quel branding marche sans réglage. La couleur du texte du pont
vient de `bridgeTextColor(isColorDark(primary))`, jamais du blanc en dur.

**Images :** `quiz_results.beat_media` (JSONB) porte une image PAR temps,
avec `mode: "with" | "only"` ("only" = l'image remplace le texte).
Sanitizé par `sanitizeBeatMedia()` : ce champ finit dans un `<img src>`
public, donc jamais écrit brut.

**Le vocabulaire de la méthode ne sort JAMAIS côté visiteur.** "miroir",
"cause", "chemin", "pont" vivent dans l'aide de l'éditeur et dans le
prompt, pas dans le texte produit. Le prompt l'interdit explicitement :
sinon le visiteur lit le squelette au lieu du message.

## Les titres générés s'inspirent des ressources, sans les recopier (3 août 2026)

Béné : "ce serait pas mal aussi d'upgrader la qualité des titres et sous
titres générés par l'IA, pour le moment ils sont pas ouf. Peut être en
lui demandant de s'inspirer des 104 hooks."

`lib/prompts/quiz/copywriting.ts` distille `copywriting-claude/` (104
hooks, triggers psychologiques, puces promesses) en MÉCANIQUES, pas en
accroches à recopier. Coller les 104 lignes coûterait des tokens à chaque
génération et, surtout, produirait des quiz qui se ressemblent tous : un
modèle à qui on donne une liste finie recopie la liste.

Deux blocs, ajoutés au prompt existant sans y toucher par ailleurs :
`HOOK_CRAFT_BLOCK` (7 mécaniques d'accroche + déclencheurs + règles de
forme) et `RESULT_BEATS_BLOCK` (les 4 temps). Le reste du prompt de
génération, qui fonctionne bien, est inchangé.

Le module quiz de Tiquiz est jumeau : toute évolution se porte des deux
côtés.

## Le logo n'est pas un bloc de texte (retour Béné 3 août 2026)

"Si je centre mon titre à gauche, il centre aussi le logo : on doit
pouvoir centrer, aligner à gauche ou à droite le logo indépendamment du
titre ET on doit aussi pouvoir l'agrandir et le rétrécir comme pour les
gif et les images."

En calant tout l'écran d'accueil sur le bord du titre (correctif de la
veille), on avait réglé un décalage et créé une contrainte : le logo
n'avait plus de vie propre. Beaucoup de marques le veulent centré au
dessus d'un titre aligné à gauche.

**Règle : `lib/quiz/introLayout.ts`.** `resolveLogoAlign(setting,
titleAlign)` et `logoRender(align, widthPct)` décident, le viewer ET
l'aperçu appellent les deux. `brand_logo_align` vaut `'auto'` par défaut
(= suit le titre, comportement d'avant), `brand_logo_width` vaut NULL
(= `max-h-16 w-auto`, la taille d'avant). Aucun quiz existant ne bouge.

## Titre et sous-titre : la borne est sur le CONTENEUR, jamais sur un champ

Deuxième passage de Béné sur le même écran : "pourquoi la case du sous
titre est plus courte que celle du titre ?? Elle a une marge à droite que
le titre n'a pas."

Le `mx-auto` avait été retiré la veille, mais pas le `max-w-xl` posé à
côté. Le titre vivait dans un conteneur `max-w-2xl` (42rem), le
sous-titre portait EN PLUS sa propre borne à 36rem. **Mesuré avant
correction : titre 672px (bord droit 1056), sous-titre 576px (bord droit
960).** Tant que tout est centré les 96px se répartissent et ça ne se
voit pas ; aligné à gauche, ça saute aux yeux, et aucun réglage ne
pouvait le rattraper puisque la borne était en dur.

**Règle : la largeur du bloc d'accueil vit sur le CONTENEUR COMMUN**
(`intro_text_width`, NULL = pleine largeur), réglable à la poignée (le
même mécanisme que la largeur des colonnes du split, qu'elle a demandé
nommément). Le bloc est positionné par le TITRE pour les deux champs ;
l'alignement propre du sous-titre pilote SON TEXTE, pas la position de sa
boîte. **INTERDIT : tout `max-w-*` ou `mx-auto` sur le titre ou le
sous-titre de l'accueil.**

**Le filet de captures ne pouvait pas le voir**, et c'est la leçon
principale : le sous-titre de la fixture se coupait au même mot à 576px
et à 672px, donc les pixels étaient identiques alors que les bords ne
l'étaient pas. Les 90 captures sont passées au vert pendant tout le bug.
Le garde-fou est `tests/visual/intro-bounds.spec.ts`, qui MESURE les
boîtes au lieu de les photographier.

## Liste ou colonnes : l'aperçu ignorait le réglage (retour Béné 3 août 2026)

"Le WYSIWYG de la présentation sous forme de liste ou de colonnes des
réponses ne fonctionne pas : j'ai choisi liste et je vois toujours mes
colonnes c'est PAS bon."

Le viewer public lisait bien `answer_layout`. C'est l'APERÇU qui avait sa
propre règle écrite en dur, sans aucune trace du réglage :

```
q.options.length >= 3 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
```

Cocher "Liste" ne pouvait donc rien changer à l'écran. Et même en "Auto",
les deux côtés comptaient les options à des endroits différents.

**Règle : `lib/quiz/answerLayout.ts`.** `resolveAnswerLayout(quizLayout,
questionOverride)` puis `answerGridClass(layout, count, {stacked})`. Le
`stacked` sert l'aperçu mobile : le canvas y est étroit mais le VIEWPORT
ne l'est pas, donc les classes `sm:` resteraient actives et montreraient
deux colonnes que le visiteur ne verra jamais (même piège que le split).

Quatrième fois que le même défaut sort, après les réseaux de partage,
l'affichage du score et l'alignement du sous-titre. **Quand l'aperçu
recalcule une décision au lieu d'appeler la fonction du viewer, il finit
toujours par mentir.**

Le module quiz de Tiquiz est jumeau : ces trois corrections y vivent
aussi, toute évolution se porte des deux côtés.

## Le sous-titre du quiz dit un BÉNÉFICE, jamais la fiche technique (retour Béné 3 août 2026)

"À chaque fois, l'IA génère un truc comme ça dans le sous titre du quiz :
'9 questions, un diagnostic, un truc concret à faire ce soir.' Franchement
on s'en fout du nombre de questions."

**La cause n'était pas la ligne qu'on croit.** Aucune consigne ne demandait
le nombre de questions. Le problème était l'inverse : rien ne disait ce
que le sous-titre DOIT contenir. Les deux seules mentions étaient
"accrocher en 1-2 phrases" et "texte d'intro engageant". À un modèle à qui
on demande d'être "engageant" sans dire sur quoi, il ne reste que les
faits du brief, et `NOMBRE DE QUESTIONS : 9` y est écrit. Il recopiait la
fiche technique faute de mieux.

**Règle : `introSubtitleBlock()` (`lib/prompts/quiz/copywriting.ts`)**,
branché sur la génération ET sur l'import (Béné a vu le problème sur les
deux). Bénéfice pour le visiteur, verbe d'ouverture ("Découvre pourquoi",
"Regarde si tu", "Apprends comment"), durée, et le bonus du créateur
quand il existe.

**La DURÉE est voulue, le NOMBRE DE QUESTIONS est interdit.** Les deux se
ressemblent et les confondre referait le bug dans l'autre sens : la durée
lève une objection ("ça me prend combien de temps ?"), le nombre de
questions ne dit rien au visiteur. La durée est CALCULÉE
(`estimateQuizMinutes`, ~20 s par question) et non laissée au modèle,
sinon il annonce 5 minutes sur un quiz de 3 questions.

## Un prompt est du CODE : il se teste (3 août 2026)

En relisant `lib/prompts/quiz/system.ts` pour le retour ci-dessus, trois
incohérences y vivaient sans que personne les voie :

1. un **tiret cadratin dans le gabarit de sortie** (`"Nom du profil — LE
   MIROIR"`), dans un prompt qui bannit les tirets cadratins dix lignes
   plus haut. On montrait au modèle exactement ce qu'on lui interdit ;
2. l'**exemple d'options contredisait sa propre règle** : `result_index`
   0 deux fois alors que la consigne dit "chacun UNE fois". C'est le cas
   exact qui a fait remonter Véronique (un profil jamais attribuable) ;
3. `FORMAT : Quiz COURT (3 à 5 questions)` **et** `NOMBRE DE QUESTIONS :
   9`, dans le même prompt.

**Règle : `tests/logic/quiz-prompt.test.mts`.** Un prompt produit une
sortie et régresse en silence quand on le retouche : il se teste comme le
reste. Les assertions portent sur ce qui compte (la règle est présente,
le gabarit n'a pas d'em-dash, les `result_index` de l'exemple sont
distincts, aucune fourchette ne contredit le compte demandé).

Pour que ce soit possible, `npm run test:logic` résout maintenant l'alias
`@/` (`tests/logic/register-alias.mjs`). Sans ça, tout module qui importe
`@/lib/...` restait hors de portée du runner natif, donc non testé, donc
exactement là où les bugs s'installent.

Le module quiz de Tiquiz est jumeau : ces corrections y vivent aussi.

## Typographie française : liste NOIRE, et l'espace s'INSÈRE (3 août 2026)

Béné : "en français on laisse un espace entre un mot et des guillemets, ou
un mot et un point d'interrogation. Là ça n'est plus le cas. Ce genre de
petits détails est chiant et long à corriger, on peut se l'éviter ?"

Oui, mais pas en recorrigeant : en retirant les DEUX causes.

**Cause 1 : la règle ne faisait que CONVERTIR une espace déjà présente.**
`Prêt ?` devenait `Prêt<nbsp>?` ; `Prêt?` restait `Prêt?`. Or un modèle de
langue écrit très souvent le français sans l'espace, donc tout le contenu
généré arrivait fautif et le restait après n'importe quel nombre de
sauvegardes. `fixFragment` INSÈRE désormais l'espace manquante.

**Cause 2 : elle n'était appliquée qu'à la MISE À JOUR, sur une liste
blanche de colonnes.** La CRÉATION (génération IA, import) n'appliquait
RIEN. Et une liste blanche oublie toute colonne ajoutée après elle : c'est
la mécanique même du "problème qui revient".

**Règle : `applyFrenchTypographyDeep(payload, locale)` au SEUL point
d'entrée**, sur `POST /api/quiz` (avant toute lecture du corps) et sur le
PATCH. Liste NOIRE de noms de champs + garde sur la FORME de la valeur.
Un champ nouveau est couvert d'office. **Les deux listes blanches ont été
supprimées, pas vidées : ne pas les réintroduire.**

**Insérer est plus dangereux que convertir**, d'où les gardes, tous
testés : on n'insère que devant une ponctuation qui TERMINE (suivie d'une
espace, d'une fermeture ou de la fin). Ça protège le `?` d'une query
(`a?b=1`), le `:` d'un schéma (`https://`), les heures (`12:30`), le CSS
(`color:red`). Le `:` exige en plus une LETTRE devant, jamais un chiffre.
`applyFrenchTypographyToHtml` découpe sur les balises ET les entités :
sans ça, `&nbsp;` deviendrait `&nbsp ;`.

**Aucune autre langue n'est touchée** (`isFrenchLocale`), c'est testé pour
les 7 locales.

Le module quiz de Tiquiz est jumeau : cette correction y vit aussi.

## Une chute dans le funnel : sur QUI, et sur QUELLE question (drame Jocelyne 4 août 2026)

"J'avais une question sur laquelle il y avait vraiment une chute. À chaque
fois que je changeais quelque chose sur les conseils du robot, ça restait
bloqué dessus. Reformuler les quatre réponses, reformuler la question,
remettre les réponses dans un autre ordre : j'ai tout fait, j'attendais
trois quatre nouvelles personnes, même problème. Il m'a carrément
conseillé de l'enlever, je l'ai enlevée, et ça continue à bloquer au même
endroit, la question 7." Puis, le lendemain : "mon premier quiz a 15
questions et globalement tous les gens qui le commencent le terminent."

Ce n'était donc pas la longueur, et il n'y avait aucune question qui
bloque. Trois défauts empilés, du plus grave au moins grave.

**1. ON DÉSIGNAIT LA MAUVAISE QUESTION.** `views` d'une étape = les
sessions qui ont AFFICHÉ cette question (`question_view` part au rendu).
Quelqu'un qui abandonne entre la Q6 et la Q7 a donc vu la Q6 et jamais la
Q7 : **il s'est arrêté SUR la Q6**. Le bandeau annonçait "Question 7 fait
perdre X%, c'est le point chaud à reformuler en priorité". Jocelyne a
réécrit, réordonné puis supprimé une question que les partants n'avaient
jamais lue, et quand elle l'a supprimée l'ancienne Q8 a pris sa place :
le bandeau a redésigné "la 7". Aucune de ses corrections ne POUVAIT
produire d'effet.

**2. AUCUN SEUIL D'ÉCHANTILLON.** L'alerte partait à 15% de perte quel que
soit le nombre de personnes. Sur une étape atteinte par 8 visiteurs, UNE
personne vaut 12,5%. Et comme le pourcentage se calcule sur l'effectif
précédent, qui fond à mesure qu'on avance, l'alerte **dérive
mécaniquement vers la fin du quiz** sans rien devoir au contenu. Sur la
page Mes stats, le badge rouge sortait dès 1% de perte, sans aucun seuil.

**3. ON N'AFFICHAIT PAS CE QU'ON AVAIT.** Chaque étape porte `views` ET
`answers`. Vu sans réponse = il bute SUR la question (trop intime, pas
comprise, blocage technique) ; répondu puis parti = fatigue, et
reformuler ne sert à rien. Deux corrections opposées, aucune des deux
affichée.

**Règle : `lib/quiz/funnelSignal.ts` décide, personne d'autre.**
`readFunnelSignal(steps)` rend `no-data | too-few | steady | hotspot`,
et le hotspot porte la question qu'ils ont VUE (`questionIndex`), celle
qu'ils n'ont jamais atteinte (`neverReachedIndex`), la perte EN
PERSONNES, et la forme (`on-question` / `after-answer`). Seuils :
`MIN_SAMPLE = 20` (une personne ne peut plus à elle seule franchir les
15%), `MIN_LOST = 5` (en dessous on commente des individus),
`MIN_DROP_PCT = 15` (inchangé). `stepLoss()` porte la perte sur la
question qui la SUBIT, avec le nombre de personnes à côté du %.

**Endroits à respecter (Tipote) :** `components/quiz/QuizAnalyticsClient.tsx`,
`lib/quiz/insights.ts` (bloc VERDICT DU FUNNEL calculé AVANT l'appel),
`lib/insights/global.ts`. Côté Tiquiz s'ajoutent `app/stats/StatsShell.tsx`
et le coach de l'Atelier.

**Sur les prompts :** à un modèle qui reçoit une liste de pourcentages et
pour consigne "nomme le point de fuite prioritaire", il reste toujours un
maximum à nommer, même sur trois visiteurs. **La retenue ne s'obtient pas
en la demandant, elle s'obtient en calculant le verdict AVANT** et en le
lui donnant comme non négociable.

**Deux phrases obligatoires partout où on montre un funnel :**
- perdre du monde est NORMAL et SAIN, ce sont d'abord les visiteurs non
  qualifiés, aucun quiz ne vise 100% de complétion (sinon chaque départ
  se lit comme une faute et la créatrice réécrit un quiz qui va bien) ;
- une seule modification à la fois, puis 20 à 30 nouvelles réponses avant
  de juger.

**Et le partage n'est pas un levier universel.** Sur un sujet intime ou
stigmatisant (santé, santé mentale, neuroatypie, argent, poids,
sexualité, famille), partager publiquement revient à s'exposer : un taux
de partage bas n'y est ni un défaut du quiz ni un cadeau trop faible.
Jocelyne l'avait diagnostiqué seule, les prompts le disent maintenant.

Le module quiz de Tiquiz est jumeau : toute correction ici se porte
là-bas.

## Le mot "quiz" n'est plus interdit comme adresse (retour Béné 4 août 2026)

"On ne peut pas blacklister le mot 'quiz' parce que beaucoup vont
l'utiliser. C'est LOGIQUE !" Elle a raison, et la liste en interdisait une
trentaine du même genre : contents, pages, dashboard, leads, settings,
support, login...

Ils n'étaient pas là pour la protéger. `RESERVED_PUBLIC_SLUGS` servait
DEUX choses à la fois : "ce slug masquerait une de nos pages" et "ce
chemin ne doit pas être servi sur le domaine d'une cliente". Le second est
déjà réglé, et mieux, par la porte du middleware : sur un domaine perso,
tout ce qui n'est pas explicitement autorisé répond 404.

Restait un vrai risque : `example.com/quiz` était résolu par le routeur
Next, et **une route statique gagne toujours contre une route
dynamique**. D'où la correction : le middleware RÉÉCRIT le slug nu vers
`/s/<slug>` (`app/s/[publicSlug]/page.tsx`), un chemin qui n'est pas une
page de l'app. Plus d'arbitrage à rendre, donc plus de mots à interdire.
L'URL vue par le visiteur ne change pas. L'unicité entre les 3 types de
contenu public (quizzes, popquizzes, hosted_pages) est intacte : elle vit
dans `lib/publicSlugServer.ts` et n'a rien à voir avec les mots réservés.

`routeTenantPath()` (`lib/publicSlug.ts`) est la fonction pure qui décide
`pass | slug | block`, testée par `tests/logic/tenant-routing.test.mts`
sur les deux moitiés : tous les mots naturels sont rendus, et aucune de
nos pages ne fuite. Il ne reste réservé que `api` ; `_next`,
`.well-known` et les fichiers à extension sont déjà impossibles puisque
`sanitizeSlug` n'accepte que `[a-z0-9-]`.

**INTERDIT :** rallonger `RESERVED_PUBLIC_SLUGS` avec un nom de route de
l'app. Si une nouvelle page apparaît, elle est déjà protégée par la porte
du middleware.
