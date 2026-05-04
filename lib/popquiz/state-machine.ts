// Pure reducer driving the runtime player. Kept framework-free so
// it's trivially unit-testable and reusable from any host (Next.js
// today, future @tipote/popquiz package, server-side replay for
// analytics, etc).
//
// Transitions:
//   idle → playing → quiz_open → resuming → playing → … → ended
//
// Invariants enforced here:
//   - a consumed cue never re-fires (seek-back is a no-op)
//   - PLAY/PAUSE while quiz_open are ignored (the overlay owns the
//     UI; we don't want stray controls fighting the state machine)
//   - the first PLAY emits a synthetic `started` event so analytics
//     can pinpoint when the viewer engaged for the first time

import type { PlayerEvent, PlayerState, PopquizCue } from "./types";

export interface PlayerSnapshot {
  state: PlayerState;
  currentCueId: string | null;
  consumedCueIds: ReadonlySet<string>;
  events: ReadonlyArray<PlayerEvent>;
}

export type PlayerAction =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME_UPDATE"; ms: number; cues: PopquizCue[] }
  | { type: "QUIZ_ANSWERED"; cueId: string; meta?: Record<string, unknown> }
  | { type: "QUIZ_SKIPPED"; cueId: string }
  | { type: "ENDED" };

export function initialSnapshot(): PlayerSnapshot {
  return {
    state: "idle",
    currentCueId: null,
    consumedCueIds: new Set(),
    events: [],
  };
}

// Cues are expected sorted ascending by timestamp_ms. Returns the
// first un-consumed cue whose timestamp has already passed — with
// a small tolerance window absorbed by the >= check, so a slow
// timeupdate (~250ms gaps in some browsers) won't miss a trigger.
function findNextCue(
  ms: number,
  cues: PopquizCue[],
  consumed: ReadonlySet<string>,
): PopquizCue | null {
  for (const cue of cues) {
    if (consumed.has(cue.id)) continue;
    if (cue.timestampMs <= ms) return cue;
    // sorted: no later cue can fire yet
    return null;
  }
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function reducer(
  s: PlayerSnapshot,
  a: PlayerAction,
): PlayerSnapshot {
  switch (a.type) {
    case "PLAY": {
      if (s.state === "quiz_open") return s;
      // First-ever PLAY → emit `started` so the analytics row gets
      // a clean engagement timestamp distinct from the row's
      // started_at (which is just "page mounted").
      const isFirstPlay = s.events.length === 0;
      return {
        ...s,
        state: "playing",
        events: isFirstPlay
          ? [
              ...s.events,
              { type: "started", timestampMs: 0, at: nowIso() },
            ]
          : s.events,
      };
    }

    case "PAUSE":
      if (s.state === "quiz_open") return s;
      return { ...s, state: "idle" };

    case "TIME_UPDATE": {
      if (s.state !== "playing") return s;
      const cue = findNextCue(a.ms, a.cues, s.consumedCueIds);
      if (!cue) return s;
      return {
        ...s,
        state: "quiz_open",
        currentCueId: cue.id,
        events: [
          ...s.events,
          {
            type: "cue_reached",
            cueId: cue.id,
            timestampMs: a.ms,
            at: nowIso(),
          },
        ],
      };
    }

    case "QUIZ_ANSWERED": {
      const consumed = new Set(s.consumedCueIds);
      consumed.add(a.cueId);
      return {
        ...s,
        state: "resuming",
        currentCueId: null,
        consumedCueIds: consumed,
        events: [
          ...s.events,
          {
            type: "quiz_answered",
            cueId: a.cueId,
            timestampMs: 0,
            at: nowIso(),
            meta: a.meta,
          },
        ],
      };
    }

    case "QUIZ_SKIPPED": {
      const consumed = new Set(s.consumedCueIds);
      consumed.add(a.cueId);
      return {
        ...s,
        state: "resuming",
        currentCueId: null,
        consumedCueIds: consumed,
        events: [
          ...s.events,
          {
            type: "quiz_skipped",
            cueId: a.cueId,
            timestampMs: 0,
            at: nowIso(),
          },
        ],
      };
    }

    case "ENDED":
      return {
        ...s,
        state: "ended",
        events: [
          ...s.events,
          { type: "completed", timestampMs: 0, at: nowIso() },
        ],
      };

    default:
      return s;
  }
}
