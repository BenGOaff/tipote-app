// app/api/admin/bulk/route.ts
// Admin Bulk Actions API — apply plan changes or bonus credits to multiple users at once

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";
import { ensureUserCredits, addBonusCredits } from "@/lib/credits";

const VALID_PLANS = ["free", "basic", "pro", "elite", "beta"] as const;

async function assertAdmin(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const ok = !!session?.user?.id && isAdminEmail(session?.user?.email);
  return { ok, session };
}

// POST — Bulk actions: change plan or add bonus credits
export async function POST(req: NextRequest) {
  try {
    const { ok, session } = await assertAdmin(req);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action: "change_plan" | "add_bonus_credits";
      user_ids: string[];
      plan?: string;
      bonus_amount?: number;
    };

    const { action, user_ids } = body;

    if (!action || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "action and user_ids[] required" },
        { status: 400 },
      );
    }

    if (user_ids.length > 200) {
      return NextResponse.json(
        { ok: false, error: "Max 200 users per bulk action" },
        { status: 400 },
      );
    }

    const results: { user_id: string; ok: boolean; error?: string }[] = [];

    if (action === "change_plan") {
      const plan = (body.plan ?? "").trim().toLowerCase();
      if (!VALID_PLANS.includes(plan as any)) {
        return NextResponse.json(
          { ok: false, error: `Invalid plan: ${plan}` },
          { status: 400 },
        );
      }

      for (const userId of user_ids) {
        try {
          // Get old plan for logging
          const { data: before } = await supabaseAdmin
            .from("profiles")
            .select("plan, email")
            .eq("id", userId)
            .maybeSingle();

          const oldPlan = before?.plan ?? null;

          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ plan, updated_at: new Date().toISOString() } as any)
            .eq("id", userId);

          if (error) {
            results.push({ user_id: userId, ok: false, error: error.message });
            continue;
          }

          // Sync credits
          try {
            await ensureUserCredits(userId);
          } catch { /* ignore */ }

          // Log change
          try {
            await supabaseAdmin.from("plan_change_log").insert({
              actor_user_id: session?.user?.id ?? null,
              target_user_id: userId,
              target_email: before?.email ?? null,
              old_plan: oldPlan,
              new_plan: plan,
              reason: "admin: bulk plan change",
            } as any);
          } catch { /* ignore */ }

          results.push({ user_id: userId, ok: true });
        } catch (e) {
          results.push({
            user_id: userId,
            ok: false,
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }
    } else if (action === "add_bonus_credits") {
      const amount = Number(body.bonus_amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { ok: false, error: "bonus_amount must be a positive number" },
          { status: 400 },
        );
      }

      for (const userId of user_ids) {
        try {
          await addBonusCredits(userId, amount);
          results.push({ user_id: userId, ok: true });
        } catch (e) {
          results.push({
            user_id: userId,
            ok: false,
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      }
    } else {
      return NextResponse.json(
        { ok: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
    }

    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    return NextResponse.json({
      ok: true,
      action,
      total: user_ids.length,
      succeeded,
      failed,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
