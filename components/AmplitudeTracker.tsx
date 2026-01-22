"use client";

import { useEffect } from "react";
import * as amplitude from "@amplitude/analytics-browser";
import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";

const AMPLITUDE_API_KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

export function AmplitudeTracker() {
  useEffect(() => {
    // Ne rien faire si pas de clé (évite de casser en preview/dev)
    if (!AMPLITUDE_API_KEY) return;

    try {
      // Plugin Session Replay (optionnel mais tu l’as coché dans Amplitude)
      amplitude.add(sessionReplayPlugin());

      // Init Amplitude
      amplitude.init(AMPLITUDE_API_KEY, undefined, {
        autocapture: true,
      });
    } catch {
      // Silence volontaire: tracker ne doit jamais casser l’app
    }
  }, []);

  return null;
}
