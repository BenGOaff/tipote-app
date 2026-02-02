// app/api/systeme-io/subscription-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SECRET = (process.env.SYSTEME_IO_WEBHOOK_SECRET ?? "").trim();

async function readBodyAny(req: NextRequest): Promise<any> {
  const raw = await req.text().catch(() => "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const params = new URLSearchParams(raw);
    const obj: Record<string, any> = {};
    let hasAny = false;
    params.forEach((v, k) => {
      obj[k] = v;
      hasAny = true;
    });
    return hasAny ? obj : null;
  }
}

function pick(body: any, keys: string[]) {
  for (const k of keys) {
    const v = body?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function findUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const users = (data as any)?.users ?? [];
  const lower = email.toLowerCase();
  return users.find((u: any) => typeof u.email === "string" && u.email.toLowerCase() === lower) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret") ?? "";
    if (!SECRET || secret !== SECRET) return NextResponse.json({ error: "Invalid secret" }, { status: 401 });

    const body = await readBodyAny(req);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const email = (pick(body, ["email", "customer_email", "user_email"]) ?? "").toLowerCase();
    const event = pick(body, ["event", "type", "status"]) ?? "";

    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    if (!event) return NextResponse.json({ error: "Missing event/type" }, { status: 400 });

    // retrouver user id
    const user = await findUserByEmail(email);
    if (!user?.id) return NextResponse.json({ status: "ok", ignored: true, reason: "user_not_found", email });

    const userId = user.id as string;

    // lire plan actuel
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) throw profErr;
    const currentPlan = (prof as any)?.plan as string | null;

    // beta = lifetime => jamais downgrade
    if (currentPlan === "beta") {
      return NextResponse.json({ status: "ok", ignored: true, reason: "beta_never_downgrade", email, user_id: userId });
    }

    const shouldDowngrade = ["payment_failed", "canceled", "cancelled", "vente_annulee"].includes(event.toLowerCase());

    if (!shouldDowngrade) {
      return NextResponse.json({ status: "ok", ignored: true, reason: "event_not_handled", event, email, user_id: userId });
    }

    // downgrade to free
    const { error: upErr } = await supabaseAdmin.from("profiles").upsert(
      { id: userId, email, plan: "free", updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
    if (upErr) throw upErr;

    await supabaseAdmin.rpc("admin_ensure_user_credits", { p_user_id: userId });

    return NextResponse.json({ status: "ok", action: "downgraded_to_free", email, user_id: userId, previous_plan: currentPlan });
  } catch (e: any) {
    console.error("[subscription-status] error:", e);
    return NextResponse.json({ error: "Internal error", details: String(e?.message ?? e) }, { status: 500 });
  }
}
