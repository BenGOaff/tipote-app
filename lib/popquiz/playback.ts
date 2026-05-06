// Self-hosted video pipeline: token minting (uploads) + signed playback
// URLs (nginx secure_link). Server-only — leaks the HMAC secrets if
// imported anywhere client-side.
//
// Storage layout written by /opt/popquiz-tus and served by nginx:
//   /srv/popquiz-videos/<app>/raw/<userId>/<videoId>/(source|thumbnail).<ext>
// `storage_path` rows in popquiz_videos hold the relative path
// (everything after /srv/popquiz-videos/), e.g. "tipote/raw/<uid>/<vid>/source.mp4".

import "server-only";
import crypto from "node:crypto";

export const POPQUIZ_APP = "tipote" as const;

const UPLOAD_TOKEN_TTL_SECONDS = 60 * 60; // 1 h is enough for a 20 Go upload on a sluggish line
const PLAYBACK_TTL_SECONDS = 60 * 60 * 2; // 2 h — same TTL the previous Supabase signed URLs used

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export interface UploadClaims {
  sub: string; // Supabase user id
  app: typeof POPQUIZ_APP;
  videoId: string;
  ext: string; // already validated against ALLOWED_EXT below
  kind: "source" | "thumbnail";
}

const SAFE_EXT = /^[a-z0-9]{1,8}$/;
const ALLOWED_SOURCE_EXT = new Set([
  "mp4",
  "webm",
  "mov",
  "m4v",
  "mkv",
]);
const ALLOWED_THUMB_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

export function normalizeExt(name: string, kind: "source" | "thumbnail"): string | null {
  const i = name.lastIndexOf(".");
  if (i < 0 || i === name.length - 1) return null;
  const ext = name.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!SAFE_EXT.test(ext)) return null;
  const allow = kind === "source" ? ALLOWED_SOURCE_EXT : ALLOWED_THUMB_EXT;
  return allow.has(ext) ? ext : null;
}

// Compact HS256 JWT — kept inline rather than pulling jsonwebtoken
// into the Next bundle. The tus server validates with @tus/server +
// jsonwebtoken; both produce/consume the same standard JWS.
export function signUploadToken(
  claims: UploadClaims,
  ttlSec = UPLOAD_TOKEN_TTL_SECONDS,
): { token: string; expiresAt: number } {
  const secret = requireEnv("POPQUIZ_TUS_JWT_SECRET");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSec;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp }));
  const sig = b64url(
    crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return { token: `${header}.${payload}.${sig}`, expiresAt: exp };
}

export function uploadEndpoint(): string {
  // Trailing /files is the tus server route. We append it here so
  // env config stays a clean origin.
  return `${requireEnv("POPQUIZ_TUS_URL").replace(/\/+$/, "")}/files/`;
}

// Mint a short-lived nginx secure_link URL for a stored object.
// Hash format must match the directive in infra/nginx:
//   secure_link_md5 "$secure_link_expires$uri <SECRET>";
// Expressed in JS: md5( `${expires}${uri} ${secret}` ), base64url, no padding.
export function signedPlaybackUrl(
  storagePath: string,
  ttlSec = PLAYBACK_TTL_SECONDS,
): string {
  const base = requireEnv("POPQUIZ_VIDEO_BASE_URL").replace(/\/+$/, "");
  const secret = requireEnv("POPQUIZ_VIDEO_SECRET");
  const uri = "/" + storagePath.replace(/^\/+/, "");
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const md5 = b64url(
    crypto.createHash("md5").update(`${expires}${uri} ${secret}`).digest(),
  );
  return `${base}${uri}?md5=${md5}&expires=${expires}`;
}

// True when storage_path was written by the new self-hosted pipeline
// (always prefixed by the app name) rather than the legacy Supabase
// bucket layout (which started at "raw/...").
export function isSelfHostedPath(storagePath: string): boolean {
  return storagePath.startsWith(`${POPQUIZ_APP}/`);
}
