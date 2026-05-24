// Resumable upload endpoint for popquiz videos + studio visuals.
//
// Listens on 127.0.0.1:1080 behind Caddy (tus.tipote.com / tus.tiquiz.com).
// Files land at:  <STORAGE_ROOT>/<app>/raw/<userId>/<videoId>/(source|thumbnail|visual).<ext>
//
// Auth: every POST/PATCH must carry `Authorization: Bearer <jwt>` minted by
// the originating Next app. The JWT's `app` claim selects which secret we
// validate against, so Tipote and Tiquiz can't impersonate each other.
//
// File placement is decided entirely from the JWT claims — client-supplied
// tus metadata is informational only. That's the security boundary: the
// browser cannot pick where its file ends up.
//
// Also exposes GET /_validate-secure-link for Caddy's `forward_auth` on the
// `videos.*` vhosts. This replaces nginx's native `secure_link_md5` module
// (Caddy has no equivalent). The signed URLs are minted by lib/popquiz/
// playback.ts in the Next backends, using the same MD5 algorithm we
// validate here — single source of truth via env vars.

import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import jwt from "jsonwebtoken";

const PORT = Number(process.env.PORT || 1080);
const HOST = process.env.HOST || "127.0.0.1";
const STORAGE_ROOT = process.env.STORAGE_ROOT || "/srv/popquiz-videos";
const MAX_SIZE = Number(process.env.MAX_SIZE_BYTES || 20 * 1024 ** 3);

const SECRETS = {
  tipote: process.env.TIPOTE_JWT_SECRET || "",
  tiquiz: process.env.TIQUIZ_JWT_SECRET || "",
};

// Per-app secret for signed video playback URLs. Must match the value
// passed as `POPQUIZ_VIDEO_SECRET` in each Next app's env (the apps
// mint the URLs; we validate them here). Without these, the validator
// rejects every request — same fail-closed posture as a wrong secret.
const VIDEO_SECRETS = {
  tipote: process.env.TIPOTE_VIDEO_SECRET || "",
  tiquiz: process.env.TIQUIZ_VIDEO_SECRET || "",
};

if (!SECRETS.tipote && !SECRETS.tiquiz) {
  console.error(
    "[tus] No JWT secret configured. Set TIPOTE_JWT_SECRET and/or TIQUIZ_JWT_SECRET.",
  );
  process.exit(1);
}
if (!VIDEO_SECRETS.tipote && !VIDEO_SECRETS.tiquiz) {
  console.warn(
    "[tus] No video secret configured. /_validate-secure-link will deny everything. " +
      "Set TIPOTE_VIDEO_SECRET and/or TIQUIZ_VIDEO_SECRET to enable video playback.",
  );
}

const APP_RE = /^(tipote|tiquiz)$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_RE = /^[a-z0-9]{1,8}$/;
const KIND_RE = /^(source|thumbnail|thumbnail-custom|visual)$/;

function httpError(status, message) {
  const err = new Error(message);
  err.status_code = status;
  return err;
}

// base64url without padding — matches lib/popquiz/playback.ts and the
// historical nginx `secure_link_md5` output format.
function b64url(buf) {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// Caddy `forward_auth` calls this with the original request's path +
// query in X-Forwarded-Uri. We re-compute the MD5 the Next backend
// would have signed and compare. Returns:
//   200  if the signature is valid AND not expired
//   410  if the signature looks right but `expires` is in the past
//   403  for every other failure (bad URI, wrong app prefix, no secret
//        configured, signature mismatch). Bodies are kept opaque so we
//        never leak why a probing client failed.
//
// Important: nginx hashes against `$uri` (the DECODED path, no query),
// so we use url.pathname here — not the raw forwarded URI. The Next
// signer in lib/popquiz/playback.ts uses the same plain pathname.
function handleValidateSecureLink(req, res) {
  const forwardedUri = req.headers["x-forwarded-uri"];
  if (typeof forwardedUri !== "string" || !forwardedUri.startsWith("/")) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain");
    res.end("bad-uri");
    return;
  }

  let url;
  try {
    url = new URL(forwardedUri, "http://internal");
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain");
    res.end("bad-uri");
    return;
  }

  const pathOnly = url.pathname;
  const md5 = url.searchParams.get("md5") || "";
  const expires = url.searchParams.get("expires") || "";

  // The storage layout always namespaces by app (e.g. /tipote/raw/...
  // or /tiquiz/raw/...), so the first path segment tells us which
  // secret to validate against.
  const appMatch = pathOnly.match(/^\/(tipote|tiquiz)\//);
  if (!appMatch) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  const secret = VIDEO_SECRETS[appMatch[1]];
  if (!secret) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }

  const expiresNum = Number(expires);
  if (!Number.isFinite(expiresNum) || expiresNum <= 0) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  if (expiresNum < Math.floor(Date.now() / 1000)) {
    res.statusCode = 410;
    res.end("expired");
    return;
  }

  const expected = b64url(
    crypto.createHash("md5").update(`${expires}${pathOnly} ${secret}`).digest(),
  );

  // Constant-time comparison protects against signature-leak side
  // channels even though MD5 is fast — defence in depth never hurt.
  const a = Buffer.from(expected);
  const b = Buffer.from(md5);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!valid) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "no-store");
  res.end("ok");
}

