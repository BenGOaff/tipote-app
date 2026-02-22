// src/lib/openaiClient.ts
// Client OpenAI pour l'IA stratégique (clé du propriétaire)
// IMPORTANT : ne jamais throw au moment de l'import (sinon /api/strategy = 500 direct)
//
// ✅ Prompt Caching :
// - timeout augmenté (4 min) pour laisser le temps aux longues générations
// - helper `cachingParams(feature)` à utiliser dans chaque appel
//   → ajoute `prompt_cache_key` pour améliorer le routage serveur (même préfixe → même machine)
//   → réduit le TTFT de 30-80% sur les prompts longs et les coûts de 90% sur gpt-5-nano

import OpenAI from "openai";

/** Timeout par défaut : 4 minutes — headroom pour les longues générations */
const DEFAULT_TIMEOUT_MS = 240_000;

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
 * Retourne les paramètres de prompt caching à spreader dans `chat.completions.create`.
 *
 * `prompt_cache_key` aide le routeur OpenAI à diriger les requêtes avec un préfixe commun
 * vers le même serveur, maximisant les cache hits (KV cache réutilisé).
 *
 * @param feature — identifiant stable de la feature (ex: "strategy", "coach", "quiz")
 */
export function cachingParams(feature: string): Record<string, unknown> {
  return {
    prompt_cache_key: `tipote:${feature}`,
  };
}
