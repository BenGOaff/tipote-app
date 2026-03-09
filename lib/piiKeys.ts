// lib/piiKeys.ts
// Manage per-user data-encryption keys (DEK).
// Lazily provisions a key on first use — transparent to the rest of the app.

import { SupabaseClient } from "@supabase/supabase-js";
import { generateDEK, wrapDEK, unwrapDEK } from "./piiCrypto";

// In-memory cache (per-request / per-instance). Safe because server
// components & route handlers are short-lived.
const dekCache = new Map<string, string>();

/**
 * Get the plaintext DEK for a user. Creates + stores one if none exists.
 */
export async function getUserDEK(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const cached = dekCache.get(userId);
  if (cached) return cached;

  // Try to fetch existing key
  const { data } = await supabase
    .from("user_encryption_keys")
    .select("wrapped_dek")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.wrapped_dek) {
    const dek = unwrapDEK(data.wrapped_dek);
    dekCache.set(userId, dek);
    return dek;
  }

  // First time: generate + store
  const dek = generateDEK();
  const wrapped = wrapDEK(dek);

  await supabase
    .from("user_encryption_keys")
    .upsert({ user_id: userId, wrapped_dek: wrapped });

  dekCache.set(userId, dek);
  return dek;
}
