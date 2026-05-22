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

- **Source de vérité = `quiz_events`** (table log time-series). Les compteurs sur `quizzes` (views_count, etc.) sont **auto-bumpés par trigger** `trg_quiz_events_bump_counter`. **Ne JAMAIS UPDATE les compteurs directement** — utiliser `log_quiz_event` RPC ou INSERT direct dans `quiz_events`.
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
