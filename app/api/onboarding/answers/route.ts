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

function pickColumnNotFound(errMsg: string): string | null {
  // PostgREST / Postgres message patterns
  // ex: 'column "preferred_content_type" of relation "business_profiles" does not exist'
  const m = errMsg.match(/column\s+"([^"]+)"\s+of\s+relation\s+"[^"]+"\s+does\s+not\s+exist/i);
  if (m?.[1]) return m[1];
  // ex: 'Could not find the 'foo' column of 'business_profiles' in the schema cache'
  const m2 = errMsg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  if (m2?.[1]) return m2[1];
  return null;
}

function cloneRow(row: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
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

  // IMPORTANT: fige userId pour éviter “user possibly null” dans les fonctions internes
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

  // Row "native" (json) — on tente d'abord ça
  const rowNative: Record<string, unknown> = {
    user_id: userId,

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

    // selon env: parfois une seule des 2 colonnes existe => on gère via retry “column not found”
    preferred_content_type: cleanString(d.preferredContentType, 200),
    content_preference: cleanString(d.preferredContentType, 200),

    preferred_tone: compactArray(d.tonePreference ?? [], 3).join(", "),
    updated_at: nowIso,
  };

  // Row fallback (stringify json + main_goals string)
  const rowFallback: Record<string, unknown> = {
    ...rowNative,
    offers: JSON.stringify(d.hasOffers ? normalizedOffers : []),
    social_links: JSON.stringify(normalizedSocialLinks),
    main_goals: compactArray(d.mainGoals ?? [], 2).join(", "),
  };

  async function updateThenInsert(row: Record<string, unknown>) {
    // UPDATE ne doit pas modifier user_id
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

  async function tryWithAutoDropColumns(initialRow: Record<string, unknown>) {
    let row = cloneRow(initialRow);
    let lastErrMsg = "";
    let lastStage: "update" | "insert" = "update";

    // jusqu’à 6 retries : assez pour drop 1-2 colonnes selon env
    for (let attempt = 1; attempt <= 6; attempt++) {
      const res = await updateThenInsert(row);
      if (res.ok) return { ok: true as const, id: res.id, stage: res.stage, attempts: attempt };

      lastStage = res.stage;
      lastErrMsg = res.error?.message || "Unknown error";

      const col = pickColumnNotFound(lastErrMsg);
      if (col && col in row) {
        delete (row as any)[col];
        continue;
      }

      // si on n'a pas une erreur “column not found”, on stop
      return { ok: false as const, error: lastErrMsg, stage: lastStage, attempts: attempt };
    }

    return { ok: false as const, error: lastErrMsg || "Unknown error", stage: lastStage, attempts: 6 };
  }

  // 1) Try native (avec auto-drop colonnes inconnues)
  const nativeRes = await tryWithAutoDropColumns(rowNative);
  if (nativeRes.ok) {
    return NextResponse.json({ ok: true, id: nativeRes.id }, { status: 200 });
  }

  // 2) Try fallback (stringify json) (avec auto-drop colonnes inconnues)
  const fallbackRes = await tryWithAutoDropColumns(rowFallback);
  if (fallbackRes.ok) {
    return NextResponse.json({ ok: true, id: fallbackRes.id }, { status: 200 });
  }

  return NextResponse.json(
    {
      ok: false,
      error: fallbackRes.error || nativeRes.error || "Unable to save onboarding answers",
      details: {
        native: { stage: nativeRes.stage, attempts: nativeRes.attempts, error: nativeRes.error },
        fallback: { stage: fallbackRes.stage, attempts: fallbackRes.attempts, error: fallbackRes.error },
      },
    },
    { status: 400 },
  );
}
