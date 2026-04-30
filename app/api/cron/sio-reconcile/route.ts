// app/api/cron/sio-reconcile/route.ts
//
// Daily reconciliation between Tipote `profiles.plan` and Systeme.io's
// view of each user's subscriptions. Catches the "lost webhook" failure
// mode: SIO fired SALE_NEW or SALE_CANCELED but our endpoint never got
// it (network blip, deploy mid-flight, …). Without this cron, that user
// stays misclassified.
//
// SAFETY: we never auto-fix plans. Auto-flipping plans from a remote
// system would risk wiping a manually-granted plan, a beta override, or
// a stale SIO state. We LOG discrepancies and return them so Ben can
// review + act manually.
//
// Schedule via vercel.json:
//   { "crons": [{ "path": "/api/cron/sio-reconcile", "schedule": "0 3 * * *" }] }

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findContactByEmail, listSubscriptionsForContact } from "@/lib/systemeIoClient";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

// Beta is granted manually for lifetime access — never has an active SIO
// subscription, so reconciliation must skip these or every run flags drift.
const LIFETIME_PLANS: ReadonlySet<string> = new Set(["beta"]);

const PER_CALL_DELAY_MS = 150;

function authOk(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const expected = Buffer.from(CRON_SECRET);
  const tryEqual = (received: string | null | undefined) => {
    if (!received) return false;
    const a = Buffer.from(received);
    if (a.length !== expected.length) return false;
    return timingSafeEqual(a, expected);
  };
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return tryEqual(auth.slice(7));
  return tryEqual(req.nextUrl.searchParams.get("secret"));
}

type Discrepancy = {
  user_id: string;
  email: string;
  local_plan: string;
  sio_status: "no_contact" | "no_active_subscription" | "active_but_local_free" | "api_error";
  detail?: string;
};

export async function GET(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const discrepancies: Discrepancy[] = [];

  // Step 1: paid users locally — should each have an active SIO sub.
  // Tipote profiles use `id` as PK (not `user_id`).
  const { data: paidRows, error: paidErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, plan, sio_contact_id")
    .not("plan", "is", null)
    .neq("plan", "free");

  if (paidErr) {
    return NextResponse.json({ ok: false, error: paidErr.message }, { status: 500 });
  }

  let checkedPaid = 0;
  for (const row of paidRows ?? []) {
    const r = row as { id?: string; email?: string | null; plan?: string | null; sio_contact_id?: string | number | null };
    const email = String(r.email ?? "").trim().toLowerCase();
    const plan = String(r.plan ?? "").toLowerCase();
    const userId = String(r.id ?? "");
    if (!email || !userId) continue;

    if (LIFETIME_PLANS.has(plan)) continue;

    checkedPaid++;
    try {
      // Prefer the cached sio_contact_id; fall back to email lookup for
      // accounts captured before the column was populated.
      let contactId: number | null = null;
      const cached = r.sio_contact_id;
      if (cached != null) {
        const n = Number(cached);
        if (Number.isFinite(n) && n > 0) contactId = n;
      }
      if (!contactId) {
        const contact = await findContactByEmail(email);
        if (!contact) {
          discrepancies.push({ user_id: userId, email, local_plan: plan, sio_status: "no_contact" });
          await sleep(PER_CALL_DELAY_MS);
          continue;
        }
        contactId = contact.id;
      }
      const { subscriptions } = await listSubscriptionsForContact(contactId);
      const hasActive = subscriptions.some((s) => {
        const status = String(s.status ?? "").toLowerCase();
        return status === "active" || status === "trialing";
      });
      if (!hasActive) {
        discrepancies.push({ user_id: userId, email, local_plan: plan, sio_status: "no_active_subscription" });
      }
    } catch (e) {
      discrepancies.push({
        user_id: userId,
        email,
        local_plan: plan,
        sio_status: "api_error",
        detail: e instanceof Error ? e.message.slice(0, 200) : "unknown",
      });
    }
    await sleep(PER_CALL_DELAY_MS);
  }

  // Step 2: spot-check 100 most-recent free users to catch missed
  // NEW_SALE webhooks. Bounded so the cron stays under maxDuration.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: freeRows } = await supabaseAdmin
    .from("profiles")
    .select("id, email, plan, updated_at")
    .or("plan.eq.free,plan.is.null")
    .gte("updated_at", sevenDaysAgo)
    .order("updated_at", { ascending: false })
    .limit(100);

  let checkedFree = 0;
  for (const row of freeRows ?? []) {
    const r = row as { id?: string; email?: string | null };
    const email = String(r.email ?? "").trim().toLowerCase();
    const userId = String(r.id ?? "");
    if (!email || !userId) continue;

    checkedFree++;
    try {
      const contact = await findContactByEmail(email);
      if (!contact) continue;
      const { subscriptions } = await listSubscriptionsForContact(contact.id);
      const hasActive = subscriptions.some((s) => {
        const status = String(s.status ?? "").toLowerCase();
        return status === "active" || status === "trialing";
      });
      if (hasActive) {
        discrepancies.push({
          user_id: userId,
          email,
          local_plan: "free",
          sio_status: "active_but_local_free",
        });
      }
    } catch {
      // Silent on free-side check — not blocking.
    }
    await sleep(PER_CALL_DELAY_MS);
  }

  try {
    await supabaseAdmin.from("webhook_logs").insert({
      source: "cron_reconcile",
      event_type: "sio_reconcile",
      payload: {
        checked_paid: checkedPaid,
        checked_free_recent: checkedFree,
        discrepancy_count: discrepancies.length,
        discrepancies: discrepancies.slice(0, 100),
      },
      received_at: new Date().toISOString(),
    } as any);
  } catch {
    // table may not have these columns yet on older deploys
  }

  return NextResponse.json({
    ok: true,
    checked_paid: checkedPaid,
    checked_free_recent: checkedFree,
    discrepancies: discrepancies.length,
    duration_ms: Date.now() - startedAt,
    details: discrepancies.slice(0, 100),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
