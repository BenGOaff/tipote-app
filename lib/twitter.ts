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
 */
export async function publishTweet(
  accessToken: string,
  text: string
): Promise<TwitterPostResult> {
  const res = await fetch(TWITTER_TWEETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (res.status === 201) {
    const json = await res.json();
    return { ok: true, postId: json.data?.id };
  }

  const errorText = await res.text();
  return { ok: false, error: errorText, statusCode: res.status };
}
