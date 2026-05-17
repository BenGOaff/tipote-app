// infra/dispatcher/server.mjs
//
// Tiny HTTP service Caddy talks to so a single `:443` catchall can
// serve custom domains owned by EITHER Tipote (port 3000) or Tiquiz
// (port 3001). The two apps have independent databases — neither
// knows about the other's custom_domains — so we need a thin
// arbiter in front to look up "who owns this hostname?".
//
// Two endpoints, both on 127.0.0.1:4000 (never exposed publicly):
//
//   1. GET /caddy-ask?domain=<host>&secret=<DISPATCHER_ASK_SECRET>
//      Called by Caddy `on_demand_tls.ask` before issuing a Let's
//      Encrypt cert for any unknown hostname. We fan out to both
//      apps' /api/internal/caddy-ask endpoints and return 200 if
//      either approves, 404 otherwise.
//
//   2. GET /lookup  (with original Host in X-Forwarded-Host)
//      Called by Caddy `forward_auth` on every request hitting the
//      catchall. Returns 200 + header `X-Dispatch-To: tipote|tiquiz`
//      so Caddy's downstream matchers can pick the right backend.
//      Returns 404 if neither app owns the hostname.
//
// Each app's caddy-ask remains the source of truth for its own
// custom_domains table — no DB credentials in this process. The
// only secrets we need are the per-app CADDY_ASK_SECRET values
// (the same env vars each app already needs).
//
// 5-minute positive cache, 30-second negative cache, so the
// upstream apps don't see one ask per request.

import http from "node:http";
import { request as httpRequest } from "node:http";

const PORT = parseInt(process.env.DISPATCHER_PORT ?? "4000", 10);
const TIPOTE_PORT = parseInt(process.env.TIPOTE_PORT ?? "3000", 10);
const TIQUIZ_PORT = parseInt(process.env.TIQUIZ_PORT ?? "3001", 10);
const TIPOTE_ASK_SECRET = process.env.TIPOTE_CADDY_ASK_SECRET ?? "";
const TIQUIZ_ASK_SECRET = process.env.TIQUIZ_CADDY_ASK_SECRET ?? "";
const DISPATCHER_ASK_SECRET = process.env.DISPATCHER_ASK_SECRET ?? "";

const POSITIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 30 * 1000;

/** @type {Map<string, { app: 'tipote' | 'tiquiz' | null; exp: number }>} */
const cache = new Map();

function askApp(port, secret, domain) {
  return new Promise((resolve) => {
    if (!secret) return resolve(false);
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: "GET",
        path: `/api/internal/caddy-ask?secret=${encodeURIComponent(secret)}&domain=${encodeURIComponent(domain)}`,
      },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function resolveApp(rawDomain) {
  const domain = (rawDomain ?? "").toLowerCase().trim();
  if (!domain) return null;

  const cached = cache.get(domain);
  if (cached && cached.exp > Date.now()) return cached.app;

  // Order chosen so the larger / faster-growing app is checked first.
  // Today Tipote is the user-facing umbrella — Tiquiz remains for
  // the standalone quiz tool. Adjust if traffic patterns flip.
  if (await askApp(TIPOTE_PORT, TIPOTE_ASK_SECRET, domain)) {
    cache.set(domain, { app: "tipote", exp: Date.now() + POSITIVE_CACHE_TTL_MS });
    return "tipote";
  }
  if (await askApp(TIQUIZ_PORT, TIQUIZ_ASK_SECRET, domain)) {
    cache.set(domain, { app: "tiquiz", exp: Date.now() + POSITIVE_CACHE_TTL_MS });
    return "tiquiz";
  }
  cache.set(domain, { app: null, exp: Date.now() + NEGATIVE_CACHE_TTL_MS });
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // --- /caddy-ask: gate Let's Encrypt cert issuance ---
    if (url.pathname === "/caddy-ask") {
      const secret = url.searchParams.get("secret");
      if (!DISPATCHER_ASK_SECRET || secret !== DISPATCHER_ASK_SECRET) {
        res.writeHead(401);
        return res.end("Bad secret");
      }
      const domain = url.searchParams.get("domain") ?? "";
      const app = await resolveApp(domain);
      if (!app) {
        res.writeHead(404);
        return res.end("Unknown hostname");
      }
      res.writeHead(200);
      return res.end("ok");
    }

    // --- /lookup: tell Caddy which backend owns the live request ---
    if (url.pathname === "/lookup") {
      // Caddy's forward_auth puts the original Host header in
      // X-Forwarded-Host; fall back to req.headers.host for direct
      // health-check style calls.
      const rawHost =
        (req.headers["x-forwarded-host"] ?? req.headers.host ?? "").toString();
      const host = rawHost.toLowerCase().split(":")[0];
      if (!host) {
        res.writeHead(400);
        return res.end("Missing host");
      }
      const app = await resolveApp(host);
      if (!app) {
        res.writeHead(404);
        return res.end("Unknown hostname");
      }
      res.setHeader("X-Dispatch-To", app);
      res.writeHead(200);
      return res.end("ok");
    }

    // --- /health: tiny endpoint for monitoring ---
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, cacheSize: cache.size }));
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (e) {
    // Never let an unexpected error take the dispatcher down — Caddy
    // would then DOS itself trying to issue certs. Return 5xx and
    // log so the operator can investigate.
    console.error("[dispatcher] unexpected error", e);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("Dispatcher error");
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[dispatcher] listening on 127.0.0.1:${PORT}`);
  console.log(`[dispatcher] tipote port=${TIPOTE_PORT} tiquiz port=${TIQUIZ_PORT}`);
  if (!TIPOTE_ASK_SECRET) console.warn("[dispatcher] TIPOTE_CADDY_ASK_SECRET is empty — Tipote domains will all be rejected");
  if (!TIQUIZ_ASK_SECRET) console.warn("[dispatcher] TIQUIZ_CADDY_ASK_SECRET is empty — Tiquiz domains will all be rejected");
  if (!DISPATCHER_ASK_SECRET) console.warn("[dispatcher] DISPATCHER_ASK_SECRET is empty — /caddy-ask will reject everything");
});

// Periodic cache prune so we don't grow unbounded on bot scans.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.exp <= now) cache.delete(k);
  }
}, 60_000);
