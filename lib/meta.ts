// lib/meta.ts
// Helpers Meta Graph API : Facebook Pages + Threads.
// Doc : https://developers.facebook.com/docs/graph-api
// Doc Threads : https://developers.facebook.com/docs/threads/

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const THREADS_API_BASE = "https://graph.threads.net/v1.0";
const FB_AUTH_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;

const SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "threads_basic",
  "threads_content_publish",
];

function getAppId(): string {
  const id = process.env.META_APP_ID;
  if (!id) throw new Error("Missing env META_APP_ID");
  return id;
}

function getAppSecret(): string {
  const secret = process.env.META_APP_SECRET;
  if (!secret) throw new Error("Missing env META_APP_SECRET");
  return secret;
}

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Missing env NEXT_PUBLIC_APP_URL");
  return `${appUrl}/api/auth/meta/callback`;
}

// ----------------------------------------------------------------
// OAuth 2.0
// ----------------------------------------------------------------

/**
 * Construit l'URL d'autorisation Facebook Login.
 * Permissions : pages_show_list, pages_manage_posts, threads_basic, threads_content_publish
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getAppId(),
    redirect_uri: getRedirectUri(),
    scope: SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `${FB_AUTH_URL}?${params.toString()}`;
}

/**
 * Echange le code d'autorisation contre un short-lived user access token.
 */
export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    client_id: getAppId(),
    client_secret: getAppSecret(),
    redirect_uri: getRedirectUri(),
    code,
  });

  const res = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Echange un short-lived token contre un long-lived user access token (~60 jours).
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: getAppId(),
    client_secret: getAppSecret(),
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta long-lived token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ----------------------------------------------------------------
// Pages Facebook
// ----------------------------------------------------------------

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  category: string;
};

/**
 * Recupere les Pages Facebook de l'utilisateur.
 */
export async function getUserPages(userAccessToken: string): Promise<MetaPage[]> {
  const res = await fetch(
    `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,category&access_token=${userAccessToken}`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta pages fetch failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.data ?? [];
}

// ----------------------------------------------------------------
// Threads Discovery
// ----------------------------------------------------------------

export type ThreadsUserInfo = {
  id: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
};

/**
 * Detecte le compte Threads lie au user via l'API Threads.
 * Utilise le user access token (pas le page token).
 */
export async function getThreadsUser(userAccessToken: string): Promise<ThreadsUserInfo | null> {
  try {
    const res = await fetch(
      `${THREADS_API_BASE}/me?fields=id,username,name,threads_profile_picture_url&access_token=${userAccessToken}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.id) return null;
    return json as ThreadsUserInfo;
  } catch {
    return null;
  }
}

export type MetaUserInfo = {
  id: string;
  name: string;
  email?: string;
};

/**
 * Recupere les infos basiques du user Facebook.
 */
export async function getUserInfo(accessToken: string): Promise<MetaUserInfo> {
  const res = await fetch(
    `${GRAPH_API_BASE}/me?fields=id,name,email&access_token=${accessToken}`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta user info failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ----------------------------------------------------------------
// Facebook Page Publishing
// ----------------------------------------------------------------

export type MetaPostResult = {
  ok: boolean;
  postId?: string;
  error?: string;
  statusCode?: number;
};

/**
 * Publie un post texte sur une Page Facebook.
 */
export async function publishToFacebookPage(
  pageAccessToken: string,
  pageId: string,
  message: string
): Promise<MetaPostResult> {
  const res = await fetch(`${GRAPH_API_BASE}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      access_token: pageAccessToken,
    }),
  });

  if (res.ok) {
    const json = await res.json();
    return { ok: true, postId: json.id };
  }

  const text = await res.text();
  return { ok: false, error: text, statusCode: res.status };
}

/**
 * Publie un post photo sur une Page Facebook (message + image URL).
 */
export async function publishPhotoToFacebookPage(
  pageAccessToken: string,
  pageId: string,
  message: string,
  imageUrl: string
): Promise<MetaPostResult> {
  const res = await fetch(`${GRAPH_API_BASE}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      url: imageUrl,
      access_token: pageAccessToken,
    }),
  });

  if (res.ok) {
    const json = await res.json();
    return { ok: true, postId: json.post_id ?? json.id };
  }

  const text = await res.text();
  return { ok: false, error: text, statusCode: res.status };
}

// ----------------------------------------------------------------
// Threads Publishing (2 etapes : create container -> publish)
// Threads supporte les posts texte seuls ET les posts avec image.
// Doc : https://developers.facebook.com/docs/threads/posts
// ----------------------------------------------------------------

/**
 * Publie un post texte sur Threads.
 * Processus en 2 etapes :
 *   1. POST /{threads_user_id}/threads -> creation_id
 *   2. POST /{threads_user_id}/threads_publish -> post_id
 */
export async function publishToThreads(
  userAccessToken: string,
  threadsUserId: string,
  text: string,
  imageUrl?: string
): Promise<MetaPostResult> {
  // Etape 1 : Creer le container
  const containerBody: Record<string, string> = {
    text,
    access_token: userAccessToken,
  };

  if (imageUrl) {
    containerBody.media_type = "IMAGE";
    containerBody.image_url = imageUrl;
  } else {
    containerBody.media_type = "TEXT";
  }

  const createRes = await fetch(`${THREADS_API_BASE}/${threadsUserId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(containerBody),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    return { ok: false, error: `Threads container creation failed: ${errText}`, statusCode: createRes.status };
  }

  const createJson = await createRes.json();
  const creationId = createJson.id;

  if (!creationId) {
    return { ok: false, error: "No creation_id returned from Threads", statusCode: 500 };
  }

  // Etape 2 : Publier le container
  const publishRes = await fetch(`${THREADS_API_BASE}/${threadsUserId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: userAccessToken,
    }),
  });

  if (publishRes.ok) {
    const publishJson = await publishRes.json();
    return { ok: true, postId: publishJson.id };
  }

  const errText = await publishRes.text();
  return { ok: false, error: `Threads publish failed: ${errText}`, statusCode: publishRes.status };
}
