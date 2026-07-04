# Tipote Extension (Chrome + Firefox, MV3)

Extension qui boost organiquement les posts LinkedIn des autres
membres du pod Tipote. Auto-like + commentaire IA validé en 1-click,
sans spam externe — tout se passe directement dans LinkedIn.

Un seul codebase, deux cibles de build : Chrome (`dist/`) et Firefox
(`dist-firefox/`). Les différences sont confinées à `build.mjs`
(transformation du manifest) + deux gates runtime.

## Architecture

```
src/
├── background.ts        # Service worker Chrome / event page Firefox
│                        # (orchestration, polling, fetch backend)
├── content.ts           # Content script LinkedIn (DOM, Voyager API)
├── bridge.ts            # Firefox only — remplace externally_connectable
│                        # (relais postMessage sur app.tipote.com)
├── popup/
│   ├── popup.html
│   └── main.tsx         # UI popup Preact (+ onboarding permissions Firefox)
└── config.ts            # API base URL, storage keys, intervals
```

Entrées indépendantes bundlées par `esbuild` (cf. `build.mjs`).
Background = ESM sur Chrome (MV3 service worker), IIFE sur Firefox
(event page). Content + popup + bridge = IIFE (contraintes isolated
world).

## Développement local

```bash
cd apps/extension
npm install
npm run build            # one-shot Chrome, cible https://app.tipote.com
npm run build:firefox    # one-shot Firefox → dist-firefox/
npm run dev              # watch Chrome, cible https://app.tipote.com (par défaut)
npm run dev:firefox      # watch Firefox
npm run dev:local        # watch Chrome, cible http://localhost:3000 (si Next.js dev tourne aussi)
npm run dev:firefox:local
npm run typecheck
```

Charger dans Chrome :
1. `chrome://extensions`
2. Activer "Developer mode"
3. "Load unpacked" → sélectionner `apps/extension/dist`

Charger dans Firefox :
1. `about:debugging` → "This Firefox"
2. "Load Temporary Add-on" → sélectionner `apps/extension/dist-firefox/manifest.json`
3. IMPORTANT : accorder les host permissions. Un add-on temporaire les a
   d'office, mais une install AMO NON (opt-in MV3 Firefox). Le popup de
   l'extension affiche une carte "Autoriser l'accès" tant que c'est
   manquant. Vérifiable aussi via about:addons → Tipote Boost →
   Permissions.

## Différences Firefox (gérées par build.mjs + gates runtime)

| Point | Chrome | Firefox |
|---|---|---|
| Background | `service_worker` ESM | event page `background.scripts` IIFE |
| Frontend → extension | `externally_connectable` + `onMessageExternal` | content script `bridge.js` sur app.tipote.com, protocole `window.postMessage` (le frontend `/boost` supporte les 2 canaux) |
| Host permissions | accordées à l'install | OPT-IN : demandées via `permissions.request()` depuis le popup, sinon aucun content script ne tourne |
| ID extension | assigné par CWS | `boost@tipote.com` (`browser_specific_settings.gecko.id`) |
| Data collection | rubrique CWS | `data_collection_permissions` dans le manifest (requis AMO depuis nov. 2025) |

Le reste (Voyager, feedInjector multi-réseaux, injected.js MAIN world,
storage, alarms, badge) est strictement identique : Firefox supporte le
namespace `chrome.*` avec promesses en MV3.

Packaging AMO : zipper le CONTENU de `dist-firefox/` (pas le dossier).
AMO exigera aussi le code source (esbuild minifie) : fournir un zip du
dossier `apps/extension/` (sans node_modules/dist) + les instructions de
build ci-dessus. Cf. `AMO-LISTING.md`.

**Important** : le mode watch (`npm run dev`) cible la **prod** par défaut,
pas localhost. C'est ce qu'on veut quand on teste l'extension contre le
vrai backend tout en itérant sur le code de l'extension. Bascule vers
localhost UNIQUEMENT si tu fais aussi tourner `npm run dev` dans la racine
Next.js (`http://localhost:3000`).

## Icônes

À placer dans `public/icons/` (16, 48, 128 px). Pour la beta unpacked,
Chrome accepte l'absence (icône puzzle par défaut). Obligatoires pour
la soumission Chrome Web Store.

## Permissions (manifest)

- `storage` : cache user + queue tâches en local
- `alarms` : polling périodique des tâches
- `cookies` : pas utilisé pour l'instant — réservé pour debug session
  LinkedIn si on en a besoin Phase 4
- host_permissions linkedin.com : pour fetch Voyager depuis SW
- host_permissions tipote.com : pour appeler nos endpoints
- `externally_connectable` : recevoir le push d'auth depuis tipote.com

Volontairement **pas** de `tabs` ou `webRequest` pour rester minimal côté
Chrome Web Store review. À ajouter seulement si une feature concrète l'exige.

## Phases d'implémentation

- [x] **2.1** — Scaffolding (this commit)
- [ ] **2.2** — Auth via externally_connectable + ping `/api/pod/me`
- [ ] **2.3** — Client Voyager (like + comment)
- [ ] **2.4** — DOM observer publication auteur
- [ ] **2.5** — Queue polling + UI badge dans le fil
- [ ] **2.6** — Throttling + détection captcha
