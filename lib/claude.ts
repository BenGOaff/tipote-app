// Shared Claude client. Streams Anthropic's SSE response so callers
// can either:
//   - await the full text (most use cases)
//   - watch the deltas via onDelta to forward heartbeats to a
//     downstream client (used by /api/content/strategy when piping
//     the call through SSE to the browser)
//
// We don't impose a total timeout — a long-running 30-day plan
// generation is legitimate. Instead, we abort if the upstream
// connection goes silent for more than `idleTimeoutMs` (90s by
// default), which is the only failure mode worth caring about.

import "server-only";
import { resolveAnthropicModel } from "@/lib/anthropicModel";

const DEFAULT_IDLE_TIMEOUT_MS = 90_000;

export function resolveClaudeModel(): string {
  // Délégation à la lib centrale — couvre Sonnet 4.6 + safety net qui
  // rattrape tous les IDs legacy (Sonnet 3.5 / Sonnet 4 / Sonnet 4.5,
  // aliases informels). Ce wrapper garde les call-sites existants
  // intacts tout en harmonisant la résolution sur l'ensemble des
  // endpoints AI Tipote.
  return resolveAnthropicModel(
    process.env.TIPOTE_CLAUDE_MODEL ||
      process.env.CLAUDE_MODEL ||
      process.env.ANTHROPIC_MODEL,
    "sonnet",
  );
}

export function getClaudeApiKey(): string {
  return (
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
    ""
  );
}

export interface CallClaudeArgs {
  apiKey: string;
  system: string;
  user: string;
  /** Override du model ID. Défaut : resolveClaudeModel() (sonnet). */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Idle timeout: abort if no chunk for this many ms. Default 90s. */
  idleTimeoutMs?: number;
  /** Forwarded each time Anthropic streams a text delta. */
  onDelta?: (chunk: string, totalLen: number) => void;
}

export async function callClaude(args: CallClaudeArgs): Promise<string> {
  const idleTimeoutMs = (() => {
    if (typeof args.idleTimeoutMs === "number") {
      return Math.max(15_000, Math.min(300_000, Math.floor(args.idleTimeoutMs)));
    }
    const raw =
      process.env.TIPOTE_CLAUDE_IDLE_TIMEOUT_MS ??
      process.env.CLAUDE_IDLE_TIMEOUT_MS ??
      "";
    const n = Number(String(raw).trim() || "NaN");
    return Number.isFinite(n)
      ? Math.max(15_000, Math.min(300_000, Math.floor(n)))
      : DEFAULT_IDLE_TIMEOUT_MS;
  })();

  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
  };
  armIdleTimer();

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        // `args.model` permet de bumper un endpoint sur un tier plus
        // puissant (ex. Opus pour le contenu premium). Défaut inchangé
        // (resolveClaudeModel = sonnet) → aucun impact sur les call-sites
        // existants qui ne passent pas de model.
        model: args.model?.trim() || resolveClaudeModel(),
        max_tokens: typeof args.maxTokens === "number" ? args.maxTokens : 4000,
        temperature: typeof args.temperature === "number" ? args.temperature : 0.7,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
        stream: true,
      }),
    });
  } catch (e: any) {
    if (idleTimer) clearTimeout(idleTimer);
    if (String(e?.name) === "AbortError") {
      throw new Error(`Claude API idle timeout (${idleTimeoutMs}ms)`);
    }
    throw e;
  }

  if (!res.ok || !res.body) {
    if (idleTimer) clearTimeout(idleTimer);
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API error (${res.status}): ${t || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let textAccum = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdleTimer();
      raw += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = raw.indexOf("\n\n")) !== -1) {
        const frame = raw.slice(0, sep);
        raw = raw.slice(sep + 2);
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) continue;
        let payload: any = null;
        try {
          payload = JSON.parse(dataLines.join("\n"));
        } catch {
          continue;
        }
        if (eventName === "content_block_delta") {
          const txt =
            payload?.delta?.type === "text_delta"
              ? String(payload.delta.text ?? "")
              : "";
          if (txt) {
            textAccum += txt;
            args.onDelta?.(txt, textAccum.length);
          }
        } else if (eventName === "error") {
          throw new Error(
            payload?.error?.message
              ? `Claude API stream error: ${payload.error.message}`
              : "Claude API stream error",
          );
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Claude API idle timeout (${idleTimeoutMs}ms)`);
    }
    throw e;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }

  return textAccum.trim();
}
