// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;

// ---------- Zod schemas ----------

const zNumOrStr = z.union([z.number(), z.string()]);

// Vrai payload "NEW SALE" de Systeme.io
const systemeNewSaleSchema = z.object({
  type: z.literal("customer.sale.completed"),
  data: z.object({
    customer: z.object({
      id: zNumOrStr,
      contact_id: zNumOrStr,
      email: z.string().email(),
      fields: z
        .object({
          first_name: z.string().optional(),
          surname: z.string().optional(),
        })
        .catchall(z.any())
        .optional(),
    }),

    // ✅ Certains envois peuvent avoir offer_price_plan OU offer_price
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

// Ancien payload simple pour nos tests manuels
const simpleTestSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  sio_contact_id: z.string().optional(),
  product_id: z.string().optional(),
});

// ---------- Mapping offres Systeme.io -> plan interne ----------

type StoredPlan = "free" | "basic" | "pro" | "elite";

function normalizePlanFromOfferName(offer: { name: string; inner_name?: string | null }): StoredPlan | null {
  const name = `${offer.inner_name ?? ""} ${offer.name}`.toLowerCase();

  if (name.includes("elite")) return "elite";
  if (name.includes("essential")) return "pro"; // alias legacy
  if (name.includes("pro")) return "pro";
  if (name.includes("basic")) return "basic";
  if (name.includes("free") || name.includes("gratuit")) return "free";
  return null;
}

const OFFER_PRICE_PLAN_ID_TO_PLAN: Record<string, StoredPlan> = {
  // Exemple :
  // "offer-price-123": "basic",
};

function inferPlanFromOffer(offer: { id: string; name: string; inner_name?: string | null }): StoredPlan | null {
  if (offer.id && offer.id in OFFER_PRICE_PLAN_ID_TO_PLAN) return OFFER_PRICE_PLAN_ID_TO_PLAN[offer.id];
  return normalizePlanFromOfferName(offer);
}

// ---------- Credits packs (price_id -> credits) ----------

// nouveau naming
const PACK_STARTER_PRICE_ID = (process.env.SIO_CREDITS_PACK_STARTER_PRICE_ID ?? "").trim();
const PACK_STANDARD_PRICE_ID = (process.env.SIO_CREDITS_PACK_STANDARD_PRICE_ID ?? "").trim();
const PACK_PRO_PRICE_ID = (process.env.SIO_CREDITS_PACK_PRO_PRICE_ID ?? "").trim();

// legacy naming
const PRICE_ID_25_LEGACY = (process.env.SIO_CREDITS_PACK_25_PRICE_ID ?? "").trim();
const PRICE_ID_100_LEGACY = (process.env.SIO_CREDITS_PACK_100_PRICE_ID ?? "").trim();
const PRICE_ID_250_LEGACY = (process.env.SIO_CREDITS_PACK_250_PRICE_ID ?? "").trim();

type CreditPackName = "starter" | "standard" | "pro";

function creditsPackFromPriceId(priceId: string): { pack: CreditPackName; credits: number } | null {
  if (!priceId) return null;

  if (PACK_STARTER_PRICE_ID && priceId === PACK_STARTER_PRICE_ID) return { pack: "starter", credits: 25 };
  if (PACK_STANDARD_PRICE_ID && priceId === PACK_STANDARD_PRICE_ID) return { pack: "standard", credits: 100 };
  if (PACK_PRO_PRICE_ID && priceId === PACK_PRO_PRICE_ID) return { pack: "pro", credits: 250 };

  if (PRICE_ID_25_LEGACY && priceId === PRICE_ID_25_LEGACY) return { pack: "starter", credits: 25 };
  if (PRICE_ID_100_LEGACY && priceId === PRICE_ID_100_LEGACY) return { pack: "standard", credits: 100 };
  if (PRICE_ID_250_LEGACY && priceId === PRICE_ID_250_LEGACY) return { pack: "pro", credits: 250 };

  return null;
}

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

async function readBodyAny(req: NextRequest): Promise<any> {
  // JSON
  try {
    return await req.json();
  } catch {
    // ignore
  }

  // raw text -> json OR form-encoded
  const raw = await req.text().catch(() => "");
  if (!raw) return null;

  // json string
  try {
    return JSON.parse(raw);
  } catch {
    // form urlencoded
    try {
      const params = new URLSearchParams(raw);
      const obj: Record<string, any> = {};
      params.forEach((v, k) => {
        obj[k] = v;
      });
      return obj;
    } catch {
      return null;
    }
  }
}

// ---------- Helpers Supabase ----------

async function findUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    console.error("[Systeme.io webhook] listUsers error:", error);
    throw error;
  }

  const users = (data as any)?.users ?? [];
  const lower = email.toLowerCase();
  return users.find((u: any) => typeof u.email === "string" && u.email.toLowerCase() === lower) ?? null;
}

