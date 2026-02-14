// lib/reddit.ts
// Helpers Reddit OAuth 2.0 + Submit API.
// Doc officielle : https://www.reddit.com/dev/api/oauth
// Guide OAuth : https://github.com/reddit-archive/reddit/wiki/OAuth2

const REDDIT_AUTH_URL = "https://www.reddit.com/api/v1/authorize";
const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_USERINFO_URL = "https://oauth.reddit.com/api/v1/me";
const REDDIT_SUBMIT_URL = "https://oauth.reddit.com/api/submit";

const SCOPES = ["identity", "submit", "read"];

function getClientId(): string {
  const id = process.env.REDDIT_CLIENT_ID;
  if (!id) throw new Error("Missing env REDDIT_CLIENT_ID");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!secret) throw new Error("Missing env REDDIT_CLIENT_SECRET");
  return secret;
}

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Missing env NEXT_PUBLIC_APP_URL");
  return `${appUrl}/api/auth/reddit/callback`;
}

// ----------------------------------------------------------------
// OAuth 2.0
// ----------------------------------------------------------------

/**
 * Genere l'URL d'autorisation Reddit.
 * @param state - CSRF token
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: "code",
    state,
    redirect_uri: getRedirectUri(),
    duration: "permanent", // pour obtenir un refresh_token
    scope: SCOPES.join(" "),
  });
  return `${REDDIT_AUTH_URL}?${params.toString()}`;
}

/**
 * Echange le code d'autorisation contre des tokens.
 * Reddit utilise Basic Auth (client_id:client_secret) pour le token endpoint.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
  });

  const credentials = Buffer.from(
    `${getClientId()}:${getClientSecret()}`
  ).toString("base64");

  const res = await fetch(REDDIT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
      "User-Agent": "Tipote/1.0",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Rafraichit un access token expire.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const credentials = Buffer.from(
    `${getClientId()}:${getClientSecret()}`
  ).toString("base64");

  const res = await fetch(REDDIT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
      "User-Agent": "Tipote/1.0",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit token refresh failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ----------------------------------------------------------------
// User Info
// ----------------------------------------------------------------

export type RedditUserInfo = {
  id: string;
  name: string; // username (ex: "u/tipote")
  icon_img?: string;
};

/**
 * Recupere les infos du profil Reddit connecte.
 */
export async function getUserInfo(accessToken: string): Promise<RedditUserInfo> {
  const res = await fetch(REDDIT_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "Tipote/1.0",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reddit userinfo failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ----------------------------------------------------------------
// Submit API
// ----------------------------------------------------------------

export type RedditPostResult = {
  ok: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  statusCode?: number;
};

/**
 * Publie un post texte sur le profil Reddit de l'utilisateur (u/username).
 * Reddit exige un titre pour chaque post.
 */
export async function publishPost(
  accessToken: string,
  username: string,
  title: string,
  text: string
): Promise<RedditPostResult> {
  const body = new URLSearchParams({
    api_type: "json",
    kind: "self",
    sr: `u_${username}`, // poster sur le profil utilisateur
    title,
    text,
  });

  const res = await fetch(REDDIT_SUBMIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Tipote/1.0",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    return { ok: false, error: errorText, statusCode: res.status };
  }

  const json = await res.json();
  const errors = json?.json?.errors;

  if (errors && errors.length > 0) {
    const errorMsg = errors.map((e: string[]) => e.join(": ")).join(", ");
    return { ok: false, error: errorMsg, statusCode: 400 };
  }

  const data = json?.json?.data;
  return {
    ok: true,
    postId: data?.id,
    postUrl: data?.url,
  };
}

/**
 * Publie un post lien sur le profil Reddit de l'utilisateur.
 */
export async function publishLinkPost(
  accessToken: string,
  username: string,
  title: string,
  url: string
): Promise<RedditPostResult> {
  const body = new URLSearchParams({
    api_type: "json",
    kind: "link",
    sr: `u_${username}`,
    title,
    url,
  });

  const res = await fetch(REDDIT_SUBMIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Tipote/1.0",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    return { ok: false, error: errorText, statusCode: res.status };
  }

  const json = await res.json();
  const errors = json?.json?.errors;

  if (errors && errors.length > 0) {
    const errorMsg = errors.map((e: string[]) => e.join(": ")).join(", ");
    return { ok: false, error: errorMsg, statusCode: 400 };
  }

  const data = json?.json?.data;
  return {
    ok: true,
    postId: data?.id,
    postUrl: data?.url,
  };
}
