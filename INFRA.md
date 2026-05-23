# Infrastructure VPS Béné

**À mettre à jour quand un process est ajouté/renommé/redémarré.**

## Process pm2

| id | name              | role                          | repo path                  | port (interne) |
|----|-------------------|-------------------------------|----------------------------|----------------|
| 5  | tipote-prod       | App Next.js Tipote            | /home/tipote/tipote-app    | 3000           |
| 1  | tiquiz-prod       | App Next.js Tiquiz            | /home/tipote/tiquiz-app    | 3001 (à confirmer) |
| 2  | popquiz-tus       | Serveur upload TUS pour videos | /home/tipote/...           | ?              |
| 6  | domain-dispatcher | Caddy ask endpoint pour custom domains | /home/tipote/tipote-app/infra/dispatcher | 8080 (à confirmer) |

## Commandes de déploiement standard

### Sur Windows (poste Béné)

```powershell
# 1. Récupère le code à jour depuis la branche de travail Claude
cd C:\Users\hello\Desktop\autopilot\tipote-app
git fetch origin claude/setup-dev-guidelines-CmXl0
git checkout origin/claude/setup-dev-guidelines-CmXl0 -- .
git add . && git commit -m "claude <description>" && git push origin main

# Idem pour Tiquiz si modifs côté Tiquiz
cd C:\Users\hello\Desktop\tiquiz
git fetch origin claude/setup-dev-guidelines-CmXl0
git checkout origin/claude/setup-dev-guidelines-CmXl0 -- .
git add . && git commit -m "claude <description>" && git push origin main
```

### Sur le VPS

```bash
# Tipote
cd /home/tipote/tipote-app
git stash
git pull origin main
npm ci
npm run build
pm2 restart tipote-prod --update-env

# Tiquiz
cd /home/tipote/tiquiz-app
git stash
git pull origin main
npm ci
npm run build
pm2 restart tiquiz-prod --update-env

# Caddy (si modif vhost/SSL)
sudo cp /home/tipote/tiquiz-app/infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Voir les logs en cas de souci
pm2 logs tipote-prod --lines 50 --nostream
pm2 logs tiquiz-prod --lines 50 --nostream
sudo journalctl -u caddy -f
```

## Domaines

| Domaine                | Pointing                    | Caddy vhost                 | Cloudflare proxy |
|------------------------|-----------------------------|-----------------------------|------------------|
| app.tipote.com         | VPS:3000 (Tipote)           | ✓                           | Orange (proxied) |
| affiliate.tipote.com   | VPS:3000 (Tipote, rewrite)  | ✓                           | Orange           |
| quiz.tipote.com        | VPS:3001 (Tiquiz)           | ✓                           | Orange           |
| n8n.tipote.com         | n8n container               | ✓                           | DNS only         |
| tus.tipote.com         | TUS upload server           | ✓                           | DNS only         |
| videos.tipote.com      | Static videos               | ✓                           | DNS only         |
| connect.tipote.com     | OAuth callbacks             | ✓                           | DNS only         |
| tipote.com / tipote.fr | Systeme.io (PAS le VPS)     | -                           | DNS only         |
| custom user domains    | VPS:3001 via Caddy ask      | dynamic via domain-dispatcher | DNS only       |

## Caddyfile sur VPS

Source de vérité : `/home/tipote/tiquiz-app/infra/caddy/Caddyfile` dans le repo.
Copié vers `/etc/caddy/Caddyfile` après chaque modif (pas de symlink à cause des
permissions du home directory).

## Supabase projects

- **Tipote** : auth + profiles + business_profiles + affiliate_* + sio_sales + webhook_logs
- **Tiquiz** : auth séparée + quizzes + popquizzes + leads + custom_domains
