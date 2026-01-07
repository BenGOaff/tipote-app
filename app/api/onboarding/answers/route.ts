// app/api/onboarding/answers/route.ts
// Save onboarding answers into `public.business_profiles` (one row per user_id)
// ⚠️ Doc onboarding -> mapping strict vers la table existante business_profiles (CSV)

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

const OnboardingSchema = z.object({
  // ÉCRAN 1
  firstName: z.string().default(""),
  country: z.string().default(""),
  niche: z.string().default(""),
  missionStatement: z.string().default(""),
  maturity: z.string().default(""),
  biggestBlocker: z.string().default(""),

  // ÉCRAN 2
  hasOffers: z.boolean().nullable().default(null),
  offers: z.array(OfferSchema).default([]),
  socialAudience: z.string().default(""),
  socialLinks: z.array(SocialLinkSchema).max(2).default([]),
  emailListSize: z.string().default(""),
  weeklyHours: z.string().default(""),
  mainGoal90Days: z.string().default(""),
  mainGoals: z.array(z.string()).max(2).default([]),

  // ÉCRAN 3
  uniqueValue: z.string().default(""),
  untappedStrength: z.string().default(""),
  biggestChallenge: z.string().default(""),
  successDefinition: z.string().default(""),
  clientFeedback: z.array(z.string()).default([]),
  preferredContentType: z.string().default(""),
  tonePreference: z.array(z.string()).max(3).default([]),
});

function cleanString(v: unknown, max = 2000): string {
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

    // Mapping strict doc -> colonnes existantes business_profiles
    const row: Record<string, unknown> = {
      user_id: user.id,

      // ÉCRAN 1
      first_name: cleanString(d.firstName, 120),
      country: cleanString(d.country, 120),
      niche: cleanString(d.niche, 200),
      mission: cleanString(d.missionStatement, 1500),
      business_maturity: cleanString(d.maturity, 120),
      biggest_blocker: cleanString(d.biggestBlocker, 200),

      // ÉCRAN 2
      has_offers: d.hasOffers ?? false,
      offers: d.hasOffers ? d.offers : [],
      audience_social: cleanString(d.socialAudience, 120),
      social_links: (d.socialLinks ?? []).slice(0, 2).map((s) => ({
        platform: cleanString(s.platform, 50),
        url: cleanString(s.url, 500),
      })),
      audience_email: cleanString(d.emailListSize, 120),
      time_available: cleanString(d.weeklyHours, 120),
      main_goal: cleanString(d.mainGoal90Days, 200),
      main_goals: (d.mainGoals ?? []).slice(0, 2).map((g) => cleanString(g, 120)),

      // ÉCRAN 3
      unique_value: cleanString(d.uniqueValue, 2000),
      untapped_strength: cleanString(d.untappedStrength, 2000),
      biggest_challenge: cleanString(d.biggestChallenge, 200),
      success_definition: cleanString(d.successDefinition, 2000),
      recent_client_feedback: (d.clientFeedback ?? [])
        .map((x) => cleanString(x, 2000))
        .filter(Boolean)
        .join("\n\n"),
      content_preference: cleanString(d.preferredContentType, 200),
      preferred_tone: (d.tonePreference ?? []).slice(0, 3).map((t) => cleanString(t, 200)).join(", "),

      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await supabase
      .from("business_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("id")
      .maybeSingle();

    if (saveError) {
      return NextResponse.json({ ok: false, error: saveError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: saved?.id ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
