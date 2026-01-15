"use client";

import { useEffect } from "react";
import { initHotjar } from "@/lib/hotjar";

export function HotjarTracker() {
  useEffect(() => {
    initHotjar();
  }, []);

  return null;
}
