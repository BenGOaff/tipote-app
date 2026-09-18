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
| **par quoi reprendre, tout de suite** | **`PASSATION.md`** (dépôt tiquiz, daté du 9 septembre) |
| **ce qui reste à faire, dit par Béné** | **`CHANTIERS.md`** (dépôt tiquiz) |

**Béné ne lit pas les dossiers.** Tout ce qu'elle doit faire ou copier
se met dans le message final, jamais dans un fichier qu'on lui demande
d'ouvrir. Une commande à la fois, aucun paramètre à remplacer.

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

**ET JAMAIS `. .env` DANS UNE CRONTAB (mesuré le 11 septembre 2026).**
La crontab tourne sous `sh`, pas sous bash, et `sh` ne cherche pas
`.env` dans le dossier courant : le journal disait
`/bin/sh: 1: .: .env: not found`, et les HUIT lignes écrites ainsi
n'avaient jamais tourné (le barème des affiliés, la maturation, les
factures revendeurs, le rejeu des commissions). Une ligne de crontab lit
la SEULE clé dont elle a besoin, dans l'ordre que Next utilise :

```bash
curl -fsS -H "X-Cron-Secret: $(grep -m1 -h '^CRON_SECRET=' /home/tipote/tipote-app/.env.local /home/tipote/tipote-app/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"\r')" https://app.tipote.com/api/cron/...
```

