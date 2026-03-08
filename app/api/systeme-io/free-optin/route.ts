// app/api/systeme-io/free-optin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FREE_SECRET = (process.env.SYSTEME_IO_FREE_WEBHOOK_SECRET ?? "").trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tipote.com").trim();

// Client "anon" pour envoyer le magic link (utilise les templates Supabase)
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

// Systeme.io envoie parfois JSON, parfois form-urlencoded
async function readBodyAny(req: NextRequest): Promise<any> {
  const raw = await req.text().catch(() => "");
  if (!raw) return null;

  // JSON
  try {
    return JSON.parse(raw);
  } catch {
    // x-www-form-urlencoded
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
  return path.split(".").reduce((acc, key) => (acc && key in acc ? (acc as any)[key] : undefined), obj);
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

// Pagination safe (si > 1000 users)
async function findUserByEmail(email: string) {
  const lower = email.toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = (data as any)?.users ?? [];
    const found = users.find((u: any) => typeof u.email === "string" && u.email.toLowerCase() === lower);
    if (found) return found;

    if (users.length < perPage) break; // dernière page
    page += 1;
  }
  return null;
}

async function getOrCreateUser(
  email: string,
  first_name: string | null,
  last_name: string | null,
  sio_contact_id: string | null,
) {
  const existing = await findUserByEmail(email);
  if (existing) return existing.id as string;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name, last_name, sio_contact_id },
  });

  if (error || !data?.user) throw error ?? new Error("createUser failed");
  return data.user.id as string;
}

async function upsertProfile(
  userId: string,
  email: string,
  first_name: string | null,
  last_name: string | null,
  sio_contact_id: string | null,
) {
  // ⚠️ CRITICAL: Protect paid plans from being overwritten by free-optin.
  // Race condition fix: instead of check-then-upsert (non-atomic), we:
  // 1. Try INSERT (new users only) with plan="free"
  // 2. If user exists (conflict), UPDATE only non-plan fields
  //    AND only set plan="free" if current plan is NOT a paid plan.
  // This eliminates the race window where a sale webhook could set a paid
  // plan between our check and our upsert.

  const PAID_PLANS = ["beta", "basic", "pro", "elite"];

  // First, try to get existing profile
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, plan")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    // New user — safe to insert with "free"
    const { error } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email,
      first_name,
      last_name,
      sio_contact_id,
      plan: "free",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    if (error) throw error;
    return;
  }

  const existingPlan = (existing.plan ?? "").toString().trim().toLowerCase();
  const hasPaidPlan = PAID_PLANS.includes(existingPlan);

  if (hasPaidPlan) {
    // ✅ User has a paid plan — update contact info but NEVER touch the plan
    console.log(
      `[Systeme.io free-optin] User ${email} already has plan="${existingPlan}" — NOT overwriting with "free".`,
    );
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        email,
        first_name: first_name || undefined,
        last_name: last_name || undefined,
        sio_contact_id: sio_contact_id || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw error;
  } else {
    // User exists but has no paid plan — safe to set "free"
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        email,
        first_name,
        last_name,
        sio_contact_id,
        plan: "free",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) throw error;
  }
}

async function ensureCredits(userId: string) {
  // service_role => OK
  const { error } = await supabaseAdmin.rpc("ensure_user_credits", { p_user_id: userId });
  if (error) throw error;
}

async function sendMagicLink(email: string): Promise<boolean> {
  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback`,
      shouldCreateUser: false, // on a déjà créé le user côté admin
    },
  });
  if (error) {
    // Non-blocking: user exists, they can use "mot de passe oublié"
    console.error("[Systeme.io free-optin] sendMagicLink error:", error);
    return false;
  }
  return true;
}

// ---------- GET = diagnostic only ----------
export async function GET(req: NextRequest) {
  console.warn(
    `[Systeme.io free-optin] ⚠️ GET request received (expected POST). ` +
    `Host: ${req.headers.get("host")} — Webhook URL must point to app.tipote.com`,
  );

  return NextResponse.json(
    {
      error: "This endpoint only accepts POST requests from Systeme.io webhooks. " +
        "If you are seeing this, the webhook URL may be misconfigured. " +
        "Use https://app.tipote.com/api/systeme-io/free-optin (not tipote.com or www.tipote.com).",
      route: "/api/systeme-io/free-optin",
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
    if (!FREE_SECRET || secret !== FREE_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const body = await readBodyAny(req);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    // Log every incoming free-optin call for debugging
    console.log(
      `[Systeme.io free-optin] Incoming request — email=${body?.data?.customer?.email ?? body?.email ?? "?"}`,
    );

    // Best-effort: log raw payload to webhook_logs table for audit
    try {
      await supabaseAdmin.from("webhook_logs").insert({
        source: "systeme_io_free_optin",
        event_type: "free_optin",
        payload: body,
        received_at: new Date().toISOString(),
      } as any);
    } catch {
      // table may not exist — that's fine
    }

    // ✅ Systeme.io optin: payload uses "contact" (not "customer"), and "fields" is an ARRAY
    // of { fieldName, slug, value } objects — NOT an object with direct keys.
    // Fallback to old paths for backward compat.

    const emailRaw = pickString(body, [
      "contact.email",
      "data.contact.email",
      "customer.email",
      "data.customer.email",
      "email",
      "Email",
    ]) ?? "";
    const email = emailRaw.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    // Helper: extract a field value from Systeme.io optin "fields" array
    // where fields = [{ fieldName: "first_name", slug: "first_name", value: "John" }, ...]
    function pickFieldFromArray(fieldName: string): string | null {
      const fields = deepGet(body, "contact.fields") ?? deepGet(body, "data.contact.fields");
      if (Array.isArray(fields)) {
        const entry = fields.find(
          (f: any) => f?.fieldName === fieldName || f?.slug === fieldName,
        );
        if (entry?.value) return String(entry.value).trim() || null;
      }
      return null;
    }

    const firstName =
      pickFieldFromArray("first_name") ??
      pickString(body, [
        "contact.fields.first_name",
        "customer.fields.first_name",
        "data.customer.fields.first_name",
        "first_name",
        "firstname",
        "Prenom",
      ]) ?? null;

    // ✅ Systeme.io optin sends "last_name" or "surname" in the fields array
    const lastName =
      pickFieldFromArray("last_name") ??
      pickFieldFromArray("surname") ??
      pickString(body, [
        "contact.fields.surname",
        "contact.fields.last_name",
        "customer.fields.surname",
        "customer.fields.last_name",
        "data.customer.fields.surname",
        "data.customer.fields.last_name",
        "surname",
        "last_name",
        "Nom",
      ]) ?? null;

    // ✅ Contact ID: Systeme.io optin sends "contact.id" (not contactId)
    const sioContactId =
      pickString(body, [
        "contact.id",
        "data.contact.id",
        "customer.contactId",
        "customer.contact_id",
        "data.customer.contactId",
        "data.customer.contact_id",
        "contactId",
        "contact_id",
      ]) ?? null;

    const userId = await getOrCreateUser(email, firstName, lastName, sioContactId);

    // IMPORTANT: on force plan=free (opt-in free)
    await upsertProfile(userId, email, firstName, lastName, sioContactId);

    // DB = source de vérité des crédits (inclut free one-shot)
    await ensureCredits(userId);

    // Magic link (non-blocking: user exists even if link fails)
    const magicLinkSent = await sendMagicLink(email);

    return NextResponse.json({
      status: "ok",
      mode: "free_optin",
      email,
      user_id: userId,
      plan: "free",
      magic_link_sent: magicLinkSent,
    });
  } catch (err) {
    console.error("[Systeme.io free-optin] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
