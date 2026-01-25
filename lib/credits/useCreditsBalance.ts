// lib/credits/useCreditsBalance.ts
// Hook client unifié pour lire + auto-refresh le solde crédits.
// Objectif: éviter de recopier la même logique (event + focus + visibility) partout.

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CREDITS_UPDATED_EVENT,
  fetchCreditsBalance,
  type CreditsBalance,
} from "@/lib/credits/client";

type UseCreditsBalanceOptions = {
  /**
   * Auto-load au montage (par défaut true)
   */
  auto?: boolean;
  /**
   * Auto-refresh au retour focus onglet (par défaut true)
   */
  refreshOnFocus?: boolean;
  /**
   * Auto-refresh au visibilitychange (par défaut true)
   */
  refreshOnVisible?: boolean;
  /**
   * Auto-refresh quand l'app émet tipote:credits-updated (par défaut true)
   */
  refreshOnEvent?: boolean;
};

export function useCreditsBalance(options: UseCreditsBalanceOptions = {}) {
  const {
    auto = true,
    refreshOnFocus = true,
    refreshOnVisible = true,
    refreshOnEvent = true,
  } = options;

  const [loading, setLoading] = useState<boolean>(auto);
  const [balance, setBalance] = useState<CreditsBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const b = await fetchCreditsBalance();
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
    const onVisibility = () => {
      if (document.visibilityState === "visible") void safeRefresh();
    };

    if (refreshOnEvent) window.addEventListener(CREDITS_UPDATED_EVENT, onEvent);
    if (refreshOnFocus) window.addEventListener("focus", onFocus);
    if (refreshOnVisible) document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (refreshOnEvent) window.removeEventListener(CREDITS_UPDATED_EVENT, onEvent);
      if (refreshOnFocus) window.removeEventListener("focus", onFocus);
      if (refreshOnVisible) document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [auto, refresh, refreshOnEvent, refreshOnFocus, refreshOnVisible]);

  return {
    loading,
    balance,
    error,
    refresh,
  };
}

export default useCreditsBalance;
