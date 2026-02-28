// lib/meta.ts
// Helpers Meta Graph API : Facebook Pages + Instagram + Threads.
// Doc : https://developers.facebook.com/docs/graph-api
// Doc Instagram : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api
// Doc Threads : https://developers.facebook.com/docs/threads/
//
// Architecture Meta (2 apps) :
//   App "Tipote" (META_APP_ID)       → Facebook Pages + Threads
//   App "Tipote ter" (INSTAGRAM_APP_ID) → Instagram Professional Login

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const THREADS_API_BASE = "https://graph.threads.net/v1.0";
const FB_AUTH_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const THREADS_AUTH_URL = "https://threads.net/oauth/authorize";
const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";

// Instagram Professional Login (OAuth séparé de Facebook)
// Doc : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
const INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

// Facebook Pages scopes (OAuth Facebook Login – app "Tipote", config_id META_CONFIG_ID)
// NOTE: instagram_manage_hashtags et instagram_manage_comments ont été retirés.
// Ces anciennes permissions (système "Facebook Login") créaient une dépendance
// sur instagram_basic dans le dashboard Meta, bloquant l'App Review.
// Toutes les fonctionnalités Instagram (comments, publish, DM) passent désormais
// par Instagram Professional Login avec les scopes instagram_business_*.
// NOTE: pages_messaging n'est PAS ici car il nécessite le produit "Messenger"
// qui est dans Tipote ter, pas Tipote. Les DMs Facebook passent par
// MESSENGER_PAGE_ACCESS_TOKEN (token généré dans Tipote ter).
const FB_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_metadata",
];


// Threads scopes (OAuth Threads separe)
// threads_keyword_search : added by Meta Dec 2024, required for GET /v1.0/search?q=...
const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_keyword_search",
];

// Instagram Professional Login scopes
// instagram_business_basic      : profil + médias
// instagram_business_manage_comments : lire/répondre aux commentaires
// instagram_business_manage_messages : envoyer des DMs
// instagram_business_content_publish : publier des posts
const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
  "instagram_business_content_publish",
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

// Instagram Professional Login : app "Tipote ter" (INSTAGRAM_APP_ID), fallback sur META_APP_ID
function getInstagramAppId(): string {
  const id = process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  if (!id) throw new Error("Missing env INSTAGRAM_APP_ID or META_APP_ID");
  return id;
}

function getInstagramAppSecret(): string {
  const secret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!secret) throw new Error("Missing env INSTAGRAM_APP_SECRET or META_APP_SECRET");
  return secret;
}

function getInstagramRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Missing env NEXT_PUBLIC_APP_URL");
  return `${appUrl}/api/auth/instagram/callback`;
}

// App parente "Tipote ter" — nécessaire pour les webhooks et la vérification
// des signatures (X-Hub-Signature-256, signed_request).
// Meta signe avec le secret de l'app parente, pas celui de la sub-app Instagram.
export function getInstagramMetaAppId(): string {
  const id = process.env.INSTAGRAM_META_APP_ID ?? process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  if (!id) throw new Error("Missing env INSTAGRAM_META_APP_ID, INSTAGRAM_APP_ID, or META_APP_ID");
  return id;
}

export function getInstagramMetaAppSecret(): string {
  const secret = process.env.INSTAGRAM_META_APP_SECRET ?? process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!secret) throw new Error("Missing env INSTAGRAM_META_APP_SECRET, INSTAGRAM_APP_SECRET, or META_APP_SECRET");
  return secret;
}

// Threads : app "Tipote" (THREADS_APP_ID), fallback sur META_APP_ID
function getThreadsAppId(): string {
  const id = process.env.THREADS_APP_ID ?? process.env.META_APP_ID;
  if (!id) throw new Error("Missing env THREADS_APP_ID or META_APP_ID");
  return id;
}

