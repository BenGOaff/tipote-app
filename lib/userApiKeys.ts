// lib/userApiKeys.ts
// Helpers Supabase pour gérer les clés API utilisateur (chiffrées).
// Table attendue: public.user_api_keys
// Colonnes attendues:
// - user_id (uuid, PK ou unique avec provider)
// - provider (text) ex: 'openai'
// - ciphertext_b64 (text)
// - iv_b64 (text)
// - tag_b64 (text)
// - created_at (timestamptz default now())
// - updated_at (timestamptz default now())
//
// ✅ Si la table n'existe pas (ou RLS bloque), on renvoie null/false sans casser l'app.

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptString, encryptString, type EncryptedPayload } from "@/lib/crypto";

export type Provider = "openai" | "claude" | "gemini";

type DbRow = {
  user_id: string;
  provider: string;
  ciphertext_b64: string;
  iv_b64: string;
  tag_b64: string;
};

export async function getDecryptedUserApiKey(params: {
  supabase: SupabaseClient;
  userId: string;
  provider: Provider;
}): Promise<string | null> {
  const { supabase, userId, provider } = params;

  try {
    const { data, error } = await supabase
      .from("user_api_keys")
      .select("user_id, provider, ciphertext_b64, iv_b64, tag_b64")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as unknown as DbRow;
    const payload: EncryptedPayload = {
      ciphertext_b64: row.ciphertext_b64,
      iv_b64: row.iv_b64,
      tag_b64: row.tag_b64,
    };

    return decryptString(payload);
  } catch {
    return null;
  }
}

export async function upsertUserApiKey(params: {
  supabase: SupabaseClient;
  userId: string;
  provider: Provider;
  apiKey: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId, provider, apiKey } = params;

  let payload: EncryptedPayload;
  try {
    payload = encryptString(apiKey);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Encryption error" };
  }

  try {
    const { error } = await supabase.from("user_api_keys").upsert(
      {
        user_id: userId,
        provider,
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function deleteUserApiKey(params: {
  supabase: SupabaseClient;
  userId: string;
  provider: Provider;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId, provider } = params;

  try {
    const { error } = await supabase
      .from("user_api_keys")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
