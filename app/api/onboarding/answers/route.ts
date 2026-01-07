// app/api/onboarding/answers/route.ts
// Save onboarding answers into `public.business_profiles` (one row per user_id)
// ✅ Robust: always returns JSON on errors (no HTML)
// ✅ Robust: tolerant to column types (jsonb vs text) for offers/social_links/main_goals
// ✅ Writes BOTH preferred_content_type and content_preference (table has both in CSV)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const OfferSchema = z.object({
  name: z.string().optional().default(""),
  type: z.string().optional().default(""),
  price: z.union([z.string(), z.number()]).optional().default(""),
  salesCount: z.union([z.string(), z.number()]).optional().default(""),
  sales: z.union([z.string(), z.number()]).optional(), // tolère anciennes clés
  link: z.string().optional().default(""),
});

const SocialLinkSchema = z.object({
  platform: z.string().optional().default(""),
  url: z.string().optional().default(""),
});

const OnboardingSchema = z
  .object({
    // Step 1
    firstName: z.string().optional().default(""),
    country: z.string().optional().default(""),
    niche: z.string().optional().default(""),
    missionStatement: z.string().optional().default(""),
    maturity: z.string().optional().default(""),
    biggestBlocker: z.string().optional().default(""),

    // Step 2
    hasOffers: z.boolean().nullable().optional().default(null),
    offers: z.array(OfferSchema).optional().default([]),
    socialAudience: z.string().optional().default(""),
    socialLinks: z.array(SocialLinkSchema).max(2).optional().default([]),
    emailListSize: z.string().optional().default(""),
    weeklyHours: z.string().optional().default(""),
    mainGoal90Days: z.string().optional().default(""),
    mainGoals: z.array(z.string()).max(2).optional().default([]),

    // Step 3
    uniqueValue: z.string().optional().default(""),
    untappedStrength: z.string().optional().default(""),
    biggestChallenge: z.string().optional().default(""),
    successDefinition: z.string().optional().default(""),
    clientFeedback: z.array(z.string()).optional().default([]),
    preferredContentType: z.string().optional().default(""),
    tonePreference: z.array(z.string()).max(3).optional().default([]),
  })
  .passthrough();

function cleanString(v: unknown, max = 2000): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.trim().slice(0, max);
}

function toNumLikeString(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return cleanString(v, 120);
}

function compactArray(arr: string[], maxItems: number): string[] {
  return arr.map((x) => cleanString(x, 200)).filter(Boolean).slice(0, maxItems);
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let d: z.infer<typeof OnboardingSchema>;
  try {
    d = OnboardingSchema.parse(body);
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join(" | ")
        : "Invalid payload";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  // Normalisation (DB CSV montre offers parfois en { price:number, sales:number })
  const normalizedOffers = (d.offers ?? []).map((o) => {
    const salesCount = o.salesCount ?? o.sales ?? "";
    return {
      name: cleanString(o.name, 200),
      type: cleanString(o.type, 120),
      price: toNumLikeString(o.price),
      salesCount: toNumLikeString(salesCount),
      link: cleanString(o.link, 500),
    };
  });

  const normalizedSocialLinks = (d.socialLinks ?? []).slice(0, 2).map((s) => ({
    platform: cleanString(s.platform, 50),
    url: cleanString(s.url, 500),
  }));

  const nowIso = new Date().toISOString();

  // Row "native" (json types) — on tente d'abord ça
  const rowNative: Record<string, unknown> = {
    user_id: user.id,

    // Step 1
    first_name: cleanString(d.firstName, 120),
    country: cleanString(d.country, 120),
    niche: cleanString(d.niche, 200),
    mission: cleanString(d.missionStatement, 1500),
    business_maturity: cleanString(d.maturity, 120),
    biggest_blocker: cleanString(d.biggestBlocker, 200),

    // Step 2
    has_offers: d.hasOffers ?? false,
    offers: d.hasOffers ? normalizedOffers : [],
    audience_social: cleanString(d.socialAudience, 120),
    social_links: normalizedSocialLinks,
    audience_email: cleanString(d.emailListSize, 120),
    time_available: cleanString(d.weeklyHours, 120),
    main_goal: cleanString(d.mainGoal90Days, 200),
    main_goals: compactArray(d.mainGoals ?? [], 2),

    // Step 3
    unique_value: cleanString(d.uniqueValue, 2000),
    untapped_strength: cleanString(d.untappedStrength, 2000),
    biggest_challenge: cleanString(d.biggestChallenge, 200),
    success_definition: cleanString(d.successDefinition, 2000),
    recent_client_feedback: (d.clientFeedback ?? [])
      .map((x) => cleanString(x, 2000))
      .filter(Boolean)
      .join("\n\n"),
    preferred_content_type: cleanString(d.preferredContentType, 200),
    content_preference: cleanString(d.preferredContentType, 200), // table contient aussi content_preference
    preferred_tone: compactArray(d.tonePreference ?? [], 3).join(", "),

    updated_at: nowIso,
  };

  // Row "fallback" (stringified json + main_goals string)
  const rowFallback: Record<string, unknown> = {
    ...rowNative,
    offers: JSON.stringify(d.hasOffers ? normalizedOffers : []),
    social_links: JSON.stringify(normalizedSocialLinks),
    main_goals: compactArray(d.mainGoals ?? [], 2).join(", "),
  };

  // Helper: try upsert
  async function tryUpsert(row: Record<string, unknown>) {
    return supabase
      .from("business_profiles")
      .upsert(row, { onConflict: "user_id" })
      .select("id")
      .maybeSingle();
  }

  // 1) Try native
  const { data: savedNative, error: errNative } = await tryUpsert(rowNative);

  if (!errNative) {
    return NextResponse.json({ ok: true, id: savedNative?.id ?? null }, { status: 200 });
  }

  // 2) Fallback (handles text columns)
  const { data: savedFallback, error: errFallback } = await tryUpsert(rowFallback);

  if (!errFallback) {
    return NextResponse.json({ ok: true, id: savedFallback?.id ?? null }, { status: 200 });
  }

  // Return explicit JSON error so UI can show it (and user can pass step 1 once fixed)
  return NextResponse.json(
    {
      ok: false,
      error: errFallback.message || errNative.message || "Unable to save onboarding answers",
      details: {
        native: errNative.message,
        fallback: errFallback.message,
      },
    },
    { status: 400 },
  );
}