function getThreadsAppSecret(): string {
  const secret = process.env.THREADS_APP_SECRET ?? process.env.META_APP_SECRET;
  if (!secret) throw new Error("Missing env THREADS_APP_SECRET or META_APP_SECRET");
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
 * Construit l'URL d'autorisation Facebook Login for Business.
 * Si META_CONFIG_ID est defini (recommande pour les apps Business),
 * utilise le config_id qui inclut deja les permissions configurees.
 * Sinon fallback sur le scope classique.
 */
export function buildAuthorizationUrl(state: string): string {
  const configId = process.env.META_CONFIG_ID;

  if (configId) {
    // Facebook Login for Business : config_id remplace le scope
    const params = new URLSearchParams({
      client_id: getAppId(),
      redirect_uri: getRedirectUri(),
      response_type: "code",
      config_id: configId,
      state,
    });
    console.log("[buildAuthorizationUrl] Using config_id:", configId);
    return `${FB_AUTH_URL}?${params.toString()}`;
  }

  // Fallback classique (sans config_id)
  const params = new URLSearchParams({
    client_id: getAppId(),
    redirect_uri: getRedirectUri(),
    scope: FB_SCOPES.join(","),
    response_type: "code",
    state,
  });
  console.log("[buildAuthorizationUrl] Using scope fallback (no META_CONFIG_ID)");
  return `${FB_AUTH_URL}?${params.toString()}`;
}

// ----------------------------------------------------------------
// Threads OAuth 2.0 (endpoint separe : threads.net/oauth/authorize)
// ----------------------------------------------------------------

function getThreadsRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Missing env NEXT_PUBLIC_APP_URL");
  return `${appUrl}/api/auth/threads/callback`;
}

/**
 * Construit l'URL d'autorisation Threads.
 * Endpoint : https://threads.net/oauth/authorize
 * Permissions : threads_basic, threads_content_publish
 */
export function buildThreadsAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getThreadsAppId(),
    redirect_uri: getThreadsRedirectUri(),
    scope: THREADS_SCOPES.join(","),
    response_type: "code",
    state,
  });
  return `${THREADS_AUTH_URL}?${params.toString()}`;
}

/**
 * Echange le code Threads contre un short-lived access token.
 * Endpoint : https://graph.threads.net/oauth/access_token
 */
export async function exchangeThreadsCodeForToken(code: string): Promise<{
  access_token: string;
  user_id: string;
}> {
  const params = new URLSearchParams({
    client_id: getThreadsAppId(),
    client_secret: getThreadsAppSecret(),
    redirect_uri: getThreadsRedirectUri(),
    grant_type: "authorization_code",
    code,
  });

  const res = await fetch(`${THREADS_TOKEN_URL}?${params.toString()}`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Threads token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Echange un short-lived Threads token contre un long-lived token (~60 jours).
 * Endpoint : https://graph.threads.net/access_token
 */
export async function exchangeThreadsForLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: getThreadsAppSecret(),
    access_token: shortLivedToken,
  });

  const res = await fetch(`${THREADS_API_BASE}/access_token?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Threads long-lived token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Echange le code d'autorisation contre un short-lived user access token.
 * @param redirectUri - optionnel, par defaut le redirect Facebook (/api/auth/meta/callback).
 *   Instagram passe /api/auth/instagram/callback.
 */
export async function exchangeCodeForToken(code: string, redirectUri?: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    client_id: getAppId(),
    client_secret: getAppSecret(),
    redirect_uri: redirectUri ?? getRedirectUri(),
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
// Instagram Professional Login OAuth
// Doc : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
// ----------------------------------------------------------------

/**
 * Construit l'URL d'autorisation Instagram Professional Login.
 * Si INSTAGRAM_CONFIG_ID est défini, utilise le config_id qui inclut
 * déjà les permissions configurées.
 * Sinon fallback sur le scope classique (cas actuel : pas de config_id Instagram).
 * Endpoint : https://www.instagram.com/oauth/authorize
 */
export function buildInstagramAuthorizationUrl(state: string): string {
  const configId = process.env.INSTAGRAM_CONFIG_ID;

  if (configId) {
    const params = new URLSearchParams({
      client_id: getInstagramAppId(),
      redirect_uri: getInstagramRedirectUri(),
      response_type: "code",
      config_id: configId,
      state,
    });
    console.log("[buildInstagramAuthorizationUrl] Using config_id:", configId);
    return `${INSTAGRAM_AUTH_URL}?${params.toString()}`;
  }

  // Fallback classique (sans config_id)
  const params = new URLSearchParams({
    client_id: getInstagramAppId(),
    redirect_uri: getInstagramRedirectUri(),
    scope: INSTAGRAM_SCOPES.join(","),
    response_type: "code",
    state,
  });
  console.log("[buildInstagramAuthorizationUrl] Using scope fallback (no INSTAGRAM_CONFIG_ID)");
  return `${INSTAGRAM_AUTH_URL}?${params.toString()}`;
}

/**
 * Echange le code Instagram contre un short-lived access token.
 * Endpoint : https://api.instagram.com/oauth/access_token
 */
export async function exchangeInstagramCodeForToken(
  code: string,
  redirectUri?: string,
): Promise<{
  access_token: string;
  user_id: string;
}> {
  const resolvedRedirectUri = redirectUri ?? getInstagramRedirectUri();
  console.log("[Instagram] token exchange redirect_uri:", resolvedRedirectUri);
  const params = new URLSearchParams({
    client_id: getInstagramAppId(),
    client_secret: getInstagramAppSecret(),
    redirect_uri: resolvedRedirectUri,
    grant_type: "authorization_code",
    code,
  });

  const res = await fetch(INSTAGRAM_TOKEN_URL, {
    method: "POST",
    body: params,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instagram token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Echange un short-lived Instagram token contre un long-lived token (~60 jours).
 * Endpoint : https://graph.instagram.com/{version}/access_token
 */
export async function exchangeInstagramForLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: getInstagramAppSecret(),
    access_token: shortLivedToken,
  });

  const res = await fetch(`${INSTAGRAM_GRAPH_BASE}/access_token?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instagram long-lived token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

export type InstagramUserInfo = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  account_type?: string;
};

