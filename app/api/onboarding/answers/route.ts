// app/api/onboarding/answers/route.ts
// Save onboarding answers into `public.business_profiles` (one row per user_id)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const OnboardingSchema = z.object({
  // Step 1
  firstName: z.string().default(""),
  ageRange: z.string().default(""),
  gender: z.string().default(""),
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

// optionnel: si tes colonnes audience_soci / audience_ema sont en int4,
// on mappe tes ranges vers un "upper bound" numérique
function audienceRangeToInt(v: string): number | null {
  const s = (v || "").trim();
  if (!s) return null;
  if (s === "0-500") return 500;
  if (s === "500-2000") return 2000;
  if (s === "2000-10000") return 10000;
  if (s === "10000+") return 10000;
  // fallback: essaie de parser un nombre
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
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

    // JSONB offers (colonne `offers`)
    const offers = {
      has_offers: Boolean(d.hasOffers),
      offer_price: cleanNullableString(d.offerPrice),
      offer_sales_count: cleanNullableString(d.offerSalesCount),
      offer_sales_page_links: cleanNullableString(d.offerSalesPageLinks),
    };

    // ⚠️ IMPORTANT :
    // - ICI on n'envoie QUE des colonnes qui existent.
    // - Fix majeur: additional_context (PAS additional_cor)
    //
    // Mapping minimal cohérent avec ton CDC + tes colonnes visibles:
    const row: Record<string, unknown> = {
      user_id: user.id,

      first_name: cleanString(d.firstName),
      age_range: cleanNullableString(d.ageRange),
      gender: cleanNullableString(d.gender),
      country: cleanString(d.country),

      niche: cleanString(d.niche),
      niche_other: cleanNullableString(d.nicheOther),

      // persona question → on l'enregistre dans mission (colonne existante)
      mission: cleanString(d.persona),

      // business maturity → colonne business_mat (d'après ton screenshot)
      business_mat: cleanString(d.businessMaturity),

      // audience (d'après ton screenshot: audience_soci / audience_ema en int4)
      audience_soci: audienceRangeToInt(d.audienceSocial),
      audience_ema: audienceRangeToInt(d.audienceEmail),

      time_available: cleanString(d.timeAvailable),

      // objectif financier → main_goal
      main_goal: cleanString(d.financialGoal),

      // objectifs psycho → main_goals (et main_goals_ot pour "autre")
      main_goals: d.psychologicalGoals ?? [],
      main_goals_ot: cleanNullableString(d.psychologicalGoalsOther),

      // préférence contenu / ton (d'après ton screenshot tronqué: preferred_con / tone_preferen)
      preferred_con: cleanString(d.contentPreference),
      tone_preferen: cleanString(d.preferredTone),

      // offres
      offers_status: d.hasOffers ? "yes" : "no",
      offers,

      // contexte additionnel / outils : on évite d'inventer des colonnes
      // ➜ on stocke dans additional_context (colonne existante)
      additional_context: cleanNullableString(
        [
          (d.toolsUsed?.length ? `Outils: ${d.toolsUsed.join(", ")}` : ""),
          (d.toolsOther ? `Outils (autre): ${d.toolsOther}` : ""),
          (d.businessType ? `Type business: ${d.businessType}` : ""),
          (d.businessTypeOther ? `Type business (autre): ${d.businessTypeOther}` : ""),
        ]
          .filter(Boolean)
          .join(" | "),
      ),

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
