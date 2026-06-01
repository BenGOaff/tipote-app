// lib/claudeRequest.ts
//
// Helper utilitaire pour construire le body d'un appel direct à l'API
// Messages d'Anthropic en filtrant les paramètres déprecated selon le
// modèle cible.
//
// Pourquoi (1er juin 2026, bug constaté en prod) :
// Anthropic a RETIRÉ `temperature`, `top_p` et `top_k` de l'API
// Messages sur Opus 4.7 et 4.8 (cf. doc migration officielle). Les
// envoyer renvoie un 400 "temperature is deprecated for this model".
// Or Tipote a 16+ call-sites qui appellent l'API Anthropic en direct
// (pas via callClaude) avec temperature en dur — quand le modèle est
// Opus 4.7+, tous échouent silencieusement chez les users.
//
// Ce helper applique le filtrage en UNE SEULE PLACE : tous les
// call-sites construisent leur body via buildClaudeMessageBody() au
// lieu de poser temperature à la main.

const OPUS_47_PLUS_RE = /^claude-opus-4-(?:[7-9]|\d{2,})\b/i;

/**
 * Vrai si `modelId` correspond à Opus 4.7 ou plus récent — donc à un
 * modèle qui rejette `temperature` / `top_p` / `top_k`.
 */
export function modelDeprecatesSamplingParams(modelId: string | null | undefined): boolean {
  if (!modelId) return false;
  return OPUS_47_PLUS_RE.test(modelId.trim());
}

export interface BuildClaudeBodyInput {
  model: string;
  max_tokens: number;
  messages: Array<{ role: string; content: unknown }>;
  system?: string | unknown;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  thinking?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
  metadata?: unknown;
}

/**
 * Construit le body d'un appel /v1/messages en retirant temperature/
 * top_p/top_k pour les modèles qui les rejettent (Opus 4.7+).
 *
 * Préserve tous les autres champs tels quels. Aucun fallback de
 * temperature appliqué côté Opus 4.7+ — le modèle gère le sampling en
 * interne.
 */
export function buildClaudeMessageBody(input: BuildClaudeBodyInput): Record<string, unknown> {
  const skipSampling = modelDeprecatesSamplingParams(input.model);
  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.max_tokens,
    messages: input.messages,
  };
  if (input.system !== undefined) body.system = input.system;
  if (input.stream !== undefined) body.stream = input.stream;
  if (input.thinking !== undefined) body.thinking = input.thinking;
  if (input.tools !== undefined) body.tools = input.tools;
  if (input.tool_choice !== undefined) body.tool_choice = input.tool_choice;
  if (input.metadata !== undefined) body.metadata = input.metadata;

  if (!skipSampling) {
    if (typeof input.temperature === "number") body.temperature = input.temperature;
    if (typeof input.top_p === "number") body.top_p = input.top_p;
    if (typeof input.top_k === "number") body.top_k = input.top_k;
  }

  return body;
}
