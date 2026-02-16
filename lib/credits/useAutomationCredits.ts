// lib/credits/useAutomationCredits.ts
// Client-side hook for reading automation credit balance with auto-refresh.

"use client";

import { useCallback, useEffect, useState } from "react";

export type AutomationCreditsBalance = {
  credits_total: number;
  credits_used: number;
  credits_remaining: number;
};

export const AUTOMATION_CREDITS_UPDATED_EVENT = "tipote:automation-credits-updated";

export function emitAutomationCreditsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTOMATION_CREDITS_UPDATED_EVENT));
}

export async function fetchAutomationCreditsBalance(): Promise<AutomationCreditsBalance> {
  const res = await fetch("/api/automation/credits", { method: "GET" });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok || !json.balance) {
    throw new Error(json?.error || "Impossible de charger les crédits d'automatisation.");
  }

  return json.balance;
}

type UseAutomationCreditsOptions = {
  auto?: boolean;
  refreshOnFocus?: boolean;
  refreshOnEvent?: boolean;
};

export function useAutomationCredits(options: UseAutomationCreditsOptions = {}) {
  const { auto = true, refreshOnFocus = true, refreshOnEvent = true } = options;

  const [loading, setLoading] = useState<boolean>(auto);
  const [balance, setBalance] = useState<AutomationCreditsBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const b = await fetchAutomationCreditsBalance();
      setBalance(b);
    } catch (e: any) {
      setBalance(null);
      setError(e?.message || "Impossible de charger les crédits.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const safeRefresh = async () => {
      if (cancelled) return;
      await refresh();
    };

    if (auto) void safeRefresh();

    const onEvent = () => void safeRefresh();
    const onFocus = () => void safeRefresh();

    if (refreshOnEvent) window.addEventListener(AUTOMATION_CREDITS_UPDATED_EVENT, onEvent);
    if (refreshOnFocus) window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      if (refreshOnEvent) window.removeEventListener(AUTOMATION_CREDITS_UPDATED_EVENT, onEvent);
      if (refreshOnFocus) window.removeEventListener("focus", onFocus);
    };
  }, [auto, refresh, refreshOnEvent, refreshOnFocus]);

  return { loading, balance, error, refresh };
}
