"use client";

import * as amplitude from "@amplitude/unified";

let isInitialized = false;

export function ampInitOnce() {
  if (typeof window === "undefined") return false;
  if (isInitialized) return true;

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) {
    console.warn("[Amplitude] Missing NEXT_PUBLIC_AMPLITUDE_API_KEY");
    return false;
  }

  try {
    amplitude.initAll(apiKey, {
      analytics: { autocapture: true },
      sessionReplay: { sampleRate: 1 },
    });

    // ping debug (1 fois)
    amplitude.track("tipote_debug_ping");
    console.log("[Amplitude] initAll ok + tipote_debug_ping sent");

    isInitialized = true;
    return true;
  } catch (err) {
    console.error("[Amplitude] init failed", err);
    return false;
  }
}

export function ampIdentify(userId: string, props?: Record<string, unknown>) {
  if (!ampInitOnce()) return;

  try {
    amplitude.setUserId(userId);

    if (props && Object.keys(props).length > 0) {
      const identify = new amplitude.Identify();
      for (const [k, v] of Object.entries(props)) identify.set(k, v as any);
      amplitude.identify(identify);
    }
  } catch {
    // no-op
  }
}

export function ampTrack(eventName: string, eventProps?: Record<string, unknown>) {
  if (!ampInitOnce()) return;

  try {
    amplitude.track(eventName, eventProps);
  } catch {
    // no-op
  }
}
