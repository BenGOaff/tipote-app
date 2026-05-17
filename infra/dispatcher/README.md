# Custom-domains dispatcher

Tiny localhost-only HTTP service that lets a single Caddy `:443`
catchall serve custom domains belonging to **either** Tipote or
Tiquiz. Neither app's database knows about the other's, so the
dispatcher fans out to both apps' `/api/internal/caddy-ask`
endpoints and tells Caddy:

1. **Which hostname to issue a cert for** (via `on_demand_tls.ask`)
2. **Which backend port to proxy a live request to** (via
   `forward_auth` + a response header `X-Dispatch-To: tipote|tiquiz`)

Listens on `127.0.0.1:4000`. **Never bind to a public interface** —
the `/caddy-ask` endpoint is gated by a shared secret but `/lookup`
is unauthenticated (it's safe behind Caddy but not over the
internet).

## One-time setup on the VPS

```bash
# 1. Clone / pull this repo so infra/dispatcher/ is on disk
cd /home/tipote/tipote-app/infra/dispatcher

# 2. Create an env file with the three secrets. Two of them already
#    exist (each app's CADDY_ASK_SECRET) — copy them here.
sudo tee /etc/default/dispatcher.env > /dev/null <<'EOF'
TIPOTE_CADDY_ASK_SECRET=<same as Tipote pm2 env>
TIQUIZ_CADDY_ASK_SECRET=<same as Tiquiz pm2 env>
DISPATCHER_ASK_SECRET=<generate a fresh long random — see below>
EOF
sudo chmod 600 /etc/default/dispatcher.env

# Generate a random secret if you don't have one yet
openssl rand -hex 32

# 3. Boot under PM2, sourcing the env file first
set -a; source /etc/default/dispatcher.env; set +a
pm2 start ecosystem.config.cjs --update-env
pm2 save

# 4. Sanity check
curl -s http://127.0.0.1:4000/health
# → {"ok":true,"cacheSize":0}
```

## Caddy expects DISPATCHER_ASK_SECRET too

Add to `/etc/caddy/caddy.env`:

```env
DISPATCHER_ASK_SECRET=<same as above>
```

Then reload Caddy:

```bash
sudo systemctl reload caddy
```

The Caddyfile (in the Tiquiz repo at `infra/caddy/Caddyfile`) uses
this var via `{$DISPATCHER_ASK_SECRET}` interpolation in the
`on_demand_tls.ask` directive.

## How a request flows

1. Visitor's browser hits `mybrand.com` over HTTPS
2. Caddy: no cert? → `GET /caddy-ask?domain=mybrand.com&secret=...`
   on dispatcher → dispatcher asks Tipote, then Tiquiz, returns 200
3. Caddy issues a Let's Encrypt cert; TLS handshake completes
4. HTTP request arrives at Caddy
5. Caddy: `forward_auth` → `GET /lookup` on dispatcher (with
   `X-Forwarded-Host: mybrand.com`) → dispatcher returns
   `200 X-Dispatch-To: tipote`
6. Caddy matcher reads `X-Dispatch-To` → `reverse_proxy` to
   `127.0.0.1:3000` (Tipote)
7. Tipote middleware sees Host = `mybrand.com`, sets the
   `x-tipote-custom-host` request header, app/[publicSlug]/page.tsx
   resolves the right (user, project, slug) and serves it

The dispatcher caches positive lookups for 5 minutes and negatives
for 30 seconds so the upstream apps never see a per-request load
spike from this.

## Failure modes

| Symptom | Likely cause |
|---|---|
| All custom domains return 401 from `/caddy-ask` | `DISPATCHER_ASK_SECRET` mismatch between dispatcher and `/etc/caddy/caddy.env` |
| Tipote domains rejected, Tiquiz fine | `TIPOTE_CADDY_ASK_SECRET` doesn't match Tipote's env |
| Both rejected but apps work directly | Dispatcher down — check `pm2 list` |
| `502 Bad Gateway` on custom domain | Backend (3000 / 3001) is down or restarting |

`pm2 logs domain-dispatcher` will surface every failed upstream
call with the host that triggered it.
