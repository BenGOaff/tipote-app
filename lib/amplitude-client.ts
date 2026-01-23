"use client";

import * as amplitude from "@amplitude/unified";

let isInitialized = false;

export function ampInitOnce() {
  if (isInitialized) return true;

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) return false;

  amplitude.initAll(apiKey, {
    analytics: { autocapture: true },
    sessionReplay: { sampleRate: 1 },
  });

  isInitialized = true;
  return true;
}

export function ampIdentify(userId: string, props?: Record<string, unknown>) {
  if (!ampInitOnce()) return;

  try {
    amplitude.setUserId(userId);

    if (props && Object.keys(props).length > 0) {
      const identify = new amplitude.Identify();
      for (const [k, v] of Object.entries(props)) {
        identify.set(k, v as any);
      }
      amplitude.identify(identify);
    }
  } catch {}
}

export function ampTrack(
  eventName: string,
  eventProps?: Record<string, unknown>
) {
  if (!ampInitOnce()) return;

  try {
    amplitude.track(eventName, eventProps);
  } catch {}
}
