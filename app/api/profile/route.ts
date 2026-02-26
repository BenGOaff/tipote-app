// app/api/profile/route.ts
// Profil business (business_profiles) — lecture + update depuis /settings
// ✅ Cohérent avec le code existant : colonnes snake_case (cf. app/api/onboarding/answers/route.ts)
// - GET: retourne le profil (ou null)
// - PATCH: met à jour un sous-ensemble de champs safe (sans casser l'onboarding)
// ✅ MULTI-PROJETS : scoped au projet actif via cookie


import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

type AnyRecord = Record<string, any>;

const OfferItemSchema = z.object({
  name: z.string().trim().max(200).default(""),
  type: z.string().trim().max(80).optional().default(""),
  price: z.union([z.string().max(40), z.number()]).optional().default(""),
  salesCount: z.union([z.string().max(40), z.number()]).optional().default(""),
  link: z.string().trim().max(400).optional().default(""),
  promise: z.string().trim().max(500).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  target: z.string().trim().max(500).optional().default(""),
  format: z.string().trim().max(200).optional().default(""),
});

const UpdateSchema = z.object({
  first_name: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  niche: z.string().trim().max(5000).optional(),
  mission: z.string().trim().max(10000).optional(),

  business_maturity: z.string().trim().max(120).optional(),
  offers_status: z.string().trim().max(120).optional(),

  main_goals: z.array(z.string().trim().max(200)).max(10).optional(),
  preferred_content_types: z.array(z.string().trim().max(120)).max(12).optional(),
  tone_preference: z.string().trim().max(120).optional(),

  offers: z.array(OfferItemSchema).max(50).optional(),

  privacy_url: z.string().trim().max(500).optional(),
  terms_url: z.string().trim().max(500).optional(),
  cgv_url: z.string().trim().max(500).optional(),

  sio_user_api_key: z.string().trim().max(200).optional(),

  content_locale: z.string().trim().max(10).optional(),
  address_form: z.enum(["tu", "vous"]).optional(),
  revenue_goal_monthly: z.string().trim().max(200).optional(),

  // Branding
  brand_font: z.string().trim().max(100).optional(),
  brand_color_base: z.string().trim().max(30).optional(),
  brand_color_accent: z.string().trim().max(30).optional(),
  brand_logo_url: z.string().trim().max(1000).optional(),
  brand_author_photo_url: z.string().trim().max(1000).optional(),
  brand_tone_of_voice: z.string().trim().max(500).optional(),

  linkedin_url: z.string().trim().max(500).optional(),
  instagram_url: z.string().trim().max(500).optional(),
  youtube_url: z.string().trim().max(500).optional(),
  website_url: z.string().trim().max(500).optional(),

  // Auto-comments automation
  auto_comment_style_ton: z.string().trim().max(40).optional(),
  auto_comment_langage: z
    .object({
      mots_cles: z.array(z.string().max(80)).max(20).optional(),
      emojis: z.array(z.string().max(10)).max(20).optional(),
      expressions: z.array(z.string().max(200)).max(20).optional(),
    })
    .optional(),
  auto_comment_objectifs: z.array(z.string().trim().max(80)).max(5).optional(),
});

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

    const projectId = await getActiveProjectId(supabase, user.id);

    let query = supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", user.id);

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query.maybeSingle();

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
      const flat = parsed.error.flatten();
      const fieldErrors = flat.fieldErrors ?? {};
      const summary = Object.entries(fieldErrors)
        .map(([k, msgs]) => `${k}: ${(msgs as string[]).join(", ")}`)
        .join("; ");
      console.error("[PATCH /api/profile] Validation error:", JSON.stringify(flat));
      return NextResponse.json(
        { ok: false, error: summary || "Validation error", details: flat },
        { status: 400 },
      );
    }

    const patch = parsed.data;

    // Rien à updater
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: true, profile: null }, { status: 200 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    const row: Record<string, unknown> = {
      user_id: user.id,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    if (projectId) row.project_id = projectId;

    // Si project_id est présent, update par user_id + project_id
    // Sinon fallback au upsert par user_id seul (ancien comportement)
    let data: any = null;
    let error: any = null;

    if (projectId) {
      const upd = await supabase
        .from("business_profiles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .select("*")
        .maybeSingle();
      // If no row matched (legacy profile has project_id=null), fall back to upsert by user_id
      if (!upd.error && upd.data) {
        data = upd.data;
      } else if (!upd.error) {
        const ups = await supabase
          .from("business_profiles")
          .upsert(row, { onConflict: "user_id" })
          .select("*")
          .maybeSingle();
        data = ups.data;
        error = ups.error;
      } else {
        error = upd.error;
      }
    } else {
      const ups = await supabase
        .from("business_profiles")
        .upsert(row, { onConflict: "user_id" })
        .select("*")
        .maybeSingle();
      data = ups.data;
      error = ups.error;
    }

    if (error) {
      console.error("[PATCH /api/profile] DB error:", error.message, error.code);
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, profile: data ?? null }, { status: 200 });
  } catch (e) {
    console.error("[PATCH /api/profile] Unexpected error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
