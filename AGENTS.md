# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## ÉTAT DU SYSTÈME au 30 août 2026 (à lire en premier)

Ce fichier est CHRONOLOGIQUE : il raconte des pannes, dans l'ordre où
elles sont arrivées. C'est utile pour comprendre POURQUOI une règle
existe, et inutile pour savoir où on en est. Ce bloc là répond à la
deuxième question.

### Les trois applications, et les six domaines

| Domaine | Sert | Dépôt | Port |
|---|---|---|---|
| `app.tipote.com` | l'app Tipote, le centre d'aide | tipote-app | 3000 |
| `affiliate.tipote.com` | **l'espace affilié** | tipote-app | 3000 |
| `tiquiz.fr` | vente Tiquiz, bon de commande, blog | tiquiz | 3001 |
| `quiz.tipote.com` | l'app Tiquiz | tiquiz | 3001 |
| `atelierduquiz.fr` | vente de l'Atelier du Quiz | formaquiz | 3002 |
| `quizing.tipote.com` | l'app de l'Atelier (la formation) | formaquiz | 3002 |

`www.tipote.fr` reste chez Systeme.io : ce sont les anciens tunnels, ils
fonctionnent encore et **ne commissionnent plus** (voir plus bas).

### CE DÉPÔT EST CELUI QUI PAIE

C'est la chose la plus importante à savoir avant d'y toucher.

