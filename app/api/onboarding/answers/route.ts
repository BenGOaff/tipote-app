// app/api/onboarding/answers/route.ts
// Fix prod: Supabase Postgres error "invalid input syntax for type integer: """
// Root cause: business_profiles.audience_social + audience_email are INT in DB,
// but onboarding was sending strings (ranges / empty string).
//
// ✅ Fix: always send numbers for audience_social / audience_email (never "").
// ✅ Keep existing robustness (json/text fallback, JSON errors).
// ✅ Adds: age_range + gender + offer_* analytics columns
// ✅ Adds: revenue_goal_monthly (TEXT en DB) from onboarding
// ✅ Adds (V2): diagnostic_answers / diagnostic_profile / diagnostic_summary / diagnostic_completed / onboarding_version
//
// ✅ FIX (03/02): ne pas écraser revenue_goal_monthly quand le payload ne le contient pas
// (ex: POST de StepDiagnosticChat / finalizeOnboarding qui envoie seulement diagnostic_*)
//
// ✅ FIX (03/02 - hotfix 500):
// ne JAMAIS envoyer "" sur revenue_goal_monthly (si colonne INT en prod => crash).
// -> si valeur vide: null (ok pour TEXT et INT)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const OfferSchema = z.object({
  name: z.string().optional().default(""),
  type: z.string().optional().default(""),
  price: z.string().optional().default(""),
  salesCount: z.union([z.string(), z.number()]).optional(),
  sales: z.union([z.string(), z.number()]).optional(),
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
    ageRange: z.string().optional().default(""),
    gender: z.string().optional().default(""),
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

    // ✅ NEW: objectif chiffré (texte en DB)
    revenueGoalMonthly: z.string().optional().default(""),
    revenue_goal_monthly: z.string().optional(),

    mainGoals: z.array(z.string()).max(2).optional().default([]),

    // Step 3
    uniqueValue: z.string().optional().default(""),
    untappedStrength: z.string().optional().default(""),
    biggestChallenge: z.string().optional().default(""),
    successDefinition: z.string().optional().default(""),
    clientFeedback: z.array(z.string()).optional().default([]),
    preferredContentType: z.string().optional().default(""),
    tonePreference: z.array(z.string()).optional().default([]),

    // ✅ NEW (V2 chat)
    diagnosticAnswers: z.array(z.any()).optional(),
    diagnostic_answers: z.array(z.any()).optional(),
    diagnosticProfile: z.record(z.any()).nullable().optional(),
    diagnostic_profile: z.record(z.any()).nullable().optional(),
    diagnosticSummary: z.string().optional(),
    diagnostic_summary: z.string().optional(),
    diagnosticCompleted: z.boolean().optional(),
    diagnostic_completed: z.boolean().optional(),
    onboardingVersion: z.string().optional(),
    onboarding_version: z.string().optional(),
  })
  .strict()
  .passthrough();

