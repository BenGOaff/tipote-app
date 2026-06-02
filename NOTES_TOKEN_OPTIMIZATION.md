# Notes — Optimisation tokens Claude (Tipote + Tiquiz)

> Notes prises le 1er juin 2026 après lecture de la doc Anthropic
> (`platform.claude.com/docs/fr/about-claude/models/choosing-a-model`
> + skill `claude-api` à jour Opus 4.8).
>
> But : réduire la conso tokens des deux apps **sans dégrader la
> qualité** sur les usages où Béné a explicitement choisi le meilleur
> Claude.
>
> ⚠️ **À ARBITRER ENSEMBLE** avant tout changement — ne rien toucher sans
> validation. Ce document = recommandations + audit, pas instructions.

---

## 🎯 Règle d'or Anthropic

> Sélectionner le modèle Claude optimal = équilibrer **3 axes** :
> capacités / vitesse / coût. Et il existe **deux stratégies** pour
> démarrer :
>
> 1. **Bottom-up** : commencer Haiku → tester → upgrader si la qualité
>    manque (idéal prototypage + tâches simples haut volume)
> 2. **Top-down** : commencer Opus → optimiser prompts → descendre vers
>    plus efficace une fois le workflow rodé (idéal raisonnement
>    complexe, où la précision prime)
>
> Béné a déjà tranché : meilleur Claude sur le **contenu créatif**.
> Mais "contenu créatif" ≠ "toutes les tâches IA". Audit ci-dessous
> = on regarde où Opus est nécessaire, où on peut descendre.

---

## 🔍 Audit du code actuel (1er juin 2026)

### Tipote — modèles par endpoint

| Endpoint                                  | Modèle    | Volume | Status           |
|-------------------------------------------|-----------|--------|------------------|
| `coach/proactiveBriefer`                  | Opus 4.8  | hebdo  | ✅ usage premium  |
| `survey/analysis` (analyse IA sondage)    | Opus 4.8  | rare   | ✅ usage premium  |
| `quiz/generate` (génération quiz IA)      | Sonnet 4.6 (default) | élevé | ✅ déjà optimal |
| `content/generate`, `templates/*`, etc.   | Sonnet 4.6 (default) | élevé | ✅ déjà optimal |
| `rewrite`, `coach/chat/greet`             | Haiku 4.5 | élevé  | ✅ déjà optimal  |
| `quiz/rebalance`, `pod/ai-suggest`        | Sonnet 4.6 | moyen  | ✅ déjà optimal  |

**Bilan Tipote** : la sélection modèle est **déjà bien faite**. Opus
réservé aux 2 endpoints à haute valeur. Sonnet sur le volume, Haiku
sur les tâches courtes/courrier.

### Tiquiz — modèles par endpoint

| Endpoint                                  | Modèle    | Volume | Status           |
|-------------------------------------------|-----------|--------|------------------|
| `quiz/generate` (génération quiz IA)      | Opus 4.8  | élevé  | ⚠️ **À discuter** |
| `survey/analysis` (analyse IA sondage)    | Opus 4.8  | rare   | ✅ usage premium  |
| `rewrite`, `chat`, `embed`                | Haiku 4.5 | élevé  | ✅ déjà optimal  |
| `rebalance`                               | Sonnet 4.6 | moyen  | ✅ déjà optimal  |

**Bilan Tiquiz** : un seul point d'interrogation — `quiz/generate`
utilise Opus 4.8 alors que sur Tipote la même feature tourne en
Sonnet 4.6. Pourquoi cette différence ? Décision historique de Béné
("génération critique sur Tiquiz") — à challenger demain :
- Sonnet 4.6 est nettement moins cher (3$/15$ vs 5$/25$ par 1M tokens)
- La génération de quiz Tipote (Sonnet) est apparemment satisfaisante
- Volume Tiquiz potentiellement plus élevé que Tipote car le plan
  free permet déjà un quiz IA

**Test possible** : sur 1 mois, A/B Sonnet 4.6 vs Opus 4.8 sur
`quiz/generate` Tiquiz et mesurer si la qualité perçue change. Si
non → switch Sonnet → économie possible **~40 %** sur cet endpoint.

---

## 💎 Gisements d'économies (par ordre d'impact)

### 1. Prompt caching — gisement n°1, **non exploité aujourd'hui**

