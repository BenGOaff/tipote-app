"use client";

import { useEffect } from "react";
import * as amplitude from "@amplitude/unified";

export function AmplitudeTracker() {
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

    if (!apiKey) {
      console.warn("[Amplitude] Missing NEXT_PUBLIC_AMPLITUDE_API_KEY");
      return;
    }

    try {
      amplitude.initAll(apiKey, {
        analytics: { autocapture: true },
        sessionReplay: { sampleRate: 1 }, // mets 0.1 si tu veux limiter après
      });

      // Event TEST : si celui-là n'apparaît pas, le problème n'est pas "autocapture"
      amplitude.track("tipote_debug_ping");
      console.log("[Amplitude] initAll ok + tipote_debug_ping sent");
    } catch (err) {
      console.error("[Amplitude] init failed", err);
    }
  }, []);

  return null;
}
