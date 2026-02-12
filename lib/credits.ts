// lib/credits.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CreditsBalance = {
  user_id: string;
  monthly_credits_total: number;
  monthly_credits_used: number;
  bonus_credits_total: number;
  bonus_credits_used: number;
  monthly_reset_at: string;
  created_at: string;
  updated_at: string;
};

export type CreditsSnapshot = CreditsBalance & {
  monthly_remaining: number;
  bonus_remaining: number;
  total_remaining: number;
};

function toInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computeCreditsSnapshot(row: CreditsBalance): CreditsSnapshot {
  const monthlyTotal = toInt(row.monthly_credits_total, 0);
  const monthlyUsed = toInt(row.monthly_credits_used, 0);
  const bonusTotal = toInt(row.bonus_credits_total, 0);
  const bonusUsed = toInt(row.bonus_credits_used, 0);

  const monthlyRemaining = Math.max(0, monthlyTotal - monthlyUsed);
  const bonusRemaining = Math.max(0, bonusTotal - bonusUsed);

  return {
    ...row,
    monthly_remaining: monthlyRemaining,
    bonus_remaining: bonusRemaining,
    total_remaining: monthlyRemaining + bonusRemaining,
  };
}

/**
 * ✅ Ensure + auto-reset monthly bucket (RPC).
 * Utilise la service_role key côté serveur via supabaseAdmin.
 */
export async function ensureUserCredits(userId: string): Promise<CreditsSnapshot> {
  const { data, error } = await supabaseAdmin.rpc("ensure_user_credits", { p_user_id: userId });

  if (error || !data) {
    throw new Error(error?.message || "Failed to ensure_user_credits");
  }

  return computeCreditsSnapshot(data as CreditsBalance);
}

/**
 * ✅ Consume credits (RPC, atomic via row lock inside function)
 * Retourne le nouveau solde.
 */
/**
 * ✅ Add bonus credits for a user (admin action).
 * Uses RPC admin_add_bonus_credits (must be created in Supabase SQL Editor).
 */
export async function addBonusCredits(userId: string, amount: number): Promise<CreditsSnapshot> {
  // Ensure credits row exists first
  await ensureUserCredits(userId);

  const { data, error } = await supabaseAdmin.rpc("admin_add_bonus_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    throw new Error(error.message || "Failed to add bonus credits");
  }

  // If the RPC returns the updated row, use it; otherwise re-fetch
  if (data && typeof data === "object" && "bonus_credits_total" in data) {
    return computeCreditsSnapshot(data as CreditsBalance);
  }

  // Fallback: re-fetch current state
  return ensureUserCredits(userId);
}

export async function consumeCredits(
  userId: string,
  amount: number,
  context: Record<string, any> = {}
): Promise<CreditsSnapshot> {
  const { data, error } = await supabaseAdmin.rpc("consume_ai_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_context: context,
  });

  if (error || !data) {
    const msg = error?.message || "Failed to consume_ai_credits";
    // Normalize “no credits” signal
    if (msg.toUpperCase().includes("NO_CREDITS")) {
      const e = new Error("NO_CREDITS");
      (e as any).code = "NO_CREDITS";
      throw e;
    }
    throw new Error(msg);
  }

  return computeCreditsSnapshot(data as CreditsBalance);
}
