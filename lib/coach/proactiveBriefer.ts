// lib/coach/proactiveBriefer.ts
//
// Appelle Claude Opus 4.8 pour générer le brief hebdo. Phase 4
// ROADMAP_RETENTION.md. Tipote ne dépend PAS du SDK @anthropic-ai/sdk
// (pas installé dans package.json) — on fait des appels HTTP bruts
// vers https://api.anthropic.com/v1/messages, comme lib/claude.ts
// existant. Cf. shared/curl/examples.md du skill claude-api.
//
// Best practices appliquées :
// - Modèle : claude-opus-4-8 (le plus puissant — décision Béné).
// - Adaptive thinking + effort high : Claude décide quand et combien
//   réfléchir, on cherche la qualité maximale.
// - Prompt caching ephemeral sur le system prompt (~2k tokens stables) :
//   tools rendraient avant system mais on n'en a pas → cache strictement
//   sur le système. À partir du 2e user dans la fenêtre 5min, ~90%
//   économie sur ces tokens. Vérifié via usage.cache_read_input_tokens.
// - Structured output JSON strict via output_config.format
//   (json_schema + additionalProperties: false partout) → aucun
//   markdown qui se faufile, validation auto.
// - PAS de temperature / top_p / top_k / budget_tokens : tous removed
//   sur Opus 4.8 (400 si passés).
// - Stop reason "refusal" géré explicitement.
// - Gestion d'erreur : un user qui échoue est skippé silencieusement
//   par le caller, les autres continuent. Pas de retry agressif (on
//   attendra le prochain lundi).
//
// ⚠️ Ne touche PAS lib/claude.ts existant (utilisé par d'autres flows
// avec Sonnet 4.6 et sans caching).

import { getClaudeApiKey } from "@/lib/claude";
import { sanitizeAiText } from "@/lib/aiTextSanitizer";
import {
  COACH_BRIEF_JSON_SCHEMA,
  type CoachBrief,
} from "@/lib/coach/briefSchema";
import { COACH_PROACTIVE_SYSTEM_PROMPT } from "@/lib/coach/systemPrompt";

const COACH_MODEL = "claude-opus-4-8";
const COACH_MAX_TOKENS = 4096;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface GenerateBriefArgs {
  contextText: string;
  firstName?: string;
}

export interface GenerateBriefResult {
  ok: boolean;
  brief?: CoachBrief;
  rawText?: string;
  cacheHit?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
  reason?:
    | "ok"
    | "refusal"
    | "parse_error"
    | "api_error"
    | "empty_response"
    | "no_api_key";
  error?: string;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicResponse {
  content: Array<AnthropicTextBlock | { type: string; [k: string]: unknown }>;
  stop_reason: string;
  stop_details?: { category?: string; explanation?: string } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/**
 * Génère un brief hebdo personnalisé pour UN user. Le system prompt
 * long est mis en cache via `cache_control: ephemeral` sur le dernier
 * bloc system. Le cron itère sur tous les users Pro/Elite en séquence :
 * tant que ça reste dans ~5min, chaque user après le 1er bénéficie du
 * cache (cache_read_input_tokens > 0 dans la réponse).
 */
export async function generateProactiveBrief(
  args: GenerateBriefArgs,
): Promise<GenerateBriefResult> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return {
      ok: false,
      reason: "no_api_key",
      error: "No Claude API key in env (CLAUDE_API_KEY_OWNER / ANTHROPIC_API_KEY_OWNER)",
    };
  }

  const greeting = args.firstName
    ? `Brief de la semaine pour ${args.firstName}.`
    : "Brief de la semaine.";

  const body = {
    model: COACH_MODEL,
    max_tokens: COACH_MAX_TOKENS,
    // Adaptive thinking — Claude décide quand et combien réfléchir.
    // budget_tokens / temperature / top_p / top_k REMOVED sur Opus 4.8.
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: {
        type: "json_schema",
        schema: COACH_BRIEF_JSON_SCHEMA,
      },
    },
    system: [
      {
        type: "text",
        text: COACH_PROACTIVE_SYSTEM_PROMPT,
        // Cache le system prompt long & stable. À partir du 2e appel
        // dans la fenêtre 5min, ~90% économie sur ces tokens.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `${greeting}\n\n` +
              `Voici le contexte business à analyser. ` +
              `Génère le brief en JSON conforme au schéma. ` +
              `Ne raconte pas le contexte — interprète-le.\n\n` +
              `---\n\n${args.contextText}`,
          },
        ],
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[coach/proactiveBriefer] fetch failed", err);
    return {
      ok: false,
      reason: "api_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      "[coach/proactiveBriefer] Anthropic API error",
      res.status,
      text.slice(0, 500),
    );
    return {
      ok: false,
      reason: "api_error",
      error: `${res.status}:${text.slice(0, 200)}`,
    };
  }

  let payload: AnthropicResponse;
  try {
    payload = (await res.json()) as AnthropicResponse;
  } catch (err) {
    console.error("[coach/proactiveBriefer] JSON parse failed on response", err);
    return {
      ok: false,
      reason: "api_error",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const usage = {
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
    cacheReadInputTokens: payload.usage?.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: payload.usage?.cache_creation_input_tokens ?? 0,
  };

  if (payload.stop_reason === "refusal") {
    return {
      ok: false,
      reason: "refusal",
      error: `refusal:${payload.stop_details?.category ?? "unknown"}`,
      usage,
    };
  }

  const textBlock = payload.content.find(
    (b): b is AnthropicTextBlock => b.type === "text",
  );
  if (!textBlock) {
    return { ok: false, reason: "empty_response", usage };
  }

  let parsed: CoachBrief;
  try {
    parsed = JSON.parse(textBlock.text) as CoachBrief;
    // Bene 7 juin 2026 : aucun em-dash dans le contenu user-visible.
    const sanitizeNode = (node: unknown): unknown => {
      if (typeof node === "string") return sanitizeAiText(node);
      if (Array.isArray(node)) return node.map(sanitizeNode);
      if (node && typeof node === "object") {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node)) o[k] = sanitizeNode(v);
        return o;
      }
      return node;
    };
    parsed = sanitizeNode(parsed) as CoachBrief;
  } catch (parseErr) {
    console.error(
      "[coach/proactiveBriefer] brief JSON parse failed",
      parseErr,
      textBlock.text.slice(0, 500),
    );
    return {
      ok: false,
      reason: "parse_error",
      rawText: textBlock.text,
      error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      usage,
    };
  }

  return {
    ok: true,
    brief: parsed,
    rawText: textBlock.text,
    cacheHit: usage.cacheReadInputTokens > 0,
    usage,
    reason: "ok",
  };
}
