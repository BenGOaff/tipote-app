// app/api/admin/users/route.ts
// Admin Users API — list & update plans
// ✅ Protégé : uniquement hello@ethilife.fr (via Supabase session cookies)
// ✅ Reads/Writes via service_role (supabaseAdmin) pour éviter RLS
// ✅ Source de vérité: public.profiles.plan

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ADMIN_EMAIL = "hello@ethilife.fr";

type UserRow = {
  id: string;
  email: string | null;
  plan: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizePlan(plan: string) {
  const p = (plan ?? "").trim().toLowerCase();
  if (p === "free" || p === "basic" || p === "pro" || p === "elite") return p;
  return p || "free";
}

async function assertAdmin(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const email = (session?.user?.email ?? "").toLowerCase();
  const ok = !!session?.user?.id && email === ADMIN_EMAIL.toLowerCase();

  return { ok, session };
}

export async function GET(req: NextRequest) {
  try {
    const { ok } = await assertAdmin(req);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

    let query = supabaseAdmin
      .from("profiles")
      .select("id,email,plan,created_at,updated_at")
      .order("updated_at", { ascending: false });

    if (q) {
      query = query.ilike("email", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const users = (data ?? []) as UserRow[];

    return NextResponse.json({ ok: true, users });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ok, session } = await assertAdmin(req);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      user_id?: string;
      email?: string;
      plan?: string;
      reason?: string;
    };

    const targetUserId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const targetEmail = typeof body?.email === "string" ? body.email.trim() : "";
    const plan = normalizePlan(String(body?.plan ?? "free"));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "admin switch";

    if (!targetUserId && !targetEmail) {
      return NextResponse.json({ ok: false, error: "Missing user_id or email" }, { status: 400 });
    }

    let userId = targetUserId;

    if (!userId && targetEmail) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", targetEmail)
        .maybeSingle();

      if (prof?.id) {
        userId = String(prof.id);
      }
    }

    let oldPlan: string | null = null;

    if (userId) {
      const { data: before } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .maybeSingle();

      oldPlan = (before?.plan ?? null) as any;

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ plan, updated_at: new Date().toISOString() } as any)
        .eq("id", userId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
    } else {
      const { data: before } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("email", targetEmail)
        .maybeSingle();

      oldPlan = (before?.plan ?? null) as any;

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ plan, updated_at: new Date().toISOString() } as any)
        .eq("email", targetEmail);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      }
    }

    // Best-effort log si table existe
    try {
      await supabaseAdmin.from("plan_change_log").insert({
        actor_user_id: session?.user?.id ?? null,
        target_user_id: userId || null,
        target_email: targetEmail || null,
        old_plan: oldPlan,
        new_plan: plan,
        reason,
      } as any);
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      user_id: userId || null,
      email: targetEmail || null,
      old_plan: oldPlan,
      new_plan: plan,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
