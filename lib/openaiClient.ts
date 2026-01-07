// src/lib/openaiClient.ts
// Client OpenAI pour l'IA stratégique (clé du propriétaire)
// IMPORTANT : ne jamais throw au moment de l'import (sinon /api/strategy = 500 direct)

import OpenAI from "openai";

export function getOwnerOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY_OWNER;
  if (!apiKey) return null;

  return new OpenAI({ apiKey });
}

export const openai = getOwnerOpenAI();
