// app/api/systeme-io/subscription-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SALES_SECRET = (process.env.SYSTEME_IO_WEBHOOK_SECRET ?? "").trim();

const payloadSchema = z
  .object({
    email: z.string().email().optional(),
    contact_id: z.union([z.string(), z.number()]).optional(),
    event: z.enum(["canceled", "payment_failed", "refunded"]).optional(),
    // on accepte tout le reste (payload Systeme.io variable)
  })
  .passthrough();

async function readBodyAny(req: NextRequest): Promise<any> {
  const raw = await req.text().catch(() => "");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    try {
      const params = new URLSearchParams(raw);
      const obj: Record<string, any> = {};
      let hasAny = false;
      params.forEach((v, k) => {
        obj[k] = v;
        hasAny = true;
      });
      return hasAny ? obj : null;
    } catch {
      return null;
    }
  }
}

function deepGet(obj: any, path: string): any {
  if (!obj) return undefined;
  return path.split(".").reduce((acc, key) => (acc && key in acc ? acc[key] : undefined), obj);
}

function pickString(body: any, paths: string[]): string | null {
  for (const p of paths) {
    const v = deepGet(body, p);
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

async function findProfileByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,plan,sio_contact_id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function findProfileByContactId(contactId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,plan,sio_contact_id")
    .eq("sio_contact_id", contactId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function setPlan(userId: string, plan: "free") {
  const { error } = await supabaseAdmin.from("profiles").update({ plan, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
}

async function ensureCredits(userId: string) {
  const { error } = await supabaseAdmin.rpc("ensure_user_credits", { p_user_id: userId });
  if (error) throw error;
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret") ?? "";
    if (!SALES_SECRET || secret !== SALES_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const bodyAny = (await readBodyAny(req)) ?? {};

    // 1) validation soft
    const parsed = payloadSchema.safeParse(bodyAny);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    // 2) extraction robuste (racine + nested Systeme.io)
    const email =
      (parsed.data.email?.toLowerCase() ??
        pickString(bodyAny, ["data.customer.email", "customer.email", "email"]))?.toLowerCase() ?? null;

    const contactId =
      (parsed.data.contact_id !== undefined && parsed.data.contact_id !== null
        ? String(parsed.data.contact_id).trim()
        : pickString(bodyAny, ["data.customer.contact_id", "customer.contact_id", "contact_id", "contactId"])) ?? null;

    const event = parsed.data.event ?? "canceled";

    let profile = null;
    if (email) profile = await findProfileByEmail(email);
    if (!profile && contactId) profile = await findProfileByContactId(contactId);

    if (!profile?.id) {
      return NextResponse.json({ status: "ignored", reason: "profile_not_found", email, contactId, event });
    }

    // règle business: beta lifetime => jamais downgrade
    if (profile.plan === "beta") {
      return NextResponse.json({ status: "ok", action: "kept_beta", user_id: profile.id, plan: "beta", event });
    }

    await setPlan(profile.id, "free");
    await ensureCredits(profile.id);

    return NextResponse.json({
      status: "ok",
      action: "downgraded_to_free",
      user_id: profile.id,
      from: profile.plan,
      to: "free",
      event,
    });
  } catch (err) {
    console.error("[Systeme.io subscription-status] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
