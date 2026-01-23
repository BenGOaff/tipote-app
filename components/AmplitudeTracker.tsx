"use client";

import { useEffect } from "react";
import { ampInitOnce } from "@/lib/telemetry/amplitude-client";

export function AmplitudeTracker() {
  useEffect(() => {
    ampInitOnce();
  }, []);

  return null;
}
