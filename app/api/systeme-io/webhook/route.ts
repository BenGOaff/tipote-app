// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tipote.com").trim();

// Client "anon" pour envoyer le magic link (utilise les templates Supabase)
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

// ---------- Zod schemas ----------

const zNumOrStr = z.union([z.number(), z.string()]);

// Payload "sale completed" (le type varie selon le trigger => on ne bloque pas dessus)
const systemeNewSaleSchema = z.object({
  type: z.string().optional(),
  data: z.object({
    customer: z.object({
      id: zNumOrStr,
      contact_id: zNumOrStr,
      email: z.string().email(),
      fields: z
        .object({
          first_name: z.string().optional(),
          surname: z.string().optional(),
          // ✅ certains setups peuvent déjà envoyer last_name
          last_name: z.string().optional(),
        })
        .catchall(z.any())
        .optional(),
    }),

    // Certains envois ont offer_price_plan OU offer_price
    offer_price_plan: z
      .object({
        id: zNumOrStr,
        name: z.string(),
        inner_name: z.string().optional().nullable(),
        type: z.string().optional(),
      })
      .optional(),

    offer_price: z
      .object({
        id: zNumOrStr,
        name: z.string().optional(),
      })
      .optional(),

    order: z
      .object({
        id: zNumOrStr,
        created_at: z.string().optional(),
      })
      .partial()
      .optional(),
  }),
});

// Ancien payload simple pour tests manuels
const simpleTestSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  sio_contact_id: z.string().optional(),
  product_id: z.string().optional(),
});

// ---------- Mapping offres Systeme.io -> plan interne ----------

// "beta" est stocké comme plan (beta = pro en accès)
export type StoredPlan = "free" | "basic" | "pro" | "elite" | "beta";

function normalizePlanFromOfferName(offer: { name: string; inner_name?: string | null }): StoredPlan | null {
  const name = `${offer.inner_name ?? ""} ${offer.name}`.toLowerCase();

  if (name.includes("beta")) return "beta";
  if (name.includes("elite")) return "elite";
  if (name.includes("essential")) return "pro"; // alias legacy
  if (name.includes("pro")) return "pro";
  if (name.includes("basic")) return "basic";
  if (name.includes("free") || name.includes("gratuit")) return "free";
  return null;
}

const OFFER_PRICE_PLAN_ID_TO_PLAN: Record<string, StoredPlan> = {
  // Offres Beta lifetime => plan "beta" en DB
  // Systeme.io peut envoyer l'ID avec préfixe "offer-price-" ou en numérique pur
  "offerprice-efbd353f": "beta",
  "offerprice-3066719": "beta",
  "offer-price-3066719": "beta",
  "offer-price-3064431": "beta",
  "3066719": "beta",
  "3064431": "beta",

  // Offres Basic
  "offer-price-2963851": "basic",
  "offer-price-3103584": "basic",
  "2963851": "basic",
  "3103584": "basic",

  // Offres Pro
  "offer-price-3103586": "pro",
  "offer-price-3103591": "pro",
  "3103586": "pro",
  "3103591": "pro",

  // Offres Elite
  "offer-price-3103592": "elite",
  "offer-price-3103593": "elite",
  "3103592": "elite",
  "3103593": "elite",
};

function inferPlanFromOffer(offer: { id: string; name: string; inner_name?: string | null }): StoredPlan | null {
  if (offer.id && offer.id in OFFER_PRICE_PLAN_ID_TO_PLAN) return OFFER_PRICE_PLAN_ID_TO_PLAN[offer.id];
  return normalizePlanFromOfferName(offer);
}

// ---------- Utils ----------

function toStringId(v: unknown): string {
  return String(v ?? "").trim();
}

function toBigIntNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  const int = Math.floor(n);
  return int > 0 ? int : null;
}

// ---------- Body parsing (JSON OU x-www-form-urlencoded) ----------
// ⚠️ NE PAS faire req.json() puis req.text() (body consommé).
async function readBodyAny(req: NextRequest): Promise<any> {
  const raw = await req.text().catch(() => "");
  if (!raw) return null;

  // 1) JSON
  try {
    return JSON.parse(raw);
  } catch {
    // 2) x-www-form-urlencoded
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

// ---------- Extraction helpers (payloads variables) ----------

function deepGet(obj: any, path: string): any {
  if (!obj) return undefined;
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return undefined;
  }
  return cur;
}

function firstDefined<T = any>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}

