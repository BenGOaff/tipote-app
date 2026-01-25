// lib/credits/client.ts
// Helpers client pour lire le solde crédits + notifier l'app.
// Objectif: éviter duplication (Sidebar/Billing/Settings/Créer) et permettre un refresh live.

export type CreditsBalance = {
  total_remaining: number;
  total_purchased: number;
  total_consumed: number;
};

export type CreditsBalanceResponse = {
  ok: boolean;
  balance?: CreditsBalance;
  error?: string;
};

export const CREDITS_UPDATED_EVENT = "tipote:credits-updated";

/**
 * Déclenche un event global pour que Sidebar/Billing puissent se rafraîchir
 * sans reload complet.
 */
export function emitCreditsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CREDITS_UPDATED_EVENT));
}

/**
 * Fetch du solde crédits (shape UI stable).
 */
export async function fetchCreditsBalance(): Promise<CreditsBalance> {
  const res = await fetch("/api/credits/balance", { method: "GET" });
  const json = (await res.json().catch(() => null)) as CreditsBalanceResponse | null;

  if (!res.ok || !json?.ok || !json.balance) {
    throw new Error(json?.error || "Impossible de charger les crédits.");
  }

  return json.balance;
}
