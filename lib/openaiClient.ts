// src/lib/openaiClient.ts
// Client OpenAI pour l'IA stratégique (clé du propriétaire)
// IMPORTANT : ne jamais throw au moment de l'import (sinon /api/strategy = 500 direct)
//
// OpenAI prompt caching is automatic for prompts > 1024 tokens (GPT-4+, GPT-5).
// No special parameter needed — the SDK handles it transparently.

import OpenAI from "openai";

/** Timeout par défaut : 5 minutes — headroom pour les longues générations */
const DEFAULT_TIMEOUT_MS = 300_000;

export function getOwnerOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY_OWNER;
  if (!apiKey) return null;

  return new OpenAI({ apiKey, timeout: DEFAULT_TIMEOUT_MS });
}

export const openai = getOwnerOpenAI();

/** Modèle OpenAI par défaut — configurable via env var */
export const OPENAI_MODEL =
  process.env.TIPOTE_OPENAI_MODEL?.trim() ||
  process.env.OPENAI_MODEL?.trim() ||
  "gpt-5-nano";

/**
 * Returns true if the configured model is a GPT-5 family model
 * that requires reasoning_effort to be set.
 */
function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith("gpt-5") || m.startsWith("o4") || m.startsWith("o3") || m.startsWith("o1");
}

/**
 * Backward-compatible stub that also injects reasoning_effort
 * for GPT-5 family models (gpt-5, gpt-5-mini, gpt-5-nano, etc.)
 * which REQUIRE this parameter.
 */
export function cachingParams(_feature: string): Record<string, unknown> {
  if (isReasoningModel(OPENAI_MODEL)) {
    return { reasoning_effort: "low" };
  }
  return {};
}
