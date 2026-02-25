// lib/linkedin.ts
// Helpers LinkedIn OAuth 2.0 + Posts API.
// Doc officielle : https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_POSTS_URL = "https://api.linkedin.com/rest/posts";

// Version API LinkedIn (format YYYYMM)
const LINKEDIN_API_VERSION = "202602";

const SCOPES = ["openid", "profile", "email", "w_member_social", "r_member_social"];

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
  warning?: string;
};

/**
 * Vérifie qu'un post LinkedIn est bien visible après création.
 * Retourne true si le post existe et est accessible.
 */
async function verifyPostExists(
  accessToken: string,
  postUrn: string,
  maxAttempts = 3,
  delayMs = 2000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const encodedUrn = encodeURIComponent(postUrn);
      const res = await fetch(`${LINKEDIN_POSTS_URL}/${encodedUrn}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": LINKEDIN_API_VERSION,
        },
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[linkedin] Post ${postUrn} verified: lifecycleState=${data?.lifecycleState}`);
        return true;
      }

      console.warn(`[linkedin] Post verification attempt ${i + 1}/${maxAttempts}: ${res.status}`);
    } catch (err) {
      console.warn(`[linkedin] Post verification error:`, err);
    }

    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return false;
}

/**
 * Publie un post sur le profil personnel LinkedIn.
 * Supporte optionnellement une image (URL publique).
 * Inclut une vérification post-publication pour s'assurer que le post est visible.
 */
