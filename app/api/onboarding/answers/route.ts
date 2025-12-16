// app/api/onboarding/answers/route.ts
// Save onboarding answers into `public.business_profiles` (one row per user_id)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const SocialLinksSchema = z
  .object({
    instagram: z.string().optional().nullable(),
    tiktok: z.string().optional().nullable(),
    linkedin: z.string().optional().nullable(),
    youtube: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
  })
  .partial();

const OnboardingSchema = z
  .object({
    // Q1–Q10 (as used by app/onboarding/OnboardingForm.tsx)
    firstName: z.string().min(1),
    ageRange: z.string().min(1),
    gender: z.string().min(1),
    country: z.string().min(1),

    niche: z.string().min(1),
    nicheOther: z.string().optional().nullable(),

    mission: z.string().min(1),
    businessMaturity: z.string().min(1),

    offersStatus: z.string().min(1),
    offerNames: z.string().optional().nullable(),
    offerPriceRange: z.string().optional().nullable(),
    offerDelivery: z.string().optional().nullable(),

    audienceSize: z.string().min(1),
    emailListSize: z.string().min(1),
    timeAvailable: z.string().min(1),

    mainGoals: z.array(z.string()).default([]),
    mainGoalsOther: z.string().optional().nullable(),

    preferredContentTypes: z.array(z.string()).default([]),
    tonePreference: z.string().min(1),

    socialLinks: SocialLinksSchema.default({}),

    hasExistingBranding: z.boolean().default(false),

    biggestBlocker: z.string().min(1),
    additionalContext: z.string().optional().nullable(),
  })
  // allow extra fields without breaking (future-proof)
  .passthrough();

function cleanNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

// We store array/object-ish fields as JSON strings so it works even if DB columns are `text`.
function asJsonText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, profile: data ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
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

    // camelCase (front) -> snake_case (DB)
    const row: Record<string, unknown> = {
      user_id: auth.user.id,

      first_name: d.firstName,
      age_range: d.ageRange,
      gender: d.gender,
      country: d.country,

      niche: d.niche,
      niche_other: cleanNullableString(d.nicheOther),

      mission: d.mission,
      business_maturity: d.businessMaturity,

      offers_status: d.offersStatus,
      offer_names: cleanNullableString(d.offerNames),
      offer_price_range: cleanNullableString(d.offerPriceRange),
      offer_delivery: cleanNullableString(d.offerDelivery),

      audience_size: d.audienceSize,
      email_list_size: d.emailListSize,
      time_available: d.timeAvailable,

      main_goals: asJsonText(d.mainGoals),
      main_goals_other: cleanNullableString(d.mainGoalsOther),

      preferred_content_types: asJsonText(d.preferredContentTypes),
      tone_preference: d.tonePreference,

      social_links: asJsonText(d.socialLinks),

      has_existing_branding: d.hasExistingBranding,

      biggest_blocker: d.biggestBlocker,
      additional_context: cleanNullableString(d.additionalContext),

      updated_at: new Date().toISOString(),
    };

    // Upsert: one row per user_id
    const { data, error } = await supabase
      .from("business_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, profile: data ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
