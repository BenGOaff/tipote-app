// src/lib/openaiClient.ts
// Client OpenAI pour l'IA stratégique (clé du propriétaire)

import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY_OWNER;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY_OWNER is not set");
}

export const openai = new OpenAI({
  apiKey,
});
