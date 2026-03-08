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

// ✅ Schema conforme au vrai payload Systeme.io (doc officielle)
// Les champs sont à la RACINE (pas de wrapper "data"), et les noms sont en camelCase.
const systemeNewSaleSchema = z.object({
  customer: z.object({
    id: zNumOrStr,
    contactId: zNumOrStr,
    email: z.string().email(),
    fields: z
      .object({
        first_name: z.string().optional().nullable(),
        surname: z.string().optional().nullable(),
        company_name: z.string().optional().nullable(),
      })
      .catchall(z.any())
      .optional(),
  }),

  pricePlan: z
    .object({
      id: zNumOrStr,
      name: z.string().optional(),
      innerName: z.string().optional().nullable(),
      type: z.string().optional(),
    })
    .optional(),

  order: z
    .object({
      id: zNumOrStr,
      createdAt: z.string().optional(),
    })
    .partial()
    .optional(),
}).passthrough();

// Legacy schema : ancien format avec wrapper "data" (rétro-compat)
const legacyNewSaleSchema = z.object({
  type: z.string().optional(),
  data: z.object({
    customer: z.object({
      id: zNumOrStr,
      contact_id: zNumOrStr.optional(),
      contactId: zNumOrStr.optional(),
      email: z.string().email(),
      fields: z
        .object({
          first_name: z.string().optional().nullable(),
          surname: z.string().optional().nullable(),
        })
        .catchall(z.any())
        .optional(),
    }),

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

    pricePlan: z
      .object({
        id: zNumOrStr,
        name: z.string().optional(),
        innerName: z.string().optional().nullable(),
        type: z.string().optional(),
      })
      .optional(),

    order: z
      .object({
        id: zNumOrStr,
        created_at: z.string().optional(),
        createdAt: z.string().optional(),
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

const OFFER_PRICE_PLAN_ID_TO_PLAN: Record<string, StoredPlan> = {
  // Offres Beta lifetime => plan "beta" en DB
  // Systeme.io envoie pricePlan.id en numérique (ex: 3064431)
  // On mappe toutes les variantes possibles (avec/sans préfixe)
  "offerprice-efbd353f": "beta",
  "offerprice-3066719": "beta",
  "offer-price-3066719": "beta",
  "offer-price-3064431": "beta",
  "3066719": "beta",
  "3064431": "beta",

  // Offres Basic
  "offer-price-2963851": "basic",
  "offer-price-3134002": "basic",
  "offer-price-3103584": "basic",
  "2963851": "basic",
  "3134002": "basic",
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

/**
 * Normalize an offer ID to maximize matching chances.
 * Systeme.io can send IDs in various formats:
 *   "offer-price-3064431", "offer_price-3064431", "offerPrice-3064431",
 *   "offerprice-3064431", "3064431", 3064431 (number)
 * We try: raw → stripped prefix → numeric-only extraction.
 */
function normalizeOfferId(raw: string): string[] {
  const id = raw.trim();
  if (!id) return [];

  const candidates: string[] = [id];

  // Try lowercase
  const lower = id.toLowerCase();
  if (lower !== id) candidates.push(lower);

  // Strip common prefixes (offer-price-, offer_price-, offerprice-)
  const stripped = lower
    .replace(/^offer[-_]?price[-_]?/i, "")
    .replace(/^offerprice[-_]?/i, "");
  if (stripped && stripped !== lower) {
    candidates.push(stripped);
    // Also add with prefix (the map has both forms)
    candidates.push(`offer-price-${stripped}`);
  }

  // Extract pure numeric part
  const numMatch = id.match(/(\d{5,})/);
  if (numMatch) {
    candidates.push(numMatch[1]);
    candidates.push(`offer-price-${numMatch[1]}`);
  }

  // De-duplicate
  return [...new Set(candidates)];
}

function inferPlanFromOffer(offerId: string): StoredPlan | null {
  // Matching uniquement par ID — on a toutes les offres Systeme.io mappées.
  // Pas de fallback par nom : c'est fragile et inutile.
  if (!offerId) return null;
  for (const candidate of normalizeOfferId(offerId)) {
    if (candidate in OFFER_PRICE_PLAN_ID_TO_PLAN) return OFFER_PRICE_PLAN_ID_TO_PLAN[candidate];
  }
  return null;
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

  // ⚠️ NEVER upsert a profile without an explicitly resolved plan.
  // If plan is null, the caller MUST handle it (skip upsert, flag for manual review).
  if (!plan) {
    throw new Error(
      `[Systeme.io webhook] ❌ REFUSED to upsert profile for ${email}: plan is null. ` +
      `This webhook will NOT assign a plan without explicit resolution. Requires manual review.`,
    );
  }
  payload.plan = plan;
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
      `[Systeme.io webhook] Incoming request — email=${rawBody?.customer?.email ?? rawBody?.data?.customer?.email ?? rawBody?.email ?? "?"} pricePlan.id=${rawBody?.pricePlan?.id ?? rawBody?.data?.pricePlan?.id ?? rawBody?.data?.offer_price_plan?.id ?? "?"}`,
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

    // ✅ Try both formats: real Systeme.io (root-level) and legacy (data-wrapped)
    const parsedSysteme = systemeNewSaleSchema.safeParse(rawBody);
    const parsedLegacy = !parsedSysteme.success ? legacyNewSaleSchema.safeParse(rawBody) : null;

    // Données structurées (nouveau format = racine, ancien = sous data)
    const saleCustomer = parsedSysteme.success
      ? parsedSysteme.data.customer
      : parsedLegacy?.success
        ? parsedLegacy.data.data.customer
        : null;

    const salePricePlan = parsedSysteme.success
      ? parsedSysteme.data.pricePlan
      : parsedLegacy?.success
        ? (parsedLegacy.data.data.pricePlan ?? parsedLegacy.data.data.offer_price_plan)
        : null;

    const saleOrder = parsedSysteme.success
      ? parsedSysteme.data.order
      : parsedLegacy?.success
        ? parsedLegacy.data.data.order
        : null;

    // ✅ Email : Zod parsé → fallback deep extraction (tous formats possibles)
    const emailMaybe = saleCustomer?.email ?? extractString(rawBody, [
      "customer.email",
      "data.customer.email",
      "email",
    ]);
    const email = emailMaybe ? String(emailMaybe).toLowerCase() : null;

    let firstName =
      saleCustomer?.fields?.first_name ??
      extractString(rawBody, [
        "customer.fields.first_name",
        "data.customer.fields.first_name",
        "first_name",
        "firstname",
      ]) ??
      null;

    // ✅ last_name (Systeme.io => souvent surname)
    let lastName =
      saleCustomer?.fields?.surname ??
      extractString(rawBody, [
        "customer.fields.surname",
        "customer.fields.last_name",
        "data.customer.fields.surname",
        "data.customer.fields.last_name",
        "surname",
        "last_name",
      ]) ??
      null;

    // ✅ contactId : Systeme.io envoie "contactId" (camelCase) à la racine de customer
    const sioContactId = toStringId(
      saleCustomer?.contactId ??
      (saleCustomer as any)?.contact_id ??
      extractString(rawBody, [
        "customer.contactId",
        "customer.contact_id",
        "data.customer.contactId",
        "data.customer.contact_id",
        "contactId",
        "contact_id",
      ]) ??
      "",
    ) || null;

    // ✅ CRITICAL FIX: Systeme.io envoie le plan dans "pricePlan.id" (pas "offer_price_plan.id")
    const offerId = toStringId(
      salePricePlan?.id ??
        extractString(rawBody, [
          "pricePlan.id",
          "data.pricePlan.id",
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
      salePricePlan?.name ??
      extractString(rawBody, [
        "pricePlan.name",
        "data.pricePlan.name",
        "data.offer_price_plan.name",
        "data.offer_price.name",
        "offer_price_plan.name",
        "offer_price.name",
      ]) ??
      "Unknown";

    const offerInner =
      (salePricePlan as any)?.innerName ??
      (salePricePlan as any)?.inner_name ??
      extractString(rawBody, [
        "pricePlan.innerName",
        "data.pricePlan.innerName",
        "data.offer_price_plan.inner_name",
        "offer_price_plan.inner_name",
      ]) ??
      null;

    const orderId = toBigIntNumber(
      saleOrder?.id ?? extractNumber(rawBody, ["order.id", "data.order.id", "order_id", "orderId"]) ?? null,
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

      let plan = inferPlanFromOffer(offerId);

      // ⚠️ CRITICAL: If we can't infer the plan, we REFUSE to assign one.
      // No guessing, no defaults. The profile is NOT updated until an admin resolves it.
      if (!plan) {
        // Check if user already has a paid plan in the DB — keep it if so
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("plan")
          .eq("id", userId)
          .maybeSingle();

        const existingPlan = (existingProfile?.plan ?? "").toString().trim();

        if (existingPlan && existingPlan !== "free") {
          // User already has a paid plan — keep it (don't downgrade or change)
          plan = existingPlan as StoredPlan;
          console.warn(
            `[Systeme.io webhook] ⚠️ Could not infer plan from offer_id="${offerId}" name="${offerName}" inner="${offerInner}". ` +
            `User ${resolvedEmail} keeps existing plan="${existingPlan}". ` +
            `RAW offer data: ${JSON.stringify({ offer_price_plan: rawBody?.data?.offer_price_plan, offer_price: rawBody?.data?.offer_price })}`,
          );
        } else {
          // ⚠️ CANNOT determine plan AND user has no existing paid plan.
          // SAFETY NET: Default to "beta" (the minimum paid plan) so paying customers
          // are NEVER left without access. Log for admin review to adjust if needed.
          plan = "beta";
          console.warn(
            `[Systeme.io webhook] ⚠️ SAFETY NET: Could not infer plan from offer_id="${offerId}" name="${offerName}" inner="${offerInner}". ` +
            `User ${resolvedEmail} defaulted to "beta" (minimum paid plan). Admin should review & add offer mapping. ` +
            `RAW offer data: ${JSON.stringify({ offer_price_plan: rawBody?.data?.offer_price_plan, offer_price: rawBody?.data?.offer_price })} ` +
            `FULL PAYLOAD KEYS: ${JSON.stringify(Object.keys(rawBody?.data ?? {}))}`,
          );

          // Log to webhook_logs with a clear flag for manual review
          try {
            await supabaseAdmin.from("webhook_logs").insert({
              source: "systeme_io",
              event_type: "PLAN_DEFAULTED_TO_BETA",
              payload: {
                email: resolvedEmail,
                user_id: userId,
                offer_id: offerId,
                offer_name: offerName,
                offer_inner: offerInner,
                order_id: orderId,
                raw_offer_data: {
                  offer_price_plan: rawBody?.data?.offer_price_plan,
                  offer_price: rawBody?.data?.offer_price,
                },
                defaulted_plan: "beta",
                requires_review: true,
              },
              received_at: new Date().toISOString(),
            } as any);
          } catch {
            // table may not exist
          }
        }
      } else {
        console.log(
          `[Systeme.io webhook] ✅ Plan inferred: ${plan} from offer_id="${offerId}" name="${offerName}"`,
        );
      }

      // Lire l'ancien plan AVANT upsert (pour le log d'audit)
      let oldPlan: string | null = null;
      try {
        const { data: existingBefore } = await supabaseAdmin
          .from("profiles")
          .select("plan")
          .eq("id", userId)
          .maybeSingle();
        oldPlan = existingBefore?.plan ?? null;
      } catch { /* best effort */ }

      await upsertProfile({
        userId,
        email: resolvedEmail,
        first_name: firstName,
        last_name: lastName,
        sio_contact_id: sioContactId,
        plan,
        product_id: offerId || null,
      });

      // ✅ Audit: log le changement de plan (comme le dashboard admin)
      if (plan !== oldPlan) {
        try {
          await supabaseAdmin.from("plan_change_log").insert({
            target_user_id: userId,
            target_email: resolvedEmail,
            old_plan: oldPlan,
            new_plan: plan,
            reason: "systeme_io webhook",
          } as any);
        } catch { /* best effort */ }
      }

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

      // ❌ Simple test payload must also have an explicit plan
      if (!plan) {
        console.error(
          `[Systeme.io webhook] ❌ Simple test payload for ${email} has unrecognized product_id="${product_id}". ` +
          `Profile NOT updated. Add this product_id to the mapping.`,
        );
        return NextResponse.json({
          status: "warning",
          action: "plan_not_resolved",
          requires_manual_review: true,
          mode: "simple_test",
          email: email.toLowerCase(),
          product_id: product_id ?? null,
          message: "Unrecognized product_id — cannot determine plan. Profile NOT updated.",
        });
      }

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
