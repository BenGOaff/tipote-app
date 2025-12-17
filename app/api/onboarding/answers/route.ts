// app/api/onboarding/answers/route.ts
// Save onboarding answers into `public.business_profiles` (one row per user_id)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const AgeRangeSchema = z.enum(["18-24", "25-34", "35-44", "45-54", "55+"]).or(z.literal("")).default("");
const GenderSchema = z
  .enum(["feminin", "masculin", "non_genre", "prefere_ne_pas_repondre"])
  .or(z.literal(""))
  .default("");

const SocialLinksSchema = z
  .object({
    instagram: z.string().optional().nullable(),
    tiktok: z.string().optional().nullable(),
    linkedin: z.string().optional().nullable(),
    youtube: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
  })
  .partial();

const OnboardingSchema = z.object({
  firstName: z.string().default(""),
  ageRange: AgeRangeSchema,
  gender: GenderSchema,
  country: z.string().default(""),

  niche: z.string().default(""),
  nicheOther: z.string().default(""),
  mission: z.string().default(""),

  businessMaturity: z.string().default(""),
  offersStatus: z.string().default(""),

  offerNames: z.string().default(""),
  offerPriceRange: z.string().default(""),
  offerDelivery: z.string().default(""),

  audienceSize: z.string().default(""),
  emailListSize: z.string().default(""),
  timeAvailable: z.string().default(""),

  mainGoals: z.array(z.string()).default([]),
  mainGoalsOther: z.string().default(""),

  preferredContentTypes: z.array(z.string()).default([]),
  tonePreference: z.string().default(""),

  instagramUrl: z.string().default(""),
  tiktokUrl: z.string().default(""),
  linkedinUrl: z.string().default(""),
  youtubeUrl: z.string().default(""),
  websiteUrl: z.string().default(""),

  hasExistingBranding: z.boolean().default(false),

  biggestBlocker: z.string().default(""),
  additionalContext: z.string().default(""),
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

    const social_links = SocialLinksSchema.parse({
      instagram: cleanNullableString(d.instagramUrl),
      tiktok: cleanNullableString(d.tiktokUrl),
      linkedin: cleanNullableString(d.linkedinUrl),
      youtube: cleanNullableString(d.youtubeUrl),
      website: cleanNullableString(d.websiteUrl),
    });

    // camelCase (front) -> snake_case (DB)
    const row: Record<string, unknown> = {
      user_id: user.id,

      first_name: cleanString(d.firstName),
      age_range: d.ageRange || null,
      gender: d.gender || null,
      country: cleanString(d.country),

      niche: cleanString(d.niche),
      niche_other: cleanNullableString(d.nicheOther),

      mission: cleanString(d.mission),
      business_maturity: cleanString(d.businessMaturity),
      offers_status: cleanString(d.offersStatus),

      offer_names: cleanString(d.offerNames),
      offer_price_range: cleanString(d.offerPriceRange),
      offer_delivery: cleanString(d.offerDelivery),

      audience_size: cleanString(d.audienceSize),
      email_list_size: cleanString(d.emailListSize),
      time_available: cleanString(d.timeAvailable),

      main_goals: d.mainGoals ?? [],
      main_goals_other: cleanNullableString(d.mainGoalsOther),

      preferred_content_types: d.preferredContentTypes ?? [],
      tone_preference: cleanString(d.tonePreference),

      social_links,

      has_existing_branding: Boolean(d.hasExistingBranding),

      biggest_blocker: cleanString(d.biggestBlocker),
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
