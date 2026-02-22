// lib/strategySSE.ts
// Shared SSE consumer for POST /api/strategy
// The strategy API now returns an SSE stream with heartbeats to prevent proxy timeouts.

export type StrategySSEResult = {
  success: boolean;
  planId?: string | null;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

export type StrategySSECallbacks = {
  onProgress?: (step: string) => void;
  onResult?: (result: StrategySSEResult) => void;
  onError?: (error: string) => void;
};

/**
 * Call POST /api/strategy via SSE stream.
 * Returns the final result or throws on network/parse error.
 */
export async function callStrategySSE(
  body: Record<string, unknown> = {},
  callbacks?: StrategySSECallbacks,
): Promise<StrategySSEResult> {
  const res = await fetch("/api/strategy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Non-SSE error response (e.g. 401, 500 from pre-validation)
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      const errMsg = (json as any)?.error || `HTTP ${res.status}`;
      callbacks?.onError?.(errMsg);
      throw new Error(errMsg);
    }
    // Shouldn't happen, but handle gracefully
    const result = json as StrategySSEResult;
    callbacks?.onResult?.(result);
    return result;
  }

  // Parse SSE stream
  return new Promise<StrategySSEResult>((resolve, reject) => {
    const reader = res.body?.getReader();
    if (!reader) {
      const err = "No response body";
      callbacks?.onError?.(err);
      reject(new Error(err));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: StrategySSEResult | null = null;

    function processLine(line: string) {
      if (line.startsWith("event: ")) {
        // store current event type for next data line
        (processLine as any).__event = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const event = (processLine as any).__event || "message";
        const dataStr = line.slice(6);
        try {
          const data = JSON.parse(dataStr);
          switch (event) {
            case "progress":
              callbacks?.onProgress?.(data.step || "");
              break;
            case "result":
              finalResult = data as StrategySSEResult;
              callbacks?.onResult?.(finalResult);
              break;
            case "error":
              finalResult = data as StrategySSEResult;
              callbacks?.onError?.(data.error || "Unknown error");
              break;
            case "heartbeat":
              // ignore, just keeps connection alive
              break;
          }
        } catch {
          // ignore parse errors on individual events
        }
        (processLine as any).__event = null;
      }
    }

    function pump(): Promise<void> {
      return reader!.read().then(({ done, value }) => {
        if (done) {
          // Process any remaining buffer
          if (buffer.trim()) {
            for (const line of buffer.split("\n")) {
              if (line.trim()) processLine(line.trim());
            }
          }
          if (finalResult) {
            if (finalResult.success || finalResult.skipped) {
              resolve(finalResult);
            } else {
              reject(new Error(finalResult.error || "Strategy generation failed"));
            }
          } else {
            reject(new Error("Stream ended without result"));
          }
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete line in buffer
        for (const line of lines) {
          if (line.trim()) processLine(line.trim());
        }

        return pump();
      });
    }

    pump().catch((err) => {
      callbacks?.onError?.(err instanceof Error ? err.message : "Stream error");
      reject(err);
    });
  });
}
