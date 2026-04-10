// app/api/systeme-io/free-optin/route.ts
// Webhook pour les opt-in gratuits Systeme.io
// Crée le compte en plan "free" + envoie magic link

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const FREE_SECRET = (process.env.SYSTEME_IO_FREE_WEBHOOK_SECRET ?? "").trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://quiz.tipote.com").trim();

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

async function readBodyAny(req: NextRequest): Promise<Record<string, unknown> | null> {
  const raw = await req.text().catch(() => "");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {
    try {
      const params = new URLSearchParams(raw);
      const obj: Record<string, string> = {};
      let hasAny = false;
      params.forEach((v, k) => { obj[k] = v; hasAny = true; });
      return hasAny ? obj : null;
    } catch { return null; }
  }
}

function deepGet(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function pickString(body: unknown, paths: string[]): string | null {
  for (const p of paths) {
    const v = deepGet(body, p);
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
}

async function findUserByEmail(email: string) {
  const lower = email.toLowerCase();
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = (data as Record<string, unknown>)?.users as Record<string, unknown>[] ?? [];
    const found = users.find((u) => typeof u.email === "string" && (u.email as string).toLowerCase() === lower);
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function getOrCreateUser(email: string, firstName: string | null, lastName: string | null, sioContactId: string | null) {
  const existing = await findUserByEmail(email);
  if (existing) return existing.id as string;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, sio_contact_id: sioContactId },
  });
  if (error || !data?.user) throw error ?? new Error("createUser failed");
  return data.user.id as string;
}

async function upsertFreeProfile(userId: string, email: string, firstName: string | null, lastName: string | null, sioContactId: string | null) {
  const PAID_PLANS = ["lifetime", "monthly", "yearly"];

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("user_id, plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    await supabaseAdmin.from("profiles").upsert({
      user_id: userId,
      email,
      full_name: [firstName, lastName].filter(Boolean).join(" ") || null,
      first_name: firstName,
      last_name: lastName,
      sio_contact_id: sioContactId,
      plan: "free",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return;
  }

  const existingPlan = String((existing as Record<string, unknown>).plan ?? "").trim();
  if (PAID_PLANS.includes(existingPlan)) {
    // Never downgrade paid users
    console.log(`[Tiquiz free-optin] ${email} already has plan="${existingPlan}" — NOT overwriting.`);
    await supabaseAdmin.from("profiles").update({
      email,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      sio_contact_id: sioContactId || undefined,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    return;
  }

  await supabaseAdmin.from("profiles").update({
    email,
    full_name: [firstName, lastName].filter(Boolean).join(" ") || null,
    first_name: firstName,
    last_name: lastName,
    sio_contact_id: sioContactId,
    plan: "free",
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
}

async function sendMagicLink(email: string): Promise<boolean> {
  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback`,
      shouldCreateUser: false,
    },
  });
  if (error) {
    console.error("[Tiquiz free-optin] sendMagicLink error:", error);
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    error: "POST only. Use https://quiz.tipote.com/api/systeme-io/free-optin?secret=<SECRET>",
    host: req.headers.get("host"),
  }, { status: 405 });
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret") ?? "";
    if (!FREE_SECRET || secret !== FREE_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const body = await readBodyAny(req);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    // Log
    try {
      await supabaseAdmin.from("webhook_logs").insert({
        source: "systeme_io_free_optin",
        event_type: "free_optin",
        payload: body,
        received_at: new Date().toISOString(),
      });
    } catch { /* table may not exist */ }

    // Extract fields from SIO optin format (fields can be array)
    function pickFieldFromArray(fieldName: string): string | null {
      const fields = deepGet(body, "contact.fields") ?? deepGet(body, "data.contact.fields");
      if (Array.isArray(fields)) {
        const entry = (fields as Record<string, unknown>[]).find(
          (f) => f?.fieldName === fieldName || f?.slug === fieldName,
        );
        if (entry?.value) return String(entry.value).trim() || null;
      }
      return null;
    }

    const email = (pickString(body, [
      "contact.email", "data.contact.email",
      "customer.email", "data.customer.email", "email",
    ]) ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const firstName = pickFieldFromArray("first_name") ?? pickString(body, [
      "contact.fields.first_name", "customer.fields.first_name",
      "data.customer.fields.first_name", "first_name",
    ]);
    const lastName = pickFieldFromArray("last_name") ?? pickFieldFromArray("surname") ?? pickString(body, [
      "contact.fields.surname", "customer.fields.surname",
      "data.customer.fields.surname", "surname", "last_name",
    ]);
    const sioContactId = pickString(body, [
      "contact.id", "data.contact.id",
      "customer.contactId", "data.customer.contactId", "contactId",
    ]);

    const userId = await getOrCreateUser(email, firstName, lastName, sioContactId);
    await upsertFreeProfile(userId, email, firstName, lastName, sioContactId);
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
    console.error("[Tiquiz free-optin] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
