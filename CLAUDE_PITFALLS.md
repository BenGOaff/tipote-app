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
- **CSS rich-text** : Tipote `tipote-quiz-rich` / `tipote-quiz-rich-inline` (≠ Tiquiz `tiquiz-rich`). Ne pas confondre quand on copie-colle entre repos.
- **PublicQuizClient** : dictionnaires inline (`translations: Record<string, QuizTranslations>` dans le fichier), pas `messages/*.json`. 8 entrées (fr / fr-vous / en / es / de / pt / it / ar). Ajouter dans les 8 quand on touche au visiteur.

---

## F) Compteurs et événements (post-Phase A tracking)

- **Source de vérité = `quiz_events`** (table log time-series). Les compteurs sur `quizzes` (views_count, etc.) sont **auto-bumpés par trigger** `trg_quiz_events_bump_counter`. **Ne JAMAIS UPDATE les compteurs directement** — utiliser `log_quiz_event` RPC ou INSERT direct dans `quiz_events`.
- **Dedup via cookie session** : cookie `tquiz_visit` / `tipote_visit` HttpOnly 30j, généré server-side au premier load. Le tracking serveur check `(quiz_id, event_type, session_id, created_at > NOW() - 24h)` avant INSERT.
- **Client `trackedRef`** : Set en mémoire pour éviter les doublons IN-tab. Combiné avec le cookie côté serveur, on dédupe correctement même si l'utilisateur ouvre 5 onglets.

---

## G) UX / produit (retours utilisateur récurrents)

- **WYSIWYG par défaut** : édition inline dans le preview, pas dans Settings sidebar. Adeline rejette systématiquement les patterns "édit dans réglages" (consent text, 18 mai 2026).
- **Drag-and-drop signifie click + hold + drop** (HTML5), pas click pour cycler positions.
- **Convention SaaS forms** : asterisk rouge sur les champs obligatoires, RIEN sur les optionnels. Ne pas écrire "(optionnel)" en suffixe.
- **Dialogs custom obligatoires** : `window.prompt` / `window.alert` = anti-pattern. Toujours utiliser `<Dialog>` Radix du design-system.
- **Sortie d'un lien dans un quiz** : `target="_blank"` + `rel="noopener noreferrer"`. Le lien ne doit jamais voler le quiz. `RichTextEdit.tsx` pose ces attributs automatiquement après `createLink`.

---

## H) Quand je vais douter pendant le code

1. **Avant de toucher une colonne SQL** : relire section A.
2. **Avant de toucher RichTextEdit** : relire section C.
3. **Avant de toucher du tracking** : relire section F.
4. **Quand je hot-fix un bug** : poser une note ici si la cause racine est non-évidente.

**Idempotence des migrations** : `IF NOT EXISTS` partout. `DROP POLICY IF EXISTS` avant `CREATE POLICY`. `CREATE OR REPLACE FUNCTION` pour les RPC. **Jamais une migration qui crashe si rejouée**.

**Toujours finir une migration par `NOTIFY pgrst, 'reload schema';`** quand on a touché à des colonnes/policies/RPC.

**Typecheck systématique** avant commit : `npx tsc --noEmit`. Exit 0 ou je fix.
