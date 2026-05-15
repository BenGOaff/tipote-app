"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Debounced autosave for editors. Pushes a JSON snapshot to a PUT
// endpoint after the state has been stable for `delayMs`. Skips writes
// when the serialized snapshot hasn't changed since the last successful
// flush, so a re-render with identical state costs nothing.
//
// Pause via `enabled = false` while the restore-draft dialog is open or
// while the initial fetch hasn't hydrated — we don't want to overwrite
// the server's pending draft with an empty in-memory state.
export function useAutosave<T>({
  endpoint,
  state,
  enabled,
  delayMs = 2000,
}: {
  endpoint: string;
  state: T;
  enabled: boolean;
  delayMs?: number;
}) {
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let serialized: string;
    try {
      serialized = JSON.stringify(state);
    } catch {
      return;
    }
    if (lastSerializedRef.current === serialized) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (inFlightRef.current) inFlightRef.current.abort();
      const ctrl = new AbortController();
      inFlightRef.current = ctrl;
      setSavingDraft(true);
      try {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
          signal: ctrl.signal,
        });
        if (res.ok) {
          lastSerializedRef.current = serialized;
          setLastSavedAt(Date.now());
        }
      } catch {
        // Network blip — next state change reattempts.
      } finally {
        if (inFlightRef.current === ctrl) inFlightRef.current = null;
        setSavingDraft(false);
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [endpoint, state, enabled, delayMs]);

  // Called after an explicit Save succeeds (changes are now in the
  // canonical columns) or when the user dismisses a restore offer.
  const clearDraft = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (inFlightRef.current) inFlightRef.current.abort();
    try {
      await fetch(endpoint, { method: "DELETE" });
      lastSerializedRef.current = null;
      setLastSavedAt(null);
    } catch {
      // Non-fatal — the server-side draft will eventually be overwritten
      // by the next autosave or ignored once updated_at moves forward.
    }
  }, [endpoint]);

  // Best-effort flush before unload — the timer might still be holding
  // a queued snapshot. Using keepalive=true lets the browser send the
  // body even if the tab is closing.
  useEffect(() => {
    if (!enabled) return;
    function flush() {
      if (!timerRef.current) return;
      let serialized: string;
      try {
        serialized = JSON.stringify(state);
      } catch {
        return;
      }
      if (lastSerializedRef.current === serialized) return;
      try {
        const data = new Blob(
          [JSON.stringify({ state })],
          { type: "application/json" },
        );
        const beaconOk = navigator.sendBeacon?.(endpoint, data) ?? false;
        if (!beaconOk) {
          fetch(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state }),
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // Ignore — sendBeacon spec is best-effort already.
      }
    }
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [endpoint, state, enabled]);

  return { savingDraft, lastSavedAt, clearDraft };
}
