// lib/refreshSocialToken.ts
// Shared helper: refresh an expired OAuth token and persist the new tokens in DB.
// Supports: Twitter/X (rotating refresh tokens), Pinterest, TikTok, Instagram, LinkedIn.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encrypt, decrypt } from "@/lib/crypto";
import { refreshAccessToken as refreshTwitterToken } from "@/lib/twitter";
import { refreshAccessToken as refreshPinterestToken } from "@/lib/pinterest";
import { refreshAccessToken as refreshTikTokToken } from "@/lib/tiktok";
import { refreshAccessToken as refreshLinkedInToken } from "@/lib/linkedin";
import { refreshInstagramLongLivedToken } from "@/lib/meta";

type RefreshResult = {
  ok: boolean;
  accessToken?: string;
  error?: string;
};

const SUPPORTED_PLATFORMS = ["twitter", "pinterest", "tiktok", "instagram", "linkedin"] as const;

/**
 * Attempts to refresh an expired social connection token.
 * On success, updates the DB with the new access_token (and new refresh_token if rotated).
 * Returns the new decrypted access_token.
 *
 * Instagram is special: it uses the access_token itself to refresh (no separate refresh_token).
 * Pass accessTokenEncrypted for Instagram when refreshTokenEncrypted is null.
 */
export async function refreshSocialToken(
  connectionId: string,
  platform: string,
  refreshTokenEncrypted: string | null,
  accessTokenEncrypted?: string | null,
): Promise<RefreshResult> {
  // Instagram uses the access_token to refresh (no separate refresh_token)
  const isInstagram = platform === "instagram";

  if (!isInstagram && !refreshTokenEncrypted) {
    return { ok: false, error: "No refresh token available" };
  }

  if (!SUPPORTED_PLATFORMS.includes(platform as typeof SUPPORTED_PLATFORMS[number])) {
    return { ok: false, error: `Token refresh not supported for ${platform}` };
  }

  try {
    let tokens: {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (isInstagram) {
      // Instagram: decrypt the current access_token and use it to get a new one
      const tokenEncrypted = accessTokenEncrypted ?? refreshTokenEncrypted;
      if (!tokenEncrypted) {
        return { ok: false, error: "No access token available for Instagram refresh" };
      }
      let currentToken: string;
      try {
        currentToken = decrypt(tokenEncrypted);
      } catch {
        return { ok: false, error: "Failed to decrypt Instagram access token" };
      }
      const igTokens = await refreshInstagramLongLivedToken(currentToken);
      tokens = {
        access_token: igTokens.access_token,
        expires_in: igTokens.expires_in,
      };
    } else {
      // Twitter, Pinterest, TikTok: use refresh_token
      let refreshToken: string;
      try {
        refreshToken = decrypt(refreshTokenEncrypted!);
      } catch {
        return { ok: false, error: "Failed to decrypt refresh token" };
      }

      if (platform === "twitter") {
        tokens = await refreshTwitterToken(refreshToken);
      } else if (platform === "tiktok") {
        const ttTokens = await refreshTikTokToken(refreshToken);
        tokens = {
          access_token: ttTokens.access_token,
          expires_in: ttTokens.expires_in,
          refresh_token: ttTokens.refresh_token,
        };
      } else if (platform === "linkedin") {
        const liTokens = await refreshLinkedInToken(refreshToken);
        tokens = {
          access_token: liTokens.access_token,
          expires_in: liTokens.expires_in,
          refresh_token: liTokens.refresh_token,
        };
      } else {
        // Pinterest
        tokens = await refreshPinterestToken(refreshToken);
      }
    }

    // Persist new tokens to DB
    const updateData: Record<string, any> = {
      access_token_encrypted: encrypt(tokens.access_token),
      token_expires_at: new Date(
        Date.now() + (tokens.expires_in ?? 7200) * 1000
      ).toISOString(),
    };

    // Persist the new refresh token (Twitter, Pinterest, and TikTok all rotate them)
    if (tokens.refresh_token) {
      updateData.refresh_token_encrypted = encrypt(tokens.refresh_token);
    }

    const { error: dbError } = await supabaseAdmin
      .from("social_connections")
      .update(updateData)
      .eq("id", connectionId);

    if (dbError) {
      console.error(
        `[refreshSocialToken] CRITICAL: DB update failed for ${platform} connection ${connectionId}:`,
        dbError.message
      );
      return {
        ok: false,
        error:
          "Token rafraîchi mais impossible de sauvegarder en base. Reconnecte ton compte.",
      };
    }

    return { ok: true, accessToken: tokens.access_token };
  } catch (err: any) {
    const msg = err?.message || "Token refresh failed";
    console.error(`[refreshSocialToken] ${platform} refresh failed:`, msg);
    return { ok: false, error: msg };
  }
}
