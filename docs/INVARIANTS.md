# INVARIANTS — anti-régression

Ces invariants documentent des décisions structurelles qui ont déjà été
cassées au moins une fois en production. Avant de toucher l'un de ces
endroits, lis l'invariant et vérifie que ta modif le respecte. Chaque
invariant pointe vers le code via `path:line` et garde l'historique du
bug d'origine pour qu'on n'ait pas à le redécouvrir.

> Convention : si tu changes l'invariant volontairement, mets à jour
> ce fichier et le commentaire inline. Si tu casses l'invariant par
> accident, on rouvre le ticket post-mortem correspondant.

---

## I-1 — La stratégie ne doit JAMAIS écraser les offres d'un créateur qui a ses propres offres

**Source** : `app/api/strategy/route.ts` — bloc « Nettoyage anti-régression » (~ligne 1229).

**Règle** : le cleanup qui vide `selected_pyramid` / `offer_pyramids` ne
s'applique qu'aux **affiliates** (`isAffiliate === true`). Pour tout
autre user (qui peut avoir saisi ses propres offres dans
`business_profiles.offers` OU avoir une pyramide auditée), ne pas
toucher au plan existant — on se contente de le re-générer si
nécessaire et l'upsert final overwrite ce qui doit l'être.

**Pourquoi cet invariant** : commit `e067c43` (2026-04-27) a élargi le
cleanup à tous les users `!shouldGenerateOffers`. Conséquence : le
PostForm de Monique affichait « Aucune offre trouvée » dès qu'elle avait
ses propres offres + était satisfaite. Bug critique : on supprimait des
données utilisateur.

**Garde-fou inline** : commentaire bloc dans `strategy/route.ts` au-dessus
du `if (isAffiliate)` rappelle l'invariant.

---

## I-2 — L'onboarding est STRICTEMENT scopé au projet actif

**Source** :
- `app/app/page.tsx` (vérification redirect → /onboarding)
- `app/onboarding/page.tsx` (vérification redirect → /app)
- `middleware.ts` (gating routes protégées)

**Règle** : si un cookie `tipote_active_project` existe, l'état
d'onboarding **ne se lit que sur la ligne `business_profiles` qui
matche `(user_id, project_id)`**. Pas de fallback `eq("user_id", X)`
qui retournerait n'importe quel projet.

Le seul fallback légitime : **absence totale de cookie de projet actif**
(comptes legacy mono-projet). Dans ce cas on prend la première ligne
`onboarding_completed=true` du user.

**Pourquoi cet invariant** : Monique a créé un 2e Tipote, le fallback
"any project completed" considérait son onboarding comme déjà fait
(parce que son 1er projet l'avait été), et elle est tombée directement
sur le dashboard du nouveau projet sans questionnaire. Promesse produit
cassée.

**Garde-fou inline** : commentaires explicites au-dessus de chaque
vérif. Le middleware retourne `res` (allow-through) au lieu de
rediriger quand le cookie pointe sur un projet en cours d'onboarding,
puis la page Server Component fait la redirection finale en stricte
project-scope.

---

## I-3 — La réinitialisation par projet ne doit JAMAIS toucher aux autres projets

**Source** : `app/api/profile/reset/route.ts` (helper `bestEffortDeleteScoped`).

**Règle** : chaque DELETE est filtré par `(user_id, project_id)`. Si
une table n'a pas de colonne `project_id`, on **skip silently** — on
**ne** retombe **pas** sur un DELETE par `user_id` seul (ce qui
viderait les autres projets du même user).

Pour wipe global, utiliser `/api/account/reset` qui est l'API explicite
pour ça.

**Garde-fou inline** : `bestEffortDeleteScoped` documente la règle ;
si tu ajoutes une nouvelle table à la liste `projectScopedTables`,
vérifie qu'elle a bien une colonne `project_id` (sinon le delete sera
no-op silencieux, ce qui est le comportement voulu — on ne wipe rien
plutôt que de wipe le mauvais scope).

---

## I-4 — La typographie française est appliquée à la fois côté save et côté render

**Source** :
- `lib/frenchTypography.ts` (transformation pure, idempotente)
- `app/api/quiz/[quizId]/route.ts` PATCH — pass on save
- `app/api/quiz/[quizId]/public/route.ts` GET — pass on render

**Règle** : le NBSP avant `: ; ! ? »` est appliqué deux fois pour
couvrir données nouvelles ET legacy. La fonction est idempotente, donc
double-application = pas de problème.

Si tu ajoutes un nouveau champ texte qui doit recevoir la typo FR :
- inscris-le dans `FR_TYPO_PLAIN_FIELDS` (route PATCH)
- inscris-le dans le mapping `renderedQuiz` (route public GET)

---

## I-5 — Les leads ne doivent JAMAIS disparaître

**Source** : `supabase/migrations/20260502_quiz_leads_result_set_null.sql`
(FK ON DELETE SET NULL) + `app/api/quiz/[quizId]/route.ts` PATCH (snapshot
du `result_title` avant DELETE des résultats orphelins).

**Règle** : trois couches indépendantes garantissent qu'un lead n'est
jamais perdu lors d'un re-shuffle des résultats :

1. FK `quiz_leads.result_id` ON DELETE SET NULL (couche DB).
2. Backfill `result_title` dans la ligne lead avant DELETE des résultats
   (couche application).
3. Explicit NULL-out de `lead.result_id` avant DELETE (couche défense).

Si tu modifies le PATCH du quiz, vérifie que les trois couches sont
toujours en place. Si tu changes le schéma de `quiz_leads`, vérifie la
FK avant de pousser la migration.

---

## Comment ajouter un nouvel invariant ici

1. Identifie une zone dont la régression couterait à un user (UX cassée,
   data perdue, contrat produit non tenu).
2. Écris la règle en une phrase impérative.
3. Pointe vers le code : `path:line`.
4. Donne un mini post-mortem du bug original (commit, date, user impacté).
5. Décris le garde-fou inline et le test si applicable.

L'idée n'est pas d'avoir une exhaustivité mais de protéger les zones les
plus fragiles avec une mémoire d'équipe documentée.