- **Le registre d'affiliés, les taux, les commissions, les lots de
  versement et les autofactures vivent ICI, et nulle part ailleurs.**
  Tiquiz et l'Atelier remontent leurs ventes (`POST /api/affiliate/
  attribute-sale`) et AFFICHENT des chiffres qu'ils ne calculent pas.
- **L'Atelier n'a plus de registre propre depuis le 26 août.** Il envoie
  `source_app: "atelier"`, et c'est ce champ qui fixe les 70 %. Son
  ancien registre (`profiles.sio_affiliate_id` dans SA base) n'est plus
  qu'un repli pour les élèves affiliés là-bas et pas ici.
- **Les valeurs du barème existent en DOUBLE**, parce que
  `tiquiz.fr/affiliation` doit les afficher sans pouvoir importer ce
  dépôt. Les deux côtés sont figés par un test qui nomme l'autre :
  `tests/logic/bareme-affiliation-source.test.mts` ici,
  `tests/logic/bareme-affiliation-miroir.test.mts` chez Tiquiz.

### Le programme d'affiliation, en six lignes

- **40 % sur Tiquiz, à CHAQUE échéance** tant que la personne reste
  abonnée. 70 % sur l'Atelier (achat unique).
- **Le taux monte avec les filleuls** : 1 filleul 45 %, 11 50 %, ...
  jusqu'à 70 % à 51. OU une remise sur son abonnement, par marches de
  10 filleuls jusqu'à la gratuité à 100. **Les deux ne se cumulent pas.**
- **Cookie 1 an. Versement à J+30, minimum 20 €, entre le 10 et le 13.**
- Une inscription gratuite par son lien le rattache **à vie**, et le
  PREMIER rattachement gagne.
- Remboursement ou impayé : la commission de cette échéance est annulée.
  Affilié `banned` : rien n'est dû. Affilié `paused` : ce qui est gagné
  reste payé.
- **Nos liens portent `?ref=`, jamais `?sa=`.** `sa` reste la clé
  interne des commissions ; il ne sort plus dans une URL. Conséquence
  décisive : un lien qui atterrit chez Systeme.io ne paie plus personne,
  et c'est pour ça que les 8 destinations sont sur nos domaines.

### Avant CHAQUE push, sans qu'on le demande

```bash
npm run test:logic     # runner natif, aucune dependance
npx tsc --noEmit       # exit 0 obligatoire
```

Et selon ce qui a été touché : `npm run check:migrations-pending`
(après un déploiement), `npm run check:supabase-keys` (un doute sur un
`.env`). Le filet visuel du module quiz vit dans le dépôt TIQUIZ : un
changement de design porté ici se valide là-bas.

### Les cinq pièges qui ont coûté le plus cher

1. **Une logique enfermée dans un composant React n'est pas testable,
   donc elle n'est pas testée.** Toute règle métier sort dans `lib/` en
   fonction pure. Même chose pour un module qui importe `supabaseAdmin` :
   aucun test ne peut le charger, donc les décisions n'y vivent pas.
2. **Quand un cas a deux mécaniques, la mécanique est un PARAMÈTRE
   OBLIGATOIRE** (`mode`, `base`, `quand`, `choix`, `maintenant`), jamais
   devinée. `base` a coûté 1,13 € de trop par vente pendant des mois.
3. **Un `??` protège du MANQUANT, jamais du FAUX.**
4. **L'espace affilié est un SOUS-DOMAINE** : `usePathname()` n'y rend
   pas `/affiliate`. Gater sur le HOST, jamais sur le pathname.
5. **Un garde-fou qui ne protège qu'un des deux jumeaux ne protège
   personne.** Les modules quiz de Tipote et Tiquiz sont jumeaux.

### Où chercher le reste

| Question | Fichier |
|---|---|
| le programme d'affiliation en détail | `PLAN_AFFILIATION.md` |
| ce que le produit promet | `PRODUCT_BRIEF.md` |
| comment ça marche, écran par écran | `CAHIER_DES_CHARGES.md` |
| les bugs récurrents et les conventions | `CLAUDE_PITFALLS.md` |
| sur quelle branche pousser | `CLAUDE_WORKFLOW.md` |
| ce qui reste à reprendre à Systeme.io | `ROADMAP_SORTIE_SIO.md` (dépôt tiquiz) |

**Béné ne lit pas les dossiers.** Tout ce qu'elle doit faire ou copier
se met dans le message final, jamais dans un fichier qu'on lui demande
d'ouvrir. Une commande à la fois, aucun paramètre à remplacer.

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

| Repo | Fichier sur prod | En dev local |
|---|---|---|
| `~/tipote-app/` | **`.env`** | `.env.local` |
| `~/tiquiz-app/` | **`.env`** | `.env.local` |

**Et le `.env` se lit DANS UNE PARENTHÈSE, jamais dans le shell nu.**
Cette page recommandait l'inverse jusqu'au 22 août, et ça a mis les deux
apps par terre (section "Un shell qui garde le `.env` de l'autre app").

```bash
# Bon : la parenthèse est un sous-shell, tout meurt avec elle.
( set -a; . ~/tipote-app/.env; set +a; curl -sS -H "X-Cron-Secret: $CRON_SECRET" https://app.tipote.com/api/cron/... )

# Juste vérifier qu'une variable existe, sans l'afficher :
grep -c '^CRON_SECRET=' ~/tipote-app/.env      # 1 = présente
```

**INTERDIT : `set -a; . .env; set +a` sans parenthèses**, et à plus forte
raison dans un terminal qui servira ensuite à un `npm run build` ou à un
`pm2 restart --update-env`.

## Workflow Git — RÈGLE ABSOLUE

**Avant TOUT push, lire `CLAUDE_WORKFLOW.md`.**

Résumé : je ne pousse JAMAIS sur `main`. Je pousse uniquement sur la
branche de travail **indiquée dans la consigne de session**. Ce nom
CHANGE à chaque session : ne jamais recopier celui trouvé dans un
fichier, il y est forcément périmé. Béné est seule maître de `main`
côté GitHub.

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
npm run test:visual    # 99/99 côté Tiquiz, uniquement si le design/UX bouge
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

## Alignement : trois étages, et le plus fort doit pouvoir se taire (4 août 2026)

Béné : "tu empiles les trucs, ça devient n'importe quoi l'éditeur. Il faut
laisser le choix de TOUT aligner / centrer OU de modifier : une question
où les réponses sont centrées, la suivante alignée à gauche, ou même une
question en colonnes et une en liste. MAIS faut le faire BIEN."

Le "tu empiles" est le diagnostic exact. Il n'y avait qu'un étage assumé
(le réglage du quiz) et un étage CLANDESTIN : l'alignement écrit dans le
texte riche, qui gagne pour toujours dès qu'on a cliqué une fois sur un
bouton d'alignement. Jocelyne s'est retrouvée avec un quiz "centré" dont
elle réalignait les champs un par un, sans pouvoir revenir en arrière
autrement qu'en les reprenant tous.

**Règle : `lib/quiz/questionLayout.ts`, trois étages, du plus fort au plus
faible.**

1. le champ : l'alignement posé à la main dans le texte riche ;
2. la question : `quiz_questions.config.align` (nouveau) ;
3. le quiz : `question_layout`.

`"inherit"` n'est PAS une valeur d'affichage, c'est "je ne me prononce
pas", et c'est le défaut de tout ce qui existe. Aucun quiz en ligne ne
bouge. Pas de migration : `config` est déjà du JSONB.

**Et le retour en arrière doit être aussi facile que l'aller.**
`clearRichTextAlign()` + le bouton "Tout réaligner sur ce réglage"
retirent les exceptions des questions ET les alignements écrits dans les
champs (en conservant gras, couleurs, tailles). Sans lui, "tout centrer"
ne centrerait rien du tout sur un quiz déjà bricolé : c'est exactement ce
que Jocelyne a vécu, et c'est ce qui permet d'appliquer le réglage à un
quiz DÉJÀ EN LIGNE sans le refaire.

La disposition des réponses suit le même modèle
(`config.answer_layout`, déjà lu par le viewer depuis juillet).

**Endroits à respecter :** `PublicQuizClient.tsx` (écran de question),
`QuizDetailClient.tsx` (aperçu + contrôles). L'aperçu appelle
`resolveQuestionAlign`, jamais un ternaire recopié : sixième fois que ce
défaut sort. Test : `tests/logic/question-layout.test.mts`.

## L'image d'une réponse garde SON format (retour Béné 4 août 2026)

"Adapte la place de l'image au format de la photo, là elles sont
tronquées dans les réponses et c'est pourri."

Les vignettes étaient en `aspect-video object-cover` : la boîte imposait
son 16/9 et recadrait la photo dedans, coupant le haut des titres.

**La règle existait déjà**, écrite en tête de `PublicQuizClient` : "w-full
h-auto par défaut, jamais de `max-h-*` / `object-cover`". Elle était
contredite soixante lignes plus bas, à QUATRE endroits (les deux branches
du viewer, les deux aperçus d'éditeur). **Une règle écrite en commentaire
n'est pas une règle** : elle vit maintenant dans
`lib/quiz/answerImage.ts`, et les quatre appellent `answerImageRender()`.

Corollaire visuel : deux photos de formats différents donnent deux cartes
de hauteurs différentes. C'est voulu. La grille porte donc `items-start`
(`answerImageGridClass`), sinon la carte la plus courte s'étire.

Le filet de captures ne pouvait pas le voir : la fixture `/visual-test`
n'a aucune réponse illustrée. À ajouter à la matrice au prochain passage.

## Ton process de déploiement, et ce qu'il implique pour moi (4 août 2026)

Béné : "c'est mon process, et je ne le changerai pas."

**Ce que TU fais, pour chaque app :**

```bash
# sur ta machine
cd C:\Users\hello\Desktop\tipote
git fetch origin
git pull origin main
git status
git add .
git commit -m "claude todo 4 aout 4"
git push origin main

# sur le serveur
cd /home/tipote/tipote-app
git stash
git pull origin main
npm ci
npm run build && pm2 restart tipote-prod --update-env
```

Tu prends ma branche, tu copies le code dans ton dossier local, tu pousses
sur `main`, puis le serveur tire `main`. `main` est donc la branche de
PROD, et je n'y touche jamais : je pousse sur ma branche, tu fais le
reste.

**Ce que ça implique pour moi, et c'est le point à ne pas oublier :**

- **Les fichiers SUPPRIMÉS, et EUX SEULS, se signalent** (correction
  Béné, 22 août 2026 : "bien sûr qu'il le voit ! C'est les fichiers à
  supprimer qu'il faut me signaler"). Son copier-coller emporte très bien
  les fichiers nouveaux ; ce qu'il ne fait pas, c'est retirer ce qui a
  disparu, donc un fichier supprimé survit en prod et continue d'y
  tourner. Lister les nouveaux fichiers à chaque envoi, c'est du bruit
  qu'elle doit trier pour rien.
  -> Message final : la liste des SUPPRESSIONS, avec leur chemin, et
  rien si la liste est vide.
- Sur le serveur, un `git pull` peut afficher **"Already up to date"**
  alors que le fetch vient de télécharger des commits : c'est normal,
  `main` est à jour même quand `origin/claude/...` bouge. Ce n'est PAS un
  signe que le déploiement a raté.
- `npm ci` réinstalle depuis `package-lock.json` : toute nouvelle
  dépendance doit être committée AVEC son lock, sinon le build casse en
  prod et pas chez toi.

## Voir l'écran d'une cliente au lieu de la déranger (4 août 2026)

Jocelyne signalait un problème qu'aucun écran ne reproduisait de notre
côté. On a diagnostiqué à l'aveugle, on lui a fait faire une manip qui
n'a rien donné, et il a fallu quatre allers-retours pour comprendre que
son Atelier était relié au mauvais compte. Voir SON écran aurait tranché
en dix secondes.

```bash
cd /home/tipote/tipote-app
node scripts/login-link.mjs adresse@de-la-cliente.fr
```

Le script affiche un lien de connexion à usage unique dans le terminal.
Il **n'envoie aucun email** (c'est l'app qui poste le message dans le flux
normal, pas la génération du lien), et il ne touche ni au mot de passe ni
à la session en cours. Il existe dans les TROIS repos.

**Trois règles, réimprimées à chaque exécution :** fenêtre privée (sinon
on remplace sa propre session par la sienne sans s'en rendre compte), on
regarde sans rien modifier, on ferme en partant.

**Deux choix techniques à ne pas défaire.** Le script n'a AUCUNE
dépendance (`createClient` de supabase-js monte un client temps réel qui
exige un WebSocket natif, absent de Node 20 : ça plantait avant de rien
faire). Et il lit le `.env` lui-même, en ne cherchant QUE les deux clés
dont il a besoin : `set -a; . .env; set +a` demande à bash d'interpréter
tout le fichier, et une clé d'API sans rapport contenant des caractères
spéciaux faisait échouer le chargement entier.
## Une librairie qui change d'API, et un `as unknown as` qui l'a caché (drame François Xavier, 7 août 2026)

"Quand j'importe le quiz au format pdf, j'ai ce message d'erreur :
Erreur lors de la lecture du fichier : r is not a function."

**L'import PDF n'avait jamais marché.** Pas "plus" : jamais. Reproduit le
jour même, hors bundle : `pdfParse is not a function`.

`pdf-parse` v1 s'appelait comme une fonction. La v2, installée le 27
juillet, est une réécriture : elle exporte une CLASSE `PDFParse` et n'a
plus de default export du tout. Le code appelait donc un objet. En prod
le nom de la variable est minifié, d'où le `r` : un message qui ressemble
à un problème de fichier alors qu'il décrit notre code.

**Et le compilateur le savait.** `tsc` répond "Module has no default
export" sur `import pdfParse from "pdf-parse"` : les types livrés par la
v2 sont justes et ils gagnent sur `@types/pdf-parse` (resté en v1, retiré
depuis). Le bug a survécu parce que le code forçait le silence :

```ts
const pdfParse = (m as unknown as { default?: ... }).default ?? (m as unknown as (b: Buffer) => ...)
```

**Règle : pas de `as unknown as` sur un module externe.** Une double
assertion ne convertit rien, elle interdit la vérification. Garde-fou :
`tests/logic/pdf-import.test.mts`.

**Les deux apps étaient cassées, différemment.** Tiquiz en v2 (API
changée), Tipote resté en v1 dont l'`index.js` lit un fichier de test au
chargement (`ENOENT ./test/data/05-versions-space.pdf`), le bug connu de
cette version sous bundler. Deux repos jumeaux, deux versions
divergentes, donc deux pannes qu'un seul correctif n'aurait pas couvertes.
Les deux sont maintenant en `^2.4.5`, avec la MÊME implémentation.

**Le vert local ne prouvait rien, et c'est le vrai piège.** Test logique
vert, `tsc` vert, `next build` vert : l'import PDF échouait quand même une
fois compilé. `pdf-parse` charge son worker par un import DYNAMIQUE
construit à l'exécution, que Next ne voit pas passer :

```
Setting up fake worker failed: Cannot find module '.../pdf.worker.mjs'
```

D'où DEUX réglages dans `next.config.ts`, tous les deux nécessaires :
- `serverExternalPackages: ["pdf-parse"]` : sinon le worker est cherché
  dans les chunks au lieu de node_modules ;
- `outputFileTracingIncludes` sur `pdfjs-dist/legacy/build/pdf.worker.mjs`
  : sinon le fichier n'est pas copié dans la sortie standalone.

Vérifié en envoyant un VRAI PDF au serveur de production des deux apps.
Le test logique fige ces deux lignes, parce qu'elles ne servent à rien en
local et que rien d'autre ne dirait qu'on les a retirées.

**Et une exception n'est jamais la phrase que lit la cliente.** Le client
affichait `error.message` tel quel. François Xavier ne pouvait rien en
faire, et nous non plus : le vrai symptôme était noyé. Le serveur renvoie
maintenant une RAISON (`lib/quiz/importFailure.ts`), l'écran la traduit
dans les 7 langues, et les cas qui appellent une action ont leur propre
phrase : PDF scanné, PDF protégé par mot de passe, PDF abîmé. Même règle
que la suppression d'un quiz (3 août) : le serveur dit ce qui s'est
passé, l'interface dit comment le dire.

## Partager SON résultat, pas le quiz (retour client, 7 août 2026)

"Quand je partage le résultat du quiz, le lien pointe vers la page de
bienvenue du quiz et non vers le résultat." Le texte qu'il obtenait :

```
J'ai identifié mon profil de stress dominant. Fais le test pour découvrir
le tien. https://quiz.tipote.com/q/type-stress-biologique?rp=aa87b13d-...
```

**Le lien n'était pas le problème**, et c'est le point à ne pas
inverser : il porte bien `?rp=<profil>`, et il DOIT mener au quiz. Béné :
"et pour chacun : lien vers le quiz." Celui qui reçoit le lien vient
passer le test, pas lire le résultat de quelqu'un d'autre.

Ce qui manquait, c'est que **le TEXTE ne parlait pas du résultat obtenu**.
Le visiteur partageait mot pour mot la phrase d'avant de l'avoir : de son
point de vue, il partageait donc "le quiz".

**Et c'est encore une moitié de décision.** Le serveur faisait déjà le bon
travail depuis le 28 juillet : avec `?rp=`, `og:title` vaut "J'ai
obtenu : <profil>" et `og:image` porte l'image du profil. Le viewer, lui,
appelait `buildShareText` (le texte du QUIZ) dans les deux cas. **Deux
endroits calculaient la même chose, un seul avait été corrigé** : c'est
mot pour mot ce que l'en-tête de `lib/quiz/shareText.ts` racontait déjà
pour le HTML brut, dans ce même fichier.

**La règle attendue, en deux lignes :**

| Moment | Texte | Aperçu | Lien |
|---|---|---|---|
| avant le résultat | le quiz | image du quiz | le quiz |
| après le résultat | LE PROFIL OBTENU | image du profil | le quiz |

**`buildResultShareText()` (`lib/quiz/shareText.ts`) décide**, et la
créatrice garde la main : un `{resultat}` dans son message de partage y
place le nom du profil elle-même (`{résultat}`, `{result}`, `{profil}`
acceptés aussi, elle écrit dans son élan). Sans variable, la phrase par
défaut nomme le profil, dans les 8 langues du viewer. Sans profil connu,
on retombe sur le texte du quiz : un partage sans texte serait pire.

**LA MÉCANIQUE EST UN PARAMÈTRE** (`getShareData(scope)`), jamais déduite
de la présence d'un `urlOverride`. Déduire marcherait aujourd'hui et
casserait au premier écran qui partage une autre URL : c'est la leçon des
contrôles "profil" appliqués à un quiz scoré.

**Et le texte et le lien sortent de la MÊME fonction** (`resultShare()`,
qui rend `{ scope, url }`). Le réglage `share_result_page` gouverne les
deux : décoché, le lien perd son `?rp=`, donc l'aperçu redevient celui du
quiz, et un texte qui annoncerait quand même "j'ai obtenu X" contredirait
l'image juste en dessous. Deux moitiés d'une même décision calculées
séparément finissent toujours par se contredire.

**L'écran de fin de SONDAGE reste en `"quiz"`** : il n'y a pas de profil
à nommer, c'est voulu.

Test : `tests/logic/result-share.test.mts`. Le module quiz de Tipote est
jumeau : la correction y vit aussi.

## Un shell qui garde le `.env` de l'autre app (panne 22 août 2026)

Les deux apps ont servi la base Supabase de l'AUTRE, deux fois dans la
même journée, pour deux raisons différentes. Une journée entière perdue.

### Le matin : le BUILD gravait les valeurs du terminal

Tiquiz affichait les quiz de Tipote et répondait `column
profiles.user_id does not exist` ; Tipote répondait `Could not find the
table 'public.content_item' in the schema cache`. Les liens de connexion
envoyés depuis `quiz.tipote.com` renvoyaient sur `app.tipote.com`.

Les quatre faits qui ont tranché, et c'est le bon réflexe de diagnostic
(comparer le FICHIER et le BUILD, jamais le fichier seul) :

```
== tiquiz-app ==  .env: ottpciabnrclwgdlwjdt   build: mmwyfqfbfkvcnrkyvagv
== tipote-app ==  .env: mmwyfqfbfkvcnrkyvagv   build: ottpciabnrclwgdlwjdt
```

**Les deux `.env` étaient justes. Les deux builds étaient croisés.**

Un `set -a; . .env; set +a` avait été lancé dans le terminal, pour les
DEUX apps, dans la même session, juste pour lire une variable. `set -a`
exporte tout le fichier dans le shell. Or Next lit `process.env` **avant**
`.env` (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
: "stopping once the variable is found"), et un `NEXT_PUBLIC_*` est gravé
dans le code au moment du `next build`, avec "the value from the
environment in which you run `next build`".

Les bases n'ont jamais été fusionnées : chacune est restée intacte, ce
sont les pointeurs qui étaient croisés.

### Le soir : la même panne, par une autre porte

Béné : "pourquoi j'ai tous mes contenus mais pas mes clients dans
Tipote ?" La question contenait le diagnostic.

Le garde-fou du matin a bien REFUSÉ de construire. Mais la ligne suivante
du déploiement, `pm2 restart --update-env`, a poussé ce terminal pollué
DANS le processus. Et comme `server.js` fait `process.chdir(__dirname)`,
le serveur standalone cherche ses fichiers d'environnement dans
`.next/standalone/`, où personne ne copiait rien : l'app ne vivait donc
QUE sur ce que PM2 gardait en mémoire, insensible à tous les rebuilds.

Le partage des symptômes disait exactement où regarder :
- les CONTENUS s'affichaient (clé anon, GRAVÉE dans le build, donc juste) ;
- les CLIENTS avaient disparu (clé de service, lue dans le PROCESSUS,
  donc celle de l'autre app).

**Un garde-fou qui protège le build ne protège pas le redémarrage.**

### Les garde-fous, et pourquoi il en faut plusieurs

Chacun couvre un MOMENT différent. En zapper un rouvre la porte par
laquelle la panne est déjà passée.

| Quand | Quoi | Ce qu'il attrape |
|---|---|---|
| avant le build | `prebuild` -> `scripts/check-build-env.mjs` | le terminal contredit le `.env` du repo : le build est REFUSÉ |
| après le build | `postbuild` -> copie `.env*` dans `.next/standalone/` en 600 | le serveur standalone a enfin une source de vérité, versionnée avec le déploiement |
| au démarrage | `instrumentation.ts` -> `lib/env/supabaseProject.ts` | la clé ne parle pas du même projet que l'URL : ça CRIE dans `pm2 logs`, à chaque démarrage |
| à la demande | `npm run check:supabase-keys` | compare le FICHIER, le TERMINAL, le BUILD et le PROCESSUS (`/proc/<pid>/environ`) |

**Le postbuild ne dispense JAMAIS d'`instrumentation.ts`** : `process.env`
passe toujours devant les fichiers, donc une valeur fausse héritée de PM2
gagne encore. Ce qui change, c'est qu'une variable ABSENTE du processus a
désormais une source fiable, versionnée avec le déploiement, au lieu de
dépendre de la mémoire de PM2.

Aucun de ces contrôles n'imprime la valeur d'une clé qui ressemble à un
secret (`estSecret`) : ces rapports finissent dans un terminal, un
historique, parfois un copier-coller. Ils disent "les deux valeurs
diffèrent" et s'arrêtent là. Les URL et les `NEXT_PUBLIC_*` restent
lisibles, ce sont elles qui rendent le diagnostic évident.

### Un journal se LIT, il ne se déduit pas

L'agent a mis une heure à trouver, en théorisant. Deux sources donnaient
la réponse en une commande : le corps de la réponse HTTP (onglet Réseau)
et `/proc/<pid>/environ`. Il a lancé quatre hypothèses avant d'aller les
regarder, et fait accuser une clé anon parfaitement bonne pendant trois
échanges parce que son test tapait sur un point d'entrée que cette clé
n'a pas le droit de lire.

**Un test qui ne distingue pas ce qu'il est censé distinguer est pire
qu'un test absent.** `/rest/v1/` répond 200 à n'importe quelle clé valide
du projet, quel que soit son rôle, et 401 à une clé anon valide.

| Ce qu'on veut savoir | Où taper |
|---|---|
| une clé anon est-elle bonne | `/auth/v1/settings` |
| une clé de service est-elle bonne | `/auth/v1/admin/users?page=1&per_page=1` |
| ce qu'une clé EST | décoder son `role` (`lireCleSupabase`) |

Et **un 401 peut vouloir dire "clé vide"** : mesurer la longueur de ce
qu'on a extrait avant de conclure quoi que ce soit.

### Un garde-fou non fusionné ne protège personne (23 août 2026)

Les trois derniers garde-fous ont été écrits le 22 au soir sur une branche
de travail, et ne sont jamais arrivés dans `main`. Pendant 24 heures, cette
page les décrivait comme actifs et le serveur ne les avait pas : la cause
exacte de la panne du soir était toujours là, derrière une doc qui disait
le contraire.

**Règle : quand une session écrit un garde-fou, la dernière étape n'est
pas de l'écrire, c'est de vérifier qu'il est arrivé.**

```bash
git log origin/main -1 --oneline -- instrumentation.ts scripts/check-supabase-keys.mjs
```

Aucune ligne = il n'est pas déployé, quoi qu'en dise la doc.

### Et la leçon qui dépasse cette panne

Une commande donnée à Béné doit être sûre même mal replacée.

- `( set -a; . .env; set +a; ... )` : la parenthèse est un sous-shell,
  tout meurt avec elle. **INTERDIT sans les parenthèses.** Une variable
  exportée dans un terminal survit à tout ce qu'on y tapera ensuite.
- `npm run build && pm2 restart <app> --update-env` : le `&&` n'est pas
  cosmétique. Sans lui, un build REFUSÉ se déployait quand même, et c'est
  exactement ce qui a mis Tipote par terre. Ne jamais donner ces deux
  commandes sur deux lignes séparées.

## On ne vend pas qu'à des femmes (Béné, 23 puis 24 août 2026)

Le 23, sur la page de remerciement du bon de commande de Tiquiz : "'Et te
voilà dans Tiquiz, prête à créer ton premier quiz' : c'est genré
automatiquement ou tu pars du principe que je ne vends qu'à des femmes ??
Ce qui n'est PAS le cas évidemment."

Le 24, en lisant ma propre phrase "toute affiliée a un code" : "arrête de
penser que je n'ai que des users féminines putain !!! d'où ça vient cette
merde ??"

Les prénoms de ces dépôts le disent tout seuls : François Xavier, Éric,
Maurice, Ivan. Un accord au féminin dans un message adressé au lecteur,
c'est un message qui dit "ce produit n'est pas pour toi".

**Règle : on tourne la phrase autrement.** Ni accord au féminin, ni point
médian, ni double forme. "Tu n'es pas connectée" devient "Ta session
n'est pas active", "Bienvenido/a" devient "Te damos la bienvenida",
"Prêt·e à booster ton business" devient "On booste ton business".
Une phrase tournée marche dans les 7 langues ; le point médian n'existe
qu'en français, et "Lista/o" ne fait que lister les deux genres au lieu
de n'en imposer aucun.

**Ce qui a été corrigé ici le 24 :** le retour de connexion
(`callbackPage.errNotAuth`, féminin en français, masculin par défaut dans
les 5 autres), l'accueil espagnol et italien (`Bienvenido/a`,
`Benvenuto/a`) dans `messages/` ET dans l'espace affilié, la rotation du
tableau de bord (`Prêt·e à booster`), l'invite d'affiliation
(`inscrit·e`), et les mentions `un·e comptable` en 4 langues.

**Le filet vit maintenant DANS LES DEUX DÉPÔTS**
(`tests/logic/genre-neutre.test.mts`). Il n'était que côté Tiquiz, et
Tipote portait exactement les mêmes fautes : un garde-fou qui ne protège
qu'un des deux jumeaux ne protège personne (leçon des deux versions
divergentes de `pdf-parse`, 7 août). Ici il couvre les 7 fichiers de
`messages/` ET les 6 dictionnaires de `app/affiliate/i18n/`.

Il ne regarde que l'ADRESSE DIRECTE au lecteur : un accord avec un nom
féminin ("analyse prête", "vidéo prête", "la campagne prête à envoyer")
est correct et ne doit pas le faire rougir. Un test qui crie pour rien
finit désactivé. **Exception assumée :** l'aide de l'éditeur qui explique
la variante selon le genre DOIT montrer un exemple ("cher·e"), sinon la
fonctionnalité ne s'explique pas.

## Un lien légal ne fait JAMAIS quitter la page (Béné, 24 août 2026)

"Pour toutes les pages créées dans Tiquiz et Tipote : un lien vers la
politique de confi etc. doit s'ouvrir dans un nouvel onglet et JAMAIS
faire quitter la page à un visiteur !! D'autant que sur le quiz, la
personne doit tout recommencer suivant les situations... c'est infernal
et le genre de choses pratiques auxquelles tu dois penser. Je ne sais pas
quand ça a sauté mais en tous cas je l'ai demandé et ça a été codé, puis
retiré."

**Ça n'avait pas sauté : ça n'avait jamais été posé** pour les liens
écrits par les créatrices. Le code DISAIT le faire. `sanitizeRichText`
portait `ADD_ATTR: ["target"]` sous le commentaire "Force links to open
safely", et **`ADD_ATTR` ne fait qu'AUTORISER l'attribut à survivre au
nettoyage : il n'en ajoute aucun.** Un lien posé dans n'importe quel
champ riche (consentement, page de résultat, bouton, pied de page)
sortait donc sans `target`, donc dans le même onglet.

Encore une règle écrite en commentaire, donc pas une règle (comme le
`w-full h-auto` des images de réponse, 4 août).

**Règle, et elle tient en deux moitiés :**

1. **Le sanitizer pose le `target`** (HOOK 3 de `lib/richText.ts`,
   `afterSanitizeAttributes`), sur tout `<a>` qui a un `href`, avec
   `rel="noopener noreferrer"` (sans `noopener`, la page ouverte garde
   une poignée sur la nôtre via `window.opener`). C'est là et pas dans
   les composants : un lien peut venir de n'importe quel champ de
   n'importe quel écran, et une règle recopiée dans chaque composant
   finit toujours par en oublier un.
2. **Nos liens légaux écrits en dur** utilisent `<a target="_blank">` et
   jamais `<Link>` de Next, qui fait une navigation INTERNE, c'est à dire
   exactement ce qu'on ne veut pas.

**Endroits à respecter :** `components/quiz/PublicQuizClient.tsx` (les 3
branches de `ConsentText`), `components/LoginForm.tsx` (adresse et mot de
passe déjà saisis), `components/support/SupportFooter.tsx` (un message de
support à moitié écrit).

**Trouvé au passage :** les deux liens du pied de page du centre d'aide
pointaient sur `/legal/conditions-utilisation` et
`/legal/politique-confidentialite`, absents de `VALID_SLUGS` (`cgu`,
`cgv`, `privacy`, `mentions`, `cookies`). La route dynamique répondait
`notFound()` : un 404 depuis la page où on demande de faire confiance.

**Ce qui n'est PAS visé :** la navigation ENTRE pages légales (le
sommaire de `/legal`, un renvoi d'un document à l'autre). On n'y perd
rien, et forcer un onglet à chaque clic y serait juste pénible.

Garde-fou : `tests/logic/liens-legaux.test.mts`, qui tient les deux
moitiés (il SANITISE vraiment, il ne relit pas la source) et qui exige
que les écrans surveillés portent encore des liens légaux : un test qui
ne peut plus échouer ment. Le module quiz de Tiquiz est jumeau : le même
test y vit.

## Le centre d'aide est la PORTE, la file vit dans Tiquiz (23 août 2026)

Béné : "s'il n'a pas reçu ses accès, comment il accède à
`quiz.tipote.com/support` ? Pas con hein ??? Je veux un service de
ticketing dans le centre d'aide commun à toutes les app, essentiellement
pour Tiquiz et L'Atelier qui sont vendus en ce moment, avec ticket relié
à la fiche client si elle existe."

**Il y avait DEUX files de tickets.** `support_tickets` ici depuis le 12
mars (les escalades du robot d'aide) et `support_tickets` dans Tiquiz
depuis le 22 août (son formulaire). Deux bases, deux écrans d'admin. Une
demande pouvait attendre des jours dans celle qu'on ne regardait pas, et
aucune des deux ne connaissait L'Atelier.

**Règle : la porte est ici, la file est là-bas.**

Le centre d'aide (`app.tipote.com/support`) porte les 57 articles, le
robot ET un formulaire de contact (7 langues, sélecteur de produit,
`?produit=` pré-sélectionne). `POST /api/support/ticket` ne écrit plus en
local : il RELAIE vers `quiz.tipote.com/api/partner/support-ticket` avec
`x-partner-secret`.

La file vit dans Tiquiz parce que le ticket doit s'afficher sur la FICHE
CLIENT, à côté des accès, des paiements et du statut Atelier, et que
c'est l'admin de Tiquiz qui porte cette fiche. Une donnée dans une autre
base est une donnée qu'on ne croisera jamais.

**Trois choses à ne pas défaire :**

1. **La limite par IP reste ICI**, sur l'adresse réelle de la personne.
   Le relais part toujours de la même IP serveur : la limite de Tiquiz
   couperait tout le centre d'aide dès la sixième personne de la journée.
2. **Le filet local.** Si Tiquiz ne répond pas, on écrit dans la table
   locale et on crie dans le journal. Elle a vu "envoyé" : la demande
   doit exister quelque part.
3. **Le bandeau de `/admin/support`** dit que la file vivante est dans
   Tiquiz. Sans lui, Béné surveille un écran qui ne bouge plus.

**`PARTNER_SHARED_SECRET` doit être posée sur CE serveur aussi**, avec la
même valeur que côté Tiquiz. Sans elle le relais répond `not_configured`
et tout retombe dans l'ancienne file, en silence pour la cliente mais
avec une ligne rouge dans `pm2 logs`.

`tiquizBaseUrl()` refuse toute adresse locale, comme `resolveAppUrl` : un
`??` ne protège que de la variable absente, jamais de la variable fausse
(drame Véronique, 2 août). Les décisions pures vivent dans
`lib/support/relayRules.ts`, à part de `relayTicket.ts` qui importe
`supabaseAdmin` : un module qui exige des variables au chargement est un
module qu'aucun test ne peut importer.

## Le mois offert ne s'ouvre QUE sur un lien du système courant (23 août 2026)

Béné : "on le met sur l'espace affilié en expliquant que c'est
uniquement avec le système d'affiliation en cours et pas sur les anciens
liens systeme io (qui restent valides mais ne seront plus ceux à
utiliser dans le futur)."

**Le piège : les deux générations de liens portent le MÊME `?sa=`.**
Même forme, même propriétaire. Le `sa` dit QUI est payé, il ne peut pas
dire par quelle génération de lien la personne est venue : le déduire
reviendrait à offrir le mois sur les anciens liens Systeme.io, ce qui
est exactement ce qui est exclu.

**Règle : `buildAffiliateLink()` ajoute `&mo=1`, et c'est le SEUL
endroit qui l'écrit.** Tout ce que l'espace affilié fabrique aujourd'hui
le porte (Promouvoir, `/go/<ref>`, les articles de blog) ; rien de ce
qui a été copié dans Systeme.io ne le portera jamais. Les anciens liens
commissionnent exactement comme avant : c'est le CADEAU qui est réservé,
pas la vente. Le test `affiliate-link.test.mts` interdit une deuxième
écriture du marqueur.

**Sans destination sur le domaine de Tiquiz, le cadeau est mort.** Les
tunnels Systeme.io ne transmettent rien de ce qu'on ajoute à l'URL : leur
page ne nous passe pas la query. D'où le slug `tiquiz_direct`
(`https://tiquiz.fr/`, migration `20260823_affiliate_tiquiz_direct.sql`),
le seul lien par lequel le marqueur peut arriver jusqu'au middleware de
Tiquiz. Les autres destinations restent en place et restent valides.

**La page Promouvoir DOIT porter la note.** Un affilié qui continue de
partager son ancien lien Systeme.io serait payé normalement mais
promettrait un mois que personne ne recevrait : c'est LUI qui passerait
pour un menteur. La carte dit les trois choses (l'argument, la limite
d'un mois par personne, et que ça ne marche qu'avec les liens de cette
page), en 6 langues.

Le lecteur du marqueur vit côté Tiquiz
(`lib/affiliate/moisOffertLien.ts`), qui le range dans un cookie
`httpOnly` dont la VALEUR est l'identifiant. Toute évolution du format
se porte des deux côtés.

## Nos liens portent `?ref=`, plus jamais le `?sa=` de Systeme.io (24 août 2026)

Béné : "je ne veux surtout pas de sa dans les nouveaux liens sinon y'a
forcément un moment où on va merder, trouver autre chose nom de zeus !
Y'a pas que ce système, c'est celui de systeme io c'est tout !!"

Elle a raison, et le mot juste est "le leur". `sa` est l'identifiant que
Systeme.io fabrique pour SES tunnels. Le reprendre dans nos liens
mélangeait deux systèmes qui n'ont pas les mêmes règles, et rendait les
deux générations de liens INDISCERNABLES une fois arrivées chez nous.

**Le système de codes publics existait déjà** (`lib/affiliate/ref.ts`,
`?ref=jocelyne`), il n'était branché nulle part. Il l'est.

| Ce qui vit où | |
|---|---|
| `sa` | la CLÉ INTERNE : commissions, conversions, versements. Tout l'historique est dessus, il ne bouge pas. |
| `ref` | le code PUBLIC : c'est lui, et lui seul, qui sort dans une URL. |

**Trois pièces, les trois obligatoires :**

1. `buildAffiliateLink(locale, path, ref)` écrit `?ref=`. Le paramètre
   est nommé UNE fois (`AFFILIATE_LINK_PARAM`), le test interdit qu'un
   deuxième endroit fabrique un lien public.
2. `assurerRefAffiliee()` (`lib/affiliate/refServer.ts`) : toute
   affiliée a un code, fabriqué au premier écran qui en a besoin si elle
   n'en avait pas. **Le code de repli est DÉTERMINISTE** (dérivé du
   `sa`) : deux onglets ouverts doivent proposer le même, sinon on écrit
   deux codes pour la même personne. Pas de code -> AUCUN lien affiché,
   jamais un lien muet : un lien muet se partage, et chaque partage est
   une vente perdue que personne ne peut plus retrouver.