async function getOrCreateSupabaseUser(params: { email: string; first_name: string | null; sio_contact_id: string | null }) {
  const { email, first_name, sio_contact_id } = params;

  const existingUser = await findUserByEmail(email);
  if (existingUser) return existingUser.id as string;

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name, sio_contact_id },
  });

  if (createUserError || !createdUser?.user) {
    console.error("[Systeme.io webhook] Error creating user:", createUserError);
    throw new Error("Failed to create user");
  }

  return createdUser.user.id as string;
}

async function upsertProfile(params: {
  userId: string;
  email: string;
  first_name: string | null;
  sio_contact_id: string | null;
  plan: StoredPlan | null;
  product_id?: string | null;
}) {
  const { userId, email, first_name, sio_contact_id, plan, product_id } = params;

  const payload: any = {
    id: userId,
    email,
    first_name,
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

async function addPurchasedCreditsLegacy(params: { userId: string; credits: number; source: string }) {
  const { userId, credits, source } = params;

  const existing = await supabaseAdmin
    .from("user_credits")
    .select("user_id, bonus_credits_total, bonus_credits_used, monthly_credits_total, monthly_credits_used")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing.error) {
    console.error("[Systeme.io webhook] read user_credits error:", existing.error);
  }

  const row = (existing.data as any) ?? null;
  const bonusTotal = Number(row?.bonus_credits_total ?? 0);
  const bonusUsed = Number(row?.bonus_credits_used ?? 0);
  const monthlyTotal = Number(row?.monthly_credits_total ?? 0);
  const monthlyUsed = Number(row?.monthly_credits_used ?? 0);

  const nextBonusTotal = Math.max(0, bonusTotal + credits);

  const { error: upsertErr } = await supabaseAdmin.from("user_credits").upsert(
    {
      user_id: userId,
      monthly_credits_total: monthlyTotal,
      monthly_credits_used: monthlyUsed,
      bonus_credits_total: nextBonusTotal,
      bonus_credits_used: bonusUsed,
      updated_at: now,
    } as any,
    { onConflict: "user_id" },
  );

  if (upsertErr) {
    console.error("[Systeme.io webhook] upsert user_credits error:", upsertErr);
    throw upsertErr;
  }

  try {
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: userId,
      amount: credits,
      kind: "purchase",
      source,
      created_at: now,
    } as any);
  } catch {
    // ignore
  }
}

async function grantCreditsIdempotent(params: { userId: string; credits: number; orderId: number | null; source: string }) {
  const { userId, credits, orderId, source } = params;

  if (!orderId || orderId <= 0) {
    console.warn("[Systeme.io webhook] Missing/invalid order.id for credits pack — fallback legacy credit.", {
      user_id: userId,
      credits,
      source,
      orderId,
    });
    await addPurchasedCreditsLegacy({ userId, credits, source: `${source}:legacy_no_order` });
    return { mode: "legacy_no_order", granted: true };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("grant_bonus_credits_from_order", {
      p_user_id: userId,
      p_credits: credits,
      p_order_id: orderId,
    });

    if (error) {
      console.error("[Systeme.io webhook] RPC grant_bonus_credits_from_order error:", error);
      throw error;
    }

    const inserted = Boolean(data);

    if (inserted) {
      try {
        await supabaseAdmin.from("credit_transactions").insert({
          user_id: userId,
          amount: credits,
          kind: "purchase",
          source,
          created_at: new Date().toISOString(),
        } as any);
      } catch {
        // ignore
      }
    }

    return { mode: "rpc_idempotent", granted: inserted };
  } catch {
    console.warn("[Systeme.io webhook] Falling back to legacy credit upsert.", { user_id: userId, credits, source });
    await addPurchasedCreditsLegacy({ userId, credits, source: `${source}:legacy_fallback` });
    return { mode: "legacy_fallback", granted: true };
  }
}

