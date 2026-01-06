// app/api/onboarding/answers/route.ts
// Save onboarding answers into `public.business_profiles` (one row per user_id)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const GenderSchema = z
  .enum(["masculin", "feminin", "non_genre", "prefere_ne_pas_repondre"])
  .or(z.literal(""))
  .default("");

const NicheSchema = z.enum(["argent", "sante_bien_etre", "dev_perso", "relations"]).or(z.literal("")).default("");

const BusinessTypeSchema = z
  .enum(["physique", "coaching", "formation", "saas", "freelance", "ecommerce", "autre"])
  .or(z.literal(""))
  .default("");

const RevenueMaturitySchema = z.enum(["0-500", "500-5000", "5000+"]).or(z.literal("")).default("");

const ContentPreferenceSchema = z.enum(["ecriture", "video"]).or(z.literal("")).default("");

const OnboardingSchema = z.object({
  // Step 1
  firstName: z.string().default(""),
  ageRange: z.string().default(""),
  gender: GenderSchema,
  country: z.string().default(""),

  // Step 2
  niche: NicheSchema,
  personaQuestion: z.string().default(""),
  businessType: BusinessTypeSchema,
  businessTypeOther: z.string().default(""),
  revenueMaturity: RevenueMaturitySchema,

  audienceSocial: z.string().default(""),
  audienceEmail: z.string().default(""),

  hasOffers: z.boolean().default(false),
  offerPriceRange: z.string().default(""),
  offerSalesCount: z.string().default(""),
  salesPageUrl: z.string().default(""),

  toolsUsed: z.array(z.string()).default([]),
  toolsOther: z.string().default(""),

  timeAvailable: z.string().default(""),

  // Step 3
  monthlyNetGoal: z.string().default(""),
  psychologicalGoals: z.array(z.string()).default([]),
  psychologicalGoalsOther: z.string().default(""),

  contentPreference: ContentPreferenceSchema,
  preferredTone: z.string().default(""),
});

function cleanNullableString(v: unknown) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function cleanString(v: unknown) {
  if (typeof v !== "string") return "";
  return v.trim();
}

function toIntOrNull(v: string) {
  const n = Number(String(v).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (Number.isNaN(n)) return null;
  return n;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const raw = await req.json();
    const parsed = OnboardingSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const d = parsed.data;

    // Store offers info as JSONB (column exists in your screenshot)
    const offers = {
      has_offers: Boolean(d.hasOffers),
      offer_price_range: cleanNullableString(d.offerPriceRange),
      offer_sales_count: cleanNullableString(d.offerSalesCount),
      sales_page_url: cleanNullableString(d.salesPageUrl),
    };

    // Tools: keep list, add "other" if provided
    const tools_used = Array.isArray(d.toolsUsed) ? d.toolsUsed : [];
    const tools_other = cleanNullableString(d.toolsOther);
    const tools_payload = tools_other ? { tools_used, tools_other } : { tools_used };

    // camelCase (front) -> snake_case (DB)
    const row: Record<string, unknown> = {
      user_id: user.id,

      // Step 1
      first_name: cleanString(d.firstName),
      age_range: cleanNullableString(d.ageRange),
      gender: d.gender || null,
      country: cleanString(d.country),

      // Step 2
      niche: cleanString(d.niche),
      mission: cleanString(d.personaQuestion), // ✅ CDC persona question -> mission (col exists)
      business_maturity: cleanString(d.revenueMaturity),

      // Audience (columns from your screenshot: audience_soci, audience_ema)
      audience_soci: toIntOrNull(d.audienceSocial),
      audience_ema: toIntOrNull(d.audienceEmail),

      time_available: cleanString(d.timeAvailable),

      // Offers (jsonb col exists)
      offers,

      // Step 3 (map on closest existing cols)
      main_goal: cleanNullableString(d.monthlyNetGoal),
      main_goals: d.psychologicalGoals ?? [],
      main_goals_ot: cleanNullableString(d.psychologicalGoalsOther),

      preferred_con: tools_payload, // ✅ store tools payload in existing json-ish slot if present
      tone_preferen: cleanNullableString(d.preferredTone),

      // Add context (business type etc)
      additional_cor: cleanNullableString(
        JSON.stringify(
          {
            business_type: d.businessType,
            business_type_other: d.businessTypeOther || null,
            content_preference: d.contentPreference,
          },
          null,
          0,
        ),
      ),

      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await supabase
      .from("business_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, profile: saved ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
