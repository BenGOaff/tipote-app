# Soumission Firefox Add-ons (AMO) — Tipote Boost

Pendant Firefox du `CWS-LISTING.md`. Les textes de fiche (nom,
description courte, description longue, justifications par permission)
sont à REPRENDRE tels quels depuis `CWS-LISTING.md` : mêmes règles
(anglais, jamais d'énumération de noms de plateformes dans les champs
de la fiche, la couverture par réseau se montre dans les screenshots).
Ce document ne liste que ce qui est SPÉCIFIQUE à AMO.

**Statut** : jamais soumise. Première soumission à faire avec le build
`npm run build:firefox` (v1.12.4+).

---

## Ce qui change vs CWS

### 1. Package à uploader

```bash
cd apps/extension
npm install
npm run build:firefox
cd dist-firefox && zip -r ../tipote-boost-firefox-v<version>.zip . && cd ..
```

Zipper le CONTENU de `dist-firefox/` (manifest.json à la racine du zip,
pas dans un sous-dossier), sinon AMO rejette à l'upload.

### 2. Code source obligatoire

esbuild minifie → AMO exige le code source + instructions de build
reproductibles. Préparer un second zip contenant `apps/extension/` SANS
`node_modules/`, `dist/`, `dist-firefox/`, `*.zip`. Dans le champ
"Notes for reviewers", indiquer :

```
Build environment: Node.js 20+
Steps:
  npm install
  npm run build:firefox
Output is written to dist-firefox/ and matches the uploaded XPI.
```

### 3. ID et slug

- ID (immuable, déjà dans le manifest) : `boost@tipote.com`
  (`browser_specific_settings.gecko.id`). Ne JAMAIS le changer : c'est
  l'identité de l'extension côté Mozilla, le changer = nouvelle
  extension, users existants orphelins.
- Slug de la fiche : choisir `tipote-boost` à la création. Le frontend
  pointe vers `https://addons.mozilla.org/firefox/addon/tipote-boost/`
  (cf. `lib/podBoost.ts`, surcharge possible via
  `NEXT_PUBLIC_TIPOTE_FIREFOX_ADDON_URL` si le slug diffère).

### 4. Data collection (obligatoire pour toute nouvelle extension AMO)

Déclarée dans le manifest (`data_collection_permissions.required`) :

| Catégorie | Pourquoi |
|---|---|
| `personallyIdentifyingInfo` | L'extension lit l'identité LinkedIn du membre (nom, headline, URN) et l'envoie au backend Tipote pour le matching de compte. |
| `websiteActivity` | Les posts publiés/likés/commentés dans le cadre du pod sont signalés au backend (fan-out et karma). |

Le formulaire AMO reprend ces catégories : cocher les mêmes, pas plus.
Aucune donnée n'est vendue ni partagée hors backend Tipote (le dire
dans le champ prévu). Politique de confidentialité :
`https://app.tipote.com/legal/extension`.

### 5. Host permissions = opt-in sur Firefox

Contrairement à Chrome, Firefox N'ACCORDE PAS les host permissions à
l'installation (MV3). Conséquences :

- Tant que l'user n'a pas accordé l'accès, AUCUN content script ne
  s'injecte et l'extension est inerte. Le popup affiche une carte
  "Autoriser l'accès" (bouton `permissions.request()`) tant que les
  permissions manquent : c'est le chemin d'onboarding normal, à montrer
  dans un screenshot de la fiche.
- Dans "Notes for reviewers", expliquer ce flow pour éviter un
  "l'extension ne fait rien" en review.

### 6. Communication frontend → extension

Pas d'`externally_connectable` sur Firefox : le manifest Firefox embarque
à la place un content script `bridge.js` limité à `app.tipote.com` /
`tipote.com`, qui répond au frontend via `window.postMessage`
(détection d'installation + bouton "Synchroniser" de la page /boost).
Utile à mentionner aux reviewers : c'est la seule différence
fonctionnelle avec le build Chrome déjà publié sur CWS.
