// app/api/systeme-io/webhook/route.ts
// Webhook pour les ventes Systeme.io (NEW_SALE, SALE_CANCELED)
// Crée le compte Supabase + profil + envoie magic link

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://quiz.tipote.com").trim();

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

// ---------- Plans Tiquiz ----------

export type TiquizPlan = "free" | "lifetime" | "monthly" | "yearly";

// Placeholder mapping — remplace les IDs quand tes bons de commande SIO sont créés
const OFFER_ID_TO_PLAN: Record<string, TiquizPlan> = {
  // Tiquiz Lifetime 57€
  "PLACEHOLDER_LIFETIME_OFFER_ID": "lifetime",
  // Tiquiz Mensuel 9€/mois
  "PLACEHOLDER_MONTHLY_OFFER_ID": "monthly",
  // Tiquiz Annuel 90€/an
  "PLACEHOLDER_YEARLY_OFFER_ID": "yearly",
};

function normalizeOfferId(raw: string): string[] {
  const id = raw.trim();
  if (!id) return [];
  const candidates: string[] = [id];
  const lower = id.toLowerCase();
  if (lower !== id) candidates.push(lower);
  const stripped = lower.replace(/^offer[-_]?price[-_]?/i, "").replace(/^offerprice[-_]?/i, "");
  if (stripped && stripped !== lower) {
    candidates.push(stripped);
    candidates.push(`offer-price-${stripped}`);
  }
  const numMatch = id.match(/(\d{5,})/);
  if (numMatch) {
    candidates.push(numMatch[1]);
    candidates.push(`offer-price-${numMatch[1]}`);
  }
  return [...new Set(candidates)];
}

function inferPlan(offerId: string): TiquizPlan | null {
  if (!offerId) return null;
  for (const candidate of normalizeOfferId(offerId)) {
    if (candidate in OFFER_ID_TO_PLAN) return OFFER_ID_TO_PLAN[candidate];
  }
  return null;
}

// ---------- Body parsing ----------

async function readBodyAny(req: NextRequest): Promise<Record<string, unknown> | null> {
  const raw = await req.text().catch(() => "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      const params = new URLSearchParams(raw);
      const obj: Record<string, string> = {};
      let hasAny = false;
      params.forEach((v, k) => { obj[k] = v; hasAny = true; });
      return hasAny ? obj : null;
    } catch {
      return null;
    }
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

// ---------- Supabase helpers ----------

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
  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, sio_contact_id: sioContactId },
  });
  if (createdUser?.user) {
    console.log(`[Tiquiz webhook] New user created: ${email}`);
    return createdUser.user.id as string;
  }
  if (createError?.message?.toLowerCase().includes("already been registered")) {
    const existing = await findUserByEmail(email);
    if (existing) return existing.id as string;
    throw new Error(`User ${email} exists but not found`);
  }
  throw new Error(`Failed to create user: ${createError?.message}`);
}

async function upsertProfile(params: {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  sioContactId: string | null;
  plan: TiquizPlan;
  productId?: string | null;
}) {
  const { userId, email, firstName, lastName, sioContactId, plan, productId } = params;
  const { error } = await supabaseAdmin.from("profiles").upsert({
    user_id: userId,
    email,
    full_name: [firstName, lastName].filter(Boolean).join(" ") || null,
    first_name: firstName,
    last_name: lastName,
    sio_contact_id: sioContactId,
    plan,
    product_id: productId ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
}

async function sendMagicLink(email: string) {
  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback`,
      shouldCreateUser: false,
    },
  });
  if (error) console.error("[Tiquiz webhook] sendMagicLink error:", error);
}

// ---------- GET diagnostic ----------

export async function GET(req: NextRequest) {
  return NextResponse.json({
    error: "POST only. Use https://quiz.tipote.com/api/systeme-io/webhook?secret=<SECRET>",
    host: req.headers.get("host"),
    method: "GET",
  }, { status: 405 });
}

// ---------- POST handler ----------

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret");
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const body = await readBodyAny(req);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    // Log to webhook_logs
    try {
      await supabaseAdmin.from("webhook_logs").insert({
        source: "systeme_io",
        event_type: pickString(body, ["type", "event"]) ?? "unknown",
        payload: body,
        received_at: new Date().toISOString(),
      });
    } catch { /* table may not exist */ }

    // Detect event type
    const eventType = pickString(body, ["type", "event"])?.toLowerCase() ?? "";

    // ── SALE_CANCELED ──
    if (eventType.includes("cancel")) {
      const email = pickString(body, [
        "customer.email", "data.customer.email", "email",
      ]);
      if (email) {
        const user = await findUserByEmail(email.toLowerCase());
        if (user) {
          // Check if lifetime (never downgrade lifetime)
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("plan")
            .eq("user_id", user.id as string)
            .maybeSingle();
          if ((profile as Record<string, unknown>)?.plan !== "lifetime") {
            await supabaseAdmin
              .from("profiles")
              .update({ plan: "free", updated_at: new Date().toISOString() })
              .eq("user_id", user.id as string);
            console.log(`[Tiquiz webhook] Downgraded ${email} to free`);
          }
        }
      }
      return NextResponse.json({ status: "ok", action: "canceled" });
    }

    // ── NEW_SALE ──
    const email = pickString(body, [
      "customer.email", "data.customer.email", "email",
    ]);
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const firstName = pickString(body, [
      "customer.fields.first_name", "data.customer.fields.first_name", "first_name",
    ]);
    const lastName = pickString(body, [
      "customer.fields.surname", "customer.fields.last_name",
      "data.customer.fields.surname", "data.customer.fields.last_name",
      "surname", "last_name",
    ]);
    const sioContactId = pickString(body, [
      "customer.contactId", "customer.contact_id",
      "data.customer.contactId", "data.customer.contact_id",
      "contactId", "contact_id",
    ]);
    const offerId = pickString(body, [
      "pricePlan.id", "data.pricePlan.id",
      "data.offer_price_plan.id", "data.offer_price.id",
      "offer_id", "product_id",
    ]) ?? "";

    let plan = inferPlan(offerId);

    // Safety net: if can't infer plan, default to lifetime (paying customer)
    if (!plan) {
      plan = "lifetime";
      console.warn(
        `[Tiquiz webhook] Could not infer plan from offer_id="${offerId}". ` +
        `Defaulted to "lifetime" for ${email}. Add offer mapping.`,
      );
    }

    const userId = await getOrCreateUser(email.toLowerCase(), firstName, lastName, sioContactId);
    await upsertProfile({
      userId,
      email: email.toLowerCase(),
      firstName,
      lastName,
      sioContactId,
      plan,
      productId: offerId || null,
    });

    await sendMagicLink(email.toLowerCase());

    return NextResponse.json({
      status: "ok",
      action: "profile_updated",
      email: email.toLowerCase(),
      user_id: userId,
      plan,
      magic_link_sent: true,
    });
  } catch (err) {
    console.error("[Tiquiz webhook] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