function cleanString(value: unknown, maxLen = 500): string {
  if (value === null || typeof value === "undefined") return "";
  const s = String(value).trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function compactArray(values: unknown[], max = 10): string[] {
  const out: string[] = [];
  for (const v of values) {
    const s = cleanString(v, 200);
    if (s) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function parseIntSafe(value: string): number | null {
  const v = cleanString(value, 80);
  if (!v) return null;
  const digits = v.replace(/[^0-9]/g, "");
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

function parseAudienceSocial(value: string): number {
  const v = cleanString(value, 50).replace(/\s+/g, "");
  if (!v) return 0;

  const direct = Number.parseInt(v.replace(/[^\d]/g, ""), 10);
  if (
    !Number.isNaN(direct) &&
    /^\d+$/.test(v.replace(/[^\d]/g, "")) &&
    !v.includes("-") &&
    !v.includes("+")
  ) {
    return direct;
  }

  if (v === "0-500") return 250;
  if (v === "500-2000") return 1250;
  if (v === "2000-10000") return 6000;
  if (v === "10000+") return 15000;

  const n = Number.parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

function parseAudienceEmail(value: string): number {
  const n = parseIntSafe(value);
  return n ?? 0;
}

type UpdateResult =
  | { ok: true; stage: string; id: string | null }
  | { ok: false; stage: string; error: any };

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
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
  }

  // ✅ Si le payload ne contient pas revenueGoalMonthly, on ne doit PAS écraser la valeur existante
  const hasRevenueGoalField =
    !!body &&
    typeof body === "object" &&
    ("revenueGoalMonthly" in (body as any) || "revenue_goal_monthly" in (body as any));

  let d: z.infer<typeof OnboardingSchema>;
  try {
    d = OnboardingSchema.parse(body);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid payload" },
      { status: 400 },
    );
  }

  const userId = user.id;

  const normalizedOffers = (d.offers ?? []).slice(0, 50).map((o) => ({
    name: cleanString(o.name, 200),
    type: cleanString(o.type, 80),
    price: cleanString(o.price, 80),
    salesCount: cleanString(o.salesCount ?? o.sales, 80),
    link: cleanString(o.link, 500),
  }));

  const offerPrice = normalizedOffers
    .map((o) => o.price)
    .filter(Boolean)
    .join(" | ");
  const offerSalesCount = normalizedOffers
    .map((o) => o.salesCount)
    .filter(Boolean)
    .join(" | ");
  const offerSalesPageLinks = normalizedOffers
    .map((o) => o.link)
    .filter(Boolean)
    .join(" | ");

  const normalizedSocialLinks = (d.socialLinks ?? []).slice(0, 2).map((s) => ({
    platform: cleanString(s.platform, 50),
    url: cleanString(s.url, 500),
  }));

  const nowIso = new Date().toISOString();

  const audienceSocialInt = parseAudienceSocial(d.socialAudience ?? "");
  const audienceEmailInt = parseAudienceEmail(d.emailListSize ?? "");

  // ⚠️ IMPORTANT: ne jamais envoyer "" pour revenue_goal_monthly (sinon crash si colonne INT)
  const revenueGoalMonthlyRaw = cleanString(
    ((d as any).revenueGoalMonthly ?? (d as any).revenue_goal_monthly ?? "") as string,
    50,
  );
  const revenueGoalMonthlyValue: string | null = revenueGoalMonthlyRaw ? revenueGoalMonthlyRaw : null;

  const diagnosticAnswers =
    (d as any).diagnosticAnswers ?? (d as any).diagnostic_answers ?? undefined;
  const diagnosticProfile =
    (d as any).diagnosticProfile ?? (d as any).diagnostic_profile ?? undefined;
  const diagnosticSummary = cleanString(
    (d as any).diagnosticSummary ?? (d as any).diagnostic_summary ?? "",
    4000,
  );
  const diagnosticCompleted =
    (d as any).diagnosticCompleted ?? (d as any).diagnostic_completed ?? undefined;
  const onboardingVersion = cleanString(
    (d as any).onboardingVersion ?? (d as any).onboarding_version ?? "",
    50,
  );

  const rowNative: Record<string, unknown> = {
    user_id: userId,

    // Step 1
    first_name: cleanString(d.firstName, 120),
    age_range: cleanString(d.ageRange, 50),
    gender: cleanString(d.gender, 50),
    country: cleanString(d.country, 120),
    niche: cleanString(d.niche, 200),
    mission: cleanString(d.missionStatement, 1500),
    business_maturity: cleanString(d.maturity, 120),
    biggest_blocker: cleanString(d.biggestBlocker, 200),

    // Step 2 (IMPORTANT: ints)
    has_offers: d.hasOffers ?? false,
    offers: d.hasOffers ? normalizedOffers : [],
    offer_price: offerPrice,
    offer_sales_count: offerSalesCount,
    offer_sales_page_links: offerSalesPageLinks,
    audience_social: audienceSocialInt,
    social_links: normalizedSocialLinks,
    audience_email: audienceEmailInt,
    time_available: cleanString(d.weeklyHours, 120),
    main_goal: cleanString(d.mainGoal90Days, 200),

    // ✅ only if provided in payload
    ...(hasRevenueGoalField ? { revenue_goal_monthly: revenueGoalMonthlyValue } : {}),

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
    content_preference: cleanString(d.preferredContentType, 200),
    preferred_tone: compactArray(d.tonePreference ?? [], 3).join(", "),

    // ✅ V2
    ...(typeof diagnosticAnswers !== "undefined" ? { diagnostic_answers: diagnosticAnswers } : {}),
    ...(typeof diagnosticProfile !== "undefined" ? { diagnostic_profile: diagnosticProfile } : {}),
    ...(diagnosticSummary ? { diagnostic_summary: diagnosticSummary } : {}),
    ...(typeof diagnosticCompleted !== "undefined"
      ? { diagnostic_completed: !!diagnosticCompleted }
      : {}),
    ...(onboardingVersion ? { onboarding_version: onboardingVersion } : {}),

    updated_at: nowIso,
  };

  const rowFallback: Record<string, unknown> = {
    ...rowNative,
    offers: JSON.stringify(d.hasOffers ? normalizedOffers : []),
    social_links: JSON.stringify(normalizedSocialLinks),
    main_goals: compactArray(d.mainGoals ?? [], 2).join(", "),
  };

  async function updateThenInsert(row: Record<string, unknown>): Promise<UpdateResult> {
    const rowForUpdate = { ...row };
    delete (rowForUpdate as any).user_id;

    const upd = await supabase
      .from("business_profiles")
      .update(rowForUpdate)
      .eq("user_id", userId)
      .select("id");
    if (upd.error) return { ok: false, stage: "update", error: upd.error };
    if (Array.isArray(upd.data) && upd.data.length > 0) {
      return { ok: true, stage: "update", id: (upd.data[0] as any)?.id ?? null };
    }

    const ins = await supabase.from("business_profiles").insert(row).select("id");
    if (ins.error) return { ok: false, stage: "insert", error: ins.error };
    return { ok: true, stage: "insert", id: (ins.data?.[0] as any)?.id ?? null };
  }

  const nativeRes = await updateThenInsert(rowNative);
  if (nativeRes.ok) {
    return NextResponse.json({ ok: true, stage: nativeRes.stage, id: nativeRes.id });
  }

  // fallback JSON-stringified for columns that might be TEXT
  const fallbackRes = await updateThenInsert(rowFallback);
  if (fallbackRes.ok) {
    return NextResponse.json({
      ok: true,
      stage: fallbackRes.stage,
      id: fallbackRes.id,
      fallback: true,
    });
  }

  // Logs serveur pour retrouver la cause exacte du 500 (RLS / type / colonne manquante)
  console.error("[api/onboarding/answers] native failed", nativeRes);
  console.error("[api/onboarding/answers] fallback failed", fallbackRes);

  return NextResponse.json(
    { ok: false, error: "Database error", details: { native: nativeRes, fallback: fallbackRes } },
    { status: 500 },
  );
}
