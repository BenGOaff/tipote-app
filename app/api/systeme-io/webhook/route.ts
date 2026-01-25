// app/api/systeme-io/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const WEBHOOK_SECRET = process.env.SYSTEME_IO_WEBHOOK_SECRET;

// ---------- Zod schemas ----------

// Vrai payload "NEW SALE" de Systeme.io
const systemeNewSaleSchema = z.object({
  type: z.literal("customer.sale.completed"),
  data: z.object({
    customer: z.object({
      id: z.number(),
      contact_id: z.number(),
      email: z.string().email(),
      fields: z
        .object({
          first_name: z.string().optional(),
          surname: z.string().optional(),
        })
        .catchall(z.any())
        .optional(),
    }),
    offer_price_plan: z.object({
      id: z.number(),
      name: z.string(),
      inner_name: z.string().optional().nullable(),
      type: z.string(),
    }),
    order: z
      .object({
        id: z.number(),
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

type InternalPlan = "basic" | "essential" | "elite";

// À remplir si un jour tu veux mapper par ID d’offer_price_plan
const OFFER_PRICE_PLAN_ID_TO_PLAN: Record<number, InternalPlan> = {
  // Exemple :
  // 2962438: "basic",
  // 2962440: "essential",
  // 2962442: "elite",
};

function inferPlanFromOffer(offer: { id: number; name: string; inner_name?: string | null }): InternalPlan | null {
  if (offer.id in OFFER_PRICE_PLAN_ID_TO_PLAN) {
    return OFFER_PRICE_PLAN_ID_TO_PLAN[offer.id];
  }

  const name = `${offer.inner_name ?? ""} ${offer.name}`.toLowerCase();
  if (name.includes("basic")) return "basic";
  if (name.includes("essential")) return "essential";
  if (name.includes("elite")) return "elite";
  return null;
}

// ---------- Credits packs (offer_price_plan.id -> credits) ----------

function toInt(v: string | undefined): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.floor(n) : null;
}

const PRICE_ID_25 = toInt(process.env.SIO_CREDITS_PACK_25_PRICE_ID ?? undefined);
const PRICE_ID_100 = toInt(process.env.SIO_CREDITS_PACK_100_PRICE_ID ?? undefined);
const PRICE_ID_250 = toInt(process.env.SIO_CREDITS_PACK_250_PRICE_ID ?? undefined);

function creditsForOfferPricePlanId(priceId: number): number | null {
  if (PRICE_ID_25 && priceId === PRICE_ID_25) return 25;
  if (PRICE_ID_100 && priceId === PRICE_ID_100) return 100;
  if (PRICE_ID_250 && priceId === PRICE_ID_250) return 250;
  return null;
}

// ---------- Helpers Supabase ----------

async function findUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

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
    user_metadata: {
      first_name,
      sio_contact_id,
    },
  });

  if (createUserError || !createdUser?.user) {
    console.error("[Systeme.io webhook] Error creating user:", createUserError);
    throw new Error("Failed to create user");
  }

  return createdUser.user.id as string;
}

/**
 * Upsert du profil dans la table public.profiles
 * ⚠️ Important : ne pas écraser plan en NULL si ce n’est pas un achat d’abonnement.
 */
async function upsertProfile(params: {
  userId: string;
  email: string;
  first_name: string | null;
  sio_contact_id: string | null;
  plan: InternalPlan | null;
  product_id?: string | null;
}) {
  const { userId, email, first_name, sio_contact_id, plan, product_id } = params;

  // Lire plan existant pour éviter de le remettre à null
  let planToStore: InternalPlan | null = plan;
  if (!planToStore) {
    const existing = await supabaseAdmin.from("profiles").select("plan").eq("id", userId).maybeSingle();
    if (!existing.error) {
      planToStore = ((existing.data as any)?.plan as InternalPlan | null) ?? null;
    }
  }

  const payload: any = {
    id: userId,
    email,
    first_name,
    sio_contact_id,
    updated_at: new Date().toISOString(),
  };

  // On met plan seulement si on a quelque chose (ou qu’il existait)
  payload.plan = planToStore;

  // product_id : on le stocke si fourni (ex: l’offer_price_plan.id)
  if (typeof product_id !== "undefined") payload.product_id = product_id;

  const { error: upsertError } = await supabaseAdmin.from("profiles").upsert(payload, { onConflict: "id" });

  if (upsertError) {
    console.error("[Systeme.io webhook] Error upserting profile:", upsertError);
    throw upsertError;
  }
}

/**
 * Ajoute X crédits achetés dans public.user_credits (bonus_credits_total)
 * (fail-safe : crée la ligne si elle n’existe pas)
 */
async function addPurchasedCredits(params: { userId: string; credits: number; source: string }) {
  const { userId, credits, source } = params;

  // 1) Lire existant
  const existing = await supabaseAdmin
    .from("user_credits")
    .select("user_id, bonus_credits_total, bonus_credits_used, monthly_credits_total, monthly_credits_used")
    .eq("user_id", userId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing.error) {
    console.error("[Systeme.io webhook] read user_credits error:", existing.error);
    // On tente quand même un upsert simple (sans lecture)
  }

  const row = (existing.data as any) ?? null;
  const bonusTotal = Number(row?.bonus_credits_total ?? 0);
  const bonusUsed = Number(row?.bonus_credits_used ?? 0);
  const monthlyTotal = Number(row?.monthly_credits_total ?? 0);
  const monthlyUsed = Number(row?.monthly_credits_used ?? 0);

  const nextBonusTotal = Math.max(0, bonusTotal + credits);

  // 2) Upsert (crée si absent)
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

  // 3) (optionnel) Audit dans credit_transactions si la table/colonnes matchent
  // -> fail-open : si ça échoue, on ne bloque pas le crédit
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

// ---------- Handler principal ----------

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret");

    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Invalid or missing secret" }, { status: 401 });
    }

    const rawBody = await req.json();
    console.log("[Systeme.io webhook] Incoming payload", {
      topLevelKeys: Object.keys(rawBody ?? {}),
      type: rawBody?.type,
    });

    // 1) Essai avec le vrai payload Systeme.io
    const parsedSysteme = systemeNewSaleSchema.safeParse(rawBody);

    if (parsedSysteme.success) {
      const { data } = parsedSysteme.data;

      const email = data.customer.email.toLowerCase();
      const firstName = data.customer.fields?.first_name ?? null;
      const sioContactId = String(data.customer.contact_id);
      const offer = data.offer_price_plan;

      const userId = await getOrCreateSupabaseUser({
        email,
        first_name: firstName,
        sio_contact_id: sioContactId,
      });

      // 1.a) Toujours upsert profile (mais sans casser le plan si null)
      const plan = inferPlanFromOffer(offer);
      await upsertProfile({
        userId,
        email,
        first_name: firstName,
        sio_contact_id: sioContactId,
        plan,
        product_id: String(offer.id),
      });

      // 1.b) Si c’est un pack crédits -> on crédite
      const credits = creditsForOfferPricePlanId(offer.id);
      if (credits && credits > 0) {
        await addPurchasedCredits({
          userId,
          credits,
          source: `systemeio:offer_price_plan:${offer.id}`,
        });

        return NextResponse.json({
          status: "ok",
          mode: "systeme_new_sale",
          action: "credits_granted",
          email,
          user_id: userId,
          credits_added: credits,
          offer_price_plan_id: offer.id,
        });
      }

      // Sinon : comportement historique (abonnements / autres offres)
      return NextResponse.json({
        status: "ok",
        mode: "systeme_new_sale",
        action: "profile_updated",
        email,
        user_id: userId,
        plan,
        product_id: String(offer.id),
      });
    }

    // 2) Sinon, essai avec le format simple pour tests manuels
    const parsedSimple = simpleTestSchema.safeParse(rawBody);

    if (parsedSimple.success) {
      const { email, first_name, sio_contact_id, product_id } = parsedSimple.data;

      const plan: InternalPlan | null =
        product_id === "prod_basic_1"
          ? "basic"
          : product_id === "prod_essential_1"
            ? "essential"
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