**Et sur le serveur de Tipote, `.env.local` EXISTE et passe devant
`.env`** : il porte `TIPOTE_KEYS_ENCRYPTION_KEY`, les secrets vidéo et
un `CRON_SECRET` différent de celui de `.env`. On ne le supprime pas
(la clé de chiffrement n'est nulle part ailleurs) ; toute commande qui
a besoin d'un secret lit `.env.local` d'abord. `npm run check:cron-secret`
nomme le fichier qu'il a lu. Aucun secret ne s'écrit en clair dans la
crontab : un `crontab -l` collé dans une conversation les expose.

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

## ON DIT TAG, JAMAIS ÉTIQUETTE (Béné, 1er septembre 2026)

"Ne dis jamais étiquette, nulle part, on parle bien de tag en français
aussi. Supprime tout ce que tu appelles étiquette partout pour dire tag,
et mets tags bordel !"

**La raison est produit, pas stylistique : c'est le mot que Systeme.io
affiche.** Son menu CRM en français dit "Tag". Une consigne qui dit
"étiquette" envoie la créatrice chercher un mot qui n'existe pas sur son
écran, au moment précis où elle suit une marche à suivre clic par clic.

**Et ça vaut par LANGUE, pas dans l'absolu.** Vérifié sur ses captures du
tableau de bord Systeme.io :

| Langue | Ce que Systeme.io affiche | Ce qu'on écrit |
|---|---|---|
| français, italien, portugais, anglais | Tag | **tag** |
| **espagnol** | Etiquetas | **etiqueta** |

L'espagnol est la seule exception, et elle est OBLIGATOIRE : y écrire
"tag" rendrait la consigne fausse, puisque le bouton qu'elle doit
cliquer s'appelle "Etiqueta añadida". L'arabe n'a pas été vérifié.

**La nuance à ne pas rater : "étiquette" au sens LIBELLÉ n'est pas un
tag.** Le libellé min/max d'une échelle, le "conversion label" de Google
Ads, le mot affiché à la place d'un score : ce ne sont pas des tags
Systeme.io. On y écrit **libellé**, pas "tag", sinon on rend le texte
faux dans l'autre sens.

Ça couvre aussi le CODE : un fichier `etiquetteVente.ts` et une fonction
`poserEtiquetteAcheteur` disaient le mot interdit. Renommés en
`tagVente.ts` et `poserTagAcheteur`.

**ET LA FAUTE QUE J'AI FAITE EN L'APPLIQUANT, qui vaut plus que la
règle :** j'ai remplacé le mot partout d'un coup, sans relire les
phrases. "Étiquette" est féminin, "tag" est masculin : le dépôt s'est
retrouvé avec "un tag posée", "le tag exacte", "de le tag", "aucune tag
manquante". Et là où le mot voulait dire LIBELLÉ, le texte est devenu
faux : la largeur d'un axe de graphique "réserve la largeur des tags",
l'orientation EXIF d'une photo devenait "un tag tourne-moi de 90
degrés". Réparé le jour même, mais le geste était mauvais.

**Un remplacement de mot n'est pas une opération mécanique.** Un mot
porte un GENRE (donc des accords à refaire) et un SENS (donc des
endroits où il ne s'applique pas). Le contrôle à faire après, et pas
avant :

```bash
grep -rnE "(une|nouvelle|cette|aucune|toute) tags?|tags? (créée|posée|manquante|exacte|courte|ancienne|inconnue)|de le tag" . --exclude-dir=node_modules
```

Zéro ligne, sinon on a laissé une phrase cassée derrière soi.

## Les interdits qui ne se discutent pas

Ajouté le 18 septembre 2026 en découpant ce fichier. Chaque ligne RÉSUME une
règle écrite en entier dans `AGENTS_HISTORIQUE.md` : avant de toucher au code
concerné, on va lire sa section. Rien ici n'est nouveau.

- **AUCUN ARGENT NE PART D'UN ÉCRAN.** On produit un FICHIER (SEPA
  `pain.001.001.03`, ou la liste PayPal). Béné le dépose dans sa banque.
- **L'IBAN est chiffré au repos et ne ressort JAMAIS en clair**, pas même vers
  sa propriétaire : seulement le masque (`FR14••••2606`). Donc **AUCUN spread
  de la ligne `affiliates`** : la réponse se construit champ par champ.
- **Sans mandat d'autofacturation, pas de facture, donc pas de virement.**
  Écrire une facture au nom de quelqu'un sans son accord est un faux.
- **Un lot est une PIÈCE, pas un calcul** : il fige les montants ET les
  coordonnées. On crée le lot D'ABORD, on marque les commissions ensuite.
- **`base` est un paramètre OBLIGATOIRE** de `attributeSale` : un appelant muet
  est lu comme TTC, qui est le repli conservateur. Un virement parti ne revient
  pas.
- **Aucun secret ne s'imprime**, et il se compare en TEMPS CONSTANT. Un
  contrôle dit "les deux valeurs diffèrent" et s'arrête là.
- **Le `.env` se lit DANS UNE PARENTHÈSE**, jamais dans le shell nu, jamais
  `. .env` dans une crontab. `npm run build && pm2 restart <app> --update-env`
  sur UNE ligne : sans le `&&`, un build refusé se déploie quand même.
- **Je ne pousse JAMAIS sur `main`**, seulement sur la branche indiquée dans la
  consigne de session. Ce nom change à chaque fois : jamais recopié d'un fichier.
- **`npm run test:logic` et `npx tsc --noEmit` avant CHAQUE push**, sans qu'on
  le demande.
- **Une migration SQL touchée = le bloc 🚨 dans le message final.**
- **Les fichiers SUPPRIMÉS, et eux seuls, se signalent** dans le message final.

## Où chercher une règle, et pourquoi elle existe

Les 73 sections chronologiques de ce fichier vivent dans
`AGENTS_HISTORIQUE.md`, **à la racine de ce dépôt**. Elles ne sont plus
relues à chaque tour : elles se lisent À LA DEMANDE, avant de toucher au
code qu'elles décrivent.

**Rien n'a été réécrit ni résumé** : le découpage est mécanique, à l'octet
près, et il est réversible par un `git revert`.

```bash
grep -n '^## ' AGENTS_HISTORIQUE.md          # la liste
grep -n -i 'nbsp\|affilié\|migration' AGENTS_HISTORIQUE.md   # chercher
sed -n '<debut>,<fin>p' AGENTS_HISTORIQUE.md # lire une section
```

**Avant de toucher à un chantier, on lit SA section**, comme avant : le
fichier est le même, il n'est simplement plus recopié dans chaque
conversation. Les voici, dans l'ordre :

- Espace affilié = sous-domaine, le pathname N'A PAS /affiliate (drame Gwenn 8 juin 2026)
- Distribution par résultat — RÈGLE UNIQUE (drame Gwenn 8 juin 2026)
- Funnel par question - RÈGLE UNIQUE (drame Adeline 1er août 2026)
- Identité stable des questions - RÈGLE UNIQUE (1er août 2026)
- Réponses sans options - à ne pas oublier (retour Jocelyne 1er août 2026)
- Taille de police d'un champ : UNE seule enveloppe (drame Jocelyne 1er août 2026)
- Quiz scoré : les contrôles "profil" ne s'appliquent PAS (drame Véronique 1er août 2026)
- Flèche retour = hiérarchie, jamais l'historique (drame Gwenn 1er août 2026)
- "Ne pas afficher le score" (retour Véronique 1er août 2026)
- Boutons de partage : les réseaux cochés, ou TOUS (retour Béné 1er août 2026)
- Un lien envoyé par email pointe sur NOTRE domaine (drame Véronique sur Tiquiz, 2 août 2026)
- Mode scoring : le visiteur ne doit JAMAIS voir une page vide
- Un `ok: false` produit TOUJOURS quelque chose à l'écran (3 août 2026)
- Le chrome d'édition n'hérite jamais de l'aperçu (drame Jocelyne 3 août 2026)
- Moins de réponses que de profils (escalade Véronique 3 août 2026)
- Titre et sous-titre partagent UN bord, calculé UNE fois (drame Béné 3 août 2026)
- La page de résultat suit les 4 temps de l'Atelier (3 août 2026)
- Les titres générés s'inspirent des ressources, sans les recopier (3 août 2026)
- Le logo n'est pas un bloc de texte (retour Béné 3 août 2026)
- Titre et sous-titre : la borne est sur le CONTENEUR, jamais sur un champ
- Liste ou colonnes : l'aperçu ignorait le réglage (retour Béné 3 août 2026)
- Le sous-titre du quiz dit un BÉNÉFICE, jamais la fiche technique (retour Béné 3 août 2026)
- Un prompt est du CODE : il se teste (3 août 2026)
- Typographie française : liste NOIRE, et l'espace s'INSÈRE (3 août 2026)
- Une chute dans le funnel : sur QUI, et sur QUELLE question (drame Jocelyne 4 août 2026)
- Le mot "quiz" n'est plus interdit comme adresse (retour Béné 4 août 2026)
- Alignement : trois étages, et le plus fort doit pouvoir se taire (4 août 2026)
- L'image d'une réponse garde SON format (retour Béné 4 août 2026)
- Une librairie qui change d'API, et un `as unknown as` qui l'a caché (drame François Xavier, 7 août 2026)
- Partager SON résultat, pas le quiz (retour client, 7 août 2026)
- Un shell qui garde le `.env` de l'autre app (panne 22 août 2026)
- Un lien légal ne fait JAMAIS quitter la page (Béné, 24 août 2026)
- Le centre d'aide est la PORTE, la file vit dans Tiquiz (23 août 2026)
- Le mois offert ne s'ouvre QUE sur un lien du système courant (23 août 2026)
- Nos liens portent `?ref=`, plus jamais le `?sa=` de Systeme.io (24 août 2026)
- Une destination ajoutée en code n'exige plus de migration
- L'audit du 24 août : ce qui pouvait merder, et qui a été réparé
- L'espace affilié s'inspire de Waalaxy : un lien par canal (24 août 2026)
- Sortir de Systeme.io : l'état des lieux vit dans le dépôt Tiquiz
- Les liens affiliés atterrissent sur NOS domaines (Béné, 25 août 2026)
- Payer les affiliés : PayPal ou virement, au choix (Béné, 25 août 2026)
- On écrit la facture À LA PLACE de l'affilié (Béné, 25 août 2026)
- L'audit du 26 août : trois trous d'argent dans l'affiliation
- Le tableau de bord annonçait un chiffre jamais versé (31 août 2026)
- Les 7 règles du programme d'affiliation (Béné, 26 août 2026)
- Le robot d'aide était MORT en portugais (audit du support, 31 août 2026)
- Les images de CE dépôt étaient exposées au même 403 (31 août 2026)
- Une adresse email n'est pas un motif de recherche (31 août 2026)
- "Qui a envoyé qui" : l'inscription gratuite n'apparaissait nulle part (31 août 2026)
- La fiche d'un affilié dit TOUT, et à un seul endroit (31 août 2026)
- Le brouillon d'une question ne suit PAS le visiteur (retour Adeline, 1er septembre 2026)
- Le menu sous une réponse dit le NOM du profil (retour Christian, 1er septembre 2026)
- Deux liens, le même mot, deux gestes opposés (retour Christian, 1er septembre 2026)
- Vérifier que le bouton du quiz porte bien l'identifiant (Béné, 1er septembre 2026)
- Le chrome de l'app ne s'affiche JAMAIS chez un visiteur (Béné, 1er septembre 2026)
- Une entité HTML sans balise autour (retour Christian, 1er septembre 2026)
- Les générateurs, deuxième passage (Béné, 2 septembre 2026)
- L'onglet Automatiser, porté de Tiquiz (1er septembre 2026)
- Les trois générateurs de contenu, portés de Tiquiz (1er septembre 2026)
- Cloudflare masquait les adresses des pages légales (3 septembre 2026)
- Un 5xx devant un navigateur perd sa raison (3 septembre 2026)
- Un client anglophone de Tiquiz est parti, et Tipote portait les mêmes défauts (7 septembre 2026)
- Un fichier de `public/` MASQUE une route de même chemin (7 septembre 2026)
- Le domaine perso d'une créatrice ne sert que SES quiz (9 septembre 2026)
- « Je n'ai pas pu regarder » n'est pas « il n'y a personne » : le registre répond 503 (11 septembre 2026)
- Le versement ne paie jamais deux fois, et ce qui est parti à tort se voit (11 septembre 2026, suite)
- Le rattachement retrouve sa personne, alias compris (Béné, 12 septembre 2026)
- Un champ personnalisé dans le formulaire de capture (retour client, 16 septembre 2026)
- Les champs personnalisés partent dans la fiche contact Systeme.io (Béné, 16 septembre 2026)
- Le bouton "Publier" est un interrupteur Actif / Désactivé (retour client, 16 septembre 2026)
- `&nbsp;` en clair : la cause était NOTRE PROPRE sanitize (16 septembre 2026)
- TOUT le formulaire de capture est éditable (Béné, 16 septembre 2026)
- Un seul endroit pour TOUT ce qu'on demande au visiteur (Béné, 17 septembre 2026)
