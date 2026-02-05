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
  const payload: Record<string, any> = {
    id: userId,
    email,
    first_name,
    last_name,
    sio_contact_id,
    plan: "free",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("profiles").upsert(payload, { onConflict: "id" });
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

    // Systeme.io opt-in: parfois "email", parfois nested
    const emailRaw = pickString(body, ["data.customer.email", "customer.email", "email", "Email"]) ?? "";
    const email = emailRaw.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const firstName =
      pickString(body, [
        "data.customer.fields.first_name",
        "customer.fields.first_name",
        "first_name",
        "firstname",
        "Prenom",
      ]) ?? null;

    // ✅ Ajout last_name (Systeme.io le met souvent dans "surname")
    const lastName =
      pickString(body, [
        "data.customer.fields.last_name",
        "data.customer.fields.surname",
        "customer.fields.last_name",
        "customer.fields.surname",
        "last_name",
        "surname",
        "Nom",
      ]) ?? null;

    const sioContactId =
      pickString(body, ["data.customer.contact_id", "customer.contact_id", "contact_id", "contactId"]) ?? null;

    const userId = await getOrCreateUser(email, firstName, lastName, sioContactId);

    // IMPORTANT: on force plan=free (opt-in free)
    await upsertProfile(userId, email, firstName, lastName, sioContactId);

    // DB = source de vérité des crédits (inclut free one-shot)
    await ensureCredits(userId);

    // Magic link
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
