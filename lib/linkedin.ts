// lib/linkedin.ts
// Helpers LinkedIn OAuth 2.0 + Posts API.
// Doc officielle : https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_POSTS_URL = "https://api.linkedin.com/rest/posts";

// Version API LinkedIn (format YYYYMM)
const LINKEDIN_API_VERSION = "202602";

const SCOPES = ["openid", "profile", "email", "w_member_social"];

function getClientId(): string {
  const id = process.env.LINKEDIN_CLIENT_ID;
  if (!id) throw new Error("Missing env LINKEDIN_CLIENT_ID");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!secret) throw new Error("Missing env LINKEDIN_CLIENT_SECRET");
  return secret;
}

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Missing env NEXT_PUBLIC_APP_URL");
  return `${appUrl}/api/auth/linkedin/callback`;
}

// ----------------------------------------------------------------
// OAuth 2.0
// ----------------------------------------------------------------

/**
 * Génère l'URL d'autorisation LinkedIn.
 * @param state - CSRF token (à stocker en cookie/session)
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: SCOPES.join(" "),
    state,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

/**
 * Échange le code d'autorisation contre des tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    client_id: getClientId(),
    client_secret: getClientSecret(),
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Rafraîchit un access token expiré.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: getClientId(),
    client_secret: getClientSecret(),
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ----------------------------------------------------------------
// User Info
// ----------------------------------------------------------------

export type LinkedInUserInfo = {
  sub: string; // person ID (pour l'URN urn:li:person:{sub})
  name: string;
  email?: string;
  picture?: string;
};

/**
 * Récupère les infos du profil LinkedIn connecté.
 */
export async function getUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const res = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn userinfo failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ----------------------------------------------------------------
// Posts API
// ----------------------------------------------------------------

export type LinkedInPostResult = {
  ok: boolean;
  postUrn?: string;
  error?: string;
  statusCode?: number;
};

/**
 * Publie un post sur le profil personnel LinkedIn.
 * Supporte optionnellement une image (URL publique).
 */
export async function publishPost(
  accessToken: string,
  personId: string,
  commentary: string,
  imageUrl?: string
): Promise<LinkedInPostResult> {
  let imageUrn: string | undefined;

  // Si une image est fournie, l'uploader via l'API LinkedIn Images
  if (imageUrl) {
    try {
      imageUrn = await uploadImageToLinkedIn(accessToken, personId, imageUrl);
    } catch (err) {
      console.error("LinkedIn image upload failed:", err);
      // Publier sans image en fallback
    }
  }

  const payload: Record<string, unknown> = {
    author: `urn:li:person:${personId}`,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  // Ajouter l'image si uploadée avec succès
  if (imageUrn) {
    payload.content = {
      media: {
        title: "Image",
        id: imageUrn,
      },
    };
  }

  const res = await fetch(LINKEDIN_POSTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 201) {
    const postUrn = res.headers.get("x-restli-id") ?? undefined;
    return { ok: true, postUrn };
  }

  const text = await res.text();
  return { ok: false, error: text, statusCode: res.status };
}

// ----------------------------------------------------------------
// LinkedIn Images API (upload en 2 étapes)
// Doc : https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
// ----------------------------------------------------------------

const LINKEDIN_IMAGES_URL = "https://api.linkedin.com/rest/images";

/**
 * Upload une image vers LinkedIn depuis une URL publique.
 * Étapes :
 *   1. POST /rest/images?action=initializeUpload → uploadUrl + image URN
 *   2. PUT uploadUrl avec le binaire de l'image
 * @returns L'URN de l'image (ex: urn:li:image:xxx)
 */
async function uploadImageToLinkedIn(
  accessToken: string,
  personId: string,
  imageUrl: string
): Promise<string> {
  // Étape 1 : Initialiser l'upload
  const initPayload = {
    initializeUploadRequest: {
      owner: `urn:li:person:${personId}`,
    },
  };

  const initRes = await fetch(`${LINKEDIN_IMAGES_URL}?action=initializeUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
    },
    body: JSON.stringify(initPayload),
  });

  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`LinkedIn image init failed (${initRes.status}): ${text}`);
  }

  const initJson = await initRes.json();
  const uploadUrl = initJson.value?.uploadUrl;
  const imageUrn = initJson.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn image init: missing uploadUrl or image URN");
  }

  // Télécharger l'image depuis l'URL publique
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}: ${imgRes.status}`);
  }
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

  // Étape 2 : Uploader le binaire
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body: imgBuffer,
  });

  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`LinkedIn image upload failed (${putRes.status}): ${text}`);
  }

  return imageUrn;
}
