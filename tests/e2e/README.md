# Tests E2E routes publiques — Tipote

Filet de sécurité minimaliste pour détecter les régressions silencieuses
sur les routes publiques (`/q/`, `/p/`, `/pq/`, `/[publicSlug]`).

Phase 7 de `ROADMAP_RETENTION.md`. Le but : qu'un déploiement qui casse
l'embed iframe ou l'OG meta des users (JB & co qui embarquent leurs
quiz sur leur blog) soit détecté en **moins de 30 secondes** au lieu
d'un user qui ouvre un ticket 48h plus tard.

## Deux niveaux de test

### 1. Smoke test (rapide, sans browser)

`scripts/smoke-public-routes.sh` — bash + curl, aucune dépendance npm.
Idéal pour un check post-déploiement depuis le VPS.

```bash
BASE_URL=https://app.tipote.com \
  SMOKE_QUIZ_ID=<slug-ou-uuid-quiz-actif> \
  SMOKE_PAGE_SLUG=<slug-page-active> \
  SMOKE_POPQUIZ_ID=<id-popquiz-actif> \
  npm run smoke
```

Ce qu'il vérifie sur chaque route fournie :

- Status 200
- **`X-Frame-Options` absent** (sinon iframe cassée — cf. PITFALLS X)
- **`Content-Security-Policy: frame-ancestors *`** présent (embed
  autorisé)
- `og:title` / `og:url` présents
- `og:url` cohérent avec le host requêté (cf. PITFALLS K : sur custom
  domain l'og:url doit pointer sur le custom, pas sur app.tipote.com)
- `robots.txt` / `sitemap.xml` / `favicon.ico` accessibles

Exit code 0 si tout passe, 1 sinon. Sortie lisible en humain et en CI.

Les 3 IDs sont optionnels indépendamment : un test est skip si son ID
n'est pas fourni (pratique pour ne pas bloquer quand on n'a pas de
popquiz actif sous la main).

### 2. Tests Playwright (browser réel)

`tests/e2e/public-quiz.spec.ts` — Playwright Chromium, plus complet.

```bash
# Une fois : installer le browser
npm run test:e2e:install

# Puis :
BASE_URL=https://app.tipote.com \
  SMOKE_QUIZ_ID=<slug-ou-uuid-quiz-actif> \
  npm run test:e2e
```

Ce qu'il vérifie en plus du smoke :

- Le body de la page n'est pas vide (garde-fou white-screen)
- Les meta OG sont parsables côté DOM
- Un bouton de démarrage du quiz est cliquable (chemin user critique)
- `/api/quiz/[id]/track` répond toujours 200, jamais 4xx (cf. PITFALLS D)

## Usage recommandé

### En CI (GitHub Actions)

Smoke test sur push (rapide, pas de browser à installer) :

```yaml
- name: Smoke prod
  env:
    BASE_URL: https://app.tipote.com
    SMOKE_QUIZ_ID: ${{ secrets.SMOKE_QUIZ_ID }}
  run: npm run smoke
```

### Post-déploiement (sur le VPS)

Après chaque `pm2 restart tipote-prod`, lance un smoke depuis le serveur :

```bash
cd /home/tipote/tipote-app
SMOKE_QUIZ_ID=<id-quiz-test> npm run smoke
```

Si exit 1 → l'alerte tombe avant qu'un user ne voie le bug.

### En local pendant le dev

Pour tester contre ton localhost :

```bash
BASE_URL=http://localhost:3000 \
  SMOKE_QUIZ_ID=<id-test> \
  npm run smoke
```

## Maintenir un quiz de test stable

Pour ne pas avoir à changer `SMOKE_QUIZ_ID` à chaque rotation, garde un
quiz actif avec un slug fixe (ex. `smoke-test-do-not-delete`). Béné a
juste à le créer une fois, en faire un quiz minimal avec 2 questions
et 2 résultats, le publier en statut `active`, et noter son slug en
variable d'env CI.