/**
 * Recupere le profil Instagram de l'utilisateur connecté.
 * Endpoint : GET /me?fields=id,username,name,profile_picture_url,account_type
 */
export async function getInstagramUser(userAccessToken: string): Promise<InstagramUserInfo> {
  const res = await fetch(
    `${INSTAGRAM_GRAPH_BASE}/me?fields=id,username,name,profile_picture_url,account_type&access_token=${userAccessToken}`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instagram user info failed (${res.status}): ${text}`);
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
  const url = `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,category&limit=100&access_token=${userAccessToken}`;
  console.log("[getUserPages] Fetching:", url.replace(/access_token=[^&]+/, "access_token=***"));
  const res = await fetch(url);
  const text = await res.text();
  console.log("[getUserPages] Status:", res.status, "Body:", text.substring(0, 500));
  if (!res.ok) {
    throw new Error(`Meta pages fetch failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text);
  console.log("[getUserPages] data count:", json.data?.length ?? 0);
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

/**
 * Publie une vidéo sur une Page Facebook.
 * Endpoint : POST /{page-id}/videos avec file_url (PULL_FROM_URL).
 * Doc : https://developers.facebook.com/docs/video-api/publishing
 */
export async function publishVideoToFacebookPage(
  pageAccessToken: string,
  pageId: string,
  description: string,
  videoUrl: string
): Promise<MetaPostResult> {
  const res = await fetch(`${GRAPH_API_BASE}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_url: videoUrl,
      description,
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
 * Publie une vidéo (Reel) sur Instagram.
 * Processus en 3 étapes :
 *   1. POST /{ig_user_id}/media (media_type=REELS, video_url, caption) -> creation_id
 *   2. Poll status_code == FINISHED
 *   3. POST /{ig_user_id}/media_publish (creation_id) -> media_id
 * Doc : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing#reels
 */
export async function publishVideoToInstagram(
  accessToken: string,
  igUserId: string,
  caption: string,
  videoUrl: string
): Promise<MetaPostResult> {
  // Étape 1 : Créer le container Reel
  const createRes = await fetch(`${INSTAGRAM_GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    return { ok: false, error: `Instagram Reel container creation failed: ${errText}`, statusCode: createRes.status };
  }

  const createJson = await createRes.json();
  const creationId = createJson.id;

  if (!creationId) {
    return { ok: false, error: "No creation_id returned from Instagram Reel", statusCode: 500 };
  }

  // Étape 2 : Attendre que le container soit prêt (vidéo = plus long que image)
  const maxAttempts = 30;
  const pollIntervalMs = 5000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusRes = await fetch(
      `${INSTAGRAM_GRAPH_BASE}/${creationId}?fields=status_code&access_token=${accessToken}`
    );
    if (!statusRes.ok) {
      const errText = await statusRes.text();
      return { ok: false, error: `Instagram Reel status check failed: ${errText}`, statusCode: statusRes.status };
    }
    const { status_code } = await statusRes.json();
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      return { ok: false, error: `Instagram Reel container failed with status: ${status_code}`, statusCode: 500 };
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } else {
      return { ok: false, error: "Instagram Reel container not ready after 150s", statusCode: 500 };
    }
  }

  // Étape 3 : Publier le container
  const publishRes = await fetch(`${INSTAGRAM_GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: accessToken,
    }),
  });

  if (publishRes.ok) {
    const publishJson = await publishRes.json();
    const mediaId = publishJson.id as string;

    try {
      const scRes = await fetch(
        `${INSTAGRAM_GRAPH_BASE}/${mediaId}?fields=shortcode&access_token=${accessToken}`
      );
      if (scRes.ok) {
        const scJson = await scRes.json();
        if (scJson.shortcode) return { ok: true, postId: scJson.shortcode };
      }
    } catch {
      // Fallback sur l'ID numérique
    }

    return { ok: true, postId: mediaId };
  }

  const errText = await publishRes.text();
  return { ok: false, error: `Instagram Reel publish failed: ${errText}`, statusCode: publishRes.status };
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
 *
 * L'API Threads utilise des query parameters (pas de JSON body).
 * Doc : https://developers.facebook.com/docs/threads/posts
 */
export async function publishToThreads(
  userAccessToken: string,
  threadsUserId: string,
  text: string,
  imageUrl?: string
): Promise<MetaPostResult> {
  // Etape 1 : Creer le container (query params, pas JSON body)
  const createParams = new URLSearchParams({
    media_type: imageUrl ? "IMAGE" : "TEXT",
    text,
    access_token: userAccessToken,
  });
  if (imageUrl) {
    createParams.set("image_url", imageUrl);
  }

  const createRes = await fetch(
    `${THREADS_API_BASE}/${threadsUserId}/threads?${createParams.toString()}`,
    { method: "POST" }
  );

  if (!createRes.ok) {
    const errText = await createRes.text();
    return { ok: false, error: `Threads container creation failed: ${errText}`, statusCode: createRes.status };
  }

  const createJson = await createRes.json();
  const creationId = createJson.id;

  if (!creationId) {
    return { ok: false, error: "No creation_id returned from Threads", statusCode: 500 };
  }

  // Attendre que Meta traite le container avant de publier.
  // Sans ce délai, Threads renvoie parfois l'erreur 4279009 ("resource does not exist").
  await new Promise((r) => setTimeout(r, 2000));

  // Etape 2 : Publier le container (avec retry automatique si container pas encore prêt)
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: userAccessToken,
  });

  const doPublish = () =>
    fetch(
      `${THREADS_API_BASE}/${threadsUserId}/threads_publish?${publishParams.toString()}`,
      { method: "POST" }
    );

  let publishRes = await doPublish();

  if (!publishRes.ok) {
    const errBody = await publishRes.text();
    // Retry une fois si le container n'est pas encore prêt (erreur 4279009)
    if (errBody.includes("4279009")) {
      await new Promise((r) => setTimeout(r, 5000));
      publishRes = await doPublish();
      if (!publishRes.ok) {
        const retryErr = await publishRes.text();
        return { ok: false, error: `Threads publish failed: ${retryErr}`, statusCode: publishRes.status };
      }
    } else {
      return { ok: false, error: `Threads publish failed: ${errBody}`, statusCode: publishRes.status };
    }
  }

  const publishJson = await publishRes.json();
  const postId = publishJson.id;

  // Étape 3 : Récupérer le permalink du post (l'ID numérique ne fonctionne pas en URL)
  let permalink: string | undefined;
  if (postId) {
    try {
      const plRes = await fetch(
        `${THREADS_API_BASE}/${postId}?fields=permalink&access_token=${userAccessToken}`
      );
      if (plRes.ok) {
        const plJson = await plRes.json();
        permalink = plJson.permalink;
      }
    } catch {
      // Pas grave si le permalink échoue, on a au moins le postId
    }
  }

  return { ok: true, postId: permalink ?? postId };
}

// ----------------------------------------------------------------
// Instagram Discovery & Publishing
// Doc : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api
// L'Instagram Graph API utilise le Page Access Token de la Page Facebook
// liee au compte Instagram Business/Creator.
// Pas d'OAuth separe : on reutilise le token de la Page Facebook existante.
// ----------------------------------------------------------------

export type InstagramAccount = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
};

/**
 * Decouvre le compte Instagram Business/Creator lie a une Page Facebook.
 * Endpoint : GET /{page-id}?fields=instagram_business_account{id,username,name,profile_picture_url}
 */
export async function getInstagramBusinessAccount(
  pageAccessToken: string,
  pageId: string
): Promise<InstagramAccount | null> {
  const url = `${GRAPH_API_BASE}/${pageId}?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${pageAccessToken}`;
  console.log("[getInstagramBusinessAccount] Fetching:", url.replace(/access_token=[^&]+/, "access_token=***"));
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    console.error("[getInstagramBusinessAccount] Error:", res.status, text);
    return null;
  }
  const json = await res.json();
  console.log("[getInstagramBusinessAccount] Response:", JSON.stringify(json));
  return json.instagram_business_account ?? null;
}

// ----------------------------------------------------------------
// Instagram Publishing (2 etapes : create container -> publish)
// Instagram REQUIERT une image ou video (pas de post texte seul).
// Doc : https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
// ----------------------------------------------------------------

/**
 * Publie un post image sur Instagram.
 * Processus en 2 etapes :
 *   1. POST /{ig_user_id}/media (image_url + caption) -> creation_id
 *   2. POST /{ig_user_id}/media_publish (creation_id) -> media_id
 */
export async function publishToInstagram(
  accessToken: string,
  igUserId: string,
  caption: string,
  imageUrl: string
): Promise<MetaPostResult> {
  // Utilise l'Instagram Graph API (Professional Login)
  // Endpoint : https://graph.instagram.com/v21.0/{ig-user-id}/media
  // Etape 1 : Creer le container media
  const createRes = await fetch(`${INSTAGRAM_GRAPH_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    return { ok: false, error: `Instagram container creation failed: ${errText}`, statusCode: createRes.status };
  }

  const createJson = await createRes.json();
  const creationId = createJson.id;

  if (!creationId) {
    return { ok: false, error: "No creation_id returned from Instagram", statusCode: 500 };
  }

  // Etape 1.5 : Attendre que le container soit prêt (Instagram traite l'image de manière asynchrone)
  const maxAttempts = 10;
  const pollIntervalMs = 3000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusRes = await fetch(
      `${INSTAGRAM_GRAPH_BASE}/${creationId}?fields=status_code&access_token=${accessToken}`
    );
    if (!statusRes.ok) {
      const errText = await statusRes.text();
      return { ok: false, error: `Instagram status check failed: ${errText}`, statusCode: statusRes.status };
    }
    const { status_code } = await statusRes.json();
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      return { ok: false, error: `Instagram container failed with status: ${status_code}`, statusCode: 500 };
    }
    // IN_PROGRESS : attendre avant le prochain poll
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } else {
      return { ok: false, error: "Instagram container not ready after 30s", statusCode: 500 };
    }
  }

  // Etape 2 : Publier le container
  const publishRes = await fetch(`${INSTAGRAM_GRAPH_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: accessToken,
    }),
  });

  if (publishRes.ok) {
    const publishJson = await publishRes.json();
    const mediaId = publishJson.id as string;

    // Récupère le shortcode pour construire l'URL correcte (ex: DVBUklhiGTi)
    // car les URLs Instagram utilisent le shortcode, pas l'ID numérique
    try {
      const scRes = await fetch(
        `${INSTAGRAM_GRAPH_BASE}/${mediaId}?fields=shortcode&access_token=${accessToken}`
      );
      if (scRes.ok) {
        const scJson = await scRes.json();
        if (scJson.shortcode) return { ok: true, postId: scJson.shortcode };
      }
    } catch {
      // Pas bloquant : fallback sur l'ID numérique
    }

    return { ok: true, postId: mediaId };
  }

  const errText = await publishRes.text();
  return { ok: false, error: `Instagram publish failed: ${errText}`, statusCode: publishRes.status };
}

// ----------------------------------------------------------------
// Webhook Subscription Helpers
// ----------------------------------------------------------------

/**
 * Abonne une Page Facebook aux événements webhook (feed).
 * Utilise les credentials de Tipote ter (qui a le produit Webhooks),
 * pas Tipote (qui ne l'a pas).
 *
 * Effectue deux étapes :
 *   A. App-level : POST /{APP_ID}/subscriptions (enregistre l'URL callback)
 *      → utilise INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET (Tipote ter)
 *   B. Page-level : POST /{PAGE_ID}/subscribed_apps (abonne la page)
 *      → utilise MESSENGER_PAGE_ACCESS_TOKEN (token Page via Tipote ter)
 *
 * Retourne { appOk, pageOk, errors }.
 */
export async function subscribePageToWebhooks(
  pageId: string,
  pageAccessToken: string,
): Promise<{ appOk: boolean; pageOk: boolean; errors: string[] }> {
  const errors: string[] = [];
  let appOk = false;
  let pageOk = false;

  // Utiliser Tipote ter (qui a le produit Webhooks) pour l'app-level subscription
  // INSTAGRAM_META_APP_ID = ID de l'app parente Tipote ter (2408789919563484)
  // INSTAGRAM_APP_ID = peut être l'ID de la sous-app Instagram Professional Login (différent !)
  const appId = process.env.INSTAGRAM_META_APP_ID ?? process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_META_APP_SECRET ?? process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookCallbackUrl = `${appUrl}/api/automations/webhook`;

  // A. App-level subscription (via Tipote ter)
  if (appId && appSecret && verifyToken) {
    try {
      const appParams = new URLSearchParams({
        object: "page",
        callback_url: webhookCallbackUrl,
        fields: "feed",
        verify_token: verifyToken,
        access_token: `${appId}|${appSecret}`,
      });
      const res = await fetch(
        `${GRAPH_API_BASE}/${appId}/subscriptions`,
        { method: "POST", body: appParams }
      );
      const json = await res.json();
      appOk = json.success === true;
      if (!appOk) errors.push(`App subscription (Tipote ter): ${JSON.stringify(json.error ?? json)}`);
    } catch (err) {
      errors.push(`App subscription error: ${String(err)}`);
    }
  } else {
    errors.push("Missing INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, or META_WEBHOOK_VERIFY_TOKEN env vars");
  }

  // B. Page-level subscription
  // Utiliser le MESSENGER_PAGE_ACCESS_TOKEN (token Page via Tipote ter) s'il existe,
  // sinon le token OAuth Facebook (Tipote) en fallback
  const pageToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN ?? pageAccessToken;
  try {
    const pageParams = new URLSearchParams({
      access_token: pageToken,
      subscribed_fields: "feed",
    });
    const res = await fetch(
      `${GRAPH_API_BASE}/${pageId}/subscribed_apps`,
      { method: "POST", body: pageParams }
    );
    const json = await res.json();
    pageOk = json.success === true;
    if (!pageOk) errors.push(`Page subscription: ${JSON.stringify(json.error ?? json)}`);
  } catch (err) {
    errors.push(`Page subscription error: ${String(err)}`);
  }

  return { appOk, pageOk, errors };
}
