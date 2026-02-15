"use client";

import { useEffect, useState } from "react";

export type SocialConnection = {
  id: string;
  platform: string;
  platform_user_id: string | null;
  platform_username: string | null;
  token_expires_at: string | null;
  expired: boolean;
};

// Module-level cache to avoid re-fetching per component instance
let cachedConnections: SocialConnection[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

export function useSocialConnections() {
  const [connections, setConnections] = useState<SocialConnection[]>(cachedConnections ?? []);
  const [loading, setLoading] = useState(cachedConnections === null);

  useEffect(() => {
    // Use cache if fresh
    if (cachedConnections && Date.now() - cacheTimestamp < CACHE_TTL) {
      setConnections(cachedConnections);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/social/connections");
        const json = await res.json();
        const conns: SocialConnection[] = json?.connections ?? [];
        cachedConnections = conns;
        cacheTimestamp = Date.now();
        if (!cancelled) {
          setConnections(conns);
        }
      } catch {
        // silencieux
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Active (non-expired) connections only */
  const activeConnections = connections.filter((c) => !c.expired);

  /** Check if a specific platform is connected and active */
  const isConnected = (platform: string) =>
    activeConnections.some((c) => c.platform === platform);

  /** Invalidate cache and refetch */
  const refresh = async () => {
    cachedConnections = null;
    cacheTimestamp = 0;
    setLoading(true);
    try {
      const res = await fetch("/api/social/connections");
      const json = await res.json();
      const conns: SocialConnection[] = json?.connections ?? [];
      cachedConnections = conns;
      cacheTimestamp = Date.now();
      setConnections(conns);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  };

  return { connections, activeConnections, loading, isConnected, refresh };
}
