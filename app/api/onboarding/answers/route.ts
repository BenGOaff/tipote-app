// app/api/onboarding/answers/route.ts
// Fix prod: Supabase Postgres error "invalid input syntax for type integer: """
// Root cause: business_profiles.audience_social + audience_email are INT in DB,
// but onboarding was sending strings (ranges / empty string).
//
// ✅ Fix: always send numbers for audience_social / audience_email (never "").
// ✅ Keep existing robustness (json/text fallback, JSON errors).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const OfferSchema = z.object({
  name: z.string().optional().default(""),
  type: z.string().optional().default(""),
  price: z.union([z.string(), z.number()]).optional().default(""),
  salesCount: z.union([z.string(), z.number()]).optional().default(""),
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
    country: z.string().optional().default(""),
    niche: z.string().optional().default(""),
    missionStatement: z.string().optional().default(""),
    maturity: z.string().optional().default(""),
    biggestBlocker: z.string().optional().default(""),

    // Step 2
    hasOffers: z.boolean().nullable().optional().default(null),
    offers: z.array(OfferSchema).optional().default([]),
    socialAudience: z.string().optional().default(""), // UI range OR number as string
    socialLinks: z.array(SocialLinkSchema).max(2).optional().default([]),
    emailListSize: z.string().optional().default(""), // UI input
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

// Convert UI socialAudience ("0-500", "500-2000", "2000-10000", "10000+") OR "1200" -> integer
function parseAudienceSocial(value: string): number {
  const v = cleanString(value, 50).replace(/\s+/g, "");
  if (!v) return 0;

  // direct number
  const direct = Number.parseInt(v.replace(/[^\d]/g, ""), 10);
  if (!Number.isNaN(direct) && /^\d+$/.test(v.replace(/[^\d]/g, "")) && !v.includes("-") && !v.includes("+")) {
    return direct;
  }

  // ranges (representative midpoint-ish)
  if (v === "0-500") return 250;
  if (v === "500-2000") return 1250;
  if (v === "2000-10000") return 6000;
  if (v === "10000+") return 15000;

  // fallback: extract first number
  const n = Number.parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

// Convert UI emailListSize (input "0", "120", "1 200", etc) -> integer (never "")
function parseAudienceEmail(value: string): number {
  const v = cleanString(value, 80);
  if (!v) return 0;
  const digits = v.replace(/[^\d]/g, "");
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) ? 0 : n;
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

  const userId = user.id;

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

  const audienceSocialInt = parseAudienceSocial(d.socialAudience ?? "");
  const audienceEmailInt = parseAudienceEmail(d.emailListSize ?? "");

  const rowNative: Record<string, unknown> = {
    user_id: userId,

    // Step 1
    first_name: cleanString(d.firstName, 120),
    country: cleanString(d.country, 120),
    niche: cleanString(d.niche, 200),
    mission: cleanString(d.missionStatement, 1500),
    business_maturity: cleanString(d.maturity, 120),
    biggest_blocker: cleanString(d.biggestBlocker, 200),

    // Step 2 (IMPORTANT: ints)
    has_offers: d.hasOffers ?? false,
    offers: d.hasOffers ? normalizedOffers : [],
    audience_social: audienceSocialInt, // ✅ int
    social_links: normalizedSocialLinks,
    audience_email: audienceEmailInt, // ✅ int
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
    content_preference: cleanString(d.preferredContentType, 200),
    preferred_tone: compactArray(d.tonePreference ?? [], 3).join(", "),

    updated_at: nowIso,
  };

  const rowFallback: Record<string, unknown> = {
    ...rowNative,
    // Keep ints as ints. Only stringify JSON fields.
    offers: JSON.stringify(d.hasOffers ? normalizedOffers : []),
    social_links: JSON.stringify(normalizedSocialLinks),
    main_goals: compactArray(d.mainGoals ?? [], 2).join(", "),
  };

  async function updateThenInsert(row: Record<string, unknown>) {
    const rowForUpdate = { ...row };
    delete (rowForUpdate as any).user_id;

    const upd = await supabase
      .from("business_profiles")
      .update(rowForUpdate)
      .eq("user_id", userId)
      .select("id");

    if (upd.error) return { ok: false as const, stage: "update" as const, error: upd.error };

    if (Array.isArray(upd.data) && upd.data.length > 0) {
      return { ok: true as const, stage: "update" as const, id: (upd.data[0] as any)?.id ?? null };
    }

    const ins = await supabase
      .from("business_profiles")
      .insert({ ...row, user_id: userId })
      .select("id")
      .maybeSingle();

    if (ins.error) return { ok: false as const, stage: "insert" as const, error: ins.error };

    return { ok: true as const, stage: "insert" as const, id: (ins.data as any)?.id ?? null };
  }

  // Native try
  const nativeRes = await updateThenInsert(rowNative);
  if (nativeRes.ok) {
    return NextResponse.json({ ok: true, id: nativeRes.id }, { status: 200 });
  }

  // Fallback stringify
  const fallbackRes = await updateThenInsert(rowFallback);
  if (fallbackRes.ok) {
    return NextResponse.json({ ok: true, id: fallbackRes.id }, { status: 200 });
  }

  return NextResponse.json(
    {
      ok: false,
      error: fallbackRes.error?.message || nativeRes.error?.message || "Unable to save onboarding answers",
      details: {
        native: { stage: nativeRes.stage, message: nativeRes.error?.message },
        fallback: { stage: fallbackRes.stage, message: fallbackRes.error?.message },
      },
    },
    { status: 400 },
  );
}