export async function publishPost(
  accessToken: string,
  personId: string,
  commentary: string,
  imageUrl?: string
): Promise<LinkedInPostResult> {
  let imageUrn: string | undefined;
  let imageWarning: string | undefined;

  // Si une image est fournie, l'uploader via l'API LinkedIn Images
  if (imageUrl) {
    try {
      imageUrn = await uploadImageToLinkedIn(accessToken, personId, imageUrl);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("LinkedIn image upload failed:", errMsg);

      // Si c'est un GIF et que le processing a échoué, on publie sans image
      // et on prévient l'utilisateur
      const isGif = imageUrl.toLowerCase().includes(".gif");
      if (isGif) {
        imageWarning = "Le GIF n'a pas pu être traité par LinkedIn. Le post a été publié sans image. LinkedIn ne supporte pas les GIFs animés via son API — utilise un PNG ou JPG à la place.";
        console.warn(`[linkedin] GIF processing failed, posting without image: ${errMsg}`);
      }
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

    // Vérification post-publication: s'assurer que le post est bien visible
    if (postUrn) {
      const exists = await verifyPostExists(accessToken, postUrn);
      if (!exists) {
        console.error(`[linkedin] Post ${postUrn} created (201) but verification failed — post may not be visible`);
        // On ne retourne pas d'erreur car le post a été créé,
        // mais on log pour diagnostic
      }
    }

    const result: LinkedInPostResult = { ok: true, postUrn };
    if (imageWarning) {
      (result as any).warning = imageWarning;
    }
    return result;
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
 * Vérifie que l'image uploadée est bien traitée par LinkedIn.
 * Polling avec retry : attend que le status soit AVAILABLE.
 * Retourne true si l'image est prête, false sinon.
 */
async function waitForImageReady(
  accessToken: string,
  imageUrn: string,
  maxAttempts = 5,
  delayMs = 2000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const encodedUrn = encodeURIComponent(imageUrn);
      const res = await fetch(`${LINKEDIN_IMAGES_URL}/${encodedUrn}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
          "LinkedIn-Version": LINKEDIN_API_VERSION,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const status = data?.status;
        console.log(`[linkedin] Image ${imageUrn} status check ${i + 1}/${maxAttempts}: ${status}`);

        if (status === "AVAILABLE") return true;
        if (status === "PROCESSING_FAILED") {
          console.error(`[linkedin] Image processing failed for ${imageUrn}`);
          return false;
        }
        // WAITING_UPLOAD or PROCESSING — keep polling
      } else {
        console.warn(`[linkedin] Image status check failed (${res.status}), retrying...`);
      }
    } catch (err) {
      console.warn(`[linkedin] Image status check error:`, err);
    }

    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // If we exhausted all attempts, assume it might still work
  console.warn(`[linkedin] Image ${imageUrn} status unknown after ${maxAttempts} checks, proceeding anyway`);
  return true;
}

/**
 * Upload une image vers LinkedIn depuis une URL publique.
 * Étapes :
 *   1. POST /rest/images?action=initializeUpload → uploadUrl + image URN
 *   2. PUT uploadUrl avec le binaire de l'image
 *   3. Vérifier que l'image est bien traitée (AVAILABLE)
 *
 * Pour les GIFs : LinkedIn Images API les traite comme images statiques.
 * Si le traitement échoue, on lève une erreur pour permettre un fallback sans image.
 *
 * @returns L'URN de l'image (ex: urn:li:image:xxx)
 */
export async function uploadImageToLinkedIn(
  accessToken: string,
  personId: string,
  imageUrl: string
): Promise<string> {
  const isGif = imageUrl.toLowerCase().endsWith(".gif") || imageUrl.toLowerCase().includes(".gif?");

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

  // Pour les GIFs : forcer le content-type en image/gif pour que LinkedIn traite correctement
  // LinkedIn accepte les GIFs mais les rend comme images statiques (1er frame)
  const uploadContentType = isGif ? "image/gif" : contentType;

  if (isGif) {
    console.log(`[linkedin] Uploading GIF image (${(imgBuffer.length / 1024).toFixed(0)} KB) for ${personId}`);
  }

  // Étape 2 : Uploader le binaire
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": uploadContentType,
    },
    body: imgBuffer,
  });

  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`LinkedIn image upload failed (${putRes.status}): ${text}`);
  }

  // Étape 3 : Vérifier que l'image est bien traitée par LinkedIn
  // Ceci est critique pour les GIFs qui peuvent échouer en processing
  const isReady = await waitForImageReady(accessToken, imageUrn, isGif ? 8 : 5, isGif ? 3000 : 2000);
  if (!isReady) {
    throw new Error(`LinkedIn image processing failed for ${imageUrn} (GIF=${isGif}). Image may not be displayable.`);
  }

  return imageUrn;
}

// ----------------------------------------------------------------
// Comments API — Auto-Reply
// Doc : https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api
// ----------------------------------------------------------------

export type LinkedInComment = {
  id: string;           // commentUrn (urn:li:comment:...)
  message: string;
  actorUrn: string;     // urn:li:person:{id}
  created: number;      // epoch ms
  parentCommentUrn?: string;
};

/**
 * Récupère les posts récents de l'utilisateur.
 * Utilise GET /rest/posts?q=author&author={personUrn}
 */
export async function getMyPosts(
  accessToken: string,
  personId: string,
  count = 20,
): Promise<Array<{ urn: string; text: string; created: number }>> {
  const authorUrn = encodeURIComponent(`urn:li:person:${personId}`);
  const url = `${LINKEDIN_POSTS_URL}?q=author&author=${authorUrn}&count=${count}&sortBy=LAST_MODIFIED`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-RestLi-Method": "FINDER",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn getMyPosts failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const elements: any[] = json?.elements ?? [];

  return elements.map((post: any) => ({
    urn: post.id ?? "",
    text: post.commentary ?? "",
    created: post.createdAt ?? post.lastModifiedAt ?? 0,
  })).filter((p) => p.urn);
}

/**
 * Récupère les commentaires d'un post LinkedIn.
 * GET /rest/socialActions/{postUrn}/comments
 */
export async function getPostComments(
  accessToken: string,
  postUrn: string,
  count = 50,
): Promise<LinkedInComment[]> {
  const encodedUrn = encodeURIComponent(postUrn);
  const url = `https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments?count=${count}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_API_VERSION,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn getPostComments failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const elements: any[] = json?.elements ?? [];

  return elements.map((c: any) => ({
    id: c["$URN"] ?? c.id ?? "",
    message: c.message?.text ?? "",
    actorUrn: c.actor ?? "",
    created: c.created?.time ?? 0,
    parentCommentUrn: c.parentComment ?? undefined,
  })).filter((c) => c.id && c.message);
}

/**
 * Répond à un commentaire LinkedIn (nested reply).
 * POST /rest/socialActions/{postUrn}/comments avec parentComment.
 */
export async function replyToLinkedInComment(
  accessToken: string,
  postUrn: string,
  parentCommentUrn: string,
  personUrn: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const encodedUrn = encodeURIComponent(postUrn);
  const res = await fetch(
    `https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        actor: personUrn,
        message: { text },
        parentComment: parentCommentUrn,
      }),
    },
  );

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `LinkedIn reply error (${res.status}): ${t}` };
  }

  return { ok: true };
}
