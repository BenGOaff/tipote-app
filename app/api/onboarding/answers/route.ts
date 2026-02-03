// app/api/onboarding/answers/route.ts
//
// ✅ FIX PROD (03/02):
// - Erreur onboarding Step 1 = 500 "Database error" car on essaye d'UPDATE des colonnes
//   qui N'EXISTENT PAS dans public.business_profiles (ex: age_range, gender, unique_value, untapped_strength).
// - Preuve : ton export business_profiles n'a que 34 colonnes (pas age_range/gender/unique_value/...).
//
// ✅ Solution:
// - Ne JAMAIS référencer des colonnes absentes.
// - N'envoyer/écrire que les colonnes réellement présentes :
//   first_name, country, niche, mission, business_maturity, biggest_blocker, has_offers, offers,
//   audience_social, audience_email, social_links, time_available, main_goal, main_goals,
//   success_definition, biggest_challenge, recent_client_feedback, content_preference, preferred_tone,
//   persona, revenue_goal_monthly, diagnostic_*, diagnostic_completed, onboarding_version,
//   onboarding_completed, updated_at.
//
// ✅ Bonus robustesse conservée :
// - parsing ints audience_social / audience_email
// - JSON fallback stringifié si offers/social_links/main_goals sont TEXT
// - ne pas écraser revenue_goal_monthly si le payload ne le contient pas
// - ne jamais envoyer "" pour revenue_goal_monthly (null à la place)

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
    // Step 1 (UI v2)
    firstName: z.string().optional().default(""),
    country: z.string().optional().default(""),
    niche: z.string().optional().default(""),
    missionStatement: z.string().optional().default(""),

    // Compat (peuvent arriver dans payload, mais PAS stockés en DB si colonnes absentes)
    ageRange: z.string().optional().default(""),
    gender: z.string().optional().default(""),
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

    revenueGoalMonthly: z.string().optional().default(""),
    revenue_goal_monthly: z.string().optional(),

    mainGoals: z.array(z.string()).max(2).optional().default([]),

    // Step 3 / compat (arrivent parfois depuis anciennes versions)
    biggestChallenge: z.string().optional().default(""),
    successDefinition: z.string().optional().default(""),
    clientFeedback: z.array(z.string()).optional().default([]),
    preferredContentType: z.string().optional().default(""),
    tonePreference: z.array(z.string()).optional().default([]),

    // ✅ V2 chat
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

  // formats range UI
  if (v === "0-500") return 250;
  if (v === "500-2000") return 1250;
  if (v === "2000-10000") return 6000;
  if (v === "10000+") return 15000;

  const n = parseIntSafe(v);
  return n ?? 0;
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

  // ✅ Ne pas écraser revenue_goal_monthly si le payload ne le contient pas
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
  const nowIso = new Date().toISOString();

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

  const audienceSocialInt = parseAudienceSocial(d.socialAudience ?? "");
  const audienceEmailInt = parseAudienceEmail(d.emailListSize ?? "");

  // ⚠️ Ne jamais envoyer "" pour revenue_goal_monthly
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

  // ✅ IMPORTANT : n'écrire que les colonnes EXISTANTES de business_profiles
  // (voir ton export: pas de age_range/gender/unique_value/untapped_strength/etc.)
  const rowNative: Record<string, unknown> = {
    user_id: userId,

    // Step 1
    ...(cleanString(d.firstName, 120) ? { first_name: cleanString(d.firstName, 120) } : {}),
    ...(cleanString(d.country, 120) ? { country: cleanString(d.country, 120) } : {}),
    ...(cleanString(d.niche, 200) ? { niche: cleanString(d.niche, 200) } : {}),
    ...(cleanString(d.missionStatement, 1500)
      ? { mission: cleanString(d.missionStatement, 1500) }
      : {}),

    // Compat (colonnes EXISTANTES)
    ...(cleanString(d.maturity, 120)
      ? { business_maturity: cleanString(d.maturity, 120) }
      : {}),
    ...(cleanString(d.biggestBlocker, 200)
      ? { biggest_blocker: cleanString(d.biggestBlocker, 200) }
      : {}),

    // Step 2
    ...(typeof d.hasOffers === "boolean" ? { has_offers: d.hasOffers } : {}),
    ...(Array.isArray(d.offers) ? { offers: d.hasOffers ? normalizedOffers : [] } : {}),
    ...(d.hasOffers ? { offer_price: offerPrice, offer_sales_count: offerSalesCount, offer_sales_page_links: offerSalesPageLinks } : {}),

    // ints existants
    ...(typeof audienceSocialInt === "number" ? { audience_social: audienceSocialInt } : {}),
    ...(typeof audienceEmailInt === "number" ? { audience_email: audienceEmailInt } : {}),

    ...(Array.isArray(d.socialLinks) ? { social_links: normalizedSocialLinks } : {}),

    ...(cleanString(d.weeklyHours, 120)
      ? { time_available: cleanString(d.weeklyHours, 120) }
      : {}),
    ...(cleanString(d.mainGoal90Days, 200)
      ? { main_goal: cleanString(d.mainGoal90Days, 200) }
      : {}),

    ...(compactArray(d.mainGoals ?? [], 2).length > 0
      ? { main_goals: compactArray(d.mainGoals ?? [], 2) }
      : {}),

    // Step 3 (colonnes EXISTANTES)
    ...(cleanString(d.successDefinition, 2000)
      ? { success_definition: cleanString(d.successDefinition, 2000) }
      : {}),
    ...(cleanString(d.biggestChallenge, 200)
      ? { biggest_challenge: cleanString(d.biggestChallenge, 200) }
      : {}),
    ...((d.clientFeedback ?? [])
      .map((x) => cleanString(x, 2000))
      .filter(Boolean)
      .join("\n\n")
      ? {
          recent_client_feedback: (d.clientFeedback ?? [])
            .map((x) => cleanString(x, 2000))
            .filter(Boolean)
            .join("\n\n"),
        }
      : {}),
    ...(cleanString(d.preferredContentType, 200)
      ? { content_preference: cleanString(d.preferredContentType, 200) }
      : {}),
    ...(compactArray(d.tonePreference ?? [], 3).join(", ")
      ? { preferred_tone: compactArray(d.tonePreference ?? [], 3).join(", ") }
      : {}),

    // revenue_goal_monthly uniquement si fourni dans payload
    ...(hasRevenueGoalField ? { revenue_goal_monthly: revenueGoalMonthlyValue } : {}),

    // V2 chat (colonnes EXISTANTES)
    ...(typeof diagnosticAnswers !== "undefined" ? { diagnostic_answers: diagnosticAnswers } : {}),
    ...(typeof diagnosticProfile !== "undefined" ? { diagnostic_profile: diagnosticProfile } : {}),
    ...(diagnosticSummary ? { diagnostic_summary: diagnosticSummary } : {}),
    ...(typeof diagnosticCompleted !== "undefined"
      ? { diagnostic_completed: !!diagnosticCompleted }
      : {}),
    ...(onboardingVersion ? { onboarding_version: onboardingVersion } : {}),

    updated_at: nowIso,
  };

  // Fallback stringifié si certaines colonnes sont TEXT (selon schémas historiques)
  const rowFallback: Record<string, unknown> = {
    ...rowNative,
    ...(rowNative.offers ? { offers: JSON.stringify(rowNative.offers) } : {}),
    ...(rowNative.social_links ? { social_links: JSON.stringify(rowNative.social_links) } : {}),
    ...(rowNative.main_goals ? { main_goals: JSON.stringify(rowNative.main_goals) } : {}),
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

  const fallbackRes = await updateThenInsert(rowFallback);
  if (fallbackRes.ok) {
    return NextResponse.json({
      ok: true,
      stage: fallbackRes.stage,
      id: fallbackRes.id,
      fallback: true,
    });
  }

  console.error("[api/onboarding/answers] native failed", nativeRes);
  console.error("[api/onboarding/answers] fallback failed", fallbackRes);

  return NextResponse.json(
    { ok: false, error: "Database error", details: { native: nativeRes, fallback: fallbackRes } },
    { status: 500 },
  );
}
