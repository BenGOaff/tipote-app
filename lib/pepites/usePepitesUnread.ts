// lib/pepites/usePepitesUnread.ts
"use client";

import { useEffect, useState } from "react";

type Summary = {
  ok: boolean;
  hasUnread?: boolean;
};

export function usePepitesUnread() {
  const [loading, setLoading] = useState(true);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        const res = await fetch("/api/pepites/summary", { cache: "no-store" });
        const json = (await res.json()) as Summary;

        if (cancelled) return;
        setHasUnread(Boolean(json?.ok && json?.hasUnread));
      } catch {
        if (cancelled) return;
        setHasUnread(false);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    run();

    const onFocus = () => run();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { loading, hasUnread };
}
