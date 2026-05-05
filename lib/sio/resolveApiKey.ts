// lib/sio/resolveApiKey.ts
// Single source of truth for "give me the user's plaintext SIO API key".
//
// Read path :
//   1. SELECT sio_user_api_key_enc, sio_user_api_key FROM business_profiles
//      WHERE user_id = ? (and project_id = ? if provided)
//   2. Si _enc présent → decrypt avec le DEK du user (lib/piiCrypto)
//   3. Sinon → retombe sur le plaintext (compat migration progressive)
//   4. Sinon → null
//
// Write path : voir `storeEncryptedApiKey()` ci-dessous (utilisé par
// PATCH /api/profile pour chiffrer avant insert).
//
// Béné 2026-05-04 : avant cette helper, chaque consommateur (cron
// alerts, sync-systeme, communities, courses, tags, public route) lisait
// sio_user_api_key en clair. Centraliser la résolution garantit que la
// décision « plaintext vs ciphertext » est faite à un seul endroit.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptField, encryptField } from "@/lib/piiCrypto";
import { getUserDEK } from "@/lib/piiKeys";

type ProfileRow = {
  sio_user_api_key: string | null;
  sio_user_api_key_enc: string | null;
};

/**
 * Resolve the plaintext API key for a user (and optionally a specific
 * project). Returns null if no key is set.
 *
 * `supabase` should be a service-role / admin client when called from
 * non-user contexts (cron, webhooks). For user-initiated requests,
 * passing the regular server client also works thanks to RLS.
 */
export async function resolveSioApiKey(
  supabase: SupabaseClient,
  userId: string,
  projectId?: string | null,
): Promise<string | null> {
  let q = supabase
    .from("business_profiles")
    .select("sio_user_api_key, sio_user_api_key_enc")
    .eq("user_id", userId);
  if (projectId) q = q.eq("project_id", projectId);

  // Multi-projet : si pas de project_id en input, on prend la ligne la
  // plus récente (comportement legacy mono-projet, voir lib/offers.ts
  // pour le même pattern).
  const { data, error } = await q
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;

  const row = data[0] as ProfileRow;

  if (row.sio_user_api_key_enc) {
    try {
      const dek = await getUserDEK(supabase, userId);
      const plain = decryptField(row.sio_user_api_key_enc, dek);
      return plain || null;
    } catch (e) {
      console.error("[resolveSioApiKey] decrypt failed:", e);
      // Fail-safe : si le ciphertext est corrompu, on retombe sur le
      // plaintext (qui peut encore exister pendant la migration).
    }
  }

  const plaintext = (row.sio_user_api_key ?? "").trim();
  return plaintext || null;
}

/**
 * Encrypt + return the ciphertext for storage. Caller writes it into
 * sio_user_api_key_enc et nulle sio_user_api_key dans le même UPDATE
 * pour que le plaintext disparaisse de la base.
 */
export async function encryptSioApiKey(
  supabase: SupabaseClient,
  userId: string,
  plaintext: string,
): Promise<string> {
  const dek = await getUserDEK(supabase, userId);
  return encryptField(plaintext, dek);
}