function verifyAuth(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) throw httpError(401, "Missing bearer token");
  const raw = h.slice(7).trim();

  // Peek at the payload to choose which secret to verify against.
  // jwt.decode does not validate the signature, so we still call
  // jwt.verify below before trusting anything.
  const peek = jwt.decode(raw);
  if (!peek || typeof peek !== "object" || typeof peek.app !== "string") {
    throw httpError(401, "Malformed token");
  }
  const secret = SECRETS[peek.app];
  if (!secret) throw httpError(401, "Unknown app");

  let claims;
  try {
    claims = jwt.verify(raw, secret, { algorithms: ["HS256"] });
  } catch {
    throw httpError(401, "Invalid token");
  }

  if (!APP_RE.test(claims.app)) throw httpError(401, "Bad app claim");
  if (typeof claims.sub !== "string" || !UUID_RE.test(claims.sub)) {
    throw httpError(401, "Bad sub claim");
  }
  if (typeof claims.videoId !== "string" || !UUID_RE.test(claims.videoId)) {
    throw httpError(401, "Bad videoId claim");
  }
  if (typeof claims.ext !== "string" || !EXT_RE.test(claims.ext)) {
    throw httpError(401, "Bad ext claim");
  }
  if (typeof claims.kind !== "string" || !KIND_RE.test(claims.kind)) {
    throw httpError(401, "Bad kind claim");
  }
  return claims;
}

function relPathFromClaims(c) {
  const filenameByKind = {
    source: `source.${c.ext}`,
    thumbnail: `thumbnail.${c.ext}`,
    "thumbnail-custom": `thumbnail-custom.${c.ext}`,
    visual: `visual.${c.ext}`,
  };
  const fname = filenameByKind[c.kind] ?? `source.${c.ext}`;
  return path.posix.join(c.app, "raw", c.sub, c.videoId, fname);
}

const tus = new Server({
  path: "/files",
  datastore: new FileStore({ directory: STORAGE_ROOT }),
  maxSize: MAX_SIZE,
  respectForwardedHeaders: true,
  namingFunction(req) {
    const c = req._claims;
    if (!c) throw httpError(401, "Missing claims");
    return relPathFromClaims(c);
  },
  generateUrl(_req, { proto, host, baseUrl, path: p, id }) {
    return `${proto}://${host}${baseUrl}${p}/${encodeURIComponent(id)}`;
  },
  getFileIdFromRequest(req) {
    const u = req.url || "";
    const m = u.match(/\/files\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : undefined;
  },
});

const server = http.createServer((req, res) => {
  // Browser preflight. The JWT in Authorization is the only auth gate;
  // any origin can attempt an upload, the token is what authorises it.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, GET, HEAD, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Tus-Resumable, Upload-Length, Upload-Offset, Upload-Metadata, Upload-Defer-Length, Upload-Concat, X-Requested-With",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Tus-Resumable, Tus-Version, Tus-Max-Size, Tus-Extension, Upload-Offset, Upload-Length, Location",
  );
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Caddy `forward_auth` for the videos.* vhosts. Routed first so the
  // tus router never sees this path (it would 404 since /files is its
  // only mounted prefix anyway, but explicit > implicit).
  if (req.method === "GET" && req.url === "/_validate-secure-link") {
    return handleValidateSecureLink(req, res);
  }

  if (req.method === "POST" || req.method === "PATCH") {
    try {
      req._claims = verifyAuth(req);
    } catch (e) {
      res.statusCode = e.status_code || 401;
      res.setHeader("Content-Type", "text/plain");
      res.end(e.message);
      return;
    }
  }

  return tus.handle(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`[tus] listening on ${HOST}:${PORT}, storage=${STORAGE_ROOT}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[tus] ${sig} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
