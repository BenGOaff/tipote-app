"use client";

// Iframe wrapper for the popquiz overlay. Adds a polished loading
// state — without it, the cue interruption goes black-backdrop →
// abrupt white iframe content, which feels broken even when the
// underlying load is fast.
//
// Used by both PopquizPlayClient (public /p) and
// EmbedPopquizPlayClient (iframe /embed/p) so the UX stays
// identical across hosting contexts.

import { useState } from "react";
import { Loader2 } from "lucide-react";

export function PopquizQuizIframe({ quizId }: { quizId: string }) {
  // The iframe is recreated when quizId changes (key prop), so the
  // loading flag is correctly reset between cues without us having
  // to track quizId in a useEffect.
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <iframe
        key={quizId}
        src={`/q/${quizId}`}
        className="absolute inset-0 w-full h-full border-0 bg-background"
        title="Quiz"
        allow="autoplay; clipboard-write"
        onLoad={() => setLoaded(true)}
      />
      {!loaded ? (
        <div
          className="absolute inset-0 grid place-items-center bg-background pointer-events-none"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-7 animate-spin text-[var(--pq-accent,#5D6CDB)]" />
            <span className="text-xs font-medium">Chargement du quiz…</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