// ---------- Handler principal ----------

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret");

    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const rawBody = await readBodyAny(req);

    if (!rawBody) {
      console.error("[Systeme.io webhook] Could not parse body");
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    console.log("[Systeme.io webhook] Incoming payload", {
      topLevelKeys: Object.keys(rawBody ?? {}),
      type: (rawBody as any)?.type,
    });

    const parsedSysteme = systemeNewSaleSchema.safeParse(rawBody);

    if (parsedSysteme.success) {
      const { data } = parsedSysteme.data;

      const email = data.customer.email.toLowerCase();
      const firstName = data.customer.fields?.first_name ?? null;
      const sioContactId = toStringId(data.customer.contact_id);

      // ✅ Priorité: offer_price_plan.id, sinon offer_price.id
      const offerId = toStringId(data.offer_price_plan?.id ?? data.offer_price?.id ?? "");
      const offerName = data.offer_price_plan?.name ?? data.offer_price?.name ?? "Unknown";
      const offerInner = data.offer_price_plan?.inner_name ?? null;

      const orderId = toBigIntNumber(data.order?.id ?? null);

      console.log("[Systeme.io webhook] Parsed sale", { email, offerId, offerName, orderId });

      const userId = await getOrCreateSupabaseUser({
        email,
        first_name: firstName,
        sio_contact_id: sioContactId,
      });

      const plan = inferPlanFromOffer({ id: offerId, name: offerName, inner_name: offerInner });

      await upsertProfile({
        userId,
        email,
        first_name: firstName,
        sio_contact_id: sioContactId,
        plan,
        product_id: offerId || null,
      });

      const pack = creditsPackFromPriceId(offerId);
      if (pack) {
        const source = `systemeio:price_id:${offerId}`;

        const res = await grantCreditsIdempotent({
          userId,
          credits: pack.credits,
          orderId,
          source,
        });

        return NextResponse.json({
          status: "ok",
          mode: "systeme_new_sale",
          action: res.granted ? "credits_granted" : "credits_already_granted",
          email,
          user_id: userId,
          credits_added: res.granted ? pack.credits : 0,
          pack: pack.pack,
          price_id: offerId,
          order_id: orderId,
          credit_mode: res.mode,
        });
      }

      return NextResponse.json({
        status: "ok",
        mode: "systeme_new_sale",
        action: "profile_updated",
        email,
        user_id: userId,
        plan,
        product_id: offerId || null,
      });
    }

    const parsedSimple = simpleTestSchema.safeParse(rawBody);

    if (parsedSimple.success) {
      const { email, first_name, sio_contact_id, product_id } = parsedSimple.data;

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
        sio_contact_id: sio_contact_id ?? null,
      });

      await upsertProfile({
        userId,
        email: email.toLowerCase(),
        first_name: first_name ?? null,
        sio_contact_id: sio_contact_id ?? null,
        plan,
        product_id: product_id ?? null,
      });

      return NextResponse.json({
        status: "ok",
        mode: "simple_test",
        email: email.toLowerCase(),
        user_id: userId,
        plan,
        product_id,
      });
    }

    console.error("[Systeme.io webhook] Payload does not match any known schema", rawBody);
    return NextResponse.json({ error: "Unsupported payload" }, { status: 400 });
  } catch (err) {
    console.error("[Systeme.io webhook] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