3. `attributeSale({ ref_hint })` traduit le code en `sa` contre la
   table, **anciens codes compris** (`affiliate_ref_aliases`).
   `sa_hint` reste, pour les anciens liens.

**EFFET DE BORD DÉCISIF : le nom du paramètre dit la génération du
lien.** Un `?ref=` vient d'ici, un `?sa=` vient d'un ancien tunnel
Systeme.io. Le marqueur `mo=1` du 23 août est donc SUPPRIMÉ : le mois
offert s'ouvre sur un `?ref=`, point. Un marqueur en moins, c'est un
endroit en moins où on pouvait l'oublier.

**Les deux valeurs ne se mélangent JAMAIS.** Elles voyagent dans des
champs séparés (`ref`/`sa` dans le corps, `affiliate_code`/
`affiliate_ref` dans les metadata Stripe, 3e et 6e champs du `custom_id`
PayPal). Deviner à la forme marcherait aujourd'hui et casserait le jour
où une affiliée choisit un code qui ressemble à un `sa`.

**Et une prop React ne s'appelle pas `ref`** : React réserve ce nom sur
un composant et le retire des props au lieu de le transmettre. D'où
`refCode`.

## Une destination ajoutée en code n'exige plus de migration

`getAllLinkDestinations()` complète les lignes de la base avec les slugs
du seed qu'elle ne contient PAS ENCORE. Sans ça, chaque nouvelle
destination demandait un `INSERT` à passer à la main : une migration de
plus à ne pas oublier, exactement la mécanique qui a coûté 15 jours de
statistiques en juin.

Ça ne ressuscite rien : l'admin ne SUPPRIME jamais une ligne, il pose
`enabled = false`. Une destination éteinte a donc une ligne, elle n'est
pas "manquante", et le seed ne la recouvre pas. Le test l'exige.

## L'audit du 24 août : ce qui pouvait merder, et qui a été réparé

Béné : "tu me fais un audit complet de tout ce qui pourrait merder aussi
bien dans les abonnements, que les paiements ou l'affiliation ou
ticketing... Je veux un système fiable et stable."

