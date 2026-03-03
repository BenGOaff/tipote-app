// app/api/admin/users/route.ts
// Admin Users API — list & update plans + credits
// ✅ Protégé : uniquement emails autorisés (via Supabase session cookies)
// ✅ Reads/Writes via service_role (supabaseAdmin) pour éviter RLS
// ✅ Source de vérité: public.profiles.plan

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";
import { ensureUserCredits, addBonusCredits } from "@/lib/credits";

type UserRow = {
  id: string;
  email: string | null;
  plan: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_sign_in_at: string | null;
};

const VALID_PLANS = ["free", "basic", "pro", "elite", "beta"] as const;

function normalizePlan(plan: string) {
  const p = (plan ?? "").trim().toLowerCase();
  if (VALID_PLANS.includes(p as any)) return p;
  return p || "free";
}

async function assertAdmin(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const ok = !!session?.user?.id && isAdminEmail(session?.user?.email);

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

    // Source of truth: auth.users (every buyer has an auth account).
    // We merge with profiles to get plan info.
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (authError) {
      return NextResponse.json({ ok: false, error: authError.message }, { status: 400 });
    }

    const authUsers = (authData as any)?.users ?? [];

    // Load all profiles in one query to merge
    const { data: profilesData } = await supabaseAdmin
      .from("profiles")
      .select("id,email,plan,created_at,updated_at");

    const profileById = new Map<string, any>();
    for (const p of profilesData ?? []) {
      profileById.set(p.id, p);
    }

    // Build merged user list: auth.users + profile data
    let users: UserRow[] = authUsers.map((au: any) => {
      const profile = profileById.get(au.id);
      const email = (au.email ?? profile?.email ?? "").toLowerCase();
      return {
        id: au.id,
        email: email || null,
        plan: profile?.plan ?? null,
        created_at: au.created_at ?? profile?.created_at ?? null,
        updated_at: profile?.updated_at ?? au.updated_at ?? null,
        last_sign_in_at: au.last_sign_in_at ?? null,
      };
    });

    // Filter by search query
    if (q) {
      users = users.filter(
        (u) =>
          (u.email ?? "").includes(q) ||
          u.id.toLowerCase().includes(q),
      );
    }

    // Sort: most recently updated first
    users.sort((a, b) => {
      const da = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const db = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return db - da;
    });

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

    // Also try to find user in auth.users if not found in profiles
    if (!userId && targetEmail) {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
        const authUsers = (authData as any)?.users ?? [];
        const found = authUsers.find((u: any) => (u.email ?? "").toLowerCase() === targetEmail.toLowerCase());
        if (found?.id) userId = found.id;
      } catch { /* ignore */ }
    }

    if (userId) {
      const { data: before } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", userId)
        .maybeSingle();

      oldPlan = (before?.plan ?? null) as any;

      // Use upsert to create the profile row if it doesn't exist yet
      // (happens when a user signed up but the Systeme.io webhook didn't fire)
      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert({
          id: userId,
          email: targetEmail || undefined,
          plan,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "id" });

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

    // Sync credits bucket after plan change (best-effort)
    let credits = null;
    if (userId) {
      try {
        credits = await ensureUserCredits(userId);
      } catch {
        // ignore — DB function may not exist yet
      }
    }

    return NextResponse.json({
      ok: true,
      user_id: userId || null,
      email: targetEmail || null,
      old_plan: oldPlan,
      new_plan: plan,
      credits,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PUT — Admin: create a new user (auth + profile + magic link)
// Use case: buyer purchased on Systeme.io but webhook didn't fire
export async function PUT(req: NextRequest) {
  try {
    const { ok, session } = await assertAdmin(req);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      plan?: string;
      first_name?: string;
      last_name?: string;
      send_magic_link?: boolean;
    };

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return NextResponse.json({ ok: false, error: "Email requis" }, { status: 400 });
    }

    const plan = normalizePlan(String(body?.plan ?? "beta"));
    const firstName = typeof body?.first_name === "string" ? body.first_name.trim() : null;
    const lastName = typeof body?.last_name === "string" ? body.last_name.trim() : null;
    const sendMagicLink = body?.send_magic_link !== false; // default true

    // 1. Check if user already exists in auth
    let userId = "";
    let alreadyExisted = false;

    try {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
      const authUsers = (authData as any)?.users ?? [];
      const existing = authUsers.find(
        (u: any) => (u.email ?? "").toLowerCase() === email,
      );
      if (existing?.id) {
        userId = existing.id;
        alreadyExisted = true;
      }
    } catch {
      // ignore — will try to create
    }

    // 2. Create auth user if not found
    if (!userId) {
      const { data: createdUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            source: "admin_create",
          },
        });

      if (createErr || !createdUser?.user) {
        return NextResponse.json(
          { ok: false, error: createErr?.message || "Failed to create auth user" },
          { status: 400 },
        );
      }
      userId = createdUser.user.id;
    }

    // 3. Upsert profile
    const { error: upsertErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          plan,
          first_name: firstName,
          last_name: lastName,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "id" },
      );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 400 });
    }

    // 4. Ensure credits bucket
    let credits = null;
    try {
      credits = await ensureUserCredits(userId);
    } catch {
      // ignore — DB function may not exist yet
    }

    // 5. Send magic link (so the buyer can log in immediately)
    let magicLinkSent = false;
    if (sendMagicLink) {
      try {
        const anonClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false } },
        );
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tipote.com").trim();
        const { error: otpErr } = await anonClient.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${appUrl}/auth/callback`,
            shouldCreateUser: false,
          },
        });
        magicLinkSent = !otpErr;
      } catch {
        // non-blocking
      }
    }

    // 6. Log
    try {
      await supabaseAdmin.from("plan_change_log").insert({
        actor_user_id: session?.user?.id ?? null,
        target_user_id: userId,
        target_email: email,
        old_plan: null,
        new_plan: plan,
        reason: "admin: create user",
      } as any);
    } catch {
      // ignore
    }

    return NextResponse.json({
      ok: true,
      user_id: userId,
      email,
      plan,
      already_existed: alreadyExisted,
      magic_link_sent: magicLinkSent,
      credits,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// PATCH — Admin: view credits for a user
export async function PATCH(req: NextRequest) {
  try {
    const { ok } = await assertAdmin(req);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      user_id: string;
    };

    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing user_id" }, { status: 400 });
    }

    const snapshot = await ensureUserCredits(userId);
    return NextResponse.json({ ok: true, credits: snapshot });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
