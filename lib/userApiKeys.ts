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

type Row = {
  user_id: string;
  provider: string;
  ciphertext_b64: string;
  iv_b64: string;
  tag_b64: string;
  created_at?: string;
  updated_at?: string;
};

function normalizeProvider(provider: Provider): Provider {
  const p = (provider ?? "openai").toString().toLowerCase().trim();
  if (p === "claude") return "claude";
  if (p === "gemini") return "gemini";
  return "openai";
}

function isSchemaOrRlsError(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  // PostgREST / Supabase errors vary, keep wide net but safe.
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("pgrst") ||
    m.includes("permission denied") ||
    m.includes("violates row-level security") ||
    m.includes("rls") ||
    m.includes("not allowed")
  );
}

export async function getDecryptedUserApiKey(params: {
  supabase: SupabaseClient;
  userId: string;
  provider: Provider;
}): Promise<string | null> {
  const provider = normalizeProvider(params.provider);

  try {
    const { data, error } = await params.supabase
      .from("user_api_keys")
      .select("ciphertext_b64, iv_b64, tag_b64")
      .eq("user_id", params.userId)
      .eq("provider", provider)
      .maybeSingle();

    if (error) {
      if (isSchemaOrRlsError(error.message)) return null;
      return null;
    }

    if (!data) return null;

    const payload: EncryptedPayload = {
      ciphertext_b64: (data as any).ciphertext_b64,
      iv_b64: (data as any).iv_b64,
      tag_b64: (data as any).tag_b64,
    };

    const decrypted = decryptString(payload);
    const key = (decrypted ?? "").trim();
    return key || null;
  } catch (e) {
    // fail-open (ne pas casser l'app)
    return null;
  }
}

export async function upsertUserApiKey(params: {
  supabase: SupabaseClient;
  userId: string;
  provider: Provider;
  apiKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = normalizeProvider(params.provider);
  const apiKey = (params.apiKey ?? "").trim();

  if (!apiKey) return { ok: false, error: "Missing apiKey" };

  try {
    const enc = encryptString(apiKey);

    // ⚠️ On assume une contrainte unique (user_id, provider) ou PK équivalente.
    const { error } = await params.supabase.from("user_api_keys").upsert(
      {
        user_id: params.userId,
        provider,
        ciphertext_b64: enc.ciphertext_b64,
        iv_b64: enc.iv_b64,
        tag_b64: enc.tag_b64,
        updated_at: new Date().toISOString(),
      } as Partial<Row>,
      { onConflict: "user_id,provider" }
    );

    if (error) {
      if (isSchemaOrRlsError(error.message)) {
        return { ok: false, error: "API keys storage not available." };
      }
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function deleteUserApiKey(params: {
  supabase: SupabaseClient;
  userId: string;
  provider: Provider;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const provider = normalizeProvider(params.provider);

  try {
    const { error } = await params.supabase
      .from("user_api_keys")
      .delete()
      .eq("user_id", params.userId)
      .eq("provider", provider);

    if (error) {
      if (isSchemaOrRlsError(error.message)) return { ok: true }; // fail-open
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
