// lib/meta.ts
// Helpers Meta Graph API : Facebook Pages + Instagram Business.
// Doc : https://developers.facebook.com/docs/graph-api
// Doc IG : https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const FB_AUTH_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;

const SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
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
 * Permissions : pages_show_list, pages_manage_posts, instagram_basic, instagram_content_publish
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
// Pages + Instagram Discovery
// ----------------------------------------------------------------

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  category: string;
  instagram_business_account?: {
    id: string;
  };
};

/**
 * Récupère les Pages Facebook de l'utilisateur + détecte les comptes IG Business liés.
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
  const pages: MetaPage[] = json.data ?? [];

  // Pour chaque page, vérifier si un compte IG Business est lié
  const pagesWithIg = await Promise.all(
    pages.map(async (page) => {
      try {
        const igRes = await fetch(
          `${GRAPH_API_BASE}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        );
        if (igRes.ok) {
          const igJson = await igRes.json();
          page.instagram_business_account = igJson.instagram_business_account;
        }
      } catch {
        // pas d'IG lié, on continue
      }
      return page;
    })
  );

  return pagesWithIg;
}

export type MetaUserInfo = {
  id: string;
  name: string;
  email?: string;
};

/**
 * Récupère les infos basiques du user Facebook.
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
// Instagram Publishing (2 étapes : create container → publish)
// NOTE : Instagram requiert obligatoirement un média (image ou vidéo).
//        Les posts texte seuls ne sont PAS supportés par l'API IG.
// ----------------------------------------------------------------

/**
 * Publie une photo sur Instagram Business (caption + image URL).
 * Processus en 2 étapes :
 *   1. POST /{ig_user_id}/media → creation_id
 *   2. POST /{ig_user_id}/media_publish → post_id
 */
export async function publishToInstagram(
  pageAccessToken: string,
  igUserId: string,
  caption: string,
  imageUrl: string
): Promise<MetaPostResult> {
  // Étape 1 : Créer le media container
  const createRes = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: pageAccessToken,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    return { ok: false, error: `Container creation failed: ${text}`, statusCode: createRes.status };
  }

  const createJson = await createRes.json();
  const creationId = createJson.id;

  if (!creationId) {
    return { ok: false, error: "No creation_id returned from Instagram", statusCode: 500 };
  }

  // Étape 2 : Publier le container
  const publishRes = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: pageAccessToken,
    }),
  });

  if (publishRes.ok) {
    const publishJson = await publishRes.json();
    return { ok: true, postId: publishJson.id };
  }

  const text = await publishRes.text();
  return { ok: false, error: `Media publish failed: ${text}`, statusCode: publishRes.status };
}

/**
 * Publie un Reel (vidéo) sur Instagram Business.
 */
export async function publishReelToInstagram(
  pageAccessToken: string,
  igUserId: string,
  caption: string,
  videoUrl: string
): Promise<MetaPostResult> {
  // Étape 1 : Créer le container vidéo
  const createRes = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_url: videoUrl,
      caption,
      media_type: "REELS",
      access_token: pageAccessToken,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    return { ok: false, error: `Reel container creation failed: ${text}`, statusCode: createRes.status };
  }

  const createJson = await createRes.json();
  const creationId = createJson.id;

  if (!creationId) {
    return { ok: false, error: "No creation_id returned for Reel", statusCode: 500 };
  }

  // Étape 2 : Publier
  const publishRes = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: pageAccessToken,
    }),
  });

  if (publishRes.ok) {
    const publishJson = await publishRes.json();
    return { ok: true, postId: publishJson.id };
  }

  const text = await publishRes.text();
  return { ok: false, error: `Reel publish failed: ${text}`, statusCode: publishRes.status };
}
