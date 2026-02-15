// lib/twitter.ts
// Helpers X (Twitter) OAuth 2.0 avec PKCE + Tweets API v2.
// Doc officielle : https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code

import { createHash, randomBytes } from "node:crypto";

const TWITTER_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const TWITTER_USERINFO_URL = "https://api.twitter.com/2/users/me";
const TWITTER_TWEETS_URL = "https://api.twitter.com/2/tweets";

const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];

function getClientId(): string {
  const id = process.env.TWITTER_CLIENT_ID;
  if (!id) throw new Error("Missing env TWITTER_CLIENT_ID");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.TWITTER_CLIENT_SECRET;
  if (!secret) throw new Error("Missing env TWITTER_CLIENT_SECRET");
  return secret;
}

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Missing env NEXT_PUBLIC_APP_URL");
  return `${appUrl}/api/auth/twitter/callback`;
}

// ----------------------------------------------------------------
// PKCE (Proof Key for Code Exchange)
// ----------------------------------------------------------------

/**
 * Genere un code_verifier aleatoire (43-128 chars, URL-safe).
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Genere le code_challenge a partir du code_verifier (S256).
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ----------------------------------------------------------------
// OAuth 2.0
// ----------------------------------------------------------------

/**
 * Genere l'URL d'autorisation X avec PKCE.
 * @param state - CSRF token
 * @param codeChallenge - PKCE code_challenge (S256)
 */
export function buildAuthorizationUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${TWITTER_AUTH_URL}?${params.toString()}`;
}

/**
 * Echange le code d'autorisation contre des tokens (avec PKCE code_verifier).
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: codeVerifier,
    client_id: getClientId(),
  });

  // X utilise Basic Auth (client_id:client_secret) pour le token endpoint
  const credentials = Buffer.from(
    `${getClientId()}:${getClientSecret()}`
  ).toString("base64");

  const res = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Rafraichit un access token expire.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: getClientId(),
  });

  const credentials = Buffer.from(
    `${getClientId()}:${getClientSecret()}`
  ).toString("base64");

  const res = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X token refresh failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ----------------------------------------------------------------
// User Info
// ----------------------------------------------------------------

export type TwitterUserInfo = {
  id: string;
  name: string;
  username: string;
};

/**
 * Recupere les infos du profil X connecte.
 */
export async function getUserInfo(accessToken: string): Promise<TwitterUserInfo> {
  const res = await fetch(TWITTER_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X userinfo failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  return json.data;
}

// ----------------------------------------------------------------
// Tweets API v2
// ----------------------------------------------------------------

export type TwitterPostResult = {
  ok: boolean;
  postId?: string;
  error?: string;
  statusCode?: number;
};

/**
 * Publie un tweet sur le compte X connecte.
 * Supporte optionnellement une image (URL publique).
 */
export async function publishTweet(
  accessToken: string,
  text: string,
  imageUrl?: string
): Promise<TwitterPostResult> {
  let mediaId: string | undefined;

  // Si une image est fournie, l'uploader via l'API media upload
  if (imageUrl) {
    try {
      mediaId = await uploadMediaToTwitter(accessToken, imageUrl);
    } catch (err) {
      console.error("Twitter media upload failed:", err);
      // Publier sans image en fallback
    }
  }

  const tweetPayload: Record<string, unknown> = { text };

  if (mediaId) {
    tweetPayload.media = { media_ids: [mediaId] };
  }

  const res = await fetch(TWITTER_TWEETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tweetPayload),
  });

  if (res.status === 201) {
    const json = await res.json();
    return { ok: true, postId: json.data?.id };
  }

  const errorText = await res.text();
  return { ok: false, error: errorText, statusCode: res.status };
}

// ----------------------------------------------------------------
// Twitter Media Upload
// L'API v2 utilise le media upload endpoint v1.1 pour les images.
// Doc : https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-upload
// ----------------------------------------------------------------

const TWITTER_MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

/**
 * Upload une image vers Twitter depuis une URL publique.
 * Utilise l'endpoint v1.1 media/upload (INIT + APPEND + FINALIZE pour les gros fichiers,
 * ou simple upload pour les petits fichiers < 5MB).
 * @returns Le media_id_string
 */
async function uploadMediaToTwitter(
  accessToken: string,
  imageUrl: string
): Promise<string> {
  // Télécharger l'image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}: ${imgRes.status}`);
  }

  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

  // Déterminer le media_type pour Twitter
  let mediaType = "image/jpeg";
  if (contentType.includes("png")) mediaType = "image/png";
  else if (contentType.includes("gif")) mediaType = "image/gif";
  else if (contentType.includes("jpeg") || contentType.includes("jpg")) mediaType = "image/jpeg";

  // Pour les fichiers < 5MB, on peut utiliser l'upload simple (base64)
  if (imgBuffer.length < 5 * 1024 * 1024) {
    const base64Data = imgBuffer.toString("base64");

    const formData = new URLSearchParams({
      media_data: base64Data,
      media_category: "tweet_image",
    });

    const res = await fetch(TWITTER_MEDIA_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twitter media upload failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    return json.media_id_string;
  }

  // Pour les fichiers plus gros : chunked upload (INIT → APPEND → FINALIZE)
  // INIT
  const initParams = new URLSearchParams({
    command: "INIT",
    total_bytes: String(imgBuffer.length),
    media_type: mediaType,
    media_category: "tweet_image",
  });

  const initRes = await fetch(TWITTER_MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: initParams.toString(),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`Twitter media INIT failed (${initRes.status}): ${text}`);
  }

  const initJson = await initRes.json();
  const mediaId = initJson.media_id_string;

  // APPEND (single chunk for images)
  const appendForm = new URLSearchParams({
    command: "APPEND",
    media_id: mediaId,
    segment_index: "0",
    media_data: imgBuffer.toString("base64"),
  });

  const appendRes = await fetch(TWITTER_MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: appendForm.toString(),
  });

  if (!appendRes.ok) {
    const text = await appendRes.text();
    throw new Error(`Twitter media APPEND failed (${appendRes.status}): ${text}`);
  }

  // FINALIZE
  const finalizeParams = new URLSearchParams({
    command: "FINALIZE",
    media_id: mediaId,
  });

  const finalizeRes = await fetch(TWITTER_MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: finalizeParams.toString(),
  });

  if (!finalizeRes.ok) {
    const text = await finalizeRes.text();
    throw new Error(`Twitter media FINALIZE failed (${finalizeRes.status}): ${text}`);
  }

  return mediaId;
}
