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

const OnboardingSchema = z.object({
  // Step 1
  firstName: z.string().default(""),
  ageRange: AgeRangeSchema,
  gender: GenderSchema,
  country: z.string().default(""),

  // Step 2
  niche: z.string().default(""),
  nicheOther: z.string().default(""),

  persona: z.string().default(""),

  businessType: z.string().default(""),
  businessTypeOther: z.string().default(""),

  businessMaturity: z.string().default(""),

  audienceSocial: z.string().default(""),
  audienceEmail: z.string().default(""),

  hasOffers: z.boolean().default(false),
  offerPrice: z.string().default(""),
  offerSalesCount: z.string().default(""),
  offerSalesPageLinks: z.string().default(""),

  toolsUsed: z.array(z.string()).default([]),
  toolsOther: z.string().default(""),

  timeAvailable: z.string().default(""),

  // Step 3
  financialGoal: z.string().default(""),
  psychologicalGoals: z.array(z.string()).default([]),
  psychologicalGoalsOther: z.string().default(""),

  contentPreference: z.string().default(""),
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

function rangeToInt(v: string): number | null {
  const s = (v || "").trim();
  if (!s) return null;

  // formats: "0-500", "500-2000", "2000-10000", "10000+"
  if (s.endsWith("+")) {
    const n = Number(s.replace("+", ""));
    return Number.isFinite(n) ? n : null;
  }

  const parts = s.split("-");
  if (parts.length === 2) {
    const high = Number(parts[1]);
    return Number.isFinite(high) ? high : null;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseLinksCsv(v: string): string[] {
  const s = (v || "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);
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

    const offers = {
      has_offers: Boolean(d.hasOffers),
      average_price: cleanNullableString(d.offerPrice),
      sales_count: cleanNullableString(d.offerSalesCount),
      sales_page_links: parseLinksCsv(d.offerSalesPageLinks),
      business_type: cleanNullableString(d.businessType),
      business_type_other: cleanNullableString(d.businessTypeOther),
      tools_used: (d.toolsUsed || []).map((t) => t.trim()).filter(Boolean),
      tools_other: cleanNullableString(d.toolsOther),
    };

    const row: Record<string, unknown> = {
      user_id: user.id,

      // profil perso
      first_name: cleanString(d.firstName),
      age_range: d.ageRange || null,
      gender: d.gender || null,
      country: cleanString(d.country),

      // business
      niche: cleanString(d.niche),
      niche_other: cleanNullableString(d.nicheOther),

      // CDC persona -> mission (colonne existante)
      mission: cleanString(d.persona),

      // maturité CA
      business_maturity: cleanString(d.businessMaturity),

      // audience
      audience_soci: rangeToInt(d.audienceSocial),
      audience_ema: rangeToInt(d.audienceEmail),
      audience_size: cleanString(d.audienceSocial),
      email_list_size: cleanString(d.audienceEmail),

      // offres
      offers_status: d.hasOffers ? "oui" : "non",
      offers,

      // outils -> colonne existante text (working_strategy)
      working_strategy: [
        ...(d.toolsUsed || []),
        d.toolsOther ? `Autre: ${cleanString(d.toolsOther)}` : "",
      ]
        .map((x) => x.trim())
        .filter(Boolean)
        .join(", "),

      // temps dispo
      time_available: cleanString(d.timeAvailable),

      // objectifs
      main_goal: cleanString(d.financialGoal),
      main_goals: d.psychologicalGoals ?? [],
      main_goals_other: cleanNullableString(d.psychologicalGoalsOther),

      preferred_content_types: d.contentPreference ? [cleanString(d.contentPreference)] : [],
      tone_preference: cleanString(d.preferredTone),

      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await supabase
      .from("business_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, profile: saved ?? null }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
