// lib/pinterest.ts
// Helpers Pinterest OAuth 2.0 + Pins API v5.
// Doc officielle : https://developers.pinterest.com/docs/api/v5/

const PINTEREST_AUTH_URL = "https://www.pinterest.com/oauth/";
const PINTEREST_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const PINTEREST_API_BASE = "https://api.pinterest.com/v5";

// Scopes requis :
//   boards:read    → lister les tableaux de l'utilisateur
//   pins:write     → créer des épingles
//   pins:read      → lire les épingles (requis en sandbox + certains endpoints v5)
//   user_accounts:read → lire le profil utilisateur
const SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"];

// ── Contraintes Pinterest ──
// Titre   : max 100 caractères
// Description : max 500 caractères
// Image   : REQUISE, min 200×300 px, recommandé 1000×1500 px (ratio 2:3), max 32 Mo
// Formats : PNG, JPG, WEBP
export const PINTEREST_LIMITS = {
  TITLE_MAX: 100,
  DESCRIPTION_MAX: 500,
  IMAGE_MIN_WIDTH: 200,
  IMAGE_MIN_HEIGHT: 300,
  IMAGE_MAX_MB: 32,
  IMAGE_RECOMMENDED_WIDTH: 1000,
  IMAGE_RECOMMENDED_HEIGHT: 1500,
};

function getClientId(): string {
  const id = process.env.PINTEREST_APP_ID;
  if (!id) throw new Error("Missing env PINTEREST_APP_ID");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.PINTEREST_APP_SECRET;
  if (!secret) throw new Error("Missing env PINTEREST_APP_SECRET");
  return secret;
}

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("Missing env NEXT_PUBLIC_APP_URL");
  return `${appUrl}/api/auth/pinterest/callback`;
}

// ----------------------------------------------------------------
// OAuth 2.0
// ----------------------------------------------------------------

/**
 * Génère l'URL d'autorisation Pinterest.
 * @param state - CSRF token
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return `${PINTEREST_AUTH_URL}?${params.toString()}`;
}

/**
 * Échange le code d'autorisation contre des tokens.
 * Pinterest utilise Basic Auth (client_id:client_secret) pour le token endpoint.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
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

  const res = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Pinterest token exchange failed (${res.status}): ${text}`
    );
  }

  return res.json();
}

/**
 * Rafraîchit un access token expiré.
 * Pinterest access tokens expirent après 30 jours.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const credentials = Buffer.from(
    `${getClientId()}:${getClientSecret()}`
  ).toString("base64");

  const res = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Pinterest token refresh failed (${res.status}): ${text}`
    );
  }

  return res.json();
}

// ----------------------------------------------------------------
// User Info
// ----------------------------------------------------------------

export type PinterestUserInfo = {
  username: string;
  id: string;
  profile_image?: string;
};

/**
 * Récupère les infos du profil Pinterest connecté.
 */
export async function getUserInfo(
  accessToken: string
): Promise<PinterestUserInfo> {
  const res = await fetch(`${PINTEREST_API_BASE}/user_account`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest user_account failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ----------------------------------------------------------------
// Boards
// ----------------------------------------------------------------

export type PinterestBoard = {
  id: string;
  name: string;
  privacy: "PUBLIC" | "PROTECTED" | "SECRET";
  description?: string;
  pin_count?: number;
};

/**
 * Récupère les tableaux de l'utilisateur.
 * Supporte la pagination automatique (max 250 tableaux).
 */
export async function getUserBoards(
  accessToken: string,
  maxBoards = 250
): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | undefined;

  do {
    const params = new URLSearchParams({
      page_size: "50",
      privacy_filter: "all",
    });
    if (bookmark) params.set("bookmark", bookmark);

    const res = await fetch(
      `${PINTEREST_API_BASE}/boards?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinterest boards failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    const items: PinterestBoard[] = json?.items ?? [];
    boards.push(...items);

    bookmark = json?.bookmark;
    if (!bookmark || boards.length >= maxBoards) break;
  } while (true);

  return boards.slice(0, maxBoards);
}

// ----------------------------------------------------------------
// Pins API
// ----------------------------------------------------------------

export type PinterestPinResult = {
  ok: boolean;
  pinId?: string;
  pinUrl?: string;
  error?: string;
  statusCode?: number;
};

/**
 * Crée une épingle Pinterest.
 *
 * Contraintes respectées :
 * - title      : tronqué à 100 caractères
 * - description : tronqué à 500 caractères
 * - image_url  : REQUISE
 * - board_id   : REQUIS
 * - link       : optionnel (URL de destination)
 */
export async function createPin(
  accessToken: string,
  boardId: string,
  title: string,
  description: string,
  imageUrl: string,
  link?: string
): Promise<PinterestPinResult> {
  // Tronquer les champs selon les limites Pinterest
  const truncatedTitle = title.slice(0, PINTEREST_LIMITS.TITLE_MAX);
  const truncatedDescription = description.slice(
    0,
    PINTEREST_LIMITS.DESCRIPTION_MAX
  );

  const payload: Record<string, unknown> = {
    board_id: boardId,
    title: truncatedTitle,
    description: truncatedDescription,
    media_source: {
      source_type: "image_url",
      url: imageUrl,
    },
  };

  if (link?.trim()) {
    payload.link = link.trim();
  }

  const res = await fetch(`${PINTEREST_API_BASE}/pins`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: text,
      statusCode: res.status,
    };
  }

  const json = await res.json();
  const pinId: string | undefined = json?.id;
  const pinUrl = pinId
    ? `https://www.pinterest.com/pin/${pinId}/`
    : undefined;

  return {
    ok: true,
    pinId,
    pinUrl,
  };
}
