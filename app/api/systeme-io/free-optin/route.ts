// app/api/systeme-io/free-optin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

const FREE_SECRET = (process.env.SYSTEME_IO_FREE_WEBHOOK_SECRET ?? "").trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tipote.com").trim();

// client "anon" pour envoyer le magic link (utilise les templates Supabase)
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

// Systeme.io envoie parfois JSON, parfois form-urlencoded
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

async function findUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const users = (data as any)?.users ?? [];
  const lower = email.toLowerCase();
  return users.find((u: any) => typeof u.email === "string" && u.email.toLowerCase() === lower) ?? null;
}

async function getOrCreateUser(email: string, first_name: string | null, sio_contact_id: string | null) {
  const existing = await findUserByEmail(email);
  if (existing) return existing.id as string;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name, sio_contact_id },
  });

  if (error || !data?.user) throw error ?? new Error("createUser failed");
  return data.user.id as string;
}

async function upsertProfile(userId: string, email: string, first_name: string | null, sio_contact_id: string | null) {
  const { error } = await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email,
      first_name,
      sio_contact_id,
      plan: "free",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) throw error;
}

async function ensureCredits(userId: string) {
  // service_role => OK
  const { error } = await supabaseAdmin.rpc("ensure_user_credits", { p_user_id: userId });
  if (error) throw error;
}

async function sendMagicLink(email: string) {
  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback`,
      shouldCreateUser: false, // on a déjà créé le user côté admin
    },
  });
  if (error) throw error;
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret") ?? "";
    if (!FREE_SECRET || secret !== FREE_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const body = await readBodyAny(req);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const email = (pickString(body, ["data.customer.email", "customer.email", "email"]) ?? "").toLowerCase();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const firstName =
      pickString(body, ["data.customer.fields.first_name", "customer.fields.first_name", "first_name", "firstname"]) ?? null;

    const sioContactId =
      pickString(body, ["data.customer.contact_id", "customer.contact_id", "contact_id", "contactId"]) ?? null;

    const userId = await getOrCreateUser(email, firstName, sioContactId);
    await upsertProfile(userId, email, firstName, sioContactId);
    await ensureCredits(userId);
    await sendMagicLink(email);

    return NextResponse.json({
      status: "ok",
      mode: "free_optin",
      email,
      user_id: userId,
      plan: "free",
      redirected_to: `${APP_URL}/auth/callback`,
    });
  } catch (err) {
    console.error("[Systeme.io free-optin] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
