# Tipote Extension (Chrome MV3)

Extension Chrome qui boost organiquement les posts LinkedIn des autres
membres du pod Tipote. Auto-like + commentaire IA validé en 1-click,
sans spam externe — tout se passe directement dans LinkedIn.

## Architecture

```
src/
├── background.ts        # Service worker (orchestration, polling, fetch backend)
├── content.ts           # Content script LinkedIn (DOM, Voyager API)
├── popup/
│   ├── popup.html
│   └── main.tsx         # UI popup Preact
└── config.ts            # API base URL, storage keys, intervals
```

3 entrées indépendantes bundlées par `esbuild` (cf. `build.mjs`).
Background = ESM (MV3 supporte). Content + popup = IIFE (contraintes
isolated world Chrome).

## Développement local

```bash
cd apps/extension
npm install
npm run build        # one-shot, cible https://app.tipote.com
npm run dev          # watch, cible https://app.tipote.com (par défaut)
npm run dev:local    # watch, cible http://localhost:3000 (si Next.js dev tourne aussi)
npm run typecheck
```

Charger dans Chrome :
1. `chrome://extensions`
2. Activer "Developer mode"
3. "Load unpacked" → sélectionner `apps/extension/dist`

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
