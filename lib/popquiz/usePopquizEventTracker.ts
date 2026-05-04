"use client";

// Client-side event tracker for popquiz player. Translates the
// state-machine PlayerEvents into RPC calls against
// `log_popquiz_event` so creator-facing counters
// (starts_count, completions_count) stay accurate.
//
// Called from both PopquizPlayClient (public /p) and
// EmbedPopquizPlayClient (iframe /embed/p) so the embed iframe
// reports its plays back to the same row as direct visits.
//
// Fire-and-forget (no await, no toast) — analytics must never block
// playback or spam the visitor with errors.
//
// Event mapping today (RPC supports view/start/complete only) :
//   started   → "start"
//   completed → "complete"
// Other events (cue_reached, quiz_answered/skipped, abandoned) wait
// for a per-event log table ; ignored for now so we don't fire
// unrecognised event_types into the RPC.

import { useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import type { PlayerEvent } from "@/lib/popquiz/types";

const TRACKED_EVENTS: Partial<Record<PlayerEvent["type"], string>> = {
  started: "start",
  completed: "complete",
};

export function usePopquizEventTracker(popquizId: string) {
  // Guard against double-firing the same event_type per session
  // (e.g. ENDED can fire multiple times on some sources). Keeping
  // this in a ref means the dedupe survives StrictMode double-mount
  // without persisting across page navigations.
  const sentRef = useRef<Set<string>>(new Set());

  return useCallback(
    (event: PlayerEvent) => {
      const rpcType = TRACKED_EVENTS[event.type];
      if (!rpcType) return;
      if (sentRef.current.has(rpcType)) return;
      sentRef.current.add(rpcType);
      try {
        const supabase = getSupabaseBrowserClient();
        // Supabase query builders are thenables (no .catch), so we
        // wrap in a .then(_, _) to swallow rejections without
        // throwing — analytics never block playback.
        void supabase
          .rpc("log_popquiz_event", {
            popquiz_id_input: popquizId,
            event_type_input: rpcType,
          })
          .then(
            () => {},
            () => {
              // fail-open : analytics never block playback
            },
          );
      } catch {
        // ignore — never throw to the player
      }
    },
    [popquizId],
  );
}
