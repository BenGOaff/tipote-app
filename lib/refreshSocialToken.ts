// lib/refreshSocialToken.ts
// Shared helper: refresh an expired OAuth token and persist the new tokens in DB.
// Supports: Twitter/X (rotating refresh tokens), Pinterest.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encrypt, decrypt } from "@/lib/crypto";
import { refreshAccessToken as refreshTwitterToken } from "@/lib/twitter";
import { refreshAccessToken as refreshPinterestToken } from "@/lib/pinterest";

type RefreshResult = {
  ok: boolean;
  accessToken?: string;
  error?: string;
};

/**
 * Attempts to refresh an expired social connection token.
 * On success, updates the DB with the new access_token (and new refresh_token if rotated).
 * Returns the new decrypted access_token.
 */
export async function refreshSocialToken(
  connectionId: string,
  platform: string,
  refreshTokenEncrypted: string | null
): Promise<RefreshResult> {
  if (!refreshTokenEncrypted) {
    return { ok: false, error: "No refresh token available" };
  }

  if (platform !== "twitter" && platform !== "pinterest") {
    return { ok: false, error: `Token refresh not supported for ${platform}` };
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(refreshTokenEncrypted);
  } catch {
    return { ok: false, error: "Failed to decrypt refresh token" };
  }

  try {
    let tokens: {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };

    if (platform === "twitter") {
      tokens = await refreshTwitterToken(refreshToken);
    } else {
      // Pinterest
      tokens = await refreshPinterestToken(refreshToken);
    }

    // Persist new tokens to DB
    const updateData: Record<string, any> = {
      access_token_encrypted: encrypt(tokens.access_token),
      token_expires_at: new Date(
        Date.now() + (tokens.expires_in ?? 7200) * 1000
      ).toISOString(),
    };

    // Persist the new refresh token (both Twitter and Pinterest rotate them)
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
