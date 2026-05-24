# Serveur TUS self-host (`popquiz-tus`)

Serveur d'upload résumable (tus) qui stocke les **vidéos popquiz** ET les
**visuels du Studio** sur le VPS, servis ensuite via Caddy `forward_auth`
+ secure-link signé (`videos.tipote.com` / `videos.tiquiz.com`).

Tourne sous pm2 (`popquiz-tus`, id 2) à `/opt/popquiz-tus/server.mjs`,
écoute `127.0.0.1:1080`. Le `.env` (secrets) reste sur le VPS, hors repo.

## Layout de stockage

```
<STORAGE_ROOT>/<app>/raw/<userId>/<videoId>/<kind>.<ext>
```
`kind` ∈ `source | thumbnail | thumbnail-custom | visual`. Le placement
vient UNIQUEMENT des claims du JWT (le client ne choisit pas où ça
atterrit). Le JWT est signé côté Next par `lib/popquiz/playback.ts`
(`signUploadToken`) avec le secret par app.

## Mise à jour (kind `visual` + fix URL d'upload)

Ce fichier :
1. ajoute `visual` à `KIND_RE` et au mapping des noms (`visual.<ext>`) ;
2. **corrige `generateUrl`** : il dépendait de `baseUrl` qui peut être
   `undefined` selon la version de `@tus/server` → URLs
   `https://<host>undefined/files/...` (ERR_NAME_NOT_RESOLVED, "failed to
   resume upload"). On construit désormais l'URL avec `proto`+`host`+`path`
   uniquement. **Ce fix répare les uploads vidéo Tipote ET Tiquiz.**

Sur le VPS, **vérifier le diff** avant de copier (sécurité anti-typo) :

```bash
cd /home/tipote/tipote-app && git pull origin main   # ou la branche déployée
diff /opt/popquiz-tus/server.mjs infra/popquiz-tus/server.mjs
# Les SEULES différences attendues : la ligne KIND_RE (+|visual) et la
# ligne `visual: `visual.${c.ext}`,` dans filenameByKind.

# Si le diff est conforme :
cp infra/popquiz-tus/server.mjs /opt/popquiz-tus/server.mjs
pm2 restart popquiz-tus
pm2 logs popquiz-tus --lines 20 --nostream   # doit relancer sans erreur
```

Les vidéos popquiz continuent de fonctionner à l'identique (kinds
inchangés). Le `.env` et `ecosystem.config.cjs` du VPS ne sont pas
touchés.