function extractString(body: any, paths: string[]): string | null {
  const v = firstDefined(...paths.map((p) => deepGet(body, p)));
  const s = v === undefined || v === null ? "" : String(v).trim();
  return s ? s : null;
}

function extractNumber(body: any, paths: string[]): number | null {
  const v = firstDefined(...paths.map((p) => deepGet(body, p)));
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  const int = Math.floor(n);
  return int > 0 ? int : null;
}

// ---------- Helpers Supabase ----------

// Pagination safe: search ALL auth users, not just first 1000
async function findUserByEmail(email: string) {
  const lower = email.toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[Systeme.io webhook] listUsers error:", error);
      throw error;
    }

    const users = (data as any)?.users ?? [];
    const found = users.find((u: any) => typeof u.email === "string" && u.email.toLowerCase() === lower);
    if (found) return found;

    if (users.length < perPage) break; // last page
    page += 1;
  }
  return null;
}

async function findProfileByContactId(contactId: string) {
  const cid = String(contactId ?? "").trim();
  if (!cid) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email, first_name, last_name, sio_contact_id")
    .eq("sio_contact_id", cid)
    .maybeSingle();

  if (error) {
    console.error("[Systeme.io webhook] findProfileByContactId error:", error);
    throw error;
  }

  return data ?? null;
}

async function getOrCreateSupabaseUser(params: {
  email: string;
  first_name: string | null;
  last_name: string | null;
  sio_contact_id: string | null;
}) {
  const { email, first_name, last_name, sio_contact_id } = params;

  // Strategy: try create first (fast path for new users).
  // If user already exists, fall back to search.
  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name, last_name, sio_contact_id },
  });

  if (createdUser?.user) {
    console.log(`[Systeme.io webhook] ✅ New Supabase user created: ${email}`);
    return createdUser.user.id as string;
  }

  // User already exists — find them (with pagination)
  if (createUserError?.message?.toLowerCase().includes("already been registered")) {
    console.log(`[Systeme.io webhook] User ${email} already exists, looking up…`);
    const existingUser = await findUserByEmail(email);
    if (existingUser) return existingUser.id as string;
    // Edge case: user exists in auth but findUserByEmail didn't find them
    console.error(`[Systeme.io webhook] ❌ User ${email} exists in auth but not found via listUsers`);
    throw new Error(`User ${email} exists but could not be found`);
  }

  console.error("[Systeme.io webhook] ❌ Error creating user:", createUserError);
  throw new Error(`Failed to create user: ${createUserError?.message || "Unknown error"}`);
}

async function upsertProfile(params: {
  userId: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  sio_contact_id: string | null;
  plan: StoredPlan | null;
  product_id?: string | null;
}) {
  const { userId, email, first_name, last_name, sio_contact_id, plan, product_id } = params;

  const payload: any = {
    id: userId,
    email,
    first_name,
    last_name,
    sio_contact_id,
    updated_at: new Date().toISOString(),
  };

  if (plan) payload.plan = plan;
  if (typeof product_id !== "undefined") payload.product_id = product_id;

  const { error: upsertError } = await supabaseAdmin.from("profiles").upsert(payload, { onConflict: "id" });
  if (upsertError) {
    console.error("[Systeme.io webhook] Error upserting profile:", upsertError);
    throw upsertError;
  }
}

// Best effort: met en place/actualise le bucket crédits selon le plan (logique DB)
async function ensureUserCredits(userId: string) {
  try {
    await supabaseAdmin.rpc("ensure_user_credits", { p_user_id: userId });
  } catch (e) {
    console.error("[Systeme.io webhook] ensure_user_credits error:", e);
  }
}

