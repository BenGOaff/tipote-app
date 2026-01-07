// app/api/onboarding/answers/route.ts
// Save onboarding answers into `public.business_profiles` (one row per user_id)
// ✅ UI Lovable (camelCase) → DB business_profiles (snake_case)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const OfferSchema = z.object({
  name: z.string().default(""),
  type: z.string().default(""),
  price: z.string().default(""),
  salesCount: z.string().default(""),
  link: z.string().default(""),
});

const SocialLinkSchema = z.object({
  platform: z.string().default(""),
  url: z.string().default(""),
});

const OnboardingSchema = z
  .object({
    // Écran 1
    firstName: z.string().default(""),
    country: z.string().default(""),
    niche: z.string().default(""),
    missionStatement: z.string().default(""),
    maturity: z.string().default(""),
    biggestBlocker: z.string().default(""),

    // Écran 2
    hasOffers: z.boolean().default(false),
    offers: z.array(OfferSchema).default([]),
    socialAudience: z.string().default(""),
    socialLinks: z.array(SocialLinkSchema).default([]),
    emailListSize: z.string().default(""),
    weeklyHours: z.string().default(""),
    mainGoal90Days: z.string().default(""),
    mainGoals: z.array(z.string()).default([]),

    // Écran 3
    uniqueValue: z.string().default(""),
    untappedStrength: z.string().default(""),
    biggestChallenge: z.string().default(""),
    successDefinition: z.string().default(""),
    clientFeedback: z.string().default(""),
    communicationStyle: z.string().default(""),
    preferredTones: z.array(z.string()).default([]),
  })
  .passthrough();

function cleanString(v: unknown, max = 5000): string {
  const s = typeof v === "string" ? v : "";
  return s.trim().slice(0, max);
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

    const body = await req.json().catch(() => ({}));
    const d = OnboardingSchema.parse(body);

    // Mapping Lovable → business_profiles (table actuelle)
    const row: Record<string, unknown> = {
      user_id: user.id,

      // Écran 1
      first_name: cleanString(d.firstName, 120),
      country: cleanString(d.country, 120),
      niche: cleanString(d.niche, 200),
      mission: cleanString(d.missionStatement, 1000),
      business_maturity: cleanString(d.maturity, 120),
      biggest_blocker: cleanString(d.biggestBlocker, 200),

      // Écran 2
      has_offers: !!d.hasOffers,
      offers: d.offers ?? [],
      audience_social: cleanString(d.socialAudience, 200),
      social_links: d.socialLinks ?? [],
      audience_email: cleanString(d.emailListSize, 200),
      time_available: cleanString(d.weeklyHours, 200),
      main_goal: cleanString(d.mainGoal90Days, 200),
      main_goals: (d.mainGoals ?? []).slice(0, 10).map((g) => cleanString(g, 200)),

      // Écran 3
      unique_value: cleanString(d.uniqueValue, 1500),
      untapped_strength: cleanString(d.untappedStrength, 1500),
      biggest_challenge: cleanString(d.biggestChallenge, 1500),
      success_definition: cleanString(d.successDefinition, 1500),
      recent_client_feedback: cleanString(d.clientFeedback, 1500),
      content_preference: cleanString(d.communicationStyle, 200),
      preferred_tone: (d.preferredTones ?? []).slice(0, 6).map((t) => cleanString(t, 80)).join(", "),

      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("business_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, profile: data ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
