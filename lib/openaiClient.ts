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
 * Backward-compatible stub — returns empty object.
 * OpenAI prompt caching is automatic for prompts > 1024 tokens.
 * No special parameter needed.
 */
export function cachingParams(_feature: string): Record<string, unknown> {
  return {};
}