Cinq trous, tous invisibles jusqu'à la production. Garde-fou commun :
`tests/logic/audit-24-aout.test.mts` (ici et côté Tiquiz).

**1. La limite par IP du centre d'aide se désarmait toute seule.**
`compteur.clear()` remettait à zéro le compteur de TOUT LE MONDE dès que
la table dépassait sa taille. Un garde-fou qu'on peut désarmer en le
remplissant n'en est pas un, et celui-ci se désarmait aussi un jour de
trafic normal. On purge ce qui a EXPIRÉ, puis les plus anciennes.

**2. La limite doit rester ICI, et AVANT le relais.** Le relais vers
Tiquiz part toujours de la même IP serveur : la limite de là-bas
couperait tout le centre d'aide dès la sixième personne de la journée.
Le test vérifie l'ORDRE des appels, pas des imports (ceux-ci sont rangés
alphabétiquement en haut du fichier : même piège que le 23 août).

Les quatre autres vivent dans le repo Tiquiz (verrou des webhooks,
remboursement d'échéance, domaines de vente, comparaison de secret) et
sont décrits dans SON `AGENTS.md`.

## L'espace affilié s'inspire de Waalaxy : un lien par canal (24 août 2026)

Béné, en montrant l'espace ambassadeur de Waalaxy : "sers-t'en pour
améliorer l'UX et l'UI de notre design, j'aime beaucoup ce qu'ils font
c'est moderne et ça donne envie."

Ce qu'ils font de mieux : leur page "Mes liens d'affiliation" est un
TABLEAU. Une ligne par lien nommé, avec ses propres clics, ses propres
inscrits, ses propres commissions. "Lien par défaut" 915 clics,
"Upgrade" 96, "Demo" 5 : en un coup d'oeil, l'affiliée sait lequel de
ses canaux travaille.

**La donnée dormait depuis le 19 août.** `affiliate_links`,
`affiliate_clicks.link_id` et `affiliate_conversions.link_id` existent
déjà : la page `/liens` n'ajoute aucune colonne, elle affiche ce qui
était écrit et que personne ne montrait.

**Quatre décisions à ne pas défaire** (`lib/affiliate/mesLiens.ts`, pur
et testé) :

- **le lien du tableau passe par NOTRE redirecteur** (`/go/<code>/...`).
  Un lien qui va droit sur la page de vente commissionne toujours (le
  `?ref=` est propagé) mais ses chiffres restent à zéro POUR TOUJOURS,
  et l'affiliée conclut que son canal ne marche pas ;
- **le meilleur canal en premier.** Trier par date mettrait son plus
  vieux lien en haut et son meilleur canal en bas ;
- **le lien par défaut ne se supprime pas.** Il vit dans des vidéos
  déjà publiées, et un lien mort est une vente perdue pour toujours ;
- **les chiffres du bandeau sont la SOMME du tableau.** Deux chiffres
  calculés séparément finissent toujours par se contredire, et c'est
  celui du haut qu'elle croit.

Et le VIDE parle (titre, phrase, sortie) : un tableau vide sans un mot
se lit "c'est cassé" ou "je n'ai rien à faire ici", et les deux coûtent
une affiliée. Sur mobile, des cartes : un tableau à sept colonnes sur un
téléphone se fait glisser sans jamais voir la colonne qui compte.

## Sortir de Systeme.io : l'état des lieux vit dans le dépôt Tiquiz

Béné, 24 août 2026 : "note où on s'arrête et ce qu'il reste à faire pour
qu'à terme mon système remplace complètement Systeme io pour les ventes
et l'affiliation sauf pour les emails."

C'est **`ROADMAP_SORTIE_SIO.md`, à la racine du dépôt TIQUIZ**, et il n'y
en a qu'un exemplaire : trois copies d'un état des lieux divergeraient en
une semaine.

**Ce qui concerne CE dépôt :** l'affiliation. Trois verrous y sont
décrits, et le deuxième est le plus dur.
1. **Rien ne paie les affiliés chez nous.** `affiliate_commissions` a des
   statuts (`pending / approved / paid`) et une colonne `payout_id`, mais
   aucune table `affiliate_payouts` n'existe et AUCUN code ne fait passer
   une commission d'un statut à l'autre. Tout se passe encore chez
   Systeme.io, et `app/affiliate/paiement/page.tsx` le dit.
2. **`affiliates.sa` est la clé primaire**, et toutes les tables du
   programme y font référence. Tant que c'est vrai, on ne peut pas
   recruter un affilié qui n'a pas de compte Systeme.io.
3. **7 des 8 destinations de `lib/affiliate/linkDestinations.ts` mènent
   à des tunnels Systeme.io.** Leurs pages ne nous transmettent pas la
   query : un `?ref=` posé dessus n'atteint jamais notre bon de commande,
   donc ni notre commissionnement ni le mois offert. Seule
   `tiquiz_direct` arrive chez nous.

## Les liens affiliés atterrissent sur NOS domaines (Béné, 25 août 2026)

"Toutes, d'un bloc." Jusqu'ici 7 destinations sur 8 menaient à des
tunnels Systeme.io, et leurs pages ne nous transmettent RIEN de ce qu'on
ajoute à l'URL : un `?ref=` posé dessus n'atteignait jamais notre bon de
commande, donc ni notre commissionnement ni le mois offert.

**CE QU'ON N'A PAS PU REPRENDRE, ET C'EST LA TROUVAILLE DU JOUR.** Les
pages `tiquiz-mensuel`, `tiquiz-annuel` et compagnie ne sont PAS des
pages de vente : ce sont les BONS DE COMMANDE de Systeme.io. Vérifié en
les capturant le 25 août, elles portent un `<form id="form-checkout">`
sans action, piloté par leur JavaScript. Les répliquer chez nous aurait
donné un formulaire de paiement mort, et on ne l'aurait vu qu'à la
première vente perdue.

Les paliers mènent donc à **NOTRE bon de commande**
(`https://tiquiz.fr/commande/<produit>`), qui vend le même palier,
affiche le même prix (il vient du catalogue) et propose les trois autres
en bas. Le hub et l'Atelier mènent à leurs pages sur nos domaines.

| Destination | Où elle mène | Depuis |
|---|---|---|
| `tiquiz_direct`, `tiquiz_main` | `https://tiquiz.fr/` | 25 août |
| les 4 paliers | `https://tiquiz.fr/commande/<produit>` | 25 août |
| `atelier` | `https://atelierduquiz.fr/` | **26 août** |
| `tiquiz_free` | `https://tiquiz.fr/signup` | **27 août** |

**PLUS AUCUNE EXCEPTION : les 8 destinations sont sur nos domaines.**
Les deux dernières sont tombées les 26 et 27 août, et les deux pour la
même raison de fond, qui est la plus importante de cette section :

**depuis que nos liens portent `?ref=` (24 août), un lien qui atterrit
chez Systeme.io ne paie PLUS PERSONNE.** Leur page ignore ce paramètre,
notre middleware ne voit jamais la requête donc ne pose aucun cookie, et
leur webhook ne sait lire qu'un `sa`. Ce n'était donc plus une exception
qui protégeait quelque chose : c'était un trou.

**`atelier` (26 août).** Béné : "je veux notre propre système
d'affiliation pour l'atelier comme pour tiquiz." Le chantier qui était
"à part" est fait : l'Atelier lit `?ref=` (son `middleware.ts` +
`lib/affiliate/refLien.ts`) et remonte ses ventes au registre CENTRAL
d'ici, au taux de 70 % (`source_app: "atelier"`). Son registre
historique (`profiles.sio_affiliate_id` dans SA base) reste interrogé en
REPLI : un élève affilié là-bas et pas ici continue d'être payé
exactement comme avant.

