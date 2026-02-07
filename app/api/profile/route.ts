// app/api/profile/route.ts
// Profil business (business_profiles) — lecture + update depuis /settings
// ✅ Cohérent avec le code existant : colonnes snake_case (cf. app/api/onboarding/answers/route.ts)
// - GET: retourne le profil (ou null)
// - PATCH: met à jour un sous-ensemble de champs safe (sans casser l’onboarding)


 import { NextRequest, NextResponse } from "next/server";
 import { z } from "zod";
 import { getSupabaseServerClient } from "@/lib/supabaseServer";

type AnyRecord = Record<string, any>;

const UpdateSchema = z
  .object({
    first_name: z.string().trim().max(120).optional(),
    country: z.string().trim().max(120).optional(),
    niche: z.string().trim().max(200).optional(),
    mission: z.string().trim().max(500).optional(),

    business_maturity: z.string().trim().max(120).optional(),
    offers_status: z.string().trim().max(120).optional(),

    main_goals: z.array(z.string().trim().max(200)).max(10).optional(),
    preferred_content_types: z.array(z.string().trim().max(120)).max(12).optional(),
    tone_preference: z.string().trim().max(120).optional(),
  })
  .strict();

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id)
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

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const patch = parsed.data;

    // Rien à updater
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, profile: null }, { status: 200 });
    }

    const row = {
      user_id: user.id,
      ...patch,
      updated_at: new Date().toISOString(),
    };

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
