// lib/offerPyramidSSE.ts
// SSE consumer for POST /api/strategy/offer-pyramid
// Generates ONLY the 3 offer pyramids (not the full strategy).
// Uses heartbeats to prevent proxy 504 timeout.

export type PyramidSSEResult = {
  success: boolean;
  planId?: string | null;
  skipped?: boolean;
  reason?: string;
  offer_pyramids?: unknown[];
  offer_mode?: string;
  error?: string;
};

export type PyramidSSECallbacks = {
  onProgress?: (step: string) => void;
  onResult?: (result: PyramidSSEResult) => void;
  onError?: (error: string) => void;
};

/**
 * Call POST /api/strategy/offer-pyramid via SSE stream.
 * Returns the final result (including offer_pyramids) or throws on error.
 */
export async function callOfferPyramidSSE(
  callbacks?: PyramidSSECallbacks,
): Promise<PyramidSSEResult> {
  const res = await fetch("/api/strategy/offer-pyramid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
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
    // Pre-validation returned JSON directly (e.g. skipped)
    const result = json as PyramidSSEResult;
    callbacks?.onResult?.(result);
    return result;
  }

  // Parse SSE stream
  return new Promise<PyramidSSEResult>((resolve, reject) => {
    const reader = res.body?.getReader();
    if (!reader) {
      const err = "No response body";
      callbacks?.onError?.(err);
      reject(new Error(err));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: PyramidSSEResult | null = null;

    function processLine(line: string) {
      if (line.startsWith("event: ")) {
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
              finalResult = data as PyramidSSEResult;
              callbacks?.onResult?.(finalResult);
              break;
            case "error":
              finalResult = data as PyramidSSEResult;
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
              reject(new Error(finalResult.error || "Pyramid generation failed"));
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
