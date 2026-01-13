// hooks/useTutorial.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "tipote_tutorial_contexts_v1";

type SeenMap = Record<string, boolean>;

function safeParse(json: string | null): SeenMap {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") return parsed as SeenMap;
    return {};
  } catch {
    return {};
  }
}

function readSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function writeSeen(map: SeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function useTutorial() {
  const [seen, setSeen] = useState<SeenMap>({});

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  const hasSeenContext = useCallback(
    (key: string) => {
      if (!key) return true;
      return Boolean(seen[key]);
    },
    [seen],
  );

  const markContextSeen = useCallback((key: string) => {
    if (!key) return;
    setSeen((prev) => {
      if (prev[key]) return prev;
      const next = { ...prev, [key]: true };
      writeSeen(next);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      hasSeenContext,
      markContextSeen,
      seen,
    }),
    [hasSeenContext, markContextSeen, seen],
  );
}