Anthropic permet de cacher les blocs **stables** d'un prompt pour
~90 % de réduction sur la portion mise en cache. Cache TTL : 5 min
(défaut, +25 % de coût d'écriture, ~90 % de réduction sur les lectures)
ou 1 h (+100 % d'écriture).

**Où c'est utilisable chez nous** :

| Endpoint                           | System prompt taille | Stable ? | Gain potentiel |
|------------------------------------|---------------------|----------|-----------------|
| `quiz/generate` (Tipote + Tiquiz)  | ~3-4K tokens         | OUI (mêmes règles entre users) | **~85 %** sur les tokens system |
| `survey/analysis`                  | ~500 tokens          | OUI      | trop court pour caching utile |
| `coach/proactiveBriefer` Pro/Elite | déjà avec `cache_control` ✓ | — | déjà optimisé |
| `content/generate`                 | ~2K tokens           | OUI (brand voice fixe par user) | **~80 %** sur tokens system |
| `templates/reformulate`            | ~1.5K tokens         | OUI      | **~70 %** sur tokens system |

**Action proposée** :
- Ajouter `cache_control: {type: "ephemeral"}` sur le **dernier bloc
  du system prompt** pour `quiz/generate` et `content/generate` (les
  2 endpoints à plus haut volume avec system stable)
- Cache 5 min par défaut → couvre les rafales de générations
- Mesurer via `usage.cache_creation_input_tokens` /
  `cache_read_input_tokens` dans les logs

**Estimation** : si 50 % des appels `quiz/generate` Tipote+Tiquiz
sont sur un system identique au précédent appel (probable vu le volume),
gain réaliste **~30-40 %** sur la facture Claude totale.

⚠️ **Piège** : tout changement d'un caractère dans le prefix
invalide le cache. Si on construit le system avec des `${date}`,
`${userId}`, ou un timestamp dynamique → le cache ne se déclenche
jamais. À auditer en même temps.

### 2. Paramètre `effort` sur Opus 4.7+ — non posé aujourd'hui

Sur Opus 4.7/4.8, le défaut est `effort: "high"`. Selon la doc :

- `low` : tâches courtes, latence-sensible, peu d'intelligence requise
- `medium` : sweet spot prix/qualité pour la plupart des tâches
- `high` (défaut) : intelligence-sensitive, raisonnement nuancé
- `xhigh` : recommandé pour coding/agentic, le meilleur balance prix/intelligence sur des tâches complexes
- `max` : Opus-tier only, latence-insensible, "correctness > cost"

**Audit** : ni `coach/proactiveBriefer`, ni `survey/analysis`, ni
`quiz/generate` ne posent d'`effort` → ils tournent en défaut (high).

**Action proposée** :
- **Coach proactif** : `effort: "high"` ou `"xhigh"` (déjà default high
  donc rien à changer côté qualité) — à laisser tel quel
- **Survey analysis** : tester `effort: "medium"` (l'analyse est sur
  données structurées, pas besoin de raisonnement très profond) →
  gain ~20-30 % sur les tokens de thinking
- **Quiz generate** : tester `effort: "medium"` (la créativité vient
  du prompt + des exemples few-shot, pas du thinking) → gain similaire

⚠️ **À tester avant de baisser** : faire générer 5 sondages d'exemple
avec medium vs high, comparer la qualité. Si Béné juge identique → on
descend.

### 3. Adaptive thinking — non activé, à évaluer

Par défaut sur Opus 4.7/4.8, **thinking est désactivé** si on ne le
pose pas explicitement. Pour activer : `thinking: {type: "adaptive"}`.
Adaptive = Claude décide quand et combien réfléchir, en fonction de la
complexité de la tâche.

**Audit** :
- Coach proactif : pas de thinking → réponse directe (probablement OK
  vu que c'est de la production de contenu structuré, pas de
  raisonnement)
- Survey analysis : pas de thinking → analyse sans réflexion (**limite
  potentielle de qualité ici** — l'analyse de stats mérite peut-être de
  réfléchir avant de produire des recommandations)
- Quiz generate : pas de thinking → OK (génération créative, le
  thinking ajouterait des tokens sans gain qualité)

**Action proposée** :
- **Survey analysis** : activer `thinking: {type: "adaptive"}` →
  meilleure analyse, coût additionnel modéré (analyse rare, ~1/user/mois)
- **Coach proactif** : tester adaptive sur 1-2 semaines, voir si le
  brief gagne en pertinence
- **Quiz generate** : laisser disabled (overkill ici)

### 4. Batch API — 50 % de réduction sur les crons non-urgents

L'API batch d'Anthropic traite les requêtes en async (≤ 24 h, souvent
< 1 h) pour **50 % de réduction** de coût.

**Applicable chez nous** :
- ✅ **`cron/monthly-report`** : 1er du mois, ~80-100 emails à envoyer,
  pas urgent (peut tourner pendant la nuit) → idéal batch
- ✅ **`cron/value-nudges`** : quotidien à 10h, ~5-20 emails/jour, pas
  urgent (peut être livré dans la journée) → idéal batch
- ❌ Coach proactif : pas applicable (le brief est lié à un user
  spécifique avec un email immédiat lundi 9h, batch ajouterait de la
  latence acceptable mais le code actuel est plus simple sans)
- ❌ Quiz/survey generate : non, ces appels sont user-initiated avec
  attente d'une réponse en temps réel

**Action proposée** :
- Migrer `monthly-report` et `value-nudges` vers batch → **~50 %
  d'économie sur ces crons**
- Refactor : créer un batch en début de cron, poller jusqu'à
  complétion, envoyer les emails en bulk
- Effort de refactoring : ~2 sessions

### 5. Streaming — déjà bien utilisé

✅ Audit OK : `callClaude` Tipote utilise `stream: true`, `quiz/generate`
utilise SSE direct. Streaming n'économise pas de tokens mais évite les
timeouts HTTP sur les gros `max_tokens` (Opus 4.8 supporte jusqu'à
128K mais nécessite streaming dès ~16K).

---

## 🚫 Pièges à éviter (qu'on ne fait PAS actuellement)

- ❌ Ne JAMAIS interpoler `Date.now()`, `randomUUID()` ou timestamp dans
  un system prompt → invalide tout le caching downstream
- ❌ Ne JAMAIS changer l'ordre des tools entre 2 requêtes → invalide
  le cache (audit OK chez nous, pas de tools dynamiques)
- ❌ Ne JAMAIS poser `max_tokens` trop bas par peur du coût : le modèle
  est tronqué mid-réponse et le user doit re-générer (perte sèche)
- ❌ Ne JAMAIS hardcoder `temperature` sur un appel Opus 4.7+ (= 400)
  → cf. fix de ce soir, helper `buildClaudeMessageBody` à utiliser
  partout

---

## 📋 Plan d'action proposé (à arbitrer demain)

Par ordre d'effort/impact :

| # | Action | Effort | Gain estimé | Risque qualité |
|---|--------|--------|-------------|----------------|
| 1 | Activer prompt caching sur `quiz/generate` (Tipote + Tiquiz) | 1 session | -30 % facture | Aucun |
| 2 | Activer prompt caching sur `content/generate` Tipote | 1 session | -15 % facture | Aucun |
| 3 | Tester Sonnet 4.6 sur `quiz/generate` Tiquiz pendant 1 mois | 30 min code + A/B | -40 % sur cet endpoint | Modéré, à mesurer |
| 4 | Activer `thinking: adaptive` sur `survey/analysis` | 15 min | +qualité, +5-10 % coût (rare) | Aucun (gain qualité) |
| 5 | Tester `effort: "medium"` sur `survey/analysis` et `quiz/generate` | 30 min + A/B | -20 % sur endpoints concernés | À mesurer |
| 6 | Migrer `monthly-report` + `value-nudges` vers Batch API | 2 sessions | -50 % sur ces crons | Aucun (latence acceptable) |

**Gain global estimé** sur la facture Claude mensuelle si tout est
appliqué : **~25-35 %**, sans dégradation qualité sur les usages
premium (coach, génération de quiz Tipote, analyse sondage).

---

## 🔭 Pistes V2 (plus tard, après mesure prod)

- **Tool search** si on ajoute beaucoup d'outils au coach (préserve le
  cache, charge les schémas à la demande)
- **Compaction** beta sur le coach Pro/Elite si on développe le chat
  long-format avec contexte qui grossit (déjà 200K context window)
- **Files API** pour les analyses de sondages très volumineuses
  (uploader le contexte 1 fois, l'utiliser N fois)
- **Citations API** si on développe une fonctionnalité de recherche
  documentaire dans le coach

---

## 🎯 Recommandation immédiate (demain matin)

Si tu veux le **gain maximum pour 1 session de code et zéro risque** :
**action n°1 + 2** (prompt caching sur `quiz/generate` et
`content/generate`) → estimation -30 % à -45 % sur la facture Claude
mensuelle sans toucher à la qualité.

Le reste (changement de modèle, effort, thinking) demande des A/B
tests en prod pour valider qu'on ne dégrade rien.
