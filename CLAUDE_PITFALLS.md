# Claude pitfalls + conventions (pense-bête personnel)

> Fichier auto-géré par Claude. Lu à chaque session via AGENTS.md.
> Mis à jour quand un bug remonte plusieurs fois ou qu'une convention
> implicite se révèle après coup. **Si je casse un de ces points, c'est
> un bug régressif évitable.**

---

## A) Checklist quand j'ajoute une COLONNE sur `quizzes`

Toujours faire les 7 étapes, dans l'ordre, sinon la feature est cassée silencieusement :

1. **Migration** : `ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS … BOOLEAN/TEXT/JSONB`. Default sensible. Comment.
2. **Schema cache** : finir la migration avec `NOTIFY pgrst, 'reload schema';` (sinon Supabase API → 500 "Could not find column in schema cache").
3. **API PATCH whitelist** : `app/api/quiz/[quizId]/route.ts` → ajouter la colonne dans `allowedFields[]`. Sans ça le save l'ignore.
4. **API public SELECT** : `app/api/quiz/[quizId]/public/route.ts` → ajouter la colonne dans la chaîne SELECT du `admin.from("quizzes").select(…)`. Sans ça le visiteur ne la voit jamais (bug `phone_required` mai 2026).
5. **Editor state** : ajouter `useState` + load depuis autosave snapshot (`s.column_name`) + load depuis DB (`q.column_name ?? default`) + ajouter dans le `autosaveSnapshot` useMemo + ajouter dans la deps array.
6. **Editor save payload** : ajouter dans le body PATCH (le `fetch` dans handleSave). Si c'est une colonne sur `quiz_results` ou `quiz_questions`, vérifier que le mapping `editResults.map(r => ({ … }))` la propage (bug `image_url` mai 2026 où le map n'incluait que `{text, result_index}`).
7. **Visitor type + render** : ajouter dans le type `Quiz` de `PublicQuizClient.tsx`, puis le consommer dans le render.

---

## B) Checklist Storage / images / fichiers

- **Bucket `public-assets`** : path `<topic>/<auth.uid()>/<file>.<ext>`. Le RLS de Supabase Storage est permissif sur ce bucket (tout authenticated peut INSERT). Si on bug "new row violates row-level security policy", c'est qu'une vieille policy restrictive existe : la migration `20260519_public_assets_permissive_reset.sql` reset propre.
- **Pas de redimensionnement** côté visiteur : `w-full h-auto` toujours. Jamais `max-h-* object-cover` sur du contenu user (crop + cap = mauvaise UX, Adeline 18 mai 2026).
- **Drag-and-drop = HTML5 natif** : `<img draggable onDragStart={…}>` + drop-zones avec `onDragOver={e => e.preventDefault()}` + `onDrop={…}`. PAS de "click to position" — Adeline a explicitement rejeté ce pattern.

---

## C) Rich-text / contentEditable

- **`RichTextEdit` rend deux branches** : `if (editing) return …; return …;`. **Toujours rendre les Dialogs hors du branchement** sinon ils ne sont jamais montés quand le bouton est cliqué. Pattern actuel : `const dialogs = (<>…</>); if (editing) return <>…{dialogs}</>; return <>…{dialogs}</>;`
- **Dialog steal le focus** du contentEditable → onBlur → commit() → setEditing(false) → champ démonté avant que `restoreSelection()` ne puisse faire son boulot. Gate via `dialogPausedRef` (set sync AVANT le `setOpen(true)`, reset au close).
- **Entités HTML survivent au strip de tags** : `&nbsp;` n'a pas de `<…>` donc la regex strip-tags le laisse passer. `extractResultLabel` décode maintenant les entités, mais si on duplique cette logique ailleurs il faut décoder aussi (`&nbsp;` → " ", `&quot;` → `"`, `&amp;` en DERNIER pour éviter double-decode).
- **Label admin d'un résultat** : toujours `stripHtml(extractResultLabel(cleanPlaceholdersForLabel(text)))`. Les 3 chaînés. (defense-in-depth : si quelqu'un modifie extractResultLabel, on a quand même la sécurité de stripHtml).
- **contentEditable insère `&nbsp;`** systématiquement à la place d'un espace après ponctuation française (`Mot :` devient `Mot&nbsp;:`). C'est volontaire (typographie FR), il faut juste décoder côté display.

---

## D) Endpoints publics

- **`/track` ne retourne JAMAIS de 4xx** : analytics endpoint en console = perçu comme bug par le créateur. Retourner 200 avec `{ok: false, reason}` partout. Le client ne lit pas le body (fire-and-forget) donc rien ne casse.
- **Slug ou UUID** : public-facing routes acceptent les deux. Toujours utiliser le pattern `resolveQuizIdFromSlugOrId`. Si je fais `.eq("id", quizId)` direct, ça 404 sur tous les quiz qui ont un slug custom.
- **Bot filtering** : sur les routes qui comptent des vues, blocklist UA (regex `/bot|crawl|spider|googlebot|chatgpt|gpt|ahrefs|semrush|facebookexternalhit|telegrambot|whatsapp/i`).
- **Owner exclusion** : `getSupabaseServerClient().auth.getUser()` puis check `quiz.user_id === user.id` pour skip le tracking sur ses propres previews.

---

## E) i18n namespaces — pièges

- **Tipote** : éditeur quiz utilise `useTranslations("quizDetail")` (≠ Tiquiz qui utilise `quizEditor`).
- **Tipote user settings** : `SettingsTabsShell` utilise `useTranslations("settingsPage")` avec **clés nested** (`reglages.xxx`, `tabs.xxx`). Format hiérarchique en JSON, pas plat.
- **CSS rich-text** : Tipote `tipote-quiz-rich` / `tipote-quiz-rich-inline` (≠ Tiquiz `tiquiz-rich`). Ne pas confondre quand on copie-colle entre repos.
- **PublicQuizClient** : dictionnaires inline (`translations: Record<string, QuizTranslations>` dans le fichier), pas `messages/*.json`. 8 entrées (fr / fr-vous / en / es / de / pt / it / ar). Ajouter dans les 8 quand on touche au visiteur.
- **API `/api/profile`** : Tipote utilise **Zod schema** pour valider le PATCH (≠ Tiquiz qui a un `allowedFields` array). Ajouter une nouvelle colonne nécessite `z.string().trim().max(N).nullable().optional()` dans le schéma `profileUpdateSchema`.
- **Toast Tipote** : **dépend du fichier**. Vérifier l'import au top.
  - `MyContentLovableClient.tsx`, `SettingsTabsShell.tsx` → `import { toast } from "@/components/ui/use-toast"` → `toast({ title, variant: "destructive" })`
  - `QuizDetailClient.tsx`, `SurveyDetailClient.tsx`, `PublicQuizClient.tsx` → `import { toast } from "sonner"` → `toast.error("…")` / `toast.success("…")`
  - Si je porte du code de Tiquiz (sonner uniforme) vers Tipote, **toujours regarder le pattern existant** du fichier cible avant de coller.