**`tiquiz_free` (27 août).** L'ancienne note disait "à refaire le jour
où notre inscription gratuite créera elle aussi le contact chez
Systeme.io" : ce jour est arrivé le 25 août. `https://tiquiz.fr/signup`
fait les trois choses d'un coup, le compte, le rattachement À VIE, et le
contact chez Systeme.io avec son étiquette `tiquiz-free` (`poserTagPlan`
crée le contact quand il n'existe pas).

🚨 **J'AI ÉCRIT ICI QUE SES SÉQUENCES NE PARTAIENT PAS. LA MESURE ÉTAIT
INVALIDE (corrigé le 31 août au soir).**

Ce que l'API de Systeme.io rend : 51 règles, toutes déclenchées sur
`form_subscribed`, aucune sur `tag_added`. J'en ai conclu que poser une
étiquette ne déclenchait rien.

**Béné a envoyé la capture d'une règle « Tag "newsletter" ajouté ->
S'abonner à la campagne Pépites 365 », active dans son tableau de
bord.** Elle n'apparaît nulle part dans la réponse de l'API, même sans
filtre. Et sur les 51 rendues, AUCUNE ne porte l'action « s'abonner à
une campagne », alors que ses tunnels en font évidemment :
**cette API ne montre qu'un sous-ensemble de ses règles.**

**J'ai enfreint une règle écrite dans ce fichier** (22 août) : ne pas
conclure "ça n'existe pas" d'une recherche qui n'a rien trouvé. Une
recherche vide dit "je n'ai pas trouvé". Et le raisonnement qui m'y a
mené est le vrai coupable : l'API n'a pas de point d'entrée pour
abonner un contact à une campagne, j'en ai déduit qu'elle ne pouvait
pas non plus me MONTRER une règle qui le fait. **Un outil qui ne sait
pas FAIRE quelque chose ne sait pas forcément le VOIR non plus.**

**Ce qui est établi :** au moins une règle par étiquette existe et
abonne à une campagne, donc poser un tag PEUT tout déclencher.

**Ce qui reste inconnu :** si `tiquiz-free` et les étiquettes de vente
ont la leur. Ça ne se vérifie QUE dans son tableau de bord
(https://systeme.io/dashboard/automation-rules), jamais par cette API.
Ne plus rien affirmer ici sur la foi de cet outil.

**Et c'est pour ça qu'on ne bascule PAS le bouton d'essai gratuit de la
page de vente** (`SALES_LINKS_LEFT_ALONE` chez Tiquiz) : leur optin est
aujourd'hui le seul chemin qui déclenche vraiment la séquence.

La chaîne est complète et elle a été vérifiée bout en bout : le `?ref=`
arrive dans l'URL, le middleware le range dans `tq_ref`, le bon de
commande le relit (l'URL gagne sur le cookie), et il part dans les
metadata Stripe ou le `custom_id` PayPal. Sur `tiquiz.fr` le bon de
commande est OUVERT sans clé (`isSalesOpen` connaît le domaine public) :
sans ça, tous ces liens répondraient 404.

Garde-fou : `tests/logic/affiliate-link.test.mts` exige que chaque
destination sauf l'optin gratuit atterrisse sur un de nos hôtes, et que
la RAISON de l'exception reste écrite à côté. Sans elle, le prochain qui
passe "finit le travail" et casse le tunnel gratuit.

## Payer les affiliés : PayPal ou virement, au choix (Béné, 25 août 2026)

"Pour l'affiliation on doit proposer le choix aux affiliés : Paypal ou
virement bancaire. Ils doivent pouvoir indiquer leur mail paypal OU leur
rib pour un virement." Et la veille, sur la façon de payer : **export
SEPA et virement à la main.**

**CE QUI N'EXISTAIT PAS.** `affiliate_commissions` porte les statuts
`pending / approved / paid / cancelled / rejected` et une colonne
`payout_id` depuis mai. Aucun code ne faisait passer une commission d'un
statut à l'autre, et aucune table de versement n'existait : **les statuts
étaient décoratifs.**

### AUCUN ARGENT NE PART D'UN ÉCRAN

On produit un FICHIER : `pain.001.001.03` pour les virements, une liste
à tabulations pour PayPal. Béné le dépose dans sa banque ou dans PayPal,
et c'est sa banque qui exécute. Un bouton qui virerait vraiment de
l'argent depuis un écran d'admin est exactement ce qu'on ne construit
pas, et le test l'interdit.

### La méthode est un CHOIX, jamais une déduction

Deviner "il a rempli un IBAN donc virement" marche jusqu'au jour où
quelqu'un remplit les deux, et c'est alors le code qui décide où part son
argent. `payout_method` est une colonne. `resoudreMethode` ne devine que
pour les lignes HISTORIQUES sans choix enregistré, et rend `explicite:
false` pour que l'écran redemande.

### L'IBAN est chiffré, et il ne ressort JAMAIS en clair

Même mécanisme que les leads (`lib/piiCrypto.ts`, une clé par affiliée
protégée par `PII_MASTER_KEY`) : un accès direct à la base ne montre que
du chiffré. Les écrans n'affichent qu'un masque (`FR14••••2606`), **y
compris à sa propriétaire** : un écran se photographie, se partage, se
laisse ouvert. Elle a besoin de RECONNAÎTRE le sien, pas de le relire ;
pour le changer, elle le ressaisit.

La clé de l'affiliée est RÉUTILISÉE d'une écriture à l'autre. En
regénérer une à chaque fois rendrait l'ancien chiffré illisible.

### Un lot est une PIÈCE, pas un calcul

Il fige les montants ET les coordonnées. Recalculer le total à
l'affichage donnerait un chiffre qui bouge quand une commission est
annulée après coup, alors qu'un virement parti ne bouge pas. Et si
l'affiliée change d'IBAN le lendemain, le fichier déjà déposé ne doit pas
changer. C'est la règle de la facture émise (24 août), transposée à
l'argent qui SORT.

**L'ordre compte** : on crée le lot D'ABORD, puis on marque les
commissions. L'inverse laisserait des commissions `paid` pointant vers un
lot inexistant, c'est à dire de l'argent qu'on croit versé sans trace de
virement. Et un lot par mois (`periode` unique) : construire deux fois le
lot d'août paierait deux fois.

### Les trois seuils, et pourquoi

| | Valeur | Pourquoi |
|---|---|---|
| rétractation | 21 jours | 14 jours légaux + marge : une commission virée ne se reprend pas |
| minimum | 20 € | un virement de 1,20 € coûte plus cher en temps qu'il ne rapporte. **L'argent reste acquis** et part au lot suivant |
| BIC | facultatif | depuis 2016 un virement SEPA se fait avec le seul IBAN ; l'exiger bloquerait des affiliées pour un champ que leur banque n'imprime plus |

### Ce qui fait refuser un fichier par la banque

Écrit dans `lib/affiliate/sepa.ts`, et testé : identifiants uniques
(`MsgId` = le lot, donc non rejouable, ce qui est une protection),
montants à deux décimales avec un POINT, somme des lignes = `CtrlSum` au
centime, XML échappé (un nom avec `&` casse le fichier entier, et le nom
vient d'un formulaire), date d'exécution un jour OUVRÉ.

Les accents sont TRANSLITTÉRÉS, pas supprimés : "Bénédicte" doit rester
lisible sur le relevé, pas devenir "Bndicte".

### Ce qui est écarté du lot est DIT, jamais avalé

Coordonnées manquantes, sous le minimum, affiliée inconnue : chaque cas
sort dans `ecartees` avec son montant, et l'écran les affiche. Elle a
gagné cet argent : quelqu'un doit lui écrire. C'est la règle du
`ok: false` du 3 août.

### NORMALISER N'EST PAS VALIDER

Premier jet : `normaliserBic` rendait `null` dès que la longueur n'était
pas 8 ou 11. Un BIC tapé de travers devenait donc `null`,
`manquesVersement` ne voyait plus rien à signaler, et le champ était
silencieusement vidé : l'affiliée voyait sa saisie disparaître sans un
mot. Ces fonctions NETTOIENT et rendent ce qui a été saisi ; ce sont
`ibanValide` / `bicValide` qui jugent.

La clé de contrôle IBAN (modulo 97) attrape la faute de frappe, qui est
le cas fréquent : un chiffre inversé donne un IBAN plausible et un
virement rejeté trois jours plus tard. Le reste se calcule par morceaux :
le nombre entier fait jusqu'à 38 chiffres, bien au delà de ce qu'un
`number` porte sans perdre en précision.

### À poser sur le serveur

`SEPA_DEBTOR_IBAN` (et `SEPA_DEBTOR_BIC` si la banque l'exige,
`SEPA_DEBTOR_NAME` sinon "ETHILIFE"). Sans elle, le fichier SEPA n'est
pas produit et l'écran le DIT au lieu de rendre un fichier que la banque
refuserait. La liste PayPal, elle, se télécharge sans ça.

### La page Paiement revient de loin

Elle portait un formulaire PayPal/IBAN jusqu'au 8 juin, débranché parce
qu'il faisait croire que la configuration était chez nous alors que tout
se passait chez Systeme.io : les affiliées remplissaient et n'étaient pas
payées ("arrête d'inventer n'importe quoi"). **Le formulaire revient
parce que le cycle existe enfin.** La page continue de dire ce qui reste
chez eux : les commissions des ventes arrivées par leurs anciens tunnels.

Test : `tests/logic/versement-affilies.test.mts`.

## On écrit la facture À LA PLACE de l'affilié (Béné, 25 août 2026)

"Je veux le même truc que systeme io : l'affilié complète ses infos, son
numéro de TVA et siren s'il a, ses coordonnées, son mode paiement et tous
les mois on génère sa facture pour sa compta, il peut la télécharger et
nous on peut le payer via cette facture qu'on a générée pour lui."

Et, dans le même message, la distinction qui structure tout :

> "Ne pas confondre :
> - les factures qu'on crée pour nos acheteurs
> - les factures qu'on crée à la place de nos affiliés pour les payer et
>   ne pas avoir à attendre leurs propres factures"

**LES DEUX VONT DANS DES SENS OPPOSÉS, ET C'EST LE PIÈGE PRINCIPAL.**

| | Facture de VENTE (dépôt Tiquiz) | AUTOFACTURE (ici) |
|---|---|---|
| qui vend | nous | l'affilié |
| le montant de départ | le prix, **TTC** | la commission, **nette de taxe** |
| la TVA | se calcule DEDANS | s'AJOUTE par dessus |
| série | `TQ-` (et `AQ-` pour l'Atelier) | `AFF-` |

Recopier l'une sur l'autre ferait des factures fausses **des deux côtés**,
et rien ne le signalerait avant une réclamation. `COMMISSION_EST_HT` est
donc une constante NOMMÉE (`lib/affiliate/fiscal.ts`) : le sens se lit,
il ne se devine pas, et si Béné décide un jour que la commission est TTC
c'est une ligne à changer, pas un calcul à retrouver.

### Sans mandat, pas de facture, donc pas de virement

Écrire une facture au nom de quelqu'un sans son accord n'est pas une
facilité, c'est un faux. L'autofacturation exige un mandat (art. 289 I-2
du CGI), la mention "Autofacturation" sur la pièce (art. 242 nonies A) et
le droit de la contester. Le texte du mandat vit dans le CODE
(`TEXTE_MANDAT`), pas dans un fichier de langue : c'est un acte
juridique, et sa VERSION est stockée avec la date d'acceptation.

`construireLot` écarte donc l'affilié sans profil complet ou sans mandat,
avec la raison `profil-fiscal`, **distincte de `coordonnees`**. Les deux
se remplissent sur le même écran mais répondent à deux questions
différentes : dire "coordonnées manquantes" à quelqu'un qui a très bien
rempli son IBAN et qui a juste oublié de cocher le mandat l'envoie
chercher au mauvais endroit. Son argent reste acquis, il part au lot
suivant.

**La date de l'acceptation vient du SERVEUR.** Le navigateur dit qu'il
accepte, il ne dit pas quand.

### Les quatre régimes de TVA, et le piège est le même qu'à la vente

`resoudreTvaAutofacture()` décide : `france-tva` (20 %),
`franchise-en-base` (0 %, le cas le plus fréquent), `autoliquidation-ue`,
`autoliquidation-hors-ue`. Un particulier ne facture pas de TVA et le cas
est SIGNALÉ : payer une commission à quelqu'un qui n'a aucun statut est
une question pour un comptable, pas pour du code.

**ASSUJETTI N'EST PAS DÉDUCTIBLE DE LA PRÉSENCE D'UN NUMÉRO DE TVA.**
Beaucoup d'auto-entrepreneurs en franchise en base en ont un sans facturer
de TVA. Le déduire ajouterait 20 % à des factures qui n'en portent pas.
C'est une case à cocher, et l'écran le dit en toutes lettres.

### La numérotation : un compteur, jamais une séquence

Une séquence Postgres saute des numéros dès qu'une transaction est
annulée, c'est même sa raison d'être. Une numérotation de factures doit
être continue : un trou est exactement ce qu'un contrôle cherche. D'où
`autofacture_compteurs` + `emettre_autofacture()`, qui alloue le numéro
ET insère dans la MÊME transaction.

**Elle ne lève JAMAIS sur un doublon.** Un lot rejoué rend la pièce déjà
émise. Deux appels SIMULTANÉS passent tous les deux le premier SELECT :
le bloc `exception when unique_violation` les rattrape, et comme c'est
une sous-transaction, le compteur revient en arrière avec. Sans lui la
fonction lèverait, donc le lot échouerait, donc les virements
attendraient une pièce comptable.

### L'ordre dans `figerLot`, et il n'est pas décoratif

**le lot -> les factures -> les commissions marquées `paid`.**

Avant le lot, la facture n'aurait pas d'identifiant de versement à
porter. Après le marquage, une panne laisserait des commissions soldées
sans la pièce qui les justifie.

**Une facture ratée ne bloque JAMAIS un virement** : l'émission ne rend
rien, ne lève pas, et chaque échec passe au suivant en criant dans le
journal. Une pièce manquante se réémet, un virement perdu non. L'écran
d'admin affiche le nombre de factures À CÔTÉ du nombre de virements, et
dit quand les deux comptes diffèrent : sans ça, une pièce non émise ne
vivrait que dans `pm2 logs`.

### Le profil est RECOPIÉ dans la pièce, jamais relu

Une facture émise ne bouge plus : c'est la loi, et c'est la même règle
que les factures de vente (24 août). Elle porte l'adresse du jour de
l'émission. Un écran qui lirait le profil COURANT réécrirait tout
l'historique au premier déménagement, sans que personne ne le voie. La
mention légale suit la même règle : la page imprimable rend `f.mentions`,
figée à l'émission, et n'importe PAS `MENTION_AUTOFACTURATION`.

### Deux trouvailles au passage, et les deux étaient des trous réels

1. **La route des coordonnées acceptait le profil fiscal et le mandat
   dans son corps et ne les écrivait NULLE PART.** L'affilié remplissait,
   lisait "enregistré", et restait écarté du lot pour "profil fiscal
   incomplet". Le silence exact que le `ok: false` du 3 août interdit.
   Le profil est accepté MÊME INCOMPLET (ce qui manque part dans
   `manquesFiscaux`) : refuser tout parce qu'il manque une ligne fait
   tout ressaisir, et c'est comme ça qu'on perd la moitié d'un
   formulaire.
2. **L'écran d'admin recevait les IBAN en clair.** `affiliate_payouts.
   lignes` porte les coordonnées FIGÉES, donc des IBAN, et `lireLots`
   faisait `select("*")`. La règle écrite la veille dit l'inverse :
   "aucune route ne le renvoie à un navigateur, pas même à sa
   propriétaire". L'écran reçoit désormais un COMPTE (`nbLignes`), pas
   des comptes bancaires. Seul le constructeur du fichier SEPA lit les
   lignes, et il tourne sur le serveur.

### À faire relire par son comptable, une fois

Trois choix sont défendables et sont les siens, pas les miens :
- **une seule série `AFF-` pour tous les affiliés** (l'autre usage est
  une série par prestataire) ;
- **le cas du particulier non assujetti**, accepté et signalé ;
- **`COMMISSION_EST_HT = true`** : un affilié assujetti coûte 20 % de
  trésorerie en plus, récupérable, mais ça sort du compte le mois même.

### Endroits à respecter

`lib/affiliate/fiscal.ts` et `lib/affiliate/autofacture.ts` (purs et
testés, ils n'importent jamais `supabaseAdmin`),
`lib/affiliate/versementStore.ts` (l'émission, sans aucune décision),
`app/api/affiliate/coordonnees/route.ts`,
`app/affiliate/components/CoordonneesVersement.tsx`,
`app/facture-affilie/[numero]/page.tsx`,
`app/affiliate/admin/versements/VersementsClient.tsx`,
`supabase/migrations/20260825_autofacturation.sql`.
Test : `tests/logic/autofacture.test.mts`.

## L'audit du 26 août : trois trous d'argent dans l'affiliation

Béné : "tu peux auditer tout le parcours de vente tiquiz et l'atelier,
paypal et stripe plus tout le système d'affiliation ? Je veux que tout
soit fiable, stable, précis... pour tous les cas de figure (upgrades
downgrades, remboursement annulation demandes etc... auto affiliation
factures affiliés, factures clients etc...)"

Les trois trouvailles ont la MÊME forme, celle du 1er août : une logique
écrite pour un cas, appliquée telle quelle à un autre. Et elles ont
toutes changé de prix le 25 août : **c'est nous qui virons maintenant, et
un virement ne se reprend pas.**

### 1. UNE VENTE REMBOURSÉE PAYAIT QUAND MÊME

`affiliate_commissions.cancelled_at` existe depuis le 25 mai. **Aucune
ligne de code ne l'écrivait.** Un remboursement fermait l'accès, arrêtait
l'abonnement, émettait l'avoir, et laissait la commission mûrir : 21
jours plus tard elle entrait dans un lot, et l'argent partait.

Nos propres conditions le promettaient déjà (`lib/legal/affiliate.ts`) :
"elles peuvent être annulées en cas de remboursement, d'impayé, de
fraude". Le texte annonçait ce que le code ne faisait pas, exactement
comme les CGV et le bon de commande le 22 août.

**Et l'Atelier savait déjà le faire.** `refundCommissionByOrder` y vit
depuis des mois, branchée sur le remboursement SYSTEME.IO. Le jour où
l'Atelier a eu son propre bon de commande, personne ne l'a rebranchée.

**Règle : `lib/affiliate/annulation.ts` décide, `annulationStore.ts`
écrit, `POST /api/affiliate/cancel-sale` est la porte.** Les trois
webhooks appellent, avec la clé de la CRÉATION (`stripe:<ref>` ici,
`<moyen>:<ref>` côté Atelier) : une clé qui ne correspond pas n'annule
rien, en silence, ce qui est le bug qu'on ferme.

**Une commission DÉJÀ VERSÉE n'est jamais réécrite.** L'argent est parti
et la facture d'autofacturation qui le justifie a été remise à un
comptable. On rend `trop-tard`, et ça CRIE : c'est un cas pour un humain
(compenser sur le lot suivant, ou écrire à l'affilié).

**L'annulation ne fait JAMAIS échouer le remboursement.** Un
remboursement doit fermer l'accès même si Tipote ne répond pas ;
l'inverse ferait rejouer le remboursement en boucle.

### 2. S'AFFILIER À SOI MÊME AVEC UN ALIAS

`attributeSale` comparait `aff.email.toLowerCase() === email`. Acheter
avec `moi+1@gmail.com` suffisait à se payer 40 % de son propre
abonnement.

La règle qui voit ces alias existait DÉJÀ, côté Tiquiz, dans
`lib/trial/moisOffert.ts`, avec ce commentaire : "c'est LE moyen le plus
simple de s'auto-affilier". Elle n'y gardait que le CADEAU. **On
protégeait le mois offert mieux que le versement**, alors que c'est le
versement qui part et ne revient pas.

`lib/affiliate/memeAdresse.ts` vit maintenant dans les TROIS dépôts sous
le même nom, et `moisOffert.ts` DÉLÈGUE au lieu de redéfinir. Au passage
`googlemail.com` est ramené à `gmail.com` : c'est la même boîte, et
l'alias le plus simple qui soit, celui qui ne demande même pas de `+`.

**Les points ne sont retirés que chez Gmail.** Ailleurs `jean.dupont@` et
`jeandupont@` peuvent être deux personnes, et les confondre refuserait
une commission légitime : aussi grave que d'en payer une de trop.

### 3. LE TAUX ET LA BASE VENAIENT DE DEUX ENDROITS

**Le taux était écrit en dur** (`const TIQUIZ_COMMISSION_RATE = 0.4`)
dans le fichier qui PAIE, pendant que `lib/affiliate/commission.ts`
existait pour être le seul endroit qui dit combien on paie. Le montant
ANNONCÉ sortait d'un module, le montant VERSÉ d'une constante à côté. Et
`affiliate_rate_overrides` (créée le 19 août) n'était lue nulle part :
un partenariat négocié à 60 % aurait été payé 40 %, en silence.

**La base n'était pas la même selon l'appelant**, dans un champ qui
s'appelle pareil :

| Appelant | Ce qu'il envoyait |
|---|---|
| notre bon de commande | HT |
| la route SIO de l'Atelier | HT |
| **le webhook Systeme.io** | **TTC** |

40 % de 17,00 € font 6,80 € au lieu de 5,67 € : **1,13 € de trop par
vente**, invisible. `base` est donc un PARAMÈTRE OBLIGATOIRE de
`attributeSale`, et le compilateur refuse un appelant qui se tait.

**Un appelant muet est lu comme TTC, et ça crie.** Le repli est
CONSERVATEUR : lire un HT comme du TTC sous-paie de 17 %, ce qui se
rattrape au lot suivant ; lire un TTC comme du HT surpaie de 20 %, et un
virement parti ne revient pas.

**LE `base: "ht"` DE PAYPAL ÉTAIT UN MENSONGE, jusqu'au 31 août 2026.**
Béné : "pour l'affiliation on fait uniquement 40 % etc. sur le HT.
Débrouille toi pour que sur PayPal ça marche aussi." Les webhooks PayPal
de Tiquiz et de l'Atelier envoyaient `base: "ht"` avec une taxe à ZÉRO,
donc un montant TTC dans un champ annoncé hors taxes. Ici, rien ne
pouvait le voir : `attributeSale` fait confiance au champ, et c'est
normal.

C'est la limite de la règle du 1er août ("la mécanique est un PARAMÈTRE
OBLIGATOIRE") : elle force l'appelant à DIRE, elle ne l'empêche pas de
dire faux. **Un paramètre obligatoire ne protège de rien quand on lui
ment.** Corrigé des deux côtés : la taxe vient désormais de la facture
que ces apps émettent pour la vente (elles seules connaissent le pays de
l'acheteur), voir leurs AGENTS.md respectifs.

**Le montant lui même se lisait au pari.** Le webhook Systeme.io d'ICI
faisait encore `extractNumber(rawBody, ["order.total_price"])`, donc
`"17.00"` valait 17 CENTIMES. `readSioAmountCents` avait retiré ce pari
côté Tiquiz le 22 août ; il vit maintenant ici sous le nom
`montantSioCents`. Un garde-fou qui ne protège qu'un des deux jumeaux ne
protège personne.

### Ce que l'audit a laissé ouvert, et qui n'est pas du code

🚨 **CETTE LIGNE DISAIT "les commissions de l'Atelier ne sont dans
AUCUN lot". C'EST PÉRIMÉ (vérifié le 31 août).**

Elle était vraie le 26 août au matin, et la correction du même jour l'a
annulée sans que la page soit reprise. Vérifié ligne par ligne :
`commissionnerVente` (dépôt formaquiz) écrit dans le registre CENTRAL
d'ici avec `source_app: "atelier"` et `regle_par: "nous"`, et
`preparerLot` filtre sur `regle_par = "nous"` **sans filtrer
`source_app`**. Les commissions de l'Atelier entrent donc dans le lot
comme les autres.

Ce qui reste vrai : le registre HISTORIQUE de l'Atelier
(`profiles.sio_affiliate_id`, dans sa base) sert encore de REPLI pour
un élève affilié là-bas et pas ici. Celles-là, oui, ne sont dans aucun
lot.

**La leçon est celle qui revient : une note d'état des lieux se relit
quand on corrige ce qu'elle décrit**, sinon le prochain passage agit
sur une dette déjà soldée.

Test : `tests/logic/audit-26-aout.test.mts`, ici et dans les deux autres
dépôts.

## Le tableau de bord annonçait un chiffre jamais versé (31 août 2026)

Béné : "vérifier que chaque affilié reçoit les bonnes infos, que le
système lui attribue bien ses clients et qu'il sera payé pour son
travail sans perdre de commission. Je vais démarcher de très gros
affiliés, je ne peux pas me permettre de proposer un système instable."

Deux défauts, et les deux ne se voient qu'À L'ÉCHELLE, c'est à dire
exactement quand un gros affilié arrive.

### 1. LES GAINS TOTAUX COMPTAIENT LES COMMISSIONS ANNULÉES

`affiliate_stats` sommait `commission_cents` sur TOUS les statuts. Or
depuis le 26 août un remboursement ou un impayé pose `cancelled`
(`annulationStore.ts`) : la ligne restait donc dans "Gains totaux".
L'affilié lisait 1 240 €, recevait 1 180 €, et **rien à l'écran
n'expliquait l'écart**. Ça ne se découvre qu'au premier virement, et
c'est le moment où on ne peut plus rattraper la confiance d'un gros
affilié. Même faute sur `total_sales` : `BadgesCard` fêtait une vente
remboursée.

### 2. ET SON ARGENT DISPARAISSAIT PENDANT UN MOIS

L'écran montre "Gains totaux / En attente / Déjà payé", et "En attente"
ne comptait que `pending`. Une commission mûre passe `approved` à J+30
et n'est virée qu'entre le 10 et le 13 : **pendant cette fenêtre, elle
n'était NI en attente NI payée.** Elle sortait de deux compteurs sur
trois tout en restant dans le total, ce qui produit toujours la même
question, et elle est légitime : "où est passé mon argent ?"

**Règle : la vue distingue quatre choses, et l'écran les dit.**

| Colonne | Ce que ça veut dire |
|---|---|
| `total_commission_cents` | ce qui reste ACQUIS (annulé exclu) |
| `a_venir_commission_cents` | gagné et pas encore versé (`pending` + `approved`) |
| `paid_commission_cents` | viré |
| `cancelled_commission_cents` | annulé, AFFICHÉ quand il n'est pas nul |

`pending_commission_cents` garde son sens strict, il sert côté admin.
**L'annulé se dit, il ne se soustrait pas en silence** : c'est la règle
des lignes écartées d'un lot (25 août). Et rien ne s'affiche quand il
est nul : un zéro permanent ferait croire à un problème là où il n'y en
a aucun.

L'écran survit à la migration pas encore passée (les deux champs sont
optionnels, avec repli sur `pending`) : un écran qui plante en attendant
serait pire que le chiffre qu'il corrige.

### 3. LE LOT DU MOIS SE CASSAIT QUAND LES AFFILIÉS SE MULTIPLIAIENT

`preparerLot` lisait le registre en UNE requête,
`.in("sa", [tous les sa du lot])`. Un `.in()` part dans l'URL, un `sa`
fait 20 à 80 caractères, et **la commission est RÉCURRENTE depuis le
26 août** : le lot d'un mois réunit une ligne par abonné et par mois,
donc de plus en plus d'affiliés distincts. Passé quelques milliers de
caractères, le serveur refuse la requête entière.

Et l'erreur était IGNORÉE (`const { data: affs }`, sans `error`). Donc
`affs` valait `null`, donc **plus aucune affiliée n'était reconnue**,
donc tout le monde sortait en `affiliee-inconnue` et le lot était vide.
Le symptôme aurait été le pire possible : un écran qui affirme que le
registre ne connaît pas des gens parfaitement inscrits, un mois après
l'autre, sans une seule ligne d'erreur pour dire pourquoi.

**Règle : `lireAffilieesParPaquets` lit par 100, et une erreur ARRÊTE
tout.** Rendre ce qu'on a lu fabriquerait un lot partiel qui a l'air
complet, et les manquants y seraient étiquetés "inconnues". "Je n'ai pas
pu regarder" et "il n'y a rien" sont deux réponses différentes (règle du
23 août).

🚨 Migration : `supabase/migrations/20260831_affiliate_stats_honnetes.sql`
(Supabase de TIPOTE). C'est une VUE : elle se remplace, aucune donnée
n'est réécrite.

Test : `tests/logic/audit-31-aout.test.mts`.

### Ce qui a été corrigé côté Tiquiz le même jour

Le détail vit dans SON `AGENTS.md`, et il touche directement ce que ce
dépôt encaisse : **aucun appel de Tiquiz n'épingle de version d'API
Stripe**, et Stripe a déplacé `invoice.subscription`, `invoice.tax` et
`subscription.current_period_end`. Lus au seul premier niveau, ils
donnaient zéro commission récurrente à partir du 2e mois et une
commission calculée sur le TTC. `lib/checkout/formeStripe.ts` (chez eux)
lit les deux formes, et `npm run check:stripe` dit la version réelle des
webhooks. Un changement de palier perdait aussi l'affiliée en route, des
deux côtés (PayPal ouvre un abonnement neuf, Stripe passe par un
calendrier).

## Les 7 règles du programme d'affiliation (Béné, 26 août 2026)

Elle a listé le fonctionnement de Systeme.io, règle par règle, après
avoir vu que mes audits successifs trouvaient toujours autre chose :
"Je dois être sûre que tu as bien tout compris et pris en compte avant
d'envoyer le moindre code."

**Chacune de ces règles est un comportement que Systeme.io donnait
gratuitement depuis des années.** En reprenant la vente, chacune doit
être réécrite explicitement, et aucune ne se signale toute seule quand
elle manque : rien ne casse, l'argent tombe juste au mauvais endroit.
C'est pour ça que sa liste vaut plus que n'importe quel audit.

| Sa règle | Où elle vit |
|---|---|
| le cookie dure **1 an** | `REF_MAX_AGE_SECONDS` / `SA_MAX_AGE_SECONDS` (Tiquiz) |
| commission versable à **J+30 du paiement** | `DELAI_RETRACTATION_JOURS` |
| inscription gratuite sur son lien -> **affilié à vie** | `fenetreAttribution.ts` + `/api/affiliate/rattacher` |
| annulation -> on arrête à la fin de l'abonnement | plus d'échéance, donc plus de commission |
| remboursement -> pas de commission | `annulation.ts`, la seule échéance remboursée |
| **40 % HT** Tiquiz, **70 %** Atelier | `COMMISSION_RATES` |
| on touche, l'affilié touche | une commission par ENCAISSEMENT |

### Ce que j'avais faux, et que sa liste a révélé

1. **Le cookie durait 90 jours.** Un prospect qui clique en janvier et
   achète en juin ne payait plus personne.
2. **Le délai était J+21**, par un raisonnement sur la rétractation
   légale (14 jours + marge). Le raisonnement se tenait et ne comptait
   pas : ses affiliés connaissent J+30, et un délai maison qui diffère
   du délai annoncé se remarque au premier virement.
3. **Le rattachement expirait à 90 jours**, alors qu'il est à VIE.
4. **Et surtout : notre propre inscription gratuite ne rattachait
   RIEN.** Ni le cookie, ni le `?ref=`. La règle "inscrit en free sur
   son lien = son affilié à vie" ne marchait que via Systeme.io, dont
   l'optin appelle `sio-conversion`. Sur nos pages, l'affilié perdait
   son prospect à l'expiration du cookie, et le problème grossissait à
   chaque inscription prise chez nous.

### LE PREMIER RATTACHEMENT GAGNE, pas le dernier

Un contact appartient à celui qui l'a AMENÉ. `findRecentConversion` lit
donc la conversion la plus ANCIENNE (`ascending: true`), et ce
rattachement passe devant un cookie plus récent. Trier du plus récent
donnerait le contact au dernier affilié dont il a croisé un lien, ce qui
viderait de son sens la promesse "à vie". Le cookie ne sert qu'aux gens
qu'on ne connaît pas encore. C'est le comportement de Systeme.io, et
Béné l'a confirmé nommément.

### Ce que l'anticipation a trouvé en plus

Elle a demandé : "identifie tout ce qui pourrait poser problème à
l'avenir et qu'on veut qui fonctionne comme systeme io."

- **Une commission en DEVISE ÉTRANGÈRE serait virée en euros.** Le
  fichier SEPA porte `Ccy="EUR"` et le lot additionnait tout. Trois
  plans Tiquiz en dollars existent chez Systeme.io depuis avril : le cas
  n'est pas théorique. On ne convertit PAS (un taux de change inventé
  produirait un versement faux qui a l'air juste) : la ligne est ÉCARTÉE
  avec la raison `devise`, et l'écran la montre.
- **La file de commissions n'était pas triée.** La commission est
  récurrente : une ligne par abonné et par mois, donc la file grandit
  avec la base. Le jour où elle dépasse la limite de la requête,
  Postgres choisit lesquelles il rend, et ce sont toujours les mêmes qui
  restent dehors. `order by sale_at asc` : la limite ne fait plus que
  RETARDER, en commençant par ce qui attend depuis le plus longtemps.
- **La décision "à vie" vivait dans `attribution.ts`**, qui importe
  `supabaseAdmin` : aucun test ne pouvait l'importer. Sortie dans
  `fenetreAttribution.ts`. C'est le test qui l'a attrapé, et c'est
  exactement le piège qui avait caché le verrou des webhooks le 24 août.

### Un affilié viré n'est pas payé, un affilié en pause si

Béné, 26 août : "affilié viré = pas payé. Point barre. S'il a triché on
ne lui doit rien."

**La table porte TROIS statuts, et les confondre prendrait l'argent de
quelqu'un qui n'a rien fait :**

| Statut | Nouvelles commissions | Ce qui est déjà gagné |
|---|---|---|
| `active` | oui | payé |
| `paused` | non (`attributeSale` refuse hors `active`) | **payé** |
| `banned` | non | **rien n'est dû** |

Un affilié en pause n'a pas triché : il ne peut plus gagner, mais ce
qu'il a accumulé lui appartient.

Le filtre passe AVANT les coordonnées et le mandat : inutile de
réclamer un IBAN pour un versement qui n'aura pas lieu, et la raison
affichée doit être la vraie. La somme reste VISIBLE à l'écran : une
ligne qui disparaît en silence est une décision qu'on ne peut plus
expliquer six mois plus tard, ni à lui, ni à un comptable.

**On ne REJETTE pas les lignes en base pour autant.** Réintégrer
quelqu'un exclu par erreur doit rester possible sans avoir à
ressusciter ses commissions une par une.

Un statut illisible ou absent est lu comme `active` : refuser de payer
quelqu'un sur une valeur qu'on ne sait pas lire serait la pire des
réponses.

### Les trois seuils, tranchés le 26 août

| | Valeur | Décision |
|---|---|---|
| délai avant versement | J+30 du paiement | comme Systeme.io |
| minimum par virement | 20 € | le nôtre, plus généreux que leurs 50 € |
| calendrier | entre le 10 et le 13 du mois | comme Systeme.io, annoncé dans les 6 langues |

Test : `tests/logic/audit-26-aout.test.mts` (les deux dépôts).

## Le robot d'aide était MORT en portugais (audit du support, 31 août 2026)

Le portugais et le brésilien ont été ajoutés à `i18n/config.ts` après
coup. **Cinq endroits gardaient leur propre copie de la liste des
langues**, restée à cinq, et aucun ne le disait.

### 1. Le robot du centre d'aide répondait 400 à chaque message

`POST /api/support/chat` validait son corps par
`z.enum(["fr","en","es","it","ar"])`. Le widget envoie la langue résolue
par `resolveHelpLocale`, qui rend très bien `pt` ou `pt-BR` : zod
refusait le corps ENTIER, la route répondait 400, et l'écran affichait
"une erreur est survenue". **À chaque message, sans exception.**

Reproduit avant de corriger, pas déduit : `safeParse({message:"ola",
locale:"pt"})` -> refusé.

Le symptôme ne disait rien de la cause. Ni "langue non gérée", ni une
ligne dans `pm2 logs` : le message d'erreur générique du widget, celui
qu'on lit comme "le service est en panne".

**Règle : une préférence d'affichage ne fait JAMAIS échouer une
question.** La langue est un `string` NORMALISÉ
(`normaliserLangueAide`, dans le module pur `lib/support/locale.ts`),
plus un `enum` : une valeur illisible retombe sur le français au lieu de
refuser. La huitième langue ajoutée un jour ne cassera plus rien.

**Et le repli de PROMPT était le français**, qui porte "Langue :
Français. Réponds toujours en français." Une langue sans prompt à elle
aurait donc été servie en français : ça a l'air de marcher, et c'est
pire qu'une erreur. Elle reçoit maintenant le prompt ANGLAIS plus une
consigne de langue explicite, posée APRÈS la base de connaissances pour
que le préfixe reste cacheable (règle de `knowledgeBase.ts`).

### 2. La préférence de langue ne se sauvegardait pas

Le sélecteur propose les SEPT langues (`LanguageSwitcher` lit
`SUPPORTED_LOCALES`). `PATCH /api/settings/ui-locale` en refusait deux,
et `persistLocaleToDb` avale l'erreur (`catch {}`, non bloquant).

**Le symptôme est le pire possible parce qu'il est différé** : ça marche
tout de suite (le cookie est posé), et la langue revient au français sur
un autre appareil, après un nettoyage de cookies, ou à l'expiration.

### 3. Les notifications de vente partaient en français

`SALE_MESSAGES` et `CANCEL_MESSAGES` couvraient cinq langues. Un compte
réglé en portugais recevait "Nouvelle vente !" en français.

### Ce qui a été trouvé au passage

Le limiteur de débit du robot était une `Map` locale **sans aucun
ramasse-miettes** : une entrée par adresse vue depuis le démarrage,
gardée pour toujours. Sur une page PUBLIQUE, c'est une fuite de mémoire
qui grandit avec le trafic, invisible jusqu'au redémarrage de PM2. Il
passe sur `lib/aiRateLimit.ts`, qui purge, et qui est déjà celui des
trois autres points d'entrée coûteux. Même famille que le compteur du
support qui se désarmait tout seul (audit du 24 août).

Le chrome du widget retombait sur le FRANÇAIS pour une langue absente de
sa table. Il retombe sur l'anglais, comme les deux ternaires de son
propre bandeau le faisaient déjà.

### L'exception assumée

`lib/affiliate/conditionsUrl.ts` liste cinq langues EXPRÈS : le texte
des conditions n'existe pas en portugais, et demander `?lang=pt`
servirait l'anglais en prétendant le contraire. C'est une décision
écrite à côté du code, et elle reste. Le test l'exige toujours écrite :
une exemption sans raison est une exemption que le prochain passage
prend pour un oubli.

**Ce qui reste ouvert, et qui n'est pas du code :** les pépites
n'existent qu'en cinq langues (`lib/pepites/translatePepite.ts` ne
traduit que vers en/es/it/ar). Les générer en portugais coûte des
jetons : c'est une décision de Béné, pas un bug.

Test : `tests/logic/langues-servies.test.mts`, qui vérifie AUSSI qu'il
attrape la régression (l'`enum` remis en place le fait rougir).

## Les images de CE dépôt étaient exposées au même 403 (31 août 2026)

Béné, sur Tiquiz : "toutes les images sont cassées c'est pas normal",
puis "j'ai même plus les favicon putain". Et une vraie cliente, Damien,
"a perdu tous ses visuels de quiz". Sur des quiz qui tournaient en
PUBLICITÉ payante.

**La panne était côté Tiquiz. Ce dépôt portait exactement la même
exposition**, et c'est tout le sujet : `app/api/upload/asset/route.ts`
est le MÊME code, avec `/srv/assets-tipote`, et son commentaire renvoie
lui aussi à un bloc `location ^~ /assets/` dans une config **nginx**...
alors que c'est **Caddy** qui répond sur les domaines `videos.*`. nginx
ne voit jamais ces requêtes.

Les images tombent alors dans le bloc des VIDÉOS, qui exige un lien
signé. Une image n'en porte pas : **403 sur toutes, d'un coup**.

**Le 403 est le diagnostic.** Un fichier absent rend 404. Un 403 dit que
le refus vient de l'authentification, pas du disque : aucun fichier
n'est perdu, ils sont refusés à la porte. Partir chercher des fichiers
disparus, c'est chercher au mauvais endroit pendant des heures.

**Et le dossier de ce dépôt N'EST PAS celui de Tiquiz.** Les deux
domaines `videos.tipote.com` et `videos.quiz.tipote.com` partagent UN
SEUL bloc de site Caddy : sans un matcher sur l'HÔTE, corriger Tiquiz
sert Tipote depuis le dossier de Tiquiz, donc rejoue la panne ici. Le
Caddyfile vit dans le dépôt TIQUIZ et route désormais chaque domaine
vers son dossier.

```bash
npm run check:assets     # apres TOUT deploiement qui touche aux images
```

Il demande un nom qui n'existe PAS exprès : **404 = la route est saine**,
403 = la panne. Il n'a donc besoin ni d'un vrai fichier ni d'un secret.

**La règle générale, et elle dépasse les images :** quand un changement
déplace l'endroit d'où quelque chose est SERVI, la dernière étape n'est
pas d'écrire la configuration, c'est d'aller chercher l'URL et de lire
le code de réponse. Le fichier était juste, commenté, relu, et adressé
à un serveur qui ne répond pas.

`DOSSIER_ASSETS_DEFAUT` vit dans `lib/storage/cheminAsset.ts`, le module
PUR : un chemin écrit à deux endroits finit toujours par diverger, et
ici la divergence coûte toutes les images.

## Une adresse email n'est pas un motif de recherche (31 août 2026)

Dans un LIKE Postgres, **`_` remplace n'importe quel caractère** et `%`
n'importe quelle suite. Or `_` est parfaitement légal dans une adresse :
`jean_dupont@gmail.com` est banal.

Cherché avec `.ilike("email", email)`, il matche donc
`jeanXdupont@gmail.com`, c'est à dire le compte de QUELQU'UN D'AUTRE.

**Dix sites dans les trois dépôts. Les deux pires sont ICI :**

- `lib/affiliate/session.ts` résout la session affiliée sur cette
  recherche. Un joker peut rendre la ligne d'un AUTRE affilié, donc lui
  montrer son tableau de bord, ses commissions et ses coordonnées.
- `app/affiliate/api/auth/start/route.ts` fait la même chose à la
  connexion. Et quand deux lignes matchent, `maybeSingle` échoue :
  l'affilié n'a alors plus de session du tout, sans qu'aucune erreur ne
  le dise.

**ON ÉCHAPPE, ON NE PASSE PAS À `.eq`.** `.eq` serait plus simple et il
est sûr partout où la colonne ne contient que du minuscule. Mais
`affiliates.email` est alimentée par des imports Systeme.io dont la
casse n'est pas garantie : empêcher une connexion serait PIRE que le
bug corrigé. `echapperMotifLike` (`lib/db/motifLike.ts`, pur et testé)
ne change RIEN au comportement, sauf exactement le cas fautif.

Le `\` s'échappe EN PREMIER, sinon on échapperait les barres qu'on vient
d'ajouter.

**Règle : toute valeur reçue de l'extérieur passée à `.like()` ou
`.ilike()` passe par `echapperMotifLike`.** Une vraie recherche (un
admin qui tape un fragment) est le seul cas où les jokers sont voulus,
et il doit alors être explicite.

Test : `tests/logic/email-pas-un-motif.test.mts`, vérifié en rejouant la
version d'avant.

## "Qui a envoyé qui" : l'inscription gratuite n'apparaissait nulle part (31 août 2026)

Béné : "j'ai testé le ref de Nina : je ne suis pas taguée comme étant
affiliée de Nina dans le suivi. Je ne peux jamais savoir qui a envoyé
qui et qui a été envoyé par qui. Le système d'affiliation n'est pas
fiable."

Elle avait raison, et pour DEUX causes empilées qui donnaient le même
écran vide.

**1. L'attribution ne se construisait que sur les VENTES.** La table
`attributions` de `/api/partner/affilies` était bâtie sur
`affiliate_commissions`, c'est à dire sur les gens qui ont PAYÉ. Or une
inscription GRATUITE par un lien affilié crée une **conversion**, pas
une commission. Et c'est précisément la conversion qui rattache
quelqu'un À VIE (règle du 26 août, sa règle).

Les conversions étaient DÉJÀ lues dans cette route (elles alimentent le
compteur de filleuls de chaque affilié). La donnée existait, personne ne
la montrait : c'est le même défaut que les liens affiliés dormants du
24 août.

**Les conversions passent devant, en ordre ASCENDANT** (le premier
rattachement gagne : un contact appartient à celui qui l'a AMENÉ). Les
commissions complètent ensuite, pour les ventes historiques arrivées par
un tunnel Systeme.io, où aucun rattachement n'a jamais été écrit chez
nous. Jamais l'inverse : un acheteur écraserait celui qui l'a amené.

**2. Et côté Tiquiz, la recherche échouait pour TOUT LE MONDE.** La
fiche client du pilotage cherchait cette table avec l'adresse telle que
l'URL la porte, c'est à dire ENCODÉE. Comme `@` s'encode toujours en
`%40`, aucune fiche n'a jamais trouvé son "amené par". Détaillé dans
l'AGENTS.md de Tiquiz.

Test : `tests/logic/attribution-suivi.test.mts`.

## La fiche d'un affilié dit TOUT, et à un seul endroit (31 août 2026)

Béné : "je clique sur l'affilié, je vois combien de comptes gratuits il
a fait créer, combien il a de clients payants, quel est son palier de
commission et / ou sa réduction sur l'outil... les factures passées, en
cours et à venir aussi, bref TOUT ! Son mode de paiement... je ne peux
le voir qu'ici et j'ai besoin de tout ça."

Le "je ne peux le voir qu'ici" est la vraie information : **le registre
vit dans ce dépôt et nulle part ailleurs.** Un chiffre absent de cette
fiche est un chiffre qu'elle ne peut obtenir qu'en ouvrant la base.

`GET /api/partner/affilies/<sa>` rend maintenant, en plus des filleuls :
la RÉCOMPENSE, l'ARGENT, le VERSEMENT et les FACTURES. Les décisions
vivent dans `lib/affiliate/ficheComplete.ts`, pur et testé ; l'écran
(centre de pilotage, dépôt Tiquiz) ne fait que les afficher.

### Quatre choses à ne pas défaire

**1. Le taux affiché est celui qui sera VERSÉ.** `attributeSale` pose
`recompense_commission_pct` sur l'AFFILIÉ, et un accord négocié
(`affiliate_rate_overrides`) passe devant le barème. Réafficher
`tauxCommissionPct(filleuls)` donnerait un autre chiffre, et c'est
celui de l'écran que Béné croirait. `affiliate_rate_overrides` existait
depuis le 19 août sans être affichée nulle part : un partenariat à 60 %
s'affichait à 40 %.

**2. L'IBAN ne sort pas, même vers son écran à elle.** Seul le MASQUE
(`FR14••••2606`), déjà stocké. Un écran se photographie, se partage, se
laisse ouvert (règle du 25 août). **Donc AUCUN spread de la ligne
`affiliates`** : la réponse est construite champ par champ. Un
`...affRes.data` sur un `select("*")` ferait sortir `iban_chiffre` ET
`pii_dek` d'un coup, sans qu'une ligne de code ne le dise. Le test
l'interdit.

Le `select("*")` est lui aussi voulu : la fiche lit des colonnes
ajoutées par quatre migrations différentes, et les nommer ferait
échouer toute la requête si l'une n'est pas passée, donc répondre
"introuvable" sur un affilié qui existe.

**3. Les quatre poches d'argent ne se recouvrent pas.** "Combien je lui
dois", "combien part au prochain lot" et "combien il a déjà touché"
sont trois nombres différents ; les fondre en un seul est exactement ce
qui a fait annoncer un chiffre jamais versé le 31 août au matin.
L'ANNULÉ s'affiche et ne se soustrait pas en silence, et il disparaît
quand il est nul (un zéro permanent ferait croire à un problème). Les
devises étrangères sont COMPTÉES, jamais additionnées à des euros.

**4. La méthode de paiement est un CHOIX, devinée seulement pour les
lignes historiques**, et l'écran le DIT (`explicite: false`). Les deux
coordonnées remplies sans choix ne se départagent pas : ce serait le
code qui déciderait où part l'argent de quelqu'un. Et `mandat` /
`profil-fiscal` / `iban` sont des manques SÉPARÉS : dire "coordonnées
manquantes" à quelqu'un qui a juste oublié de cocher le mandat
l'envoie chercher au mauvais endroit.

### LE PALIER NE COMPTE QUE LES CLIENTS PAYANTS

Béné, en relisant l'écran le jour même : "on compte les affiliés mais
seuls ceux QUI PAIENT permettent d'augmenter le palier de commission !
Tu veux que je paye des gens qui ne me rapportent rien ?? Client payant
= augmente le %, client gratuit = aucun impact, ça me semble logique."

Elle avait raison, et c'était une faute introduite le jour même : la
fiche passait le nombre TOTAL de filleuls au calcul de la marche, donc
elle annonçait "encore 4 filleuls et il passe à 50 %" en comptant des
comptes gratuits.

**Le calcul qui décide vraiment le faisait déjà bien**, et c'est ce qui
rend l'erreur impardonnable : `cron/recompense-affilies` compte dans
`affiliate_commissions`, une personne par adresse, `cancelled` et
`rejected` exclus. La fiche lit donc `recompense_filleuls`, LA colonne
que ce cron écrit, plutôt que de recompter à côté.

**Le paramètre s'appelle `filleulsPayants`, pas `filleuls`.** Un nom
vague accepte silencieusement le mauvais nombre ; celui-là a fait
échouer la compilation sur les six appelants au moment du renommage.
C'est la seule protection qui survit au prochain qui touchera au
fichier (règle du 1er août).

Trois comptes qui se ressemblent et qu'il ne faut pas confondre :
`filleuls` (tous), `acheteurs` (ont acheté un jour), `payants` (comptent
pour le palier). Un remboursé est dans le deuxième et pas dans le
troisième : un remboursement ne laisse pas un palier derrière lui.

### Les champs sont OPTIONNELS côté pilotage

Le centre de pilotage et le registre sont deux serveurs déployés
séparément. Entre les deux déploiements, la fiche répond sans les
nouveaux champs : chaque section se tait au lieu de faire planter un
écran qui marchait très bien avant.

Test : `tests/logic/fiche-affilie-complete.test.mts`.

## Le brouillon d'une question ne suit PAS le visiteur (retour Adeline, 1er septembre 2026)

"On peut revenir en arrière, ce qui est un plus, mais lorsqu'on le fait
ça efface les cases suivantes déjà remplies."

**RIEN N'ÉTAIT EFFACÉ EN BASE**, et c'est ce qui rendait le retour
difficile à croire : `answers` n'est jamais tronqué, aucune ligne de
code ne coupe le tableau. Ce qui suivait le visiteur, c'était le
BROUILLON, c'est à dire l'état de SAISIE de la question affichée.

Il vivait dans QUATRE variables globales au composant (`freeTextDraft`,
`multiOptionsDraft`, `autreTexte`, `autreChoisi`), jamais remises à la
question courante. Cinq symptômes, un seul défaut :

| Ce qu'elle a vu | Ce qui se passait |
|---|---|
| "ça efface les cases suivantes déjà remplies" | le texte tapé en Q3 arrivait pré-rempli en Q4 ; valider ÉCRASAIT la réponse déjà donnée |
| des cases cochées sans les avoir cochées | la sélection d'un multi-choix restait d'une question à l'autre |
| revenir puis cliquer décoche tout | le premier clic repartait d'un brouillon VIDE au lieu de la sélection affichée |
| impossible de tout décocher | l'affichage retombait sur la réponse enregistrée dès que le brouillon était vide |
| le texte du "Autre" invisible au retour | l'option était surlignée, le champ restait FERMÉ |

**LA CAUSE COMMUNE : la question affichée et l'état de saisie n'étaient
reliés par rien.** La remise à zéro était recopiée dans les
gestionnaires de navigation, et il en manquait : la flèche retour vidait
le texte libre, le swipe AVANT non, et les cases cochées n'étaient
vidées nulle part.

**Et un commentaire l'annonçait déjà**, posé sur `multiOptionsDraft` :
"Reset whenever currentQ changes (handled in commitAnswer + an effect
below)". **Cet effet n'a jamais existé.** Quatrième fois que ce dépôt
paie une règle écrite en commentaire et démentie par le code (le
`w-full h-auto` des images de réponse, l'`ADD_ATTR: ["target"]` des
liens légaux, le "Next décode déjà le segment" du pilotage).

**Règle : `lib/quiz/brouillonReponse.ts` décide, et UN SEUL effet
applique.** `brouillonPourQuestion(reponse, autreIdx)` rend les quatre
champs de saisie depuis la réponse de la QUESTION COURANTE ; l'effet
tourne sur `[currentQ, step, quiz, resumed]`. Plus aucune remise à zéro
dans un gestionnaire de navigation : c'est ce qui en oubliait un.

**Et le brouillon est le SEUL à décider de l'affichage.** Les deux
replis du genre `brouillon.length > 0 ? brouillon : réponse
enregistrée` sont SUPPRIMÉS, pas assouplis : **un brouillon vide est une
intention, pas une absence.** C'est ce repli qui rendait "tout décocher"
et "effacer mon texte" impossibles.

`answers` est volontairement HORS des dépendances de l'effet : valider
une réponse le modifie, et relancer l'effet là remettrait le brouillon
de la question qu'on vient de quitter. `resumed` y est, pour le seul cas
où la reprise d'un brouillon local ne change pas l'index.

**Le filet de captures ne pouvait rien voir** : il photographie un écran
au repos, et ce bug ne vit que dans l'enchaînement des gestes. Le
garde-fou est `tests/logic/brouillon-question.test.mts`, vérifié en
rejouant la version d'avant (il rougit).

Le module quiz de Tiquiz est jumeau : la correction y vit aussi.

## Le menu sous une réponse dit le NOM du profil (retour Christian, 1er septembre 2026)

"Les différents résultats n'apparaissent pas sous les réponses. Seuls
apparaissent « Résultat 1, Résultat 2 » etc."

Il avait raison, et le menu ne POUVAIT rien afficher d'autre : les deux
sélecteurs posés sous chaque réponse de l'éditeur jetaient le profil et
n'en gardaient que le rang.

```
editResults.map((_, ri) => <option>…Résultat {ri + 1}</option>)
                  ^^^ le profil, ignoré
```

Aucun titre, si bien écrit soit-il, ne pouvait apparaître. Sur un quiz à
six profils, "Résultat 4" ne dit rien : la créatrice branche ses
réponses au hasard, ou remonte vérifier l'ordre à chaque clic. C'est le
geste le plus répété de tout l'éditeur.

**LA RÈGLE EXISTAIT DÉJÀ, recopiée à la main quatre fois dans le MÊME
fichier** (`stripHtml(extractResultLabel(cleanPlaceholdersForLabel(t)))`
plus un repli). Deux endroits ne l'ont jamais eue. Une règle recopiée
finit toujours par en oublier un : c'est le `mx-auto` du sous-titre, les
images de réponse, les réseaux de partage, la sixième fois.

**Règle : `lib/quiz/resultLabel.ts`, `resultChoiceLabel(titre,
secours)`, et personne ne recompose.** Les trois étapes comptent et
l'ordre aussi : placeholders interpolés à VIDE (sinon le menu affiche
"Bonjour {name}, tu es le..."), puis `extractResultLabel` (retire le
", tu es le·la" et les marques inclusives), puis `stripHtml` (un
`<option>` ne rend pas de HTML, il montrerait les balises).

**`secours` est OBLIGATOIRE.** Un profil encore sans titre doit rester
choisissable : une entrée vide dans un menu est pire que "Résultat 3".

**Trouvé au passage, et c'est propre à ce dépôt : trois replis étaient
écrits EN FRANÇAIS DANS LE CODE** (`` `Résultat ${ri + 1}` ``), dans les
alertes de cohérence et l'aide des étiquettes. Une créatrice espagnole
ou arabe lisait "Résultat 4". La clé `quizDetail.previewResult` existe
maintenant dans les 7 langues.

**Exception assumée :** `titleForVisual` compose les deux mêmes
fonctions pour le titre d'une IMAGE générée, sans repli et avec sa
propre capitalisation. Ce n'est pas un libellé d'interface, et le
confondre casserait la génération d'images. Le test vise la composition
SUIVIE D'UN REPLI, pas la composition elle-même.

Test : `tests/logic/nom-du-profil.test.mts`. Le module quiz de Tiquiz est
jumeau : la correction y vit aussi.

### Et un projet qui n'est pas à vous ne téléporte plus personne

Béné, en essayant d'ouvrir le quiz de Christian : "je n'arrive pas à
accéder à ses quiz, je ne sais pas pourquoi, et pire : ça me redirige
directement vers mon dashboard et pas vers une page 'ce quiz n'est pas
disponible'."

On DISAIT bien quelque chose, un toast, mais `router.push("/dashboard")`
partait dans la foulée : elle changeait d'écran avant d'avoir lu la
raison, et se retrouvait sur son tableau de bord sans savoir pourquoi.
Un toast qui accompagne une navigation n'est pas un message, c'est un
reflet.

**Règle : les quatre éditeurs affichent un ÉCRAN** (titre, phrase, et
UNE sortie nommée qui passe par `projectBackHref`, donc la hiérarchie et
jamais l'historique). Plus aucune redirection sur un chargement qui
échoue. Seul le mode EMBED garde le toast : il n'a pas de tableau de
bord où retourner.

**On ne distingue pas "supprimé" de "pas à toi", et c'est voulu** : la
route répond 404 dans les deux cas pour ne pas révéler qu'un projet
existe. La phrase dit donc les deux possibilités, plus la seule chose
qui inquiète vraiment : rien n'a été modifié.

**Trouvé au passage** : deux de ces quatre écrans affichaient
`toast.error("Quiz not found")`, écrit en dur EN ANGLAIS dans une
interface qui existe en 7 langues. Les clés `unavailableTitle` et
`unavailableBody` sont posées dans les 7 fichiers.

## Deux liens, le même mot, deux gestes opposés (retour Christian, 1er septembre 2026)

Béné : "est-ce que c'est bien expliqué, la différence entre le lien de
partage pour FAIRE le quiz et celui pour COPIER le quiz dans son compte ?"

Non, et l'écran faisait tout pour les confondre :

| Le geste | Où | Comment il s'appelait |
|---|---|---|
| donner le lien pour RÉPONDRE au quiz | onglet de l'éditeur | "Partager", icône `Share2` |
| donner une COPIE du quiz à quelqu'un | carte de Mes projets | "Partager ce quiz", icône `Share2` |
| se dupliquer le quiz à soi même | carte de Mes projets | "Dupliquer", icône `CopyPlus` |

**Même mot, même icône, et le deuxième est le seul qui donne son
travail.** Un créateur qui colle ce lien à son audience installe son
quiz dans le compte de chaque personne qui clique. Le texte du panneau
était juste et complet, mais il fallait l'ouvrir pour le découvrir :
l'entrée, elle, disait le contraire.

**Règle : le geste se nomme par son VERBE, pas par sa famille.**
"Donner une copie du quiz", icône `Gift`, distincte des deux autres. Et
la première ligne du panneau pose le contraste AVANT le bouton
(`partageQuiz.notPublicLink`, 7 langues) : "ce n'est PAS le lien pour
faire passer le quiz, celui-là est dans l'onglet Partager de l'éditeur".

**Trois gestes voisins ne peuvent pas porter deux icônes.** Le premier
jet remplaçait `Share2` par `CopyPlus`... qui est déjà l'icône de
"Dupliquer". On déplaçait la collision au lieu de la retirer.

## Vérifier que le bouton du quiz porte bien l'identifiant (Béné, 1er septembre 2026)

"On peut vérifier que l'url du CTA du quiz se voit bien attribuer l'id
de l'affilié au bon format ? Il faut récupérer l'id dans l'url
(`?sa=sa...`) et l'ajouter à l'url du CTA."

```bash
npm run check:cta-affilie -- "https://app.tipote.com/q/mon-quiz?sa=sa0007..."
```

Il va chercher le VRAI quiz sur le serveur et imprime l'adresse que
portera chaque bouton (fin de quiz, chaque profil, quiz fermé). Il
appelle les MÊMES fonctions que le viewer (`lireAffiliateDuQuiz` puis
`attacherAffiliate`) : un script qui réécrirait la règle finirait par
dire le contraire de ce que le visiteur voit, c'est le défaut sorti six
fois dans ces dépôts.

**LE PIÈGE QU'IL EXISTE POUR ATTRAPER : un `sa` mal formé est jeté SANS
BRUIT.** C'est voulu, cette valeur finit dans un versement. Mais à
l'écran rien ne le montre : le bouton mène quelque part, il ne porte
simplement rien. Le script dit la longueur reçue et la forme attendue
("sa" + 20 à 80 caractères hexadécimaux, `lib/affiliate/saFormat.ts`).

**Ce qu'il ne peut PAS vérifier, et il le dit :** la deuxième moitié
appartient au vendeur. Systeme.io pose SON cookie quand le visiteur
atterrit sur SA page ; nous, on ne fait que coller l'identifiant sur le
bouton. Et leur API n'expose AUCUN moyen d'assigner un affilié à un
contact (mesuré : l'écriture d'un contact n'accepte que des champs et
une langue). Un contact créé par notre capture d'email affichera donc
toujours "Affilié : Aucun" tant que la personne n'a pas cliqué le
bouton.
