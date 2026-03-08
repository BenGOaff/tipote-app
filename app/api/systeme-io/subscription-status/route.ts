// app/api/systeme-io/subscription-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SALES_SECRET = (process.env.SYSTEME_IO_WEBHOOK_SECRET ?? "").trim();

// ✅ Legacy schema (si le payload a email/event à la racine)
const legacyPayloadSchema = z
  .object({
    email: z.string().email().optional(),
    contact_id: z.union([z.string(), z.number()]).optional(),
    event: z.enum(["canceled", "payment_failed", "refunded"]).optional(),
  })
  .passthrough();

// ✅ Vrai schema Systeme.io "sale canceled" (identique au "new sale")
const systemePayloadSchema = z
  .object({
    customer: z.object({
      id: z.union([z.string(), z.number()]),
      contactId: z.union([z.string(), z.number()]),
      email: z.string().email(),
    }).passthrough(),
    pricePlan: z.object({
      id: z.union([z.string(), z.number()]),
      name: z.string().optional(),
      type: z.string().optional(),
    }).passthrough().optional(),
    order: z.object({
      id: z.union([z.string(), z.number()]),
    }).passthrough().optional(),
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

// ---------- GET = diagnostic only ----------
export async function GET(req: NextRequest) {
  console.warn(
    `[Systeme.io subscription-status] ⚠️ GET request received (expected POST). ` +
    `Host: ${req.headers.get("host")} — Webhook URL must point to app.tipote.com`,
  );

  return NextResponse.json(
    {
      error: "This endpoint only accepts POST requests from Systeme.io webhooks. " +
        "If you are seeing this, the webhook URL may be misconfigured. " +
        "Use https://app.tipote.com/api/systeme-io/subscription-status (not tipote.com or www.tipote.com).",
      route: "/api/systeme-io/subscription-status",
      host: req.headers.get("host"),
      method: "GET",
      expected_method: "POST",
      now: new Date().toISOString(),
    },
    { status: 405 },
  );
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret") ?? "";
    if (!SALES_SECRET || secret !== SALES_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const bodyAny = (await readBodyAny(req)) ?? {};

    // Log every incoming subscription-status call for debugging
    console.log(
      `[Systeme.io subscription-status] Incoming request — raw keys: ${JSON.stringify(Object.keys(bodyAny))}`,
    );

    // Best-effort: log raw payload to webhook_logs table for audit
    try {
      await supabaseAdmin.from("webhook_logs").insert({
        source: "systeme_io_subscription_status",
        event_type: "subscription_status",
        payload: bodyAny,
        received_at: new Date().toISOString(),
      } as any);
    } catch {
      // table may not exist — that's fine
    }

    // ✅ Try both schemas: real Systeme.io format (customer at root) and legacy (email at root)
    const parsedSysteme = systemePayloadSchema.safeParse(bodyAny);
    const parsedLegacy = !parsedSysteme.success ? legacyPayloadSchema.safeParse(bodyAny) : null;

    // ✅ Extraction robuste : Systeme.io "sale canceled" a le même format que "new sale"
    const email = (
      (parsedSysteme.success ? parsedSysteme.data.customer.email : null) ??
      (parsedLegacy?.success ? parsedLegacy.data.email : null) ??
      pickString(bodyAny, ["customer.email", "data.customer.email", "email"])
    )?.toLowerCase() ?? null;

    const contactId = (
      (parsedSysteme.success ? String(parsedSysteme.data.customer.contactId).trim() : null) ??
      (parsedLegacy?.success && parsedLegacy.data.contact_id != null
        ? String(parsedLegacy.data.contact_id).trim()
        : null) ??
      pickString(bodyAny, [
        "customer.contactId",
        "customer.contact_id",
        "data.customer.contactId",
        "data.customer.contact_id",
        "contactId",
        "contact_id",
      ])
    ) ?? null;

    const event = (parsedLegacy?.success ? parsedLegacy.data.event : null) ??
      pickString(bodyAny, ["event"]) ??
      "canceled";

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