// Envoie un magic link de connexion au client après l'achat
async function sendMagicLink(email: string) {
  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${APP_URL}/auth/callback`,
      shouldCreateUser: false, // user déjà créé via admin.createUser
    },
  });
  if (error) {
    console.error("[Systeme.io webhook] sendMagicLink error:", error);
    // Non-blocking: le user existe quand même, il pourra se connecter via "mot de passe oublié"
  }
}

// ---------- GET = diagnostic only ----------
// ⚠️ If Systeme.io hits GET instead of POST, the webhook body is lost.
// This happens when the webhook URL points to tipote.com/www.tipote.com
// instead of app.tipote.com (the actual Next.js server).
export async function GET(req: NextRequest) {
  console.warn(
    `[Systeme.io webhook] ⚠️ GET request received (expected POST). ` +
    `Host: ${req.headers.get("host")} — Webhook URL must point to app.tipote.com`,
  );

  return NextResponse.json(
    {
      error: "This endpoint only accepts POST requests from Systeme.io webhooks. " +
        "If you are seeing this, the webhook URL may be misconfigured. " +
        "Use https://app.tipote.com/api/systeme-io/webhook (not tipote.com or www.tipote.com).",
      route: "/api/systeme-io/webhook",
      host: req.headers.get("host"),
      method: "GET",
      expected_method: "POST",
      now: new Date().toISOString(),
    },
    { status: 405 },
  );
}

// ---------- Handler principal ----------

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret");
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const rawBody = await readBodyAny(req);

    // Log every incoming webhook call for debugging (helps trace missed buyers)
    console.log(
      `[Systeme.io webhook] Incoming request — type=${rawBody?.type ?? "unknown"} email=${rawBody?.data?.customer?.email ?? rawBody?.email ?? "?"}`,
    );

    if (!rawBody) {
      console.error("[Systeme.io webhook] Could not parse body", {
        contentType: req.headers.get("content-type"),
      });
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    // Best-effort: log raw payload to webhook_logs table for audit
    try {
      await supabaseAdmin.from("webhook_logs").insert({
        source: "systeme_io",
        event_type: rawBody?.type ?? null,
        payload: rawBody,
        received_at: new Date().toISOString(),
      } as any);
    } catch {
      // table may not exist — that's fine
    }

    const parsedSysteme = systemeNewSaleSchema.safeParse(rawBody);
    const systemeData = parsedSysteme.success ? parsedSysteme.data.data : null;

    const emailMaybe = systemeData?.customer?.email ?? extractString(rawBody, ["data.customer.email", "customer.email", "email"]);
    const email = emailMaybe ? String(emailMaybe).toLowerCase() : null;

    let firstName =
      systemeData?.customer?.fields?.first_name ??
      extractString(rawBody, ["data.customer.fields.first_name", "customer.fields.first_name", "first_name", "firstname"]) ??
      null;

    // ✅ last_name (Systeme.io => souvent surname)
    let lastName =
      systemeData?.customer?.fields?.last_name ??
      systemeData?.customer?.fields?.surname ??
      extractString(rawBody, [
        "data.customer.fields.last_name",
        "data.customer.fields.surname",
        "customer.fields.last_name",
        "customer.fields.surname",
        "last_name",
        "surname",
      ]) ??
      null;

    const sioContactId =
      (systemeData?.customer?.contact_id !== undefined && systemeData?.customer?.contact_id !== null
        ? toStringId(systemeData.customer.contact_id)
        : extractString(rawBody, ["data.customer.contact_id", "data.customer.contactId", "customer.contact_id", "contact_id", "contactId"])) ?? null;

    const offerId = toStringId(
      systemeData?.offer_price_plan?.id ??
        systemeData?.offer_price?.id ??
        extractString(rawBody, [
          "data.offer_price_plan.id",
          "data.offer_price.id",
          "offer_price_plan.id",
          "offer_price.id",
          "offer_id",
          "product_id",
          "price_id",
        ]) ??
        "",
    );

    const offerName =
      systemeData?.offer_price_plan?.name ??
      systemeData?.offer_price?.name ??
      extractString(rawBody, ["data.offer_price_plan.name", "data.offer_price.name", "offer_price_plan.name", "offer_price.name"]) ??
      "Unknown";

    const offerInner =
      systemeData?.offer_price_plan?.inner_name ??
      extractString(rawBody, ["data.offer_price_plan.inner_name", "offer_price_plan.inner_name"]) ??
      null;

    const orderId = toBigIntNumber(
      systemeData?.order?.id ?? extractNumber(rawBody, ["data.order.id", "order.id", "order_id", "orderId"]) ?? null,
    );

    // Fallback: si email absent, on tente via sio_contact_id -> profiles
    let resolvedEmail = email;
    let resolvedUserId: string | null = null;

    if (!resolvedEmail && sioContactId) {
      const prof = await findProfileByContactId(sioContactId);
      if (prof?.id) {
        resolvedUserId = prof.id as string;
        resolvedEmail = (prof.email as string | null)?.toLowerCase() ?? null;
        if (!firstName) firstName = (prof.first_name as string | null) ?? null;
        if (!lastName) lastName = (prof.last_name as string | null) ?? null;
      }
    }

    if (resolvedEmail) {
      const userId =
        resolvedUserId ??
        (await getOrCreateSupabaseUser({
          email: resolvedEmail,
          first_name: firstName,
          last_name: lastName,
          sio_contact_id: sioContactId,
        }));

      let plan = inferPlanFromOffer({ id: offerId, name: offerName, inner_name: offerInner });

      // Log when plan cannot be determined — helps debug installment payment IDs
      if (!plan) {
        // Check if user already has a plan in the DB
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("plan")
          .eq("id", userId)
          .maybeSingle();

        const existingPlan = (existingProfile?.plan ?? "").toString().trim();

        if (existingPlan && existingPlan !== "free") {
          // User already has a paid plan — keep it
          console.warn(
            `[Systeme.io webhook] ⚠️ Could not infer plan from offer_id="${offerId}" name="${offerName}" inner="${offerInner}". User ${resolvedEmail} keeps existing plan="${existingPlan}".`,
          );
        } else {
          // Unknown offer — do NOT default to a paid plan. Keep as free.
          // Admin can manually assign the correct plan after checking webhook_logs.
          console.error(
            `[Systeme.io webhook] ❌ Could not infer plan from offer_id="${offerId}" name="${offerName}" inner="${offerInner}". User ${resolvedEmail} stays "free". Check OFFER_PRICE_PLAN_ID_TO_PLAN mapping.`,
          );
        }
      } else {
        console.log(
          `[Systeme.io webhook] ✅ Plan inferred: ${plan} from offer_id="${offerId}" name="${offerName}"`,
        );
      }

      await upsertProfile({
        userId,
        email: resolvedEmail,
        first_name: firstName,
        last_name: lastName,
        sio_contact_id: sioContactId,
        plan,
        product_id: offerId || null,
      });

      // ✅ Pas de bonus via webhook. Les crédits sont gérés par ensure_user_credits (DB).
      await ensureUserCredits(userId);

      // ✅ Envoie le magic link de connexion au client
      await sendMagicLink(resolvedEmail);

      return NextResponse.json({
        status: "ok",
        action: "profile_updated",
        email: resolvedEmail,
        user_id: userId,
        plan,
        product_id: offerId || null,
        order_id: orderId,
        magic_link_sent: true,
      });
    }

    // payload simple test
    const parsedSimple = simpleTestSchema.safeParse(rawBody);
    if (parsedSimple.success) {
      const { email, first_name, last_name, sio_contact_id, product_id } = parsedSimple.data;

      const plan: StoredPlan | null =
        product_id === "prod_basic_1"
          ? "basic"
          : product_id === "prod_essential_1"
            ? "pro"
            : product_id === "prod_pro_1"
              ? "pro"
              : product_id === "prod_elite_1"
                ? "elite"
                : null;

      const userId = await getOrCreateSupabaseUser({
        email: email.toLowerCase(),
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        sio_contact_id: sio_contact_id ?? null,
      });

      await upsertProfile({
        userId,
        email: email.toLowerCase(),
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        sio_contact_id: sio_contact_id ?? null,
        plan,
        product_id: product_id ?? null,
      });

      await ensureUserCredits(userId);

      // ✅ Envoie le magic link de connexion au client
      await sendMagicLink(email.toLowerCase());

      return NextResponse.json({
        status: "ok",
        mode: "simple_test",
        email: email.toLowerCase(),
        user_id: userId,
        plan,
        product_id,
        magic_link_sent: true,
      });
    }

    console.error("[Systeme.io webhook] Unsupported payload", rawBody);
    return NextResponse.json({ error: "Unsupported payload" }, { status: 400 });
  } catch (err) {
    console.error("[Systeme.io webhook] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
