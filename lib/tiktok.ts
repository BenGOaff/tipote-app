// lib/tiktok.ts
// Helpers TikTok OAuth 2.0 + Content Posting API.
// Doc officielle : https://developers.tiktok.com/doc/login-kit-web
// Content Posting : https://developers.tiktok.com/doc/content-posting-api-get-started

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USERINFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";

// Content Posting API
const TIKTOK_PHOTO_PUBLISH_URL = "https://open.tiktokapis.com/v2/post/publish/content/init/";
const TIKTOK_VIDEO_PUBLISH_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";
const TIKTOK_PUBLISH_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/";

// Scopes nécessaires :
// user.info.basic : profil de base
// video.publish : publier des vidéos
// video.upload : uploader des vidéos
const SCOPES = ["user.info.basic", "video.publish", "video.upload"];

function getClientKey(): string {
  const key = process.env.TIKTOK_CLIENT_KEY;
  if (!key) throw new Error("Missing env TIKTOK_CLIENT_KEY");
  return key;
}

function getClientSecret(): string {
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!secret) throw new Error("Missing env TIKTOK_CLIENT_SECRET");
  return secret;
}

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Missing env NEXT_PUBLIC_APP_URL");
  return `${appUrl}/api/auth/tiktok/callback`;
}

// ----------------------------------------------------------------
// OAuth 2.0
// ----------------------------------------------------------------

/**
 * Genere l'URL d'autorisation TikTok.
 * TikTok utilise `client_key` au lieu de `client_id`.
 * @param state - CSRF token
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: getClientKey(),
    response_type: "code",
    scope: SCOPES.join(","),
    redirect_uri: getRedirectUri(),
    state,
  });
  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
}

/**
 * Echange le code d'autorisation contre des tokens.
 * TikTok utilise JSON body (pas form-encoded).
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  open_id: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}> {
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: getClientKey(),
      client_secret: getClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok token exchange failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`TikTok token error: ${json.error} — ${json.error_description}`);
  }

  return json;
}

/**
 * Rafraichit un access token expire.
 * TikTok supporte le refresh token (durée: 365 jours).
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  open_id: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}> {
  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: getClientKey(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok token refresh failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`TikTok refresh error: ${json.error} — ${json.error_description}`);
  }

  return json;
}

// ----------------------------------------------------------------
// User Info
// ----------------------------------------------------------------

export type TikTokUserInfo = {
  open_id: string;
  display_name: string;
  avatar_url?: string;
  username?: string;
};

/**
 * Recupere les infos du profil TikTok connecte.
 */
export async function getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  const res = await fetch(`${TIKTOK_USERINFO_URL}?fields=open_id,display_name,avatar_url,username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok userinfo failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.error?.code) {
    throw new Error(`TikTok userinfo error: ${json.error.code} — ${json.error.message}`);
  }

  const data = json.data?.user;
  if (!data) throw new Error("TikTok userinfo: no user data");

  return {
    open_id: data.open_id,
    display_name: data.display_name ?? "",
    avatar_url: data.avatar_url,
    username: data.username,
  };
}

// ----------------------------------------------------------------
// Content Posting API - Photo
// ----------------------------------------------------------------

export type TikTokPostResult = {
  ok: boolean;
  publishId?: string;
  error?: string;
  statusCode?: number;
};

/**
 * Publie une ou plusieurs photos sur TikTok via le Content Posting API.
 * Les images doivent etre des URLs publiques.
 * TikTok traite la publication de maniere asynchrone — le publishId
 * peut etre utilise pour verifier le statut.
 *
 * Privacy levels: SELF_ONLY, MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, PUBLIC_TO_EVERYONE
 */
export async function publishPhoto(
  accessToken: string,
  imageUrls: string[],
  caption: string,
  privacyLevel: string = "PUBLIC_TO_EVERYONE",
): Promise<TikTokPostResult> {
  if (imageUrls.length === 0) {
    return { ok: false, error: "Au moins une image est requise" };
  }

  const body = {
    post_info: {
      title: caption.slice(0, 150), // TikTok limite le titre des photos
      privacy_level: privacyLevel,
      disable_comment: false,
      auto_add_music: true,
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: 0,
      photo_images: imageUrls.slice(0, 35), // Max 35 images par post
    },
    media_type: "PHOTO",
  };

  const res = await fetch(TIKTOK_PHOTO_PUBLISH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[TikTok] Photo publish error (${res.status}):`, text.slice(0, 500));
    return { ok: false, error: `TikTok API error (${res.status}): ${text.slice(0, 300)}`, statusCode: res.status };
  }

  const json = await res.json();

  if (json.error?.code && json.error.code !== "ok") {
    return { ok: false, error: `TikTok: ${json.error.code} — ${json.error.message}` };
  }

  const publishId = json.data?.publish_id;
  return { ok: true, publishId };
}

// ----------------------------------------------------------------
// Content Posting API - Video (Pull from URL)
// ----------------------------------------------------------------

/**
 * Publie une video sur TikTok via le Content Posting API (PULL_FROM_URL).
 * La video doit etre une URL publique directement accessible.
 * TikTok telecharge la video depuis l'URL.
 */
export async function publishVideo(
  accessToken: string,
  videoUrl: string,
  caption: string,
  privacyLevel: string = "PUBLIC_TO_EVERYONE",
): Promise<TikTokPostResult> {
  const body = {
    post_info: {
      title: caption.slice(0, 150),
      privacy_level: privacyLevel,
      disable_comment: false,
    },
    source_info: {
      source: "PULL_FROM_URL",
      video_url: videoUrl,
    },
  };

  const res = await fetch(TIKTOK_VIDEO_PUBLISH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[TikTok] Video publish error (${res.status}):`, text.slice(0, 500));
    return { ok: false, error: `TikTok API error (${res.status}): ${text.slice(0, 300)}`, statusCode: res.status };
  }

  const json = await res.json();

  if (json.error?.code && json.error.code !== "ok") {
    return { ok: false, error: `TikTok: ${json.error.code} — ${json.error.message}` };
  }

  const publishId = json.data?.publish_id;
  return { ok: true, publishId };
}

// ----------------------------------------------------------------
// Publish Status Check
// ----------------------------------------------------------------

export type TikTokPublishStatus = {
  status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "PUBLISH_COMPLETE" | "FAILED" | string;
  publishId?: string;
  errorCode?: string;
  errorMessage?: string;
};

/**
 * Verifie le statut d'une publication en cours.
 * Utile car TikTok traite les publications de maniere asynchrone.
 */
export async function getPublishStatus(
  accessToken: string,
  publishId: string,
): Promise<TikTokPublishStatus> {
  const res = await fetch(TIKTOK_PUBLISH_STATUS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: publishId }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { status: "FAILED", errorMessage: `Status check failed (${res.status}): ${text.slice(0, 200)}` };
  }

  const json = await res.json();
  const data = json.data;

  return {
    status: data?.status ?? "FAILED",
    publishId: data?.publish_id,
    errorCode: json.error?.code,
    errorMessage: json.error?.message,
  };
}