---

## F) Compteurs et événements (post-Phase A tracking)

- **Source de vérité = `quiz_events`** (table log time-series). Les compteurs sur `quizzes` (views_count, etc.) sont **auto-bumpés par trigger** `trg_quiz_events_bump_counter`. **Ne JAMAIS UPDATE les compteurs directement** — faire un **INSERT direct dans `quiz_events`** (le trigger bumpe). **NE PAS** passer par la RPC `log_quiz_event` : un `await rpc(...)` qui ne lit pas `{ error }` masque les échecs (sur Tiquiz, des surcharges coexistantes faisaient échouer l'appel en silence → starts/completes=0). On insère direct (track route + share) et on lit l'erreur.
- **Funnel par question** : la requête `analytics` trie par `created_at` DESC (PAS `question_index` ASC) avant `.limit(50000)`, sinon une troncature couperait les questions de FIN → funnel limité aux 1res questions.
- **Dedup via cookie session** : cookie `tquiz_visit` HttpOnly 30j (même nom sur Tipote pour simplicité), généré server-side au premier load. Le tracking serveur check `(quiz_id, event_type, session_id, created_at > NOW() - 24h)` avant INSERT.
- **Client `trackedRef`** : Set en mémoire pour éviter les doublons IN-tab. Combiné avec le cookie côté serveur, on dédupe correctement même si l'utilisateur ouvre 5 onglets.

## G) Tracking pixels Meta + Google (post-Phase B)

- **Injection des scripts** : via `useEffect` dans `PublicQuizClient` qui crée `<script>` et `appendChild(document.head)` programmatiquement. PAS de composant `<TrackingPixels>` avec next/Script — c'était galère à placer à travers les multiples step branches (intro/quiz/email/result/share).
- **Strict consent gate** : `pixelsConsentGiven = quiz.show_consent_checkbox === false || consent`. Si pas donné → aucun script injecté → fbq/gtag pas définis → fireQuizPixel silencieux.
- **fireQuizPixel(event, config)** dans `lib/clientPixels.ts` : appelé en parallèle de `trackEvent(event)`. Le 1er parle aux pixels externes, le 2e à la DB interne. Les deux systèmes cohabitent — pas de fallback de l'un à l'autre.
- **gtag.js sert GA4 ET Google Ads** sur la même page. On charge un seul `<script src="...gtag/js?id=PRIMARY">` puis on fait `gtag('config', GA4_ID)` ET `gtag('config', ADS_ID)`. Pattern officiel Google.
- **Conversion fire** : `gtag('event', 'conversion', { send_to: 'AW-XXX/LABEL' })` UNIQUEMENT sur le `complete` event (= visiteur a soumis l'email). Pas sur view ou start.
- **Per-quiz + défauts user** : 4 colonnes sur `quizzes` + 4 sur `profiles` (préfixe `default_*`). Bouton "↺ Appliquer mes valeurs par défaut" dans l'éditeur quand le user a configuré ses défauts ET que les champs locaux sont vides.

---

## G) UX / produit (retours utilisateur récurrents)

- **WYSIWYG par défaut** : édition inline dans le preview, pas dans Settings sidebar. Adeline rejette systématiquement les patterns "édit dans réglages" (consent text, 18 mai 2026).
- **Drag-and-drop signifie click + hold + drop** (HTML5), pas click pour cycler positions.
- **Convention SaaS forms** : asterisk rouge sur les champs obligatoires, RIEN sur les optionnels. Ne pas écrire "(optionnel)" en suffixe.
- **Dialogs custom obligatoires** : `window.prompt` / `window.alert` = anti-pattern. Toujours utiliser `<Dialog>` Radix du design-system.
- **Sortie d'un lien dans un quiz** : `target="_blank"` + `rel="noopener noreferrer"`. Le lien ne doit jamais voler le quiz. `RichTextEdit.tsx` pose ces attributs automatiquement après `createLink`.

---

## H bis) Sync UI : nouvelle tab Settings ⇒ UserAvatarMenu

Quand j'ajoute un onglet à `SettingsTabsShell`, je DOIS aussi
l'ajouter dans le dropdown `components/UserAvatarMenu.tsx` (menu
déroulant photo de profil). Adeline (19 mai 2026) a remonté qu'il
manquait des entrées (sources + domain sur Tipote).

Checklist 2-points : (1) SettingsTabsShell TabsTrigger + TabsContent ;
(2) UserAvatarMenu `settingsTabs[]` + `header.menu.*` i18n × 7 locales.

## H ter) i18n nested keys : check le SHAPE avant d'ajouter

Quand j'écris à `header.menu.foo`, je dois d'abord vérifier que
`header.menu` est un DICT, pas un STRING. Sur Tipote `pt` + `pt-BR`,
`header.menu` valait `"Menu"` (string raw jamais traduit) — un
`setdefault('menu', {})` retournait alors le string et le `menu[k]=…`
crashait. Python : `isinstance(menu, dict)` avant d'écrire ; ou
réécrire la sous-arbo complète si elle est mal typée.

## I) Typographie française au render — NBSP devant `:;!?»`

`lib/quizPersonalization.ts:interpolateText` cleanait les espaces
ASCII devant TOUTES les ponctuations avant ce fix (Adeline 19 mai
2026). Bug : "reçu?" et "passé:" en français.

Maintenant :
- `,` `.` `)` → strip l'espace devant (anglais & français ok)
- `: ; ! ? »` → REMPLACE l'espace ASCII par U+00A0 (NBSP) — typo
  française. Le NBSP existant déjà reste intouché.

Si je touche à cette fonction, ne PAS revenir au regex unifié
`[ \t]+([.,;:!?»)])` → "$1" — c'est la régression V1.

## H) Placement UI — visibilité, pas hasard

- **Toujours demander la place exacte** quand j'ajoute une section Settings / Paramètres. Adeline (mai 2026) m'a fait déplacer 2× la même Card "Tracking & Pubs" parce que je l'avais collée "à la fin du tab actuel" sans réfléchir.
- **Tabs visuels = navigation principale**. Une nouvelle section logiquement séparée (ex. Tracking ≠ Branding) mérite son propre tab, pas un Cards en bout de tab existant.
- **Tipote** : Card "Tracking & Pubs" sous Systeme.io dans le tab "Connexions" (cohérent : c'est une "connexion à un service externe").
- **Tiquiz** : onglet dédié "Tracking" entre Systeme.io et Compte & Tarifs.

## K) OG metadata sur custom domain → toujours utiliser `buildCanonicalUrl`

Next.js `metadataBase` dans `app/layout.tsx` est UNE URL statique. Si je
laisse `openGraph.url` non défini, Next utilise metadataBase → l'aperçu
iMessage / WhatsApp affiche `app.tipote.com` même quand l'user est sur
son custom domain (rapport mai 2026).

Toute nouvelle route publique (= servie à un visiteur lambda, pas le
dashboard) DOIT :
1. Importer `buildCanonicalUrl` depuis `@/lib/publicUrl`
2. Calculer `const canonical = await buildCanonicalUrl(<chemin actuel>)`
3. Spread `{ url: canonical }` dans `openGraph` ET
   `alternates: { canonical }` au niveau top-level.

Sinon : iMessage / WhatsApp / Slack lisent `og:url` du HTML retourné et
affichent ce hostname sous l'aperçu → l'user a payé pour son custom
domain mais voit l'URL Tipote partout. Bug d'image de marque sévère.

Routes concernées actuellement (Tipote) : `/q/[quizId]`, `/p/[slug]`,
`/pq/[popquizId]`, `/[publicSlug]`. Mêmes 3 catégories en Tiquiz.

## J) PageBuilder iframe : selection-preservation pour les dialogs parent

Quand un bouton de la toolbar inline (Link / Image / Couleur) ouvre un
Dialog React côté parent, le contentEditable de l'iframe perd le focus →
la sélection est perdue → exec("createLink") ou exec("foreColor") ne
sait plus sur quoi agir. Solution implémentée mai 2026 :

1. **Iframe** : `saveSelectionForDialog()` clone le Range avant le
   `parent.postMessage`. `dialogPaused=true` empêche le blur handler du
   contentEditable de tear-down la toolbar.
2. **Parent** : ouvre le Dialog Radix. À la confirmation, postMessage
   retour vers l'iframe avec le résultat.
3. **Iframe** : `restoreSelectionFromDialog()` refocus l'élément +
   `sel.addRange(savedRange)` + **nullifie `savedSelRange` aussitôt**
   (sinon un cancel-dialog tardif re-restore un range invalidé par
   l'execCommand qui vient de réécrire les nodes).
4. **Parent** : sur fermeture du Dialog, post `tipote:cancel-dialog`
   systématiquement — c'est un no-op si l'apply a déjà consommé le range.

Si je touche à ce flow, vérifier que :
- la toolbar reste visible pendant que le Dialog est ouvert
  (dialogPaused respecté dans blur),
- exec restaure la sélection avant exec (sinon execCommand ne fait rien),
- `savedSelRange` est nullifié après consommation (sinon double-restore
  buggy).

## L) WORKFLOW DE DÉPLOIEMENT — comprendre où vit vraiment mon code

**Mon code ne va JAMAIS direct en prod.** Il passe par 4 étapes :

1. **Je commit sur ma branche `claude/setup-dev-guidelines-CmXl0`**
   → visible à https://github.com/BenGOaff/tipote-app/tree/claude/setup-dev-guidelines-CmXl0
2. **Ben télécharge mon code en local sur son PC** (Windows,
   `C:\Users\hello\Desktop\tipote-app`) depuis cette branche
3. **Il push sur `main`** via `git add . && git commit && git push origin main`
4. **Il déploie sur le VPS** :
   ```
   cd /home/tipote/tipote-app
   git stash && git pull origin main && npm ci && npm run build
   pm2 restart tipote-prod --update-env
   ```

**Conséquence critique** : si je viens de pusher 5 commits sur ma branche
en succession, **ils ne sont en prod qu'après les 4 étapes**. Entre
chaque commit que je fais et le moment où ça touche la prod, il peut
s'écouler des heures (Ben doit re-télécharger, re-push main, re-build).

**Quand un user me dit « ton code est sur main » ou « j'ai déployé »** :
- ça veut dire qu'il a fait étape 3 (push main) ET étape 4 (build VPS)
- **mais pas forcément avec MES DERNIERS commits** — il a téléchargé à
  un moment T, mes commits postérieurs à T sont restés sur ma branche
- avant de conclure « mon code marche pas », **toujours vérifier que le
  commit sur lequel je base mon analyse est bien le commit qui tourne
  en prod**. Outils :
  - `curl -sL <url-prod> | grep <truc-spécifique-au-dernier-commit>`
  - demander à Ben de faire `git log origin/main -5 --oneline` pour
    voir le dernier commit sur main
- si mon dernier commit n'est pas en prod, lui rappeler le merge :
  ```
  cd C:\Users\hello\Desktop\tipote-app
  git fetch origin
  git checkout main
  git merge origin/claude/setup-dev-guidelines-CmXl0 -m "merge claude"
  git push origin main
  ```

**Conclusion à appliquer SYSTÉMATIQUEMENT** : quand un fix touche un
truc visible côté visiteur (OG meta, public page, etc.) et que le user
re-teste, et que ça ne marche pas comme prévu → **AVANT** de re-coder
ou de spéculer sur un nouveau bug, **vérifier d'abord avec un curl
direct** que le serveur sert bien la version qui contient mon fix. Si
non, c'est un problème de pipeline déploiement, pas de code.

## I) Quand je vais douter pendant le code

1. **Avant de toucher une colonne SQL** : relire section A.
2. **Avant de toucher RichTextEdit** : relire section C.
3. **Avant de toucher du tracking** : relire section F.
4. **Quand je hot-fix un bug** : poser une note ici si la cause racine est non-évidente.

**Idempotence des migrations** : `IF NOT EXISTS` partout. `DROP POLICY IF EXISTS` avant `CREATE POLICY`. `CREATE OR REPLACE FUNCTION` pour les RPC. **Jamais une migration qui crashe si rejouée**.

**Toujours finir une migration par `NOTIFY pgrst, 'reload schema';`** quand on a touché à des colonnes/policies/RPC.

**Typecheck systématique** avant commit : `npx tsc --noEmit`. Exit 0 ou je fix.

## X) IFRAME EMBED — ne JAMAIS poser `X-Frame-Options` sur `/q/`, `/p/` (21 mai 2026)

**Cas réel** : JB (compte-sio@imagelys.com) embed ses quiz Tipote via
iframe sur son blog Systeme.io (imagelys.com). Le 9 mai 2026, commit
`056ddfb1` a posé `X-Frame-Options: SAMEORIGIN` sur les routes
publiques /p/ et /q/ dans middleware.ts. Conséquence : tous les iframes
JB (et n'importe quel autre user qui embed) ont cassé silencieusement —
"app.tipote.com n'autorise pas la connexion" dans le navigateur.

Fix dans commit `8b41d898` (21 mai) : remplacer par
`Content-Security-Policy: frame-ancestors *` qui permet l'embedding
tout en gardant les autres headers de hardening
(`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).

**Règle absolue** : sur les routes publiques d'un quiz/popquiz, **ne
PAS poser `X-Frame-Options`**. Si je veux durcir, utiliser :
```ts
res.headers.set("Content-Security-Policy", "frame-ancestors *");
res.headers.delete("X-Frame-Options");
```

**Test de non-régression** à lancer après tout commit qui touche
`middleware.ts` ou `next.config.ts` :
```bash
curl -sI https://app.tipote.com/q/<quiz-actif> | grep -iE 'frame|content-security'
```
Sortie attendue : `content-security-policy: frame-ancestors *`. Absent
ou `x-frame-options: SAMEORIGIN` = régression.

## Y) EXTENSION CHROME — détection des publications (v1.0, 21 mai 2026)

**Ne JAMAIS** revenir à un polling périodique de `voyagerFeedDashProfileUpdates` ou autre endpoint Voyager privé pour détecter les publications de l'user. Ces endpoints :
- Répondent 400/403 sans warning quand LinkedIn change leur signature (cas reel 19-20 mai 2026)
- Sont rate-limités (risque de griller le compte)
- Doivent être ré-engineered ~tous les 3-6 mois

**Solution** : `apps/extension/src/injected.ts` — script injecté dans le MAIN world de LinkedIn qui hook `window.fetch` et `XMLHttpRequest.prototype.send`. Quand LinkedIn POST vers son propre endpoint de création de post, on capture la réponse et on extrait l'URN. Émis via `window.postMessage` au content script.

**Si LinkedIn change ses URLs internes de création** (ce qui arrive régulièrement) : étendre la liste `POST_CREATE_PATTERNS` dans `injected.ts`. Diagnostic en regardant les logs `[tipote/injected]` dans la DevTools Console de LinkedIn quand l'user publie un post.

## Z) EXTENSION CHROME — throttle anti-ban OBLIGATOIRE (v1.0, 21 mai 2026)

Toute action write LinkedIn (like, comment) passe par `voyagerLike()` / `voyagerComment()` qui :
- Vérifie le throttle avant action (refuse si > 12/h ou compte en pause)
- Wait gaussien aléatoire 3-25s avant fetch (anti-bot human-like)
- Détecte 429 (rate limit) → pause 30 min
- Détecte challenge/captcha (401/403 avec body suspect) → pause 24h
- Track les actions réussies dans `chrome.storage.local["tipote.voyager.throttle"]`

**Ne JAMAIS** ajouter un autre chemin qui appelle directement `fetch` vers `/voyager/api/voyagerSocialDash*` ou autre endpoint write sans passer par ces wrappers. Le compte serait flag/ban en <24h.

Pour debug : `tipoteThrottle()` dans la console DevTools LinkedIn affiche l'état actuel.

## AA) EXTENSION CHROME — multi-plateforme (v1.1.0, 22 mai 2026)

Phase 1 cross-platform : extension supporte LinkedIn (existant) +
Facebook + Threads + Instagram + X/Twitter en mode "aide rédaction".
AUCUNE auto-action sur les plateformes Meta / X — risque de ban
trop élevé (cf. brainstorm Béné). On insère juste le texte dans le
composer, l'user clique sur le bouton natif du réseau pour publier.

Architecture : `apps/extension/src/platforms/`
  - types.ts → PlatformAdapter interface (isComposer, findParentPost,
    fillEditor)
  - linkedin.ts / facebook.ts / threads.ts / instagram.ts / x.ts →
    une implémentation par réseau (DOMs et frameworks très différents :
    TipTap, Lexical, DraftJS, plain textarea)
  - index.ts → detectPlatform(hostname) pick le bon adapter

**NE JAMAIS** :
- Ajouter de auto-like / auto-comment / auto-publish sur Meta / X.
  Ban quasi-certain en <30j. Si on veut un jour étendre l'auto-engagement
  hors LinkedIn, passer par les API officielles (Meta Graph, X API)
  avec OAuth user — pas via DOM injection.
- Coder en dur les selectors d'un réseau sans passer par un adapter.
  Si LinkedIn rajoute une langue et que le pattern aria-label change,
  on doit pouvoir extender un seul fichier (`platforms/linkedin.ts`)
  sans toucher au reste.

Quand un user signale "le bouton Tipote n'apparaît plus sur <réseau>" :
1. Logger le hostname pour vérifier que detectPlatform() match
2. Vérifier les patterns aria-label de l'adapter concerné (LinkedIn /
   FB / etc. changent leurs traductions parfois)
3. Étendre la liste de patterns si nouvelle langue

## R) NEXT.JS REWRITES — utiliser negative lookahead, PAS de pass-through (22 mai 2026, v2)

**Erreur initiale** : pour mapper le sous-domaine `affiliate.tipote.com` →
chemin `/affiliate/*`, j'ai mis dans `next.config.ts` :

```ts
{
  source: "/:path*",
  has: [{ type: "host", value: "affiliate.tipote.com" }],
  destination: "/affiliate/:path*",
}
```

Résultat : `affiliate.tipote.com/_next/static/css/xyz.css` a été rewrité
en `/affiliate/_next/static/css/xyz.css` qui n'existe pas → 404 sur
TOUTES les CSS et JS de la page.

**Première tentative de fix qui ne marche PAS** : ajouter des règles
"pass-through" avant le catch-all :

```ts
// CETTE APPROCHE NE MARCHE PAS
beforeFiles: [
  { source: "/_next/:path*", has: [...], destination: "/_next/:path*" },
  { source: "/:path*", has: [...], destination: "/affiliate/:path*" },
]
```

Pourquoi ça ne marche pas : `path-to-regexp` v6 (le parser des sources
Next.js) a un bug subtil avec `:path*` à la fin sur des chemins
multi-segments. La règle pass-through `/_next/:path*` ne matche PAS
`/_next/static/chunks/file.js`, donc la requête tombe sur le catch-all
qui foire.

**Solution qui marche** : negative lookahead dans le source du
catch-all, AVEC un nom de capture qui contient le pattern regex :

```ts
beforeFiles: [
  {
    source: "/:path((?!_next|api|affiliate|favicon\\.ico).*)",
    has: [{ type: "host", value: "subdomain.example.com" }],
    destination: "/affiliate/:path",
  },
],
```

C'est le pattern OFFICIEL de la doc Next.js
(<https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites#regex-path-matching>).
Une seule règle, pas de pass-through, pas de surprise.

**Comment l'écrire** :
- `/:path` : capture nommée
- `((?!a|b|c).*)` : regex qui matche tout SAUF ce qui commence par a, b, ou c
- `\\.` pour escaper un point littéral dans `robots\\.txt` ou `favicon\\.ico`
- Destination utilise le nom de capture : `/target/:path`

**⚠️ Liste à exclure systématiquement** : penser à TOUS les fichiers
statiques accessibles au root du domaine, pas juste `_next` et `api` :
- `_next` (assets Next.js)
- `api` (route handlers API)
- la cible elle-même (`affiliate` dans notre cas) pour éviter
  /affiliate/affiliate/...
- `favicon` (PAS `favicon\\.ico` ! Catch aussi favicon.png, favicon-
  192x192.png, etc — n'importe quel fichier commençant par favicon)
- `robots\\.txt`
- `sitemap\\.xml`
- tout autre asset au root (manifest.json, opensearch.xml, ads.txt...)

J'ai déjà failli oublier `favicon.png` deux fois (22 mai 2026, le
fix initial n'excluait que `favicon\\.ico` → la page affiliate était
sans favicon parce que /favicon.png partait dans le rewrite).

**Test après chaque rewrite** :
1. Visiter une page du sous-domaine
2. Ouvrir DevTools → Network → cocher "JS" et "CSS" puis "Doc" et "Img"
3. Recharger → tous les 200, aucun 404
4. Vérifier l'onglet du navigateur : le favicon doit être correct
5. ET vérifier que ton root `/` du sous-domaine rewrite bien (capture
   vide capturée par `.*`)

Si y'a UN 404 sur un `_next/static/*.css` ou `*.js`, c'est ce bug.

## S) NEXT.JS 16 — NextResponse.rewrite() avec URL object essaie un fetch externe (22 mai 2026)

**Erreur faite** : dans le middleware Next.js 16, j'ai fait :

```ts
const url = req.nextUrl.clone();
url.pathname = "/affiliate/login";
return NextResponse.rewrite(url);  // CRASHE
```

Résultat : Next.js 16 a changé le comportement de `NextResponse.rewrite()`
avec un URL object. Au lieu de rewriter en interne, il essaie un fetch
HTTP externe vers l'URL. Comme l'URL contient `localhost:3000` (via
Caddy reverse proxy) et que Next sert en HTTP mais essaie HTTPS → erreur
`EPROTO: wrong version number` → 500 Internal Server Error.

**Règle absolue** : pour mapper un sous-domaine vers un sous-chemin,
NE PAS utiliser le middleware. Utiliser `next.config.ts` → `async
rewrites()` avec un filtre `has: [{ type: "host" }]`. C'est résolu
au build, pas au runtime, donc zéro risque de fetch externe.

Si vraiment besoin de rewrite dynamique côté middleware (rare), utiliser
le pattern recommandé Next.js :

```ts
return NextResponse.rewrite(new URL("/path", request.url));
```

(`new URL(path, request.url)` au lieu de `req.nextUrl.clone()` —
ça construit une URL relative au même host que la requête, ce qui
force Next à traiter en interne.)

Mais 90% du temps, `next.config.ts` rewrites est plus simple et plus fiable.

## T) window.open avec noopener retourne null par spec → cassé pour la détection popup-bloqué (23 mai 2026)

**Symptôme remonté par Eric (Link in Bio)** : quand il cliquait sur
un bouton de sa page Link in Bio publiée, deux pages s'ouvraient
(la destination), ET sa page Link in Bio disparaissait (remplacée
par la destination dans l'onglet courant).

**Cause** : dans `components/pages/PublicPageClient.tsx`, le click
handler injecté faisait :

```js
win = window.open(href, '_blank', 'noopener,noreferrer');
if (!win) {
  window.top.location.href = href; // FALLBACK popup-bloqué
}
```

`window.open(..., 'noopener')` retourne **toujours null par spec**
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/open#return_value)),
peu importe que la popup ait été ouverte ou bloquée. Donc le
fallback `window.top.location.href = href` se déclenchait
SYSTÉMATIQUEMENT, ce qui faisait disparaître la page Link in Bio en
plus du nouvel onglet ouvert nativement par target="_blank".

**Fix** : retirer `'noopener,noreferrer'` du 3e arg pour récupérer
la vraie ref de la fenêtre, puis null l'opener à la main :

```js
win = window.open(href, '_blank'); // pas de noopener ici
if (win) { try { win.opener = null; } catch(ex) {} }
if (!win) { /* fallback popup-bloqué */ }
```

**Règle générale** : si tu utilises `window.open` AVEC `noopener` et
que tu testes la valeur de retour, c'est un bug. Soit tu fais sans
noopener (avec opener=null manuel), soit tu n'as pas de fallback.

## U) Pixel Meta : server-render obligatoire pour la détection (23 mai 2026)

**Bug Gwenn (23/05)** : elle teste sa pub Meta sur un quiz Tiquiz et
son extension Pixel Helper affiche "no pixel" sur toutes les pages
(intro, capture, résultat). Le pixel ETAIT pourtant configuré sur son
quiz.

**Cause** : l'injection du script pixel se faisait côté CLIENT via
`useEffect` dans `PublicQuizClient.tsx`, après le mount React. Deux
problèmes :

1. **Race condition consent** : si `show_consent_checkbox=true`
   (défaut), le script ne se chargeait jamais avant que le visiteur
   coche la case. Pixel Helper voit la page avant le consent → "no
   pixel".
2. **Détection retardée** : même avec consent ON, Pixel Helper scanne
   la page au premier paint. L'injection client arrivait après → soit
   l'extension affiche "not detected", soit elle finit par le voir
   mais l'user a déjà fermé l'extension.

**Fix** : server-render le pixel via `<TrackingPixels>` dans la route
page. Le script est dans le HTML envoyé au browser, Pixel Helper le
détecte instantanément.

```tsx
// app/q/[quizId]/page.tsx (server component)
import { TrackingPixels } from "@/components/tracking/TrackingPixels";

return (
  <>
    <TrackingPixels
      metaPixelId={fullQuiz.meta_pixel_id}
      ga4MeasurementId={fullQuiz.ga4_measurement_id}
    />
    <PublicQuizClient quizId={quizId} />
  </>
);
```

**À NE PAS oublier en parallèle** :
- Retirer l'injection client-side dans `PublicQuizClient.tsx` (sinon
  double init).
- Retirer le `fireQuizPixel("view")` du trackEvent("view") car
  l'init script fire déjà PageView (sinon double PageView dans les
  rapports Meta/GA).
- Sur les pages publiques de TYPE hosted_page (Tipote `/p/[slug]` et
  `/[publicSlug]` pour kind="page"), le pixel doit aussi être au
  parent (le html_snapshot est dans un iframe srcDoc et Pixel
  Helper voit la fenêtre parente). Cf. `app/p/[slug]/page.tsx`.

**Routes couvertes** :
- Tiquiz : `/q/[quizId]` ✅ + `/[publicSlug]` ✅
- Tipote : `/q/[quizId]` ✅ + `/p/[slug]` ✅ + `/[publicSlug]` ✅
- Popquiz : pas de pixel column en V1 (acceptable, à ajouter si user demande)

**Pour un nouveau type de page publique** : faut toujours fetch les
pixel IDs côté server et passer à `<TrackingPixels>`. Pas de pixel
client-side uniquement.

### U bis) Hosted pages : fallback pixel sur le défaut profil aussi (23 mai 2026)

Suite du fix U. Les hosted_pages (capture, sales, showcase,
link-in-bio) utilisent les colonnes `facebook_pixel_id` /
`google_tag_id` (PAS meta_pixel_id comme les quizzes). Le 1er fix
ne lisait QUE ces colonnes page-level → si le créateur a mis son
pixel dans /settings (défaut business_profile) et pas sur la page,
aucun pixel rendu (bug Béné, page de capture sans pixel).

Fix : fallback sur resolveEffectivePixels({}, user_id, project_id)
quand la page n'a pas de pixel explicite. Mapping :
- facebook_pixel_id ← default_meta_pixel_id
- google_tag_id      ← default_ga4_measurement_id

Routes : app/p/[slug]/page.tsx + app/[publicSlug]/page.tsx (kind=page).

RÈGLE : toute nouvelle page publique doit fallback sur le défaut
profil quand le pixel par-contenu est vide. resolveEffectivePixels
est le point unique.

## V) STATS time-series : TOUJOURS bucketiser par jour LOCAL du créateur (24 mai 2026)

**Bug récurrent (Adeline 24/05, sur quiz.tipote.com = Tiquiz mais même
code ici)** : 6 leads faits aujourd'hui, mais le graphe "Leads sur les
30 derniers jours" du quiz affichait ZÉRO pour aujourd'hui. La liste
des leads montrait bien les 6.

**Cause** : mélange de conventions de fuseau dans le bucketing par jour.
`QuizResultsAnalytics.tsx` générait les clés via
`d.toISOString().slice(0,10)` (jour UTC) mais bucketisait les leads via
`lead.created_at.slice(0,10)` (jour brut) → décalage de fuseau → les
leads d'aujourd'hui ne tombaient dans aucun bucket.

**RÈGLE DÉFINITIVE** : tout bucketing par jour des time-series stats se
fait selon le **jour LOCAL du créateur**, via `lib/dateKeys.ts` :
- Client → `localDateKey(date)` pour LES CLÉS *et* les lignes.
- Serveur → client passe `&tz=${new Date().getTimezoneOffset()}`,
  serveur bucketise via `dateKeyForOffset(date, tzOffset)`.

⚠️ Cas SSR (app/quiz/[id]/analytics/page.tsx prefetch) : le serveur ne
connaît pas le fuseau au SSR → le QuizAnalyticsClient REFAIT un fetch
client avec tz au mount (on a retiré le court-circuit
`period === initial.period`). Sans ça le 1er paint reste en UTC.

**Checklist** : clés + lignes même helper ; jamais toISOString().slice
pour un bucket affiché ; endpoint serveur → accepter `tz`. Surfaces :
QuizResultsAnalytics, /api/quiz/[id]/analytics.

## W) STUDIO VISUELS — module réutilisable IA + édition canvas (24 mai 2026)

**But** : générateur/éditeur de visuels marketing (posts, stories, covers
blog, hero pages) portable sur affiliate / Tiquiz / Tipote. Démarré sur
le dashboard affilié (`promouvoir > Visuels`) comme terrain d'entraînement.

**Décision d'archi (ne pas dévier)** : HYBRIDE, jamais "tout IA". Les
modèles d'image 2026 plafonnent à ~94-96 % de précision sur le texte →
inacceptable pour des CTA/branding. Donc :
- L'IA génère le **fond** (image d'ambiance), `gpt-image-1` derrière une
  abstraction (réutilise `OPENAI_API_KEY_OWNER`). Phase 2.
- Le **texte/CTA/logo** sont des **objets déterministes** (Fabric.js) →
  orthographe + couleurs de marque + position 100 % maîtrisées.

**Moteur = Fabric.js v6** (PAS Konva). Choisi car Konva ne fait pas de
rich text : Béné veut styliser une PARTIE du texte (un mot en gras /
couleur). Fabric `Textbox` + `setSelectionStyles` le fait nativement,
avec édition de texte NATIVE dans le canvas (caret + sélection). Konva a
été retiré (deps supprimées le 24/05).

**Le module** :
- `lib/visualStudio/{types,presets}.ts` — contrat + formats (1:1 1080²,
  4:5 1080×1350, 9:16 1080×1920) + brand presets (Tiquiz/Tipote partagent
  #2E386E texte / #5D6CDB CTA / Inter ; vert #C1FF6F Tipote, turquoise
  #20BBE6 Tiquiz). `FONT_OPTIONS` = stacks CSS complètes.
- `components/visual-studio/StudioCanvas.tsx` — Fabric, **client-only**.
- `components/visual-studio/ImageStudio.tsx` — modale contrôlée, contrat
  calqué sur `ArticleEditorModal` (`open/onOpenChange/onApply`).

**Pièges techniques (déjà rencontrés)** :
1. **Fabric interdit l'import côté Node** (`exports.node = null`) → SSR
   crash. StudioCanvas DOIT être chargé via `dynamic(() => import(...).
   then(m => m.StudioCanvas), { ssr: false })`. `import type {…}` OK.
2. **ref à travers `next/dynamic` ne traverse pas** → pas de forwardRef.
   On expose le handle (toBlob/applyStyle/…) via callback `onReady`.
3. **Pas de zoom viewport** : objets en pixels d'AFFICHAGE → `obj.
   getBoundingRect()` donne directement la position écran pour ancrer la
   barre flottante HTML. Export pleine résolution = `canvas.toDataURL({
   multiplier: renderWidth/displayWidth })`. Au changement de format, on
   rescale les objets `layerId` par le ratio des dimensions.
4. **CORS export** : `FabricImage.fromURL(url, { crossOrigin:
   "anonymous" })` sur tout fond/logo distant, sinon canvas "tainted" et
   `toDataURL` jette. nginx videos.tipote.com expose déjà `ACAO *`.
5. **Lint repo** : `react-hooks/set-state-in-effect` est une ERREUR. Pas
   de `setState` synchrone dans le corps d'un effet.
6. **WYSIWYG OBLIGATOIRE (rappel section G)** : 1ère version mettait
   l'édition texte dans le panneau latéral → Béné a rejeté (24/05).
   L'édition de CONTENU se fait SUR le visuel (Fabric gère le caret).
   Panneau latéral = format / fond / logo / "Ajouter un texte" — JAMAIS
   la saisie de contenu.
7. **Style sur une plage (un mot)** : barre flottante HTML hors canvas.
   - Boutons (gras/taille/align) : `onMouseDown preventDefault` pour NE
     PAS faire perdre la sélection d'édition Fabric.
   - Contrôles natifs (select police / input color) : capturer la plage
     via `getSelectionRange()` au `onMouseDown`, puis `applyStyle(patch,
     range)` au change — `setSelectionStyles` marche même hors édition.
8. **Polices** : passer des STACKS CSS complètes (avec générique) à
   Fabric, sinon rendu serif quand la webfont n'est pas chargée (bug
   Inter→serif 24/05). Redraw sur `document.fonts.ready`.
8bis. **⚠️ Texte qui DÉBORDE après chargement de police (bug récurrent,
    "padding pas respecté")** : Fabric a un cache GLOBAL des largeurs de
    glyphes (`cache.charWidthsCache`, via `cache.getFontCache`). Si la
    webfont n'est pas chargée au 1er calcul, il mémorise les largeurs de
    la police de SECOURS (plus étroites) sous la clé de la vraie police →
    retour à la ligne calculé trop large → le texte déborde, et `_clearCache()`
    /`initDimensions()` NE corrigent PAS (cache par-instance seulement, et
    `_splitText()` re-wrappe AVANT `_clearCache`). FIX : après chargement
    des polices (`document.fonts.load(...)` puis `document.fonts.ready`),
    appeler **`cache.clearFontCache()`** (import `{ cache } from "fabric"`)
    PUIS `initDimensions()` sur les Textbox PUIS re-empiler. Filet ceinture-
    bretelles : auto-fit itératif qui réduit la fontSize tant que
    `getLineWidth(i)` de la ligne la plus large dépasse la safe-zone.
9. **Fabric dans une modale → hit-detection décalée** (bug 24/05 "seul
   le titre est sélectionnable"). Le Dialog s'anime (zoom/translate) à
   l'ouverture ; si Fabric mesure pendant l'anim, l'offset est figé faux
   → clics décalés, seuls les éléments du haut répondent. Fix :
   `setDimensions()` + `calcOffset()` après stabilisation (rAF ×2 +
   `setTimeout(250)` + listener resize), et `calcOffset()` au changement
   de format.
10. **Color picker = `ColorSwatchPicker`** (`components/ui/`, react-colorful
    + swatches + `userPalettes`), JAMAIS `<input type=color>` (moche,
    rejeté 24/05). Surfacer la palette de marque via `userPalettes`. Pour
    colorer UN MOT : capturer la plage Fabric en `onMouseDownCapture`
    (phase capture = avant que Fabric quitte l'édition), ne stocker que
    les plages valides, et re-monter la barre via `key` par sélection.

**STOCKAGE (décision Béné, 24/05) — IMPLÉMENTÉ** : PAS de Supabase Storage.
On réutilise le pipeline self-host des vidéos popquiz : TUS
(`tus.tipote.com/files/`) → `/srv/popquiz-videos/<app>/raw/<uid>/<id>/
visual.<ext>` → servi signé via Caddy forward_auth (`videos.tipote.com`).
- `lib/popquiz/playback.ts` : `UploadClaims.kind` inclut désormais
  `"visual"` (`signUploadToken` / `signedPlaybackUrl` réutilisés tels quels).
- Routes Next génériques (réutilisables Tiquiz/Tipote) :
  `app/api/visuals/upload-token` + `app/api/visuals/playback-url`
  (auth = user Supabase ; l'affilié EST un user Supabase, mêmes cookies).
- Client : `lib/visualStudio/uploadVisual.ts` (tus-js-client) → branché
  sur la prop `upload` de `<ImageStudio>`.
- ⚠️ DÉPENDANCE SERVEUR : le serveur tus (`/opt/popquiz-tus/server.mjs`,
  désormais versionné dans `infra/popquiz-tus/`) doit avoir `visual` dans
  `KIND_RE` + `filenameByKind`. Tant que Béné n'a pas `cp` + `pm2 restart
  popquiz-tus`, l'upload renvoie 401 "Bad kind claim". Voir
  `infra/popquiz-tus/README.md` (vérifier le `diff` avant de copier).
- Le module reste agnostique : l'hôte injecte `upload(blob) => url`.

### W bis) Serveur tus partagé — 2 bugs de prod corrigés (24/05)

Le serveur tus (`/opt/popquiz-tus/server.mjs`, canonique dans Tiquiz
`infra/tus-server/server.mjs`, copie Tipote `infra/popquiz-tus/`) est
PARTAGÉ par les vidéos popquiz ET les visuels. Deux régressions vues le
24/05 (déclenchées par un restart qui a chargé une version disque qui
avait dérivé) :
1. **`generateUrl` dépendait de `baseUrl`** qui est `undefined` selon la
   version de `@tus/server` → URLs `https://<host>undefined/files/...`
   → upload cassé (ERR_NAME_NOT_RESOLVED). Fix : `${proto}://${host}${p}/
   ${encodeURIComponent(id)}` (sans baseUrl).
2. **Lecture 404 via Caddy `forward_auth`** : Caddy garde la query string
   en réécrivant le chemin de la sous-requête d'auth → le serveur tus
   reçoit `/_validate-secure-link?md5=...` et l'égalité STRICTE
   `req.url === "/_validate-secure-link"` échoue → `tus.handle()` → 404
   « The file for this url was not found ». Fix : comparer le PATH seul
   (`req.url.split("?")[0]`).

⚠️ **Le `/opt` peut diverger du repo** (édité à la main sans restart, donc
le process tournait une version, le disque une autre). Toujours vérifier
par un test bout-en-bout (upload PUIS lecture) après tout restart de
`popquiz-tus`, et garder `/opt` synchro avec `infra/tus-server/`.

**Portage Tiquiz/Tipote** : nourrir `brandKit` via `resolveQuizBranding()`
(business_profiles), brancher `upload` sur le pipeline TUS, ouvrir la
modale depuis chaque "Ajouter/Modifier une image" (éditeur quiz,
PageBuilder hero, articles blog).

## AB) DASHBOARD AFFILIÉ — contenus, liens, visuels accrochés, CMS admin (27 mai 2026)

App `/affiliate` (affiliate.tipote.com). Nav = Vue d'ensemble · Promouvoir ·
Contenus · Essai gratuit · Support (`AffiliateSidebar` ; `AffiliateNav` supprimé).

- **Promouvoir = liens éditables** (`LinksManager`) : persistés par affilié dans
  `affiliates.promo_overrides` clé `links:custom:items` (JSON). L'API promo
  (`/affiliate/api/promo`, `KEY_RE`) accepte les kinds `email|post|links`.
- **Visuel généré ↔ post** : le studio (`StudioLauncher.onSaved`) remonte le
  CHEMIN de stockage (pas l'URL signée — elle expire en 2 h). On persiste
  `post:<id>:visuals` (JSON de chemins) ; on **re-signe** chaque chemin avec
  `signedPlaybackUrl()` à l'affichage (server). `uploadVisual` renvoie
  `{ url, path }` ; `ImageStudio` remonte `storagePath` via `onApply`.
- **CMS admin (Béné autonome)** : table générique `affiliate_contents`
  (`kind` article|email|post|visual, `meta` jsonb). Admin GATÉ par
  `getAffiliateAdmin()` = user Supabase + `isAdminEmail` (⚠️ PAS
  `getAffiliateSession` qui exige le statut affilié actif). Page
  `/affiliate/admin/contenus` (lien sidebar `isAdmin` only). CRUD
  `/affiliate/api/admin/contents` ; seed des modèles code→base
  `/affiliate/api/admin/seed?kind=` (idempotent : ne seed que si vide).
  Lecture côté affilié = contenus `published` en base, **repli sur les
  modèles par défaut (TS) tant que la base est vide** (zéro régression).
  Visuels = upload TUS (kind=visual, `meta.storagePath`), re-signés. Migration
  `20260601_affiliate_contents` (à appliquer en prod).


## AC) CHROME WEB STORE — fiche extension Tipote Boost (rejet keyword spam, 29 mai 2026)

Doc de réf complète : `apps/extension/CWS-LISTING.md`. Pièges qui font rejeter :

- **Keyword spam (réf. Google « Yellow Argon »)** : NE JAMAIS énumérer les noms
  de plateformes en liste dans les champs CWS (nom, description courte,
  description longue). La v1.3.0 a été refusée pour la ligne brute
  `LinkedIn, Facebook, Threads, Instagram, X (Twitter), TikTok et Reddit`.
  → On décrit la fonction (« the social networks you already use »), la
  couverture par réseau se montre dans les **captures** (1 screenshot/réseau)
  et sur **tipote.fr** (notre site, hors policy CWS). Les `host_permissions`
  du manifest suffisent à Google pour vérifier les plateformes réellement
  supportées — pas besoin de les lister dans le texte.
- **Tous les champs CWS en anglais** : extension internationale (default
  locale EN, `src/i18n.ts`). Pas de FR dans la fiche.
- **Description courte = 132 caractères STRICT** : upload rejeté au-delà. Doit
  être identique au champ `description` du `manifest.json` (Chrome lit les deux).
- **Changer `manifest.json` (description, version, permissions) → re-zip
  obligatoire** : `npm install && npm run build` puis
  `cd dist && zip -rq ../tipote-boost-vX.Y.Z.zip .`. Le « Résumé issu du
  package » vient du manifest DANS LE ZIP, pas du repo. La description longue,
  elle, s'édite directement dans le dashboard (pas besoin de re-zip pour elle).
- **Re-soumission après rejet = scrutin accru** : rester conservateur, ne pas
  réintroduire d'autres motifs (pods d'engagement = sujet sensible LinkedIn/X,
  cf. CWS-LISTING.md « Délais et processus »).

## AD) STUDIO VISUELS — mode CARROUSEL (génération multi-slides, juin 2026)

Module `components/visual-studio/` (ImageStudio + StudioCanvas) + `lib/visualStudio/`.
Réutilisé sur affiliate (et plus tard Tipote). Points à respecter :

- **Carrousel = FLAT, couleurs de MARQUE** (choix Béné) : pas d'image IA par
  slide. La copy des 10 slides vient d'UN appel `/api/visual-studio/generate-carousel`
  (structure hook → rehook → problème → 4×valeur → aha → takeaway → CTA, cf.
  `lib/visualStudio/carousel.ts` `CAROUSEL_ROLES`). Les fonds alternent la
  palette du `brandKit` (`slideStyle()` calcule fond/texte/accent/bouton avec
  contraste WCAG). Sur affiliate : brandKit = Tipote ou Tiquiz selon l'outil
  promu ; sur Tipote (à venir) : couleurs + logo des réglages de l'user.
- **Le brand kit est INJECTÉ par l'hôte** (prop `brandKit`) → ne jamais hardcoder
  une couleur de slide. Toute couleur de slide passe par `slideStyle(brand, i, role)`.
- **Gabarit `carousel` du canvas** : géré par `layoutCarousel()` + `handle.setCarousel()`
  dans `StudioCanvas.tsx`. C'est un 4e template à côté de auto/data/beforeAfter —
  additif, gated par `curTemplate === "carousel"`. Flat = `shadow:""`, pas de
  scrim, pas de pilule. Le fond est posé via `ensureSolidBg()` DIRECTEMENT sur le
  canvas (pas l'état React `background`) → indispensable pour l'export en boucle.
- **Export multi-slides** : `ImageStudio.applyCarousel()` boucle slide par slide
  (setLayers + setCarousel + toBlob + upload) et remonte un tableau via
  `onApplyMany`. Persistance hôte = `post:<id>:visuals` (déjà un tableau de
  chemins) → PostDayCard.`handleVisualsSaved` patch UNE fois (sinon races sur
  l'état avec des patchs concurrents).
- **Éditions WYSIWYG par slide** : capturées dans `slidesRef` via
  `handle.getLayerText()` AVANT chaque navigation / export (les éditions vivent
  dans Fabric, pas dans le state React).
- **i18n** : clés `visualStudio.*` (next-intl, `messages/*.json`) — ajouter dans
  les 7 langues (fr/en/es/it/pt/pt-BR/ar). Les textes des slides, eux, sont
  générés par l'IA dans la locale de l'user.

⚠️ Env note (pas un bug code) : un Edit sur un gros fichier peut échouer en
silence ("File has not been read yet") si la lecture a été paginée/tronquée —
re-grep le marqueur après coup pour confirmer que l'édition a bien pris.

### AD bis — carrousel : PDF LinkedIn + nav clavier/swipe (juin 2026)

- **Export PDF** (`lib/visualStudio/exportPdf.ts`, `carouselToPdf`) : posts
  "document" LinkedIn = 1 slide / page. Construit à partir des MÊMES PNG que le
  téléchargement (pas de re-rendu divergent). `jspdf` (déjà en dep) importé en
  DYNAMIQUE (`await import`) pour ne pas alourdir le bundle studio. Unité `px` +
  `format:[w,h]` par page → la page colle au pixel du visuel. Bouton visible en
  mode carrousel uniquement.
- **Nav clavier ← →** : gardée par `handle.isEditingText()` (ne pas voler la
  frappe quand un texte Fabric est en édition) ET par le tag de
  `document.activeElement` (INPUT/TEXTAREA/contentEditable = on laisse passer).
- **Swipe tactile** : seuil 50px + horizontal franc (|dx|>|dy|), ignoré en
  édition de texte. Posé sur le `stageRef` (onTouchStart/End).
- **Tous les boutons d'export** (Enregistrer / Télécharger / PDF) partagent un
  garde `anyExport = busy||downloading||pdfBusy` pour éviter les exports
  concurrents qui se marchent dessus sur le canvas.
