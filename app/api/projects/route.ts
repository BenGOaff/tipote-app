// app/api/projects/route.ts
// CRUD pour les projets multiprofils
//
// GET    → liste des projets du user (+ plan pour gating ELITE)
// POST   → créer un nouveau projet (ELITE only)
// PATCH  → renommer un projet
// DELETE → supprimer un projet (pas le default)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isValidAccentColor,
  isValidEmoji,
} from "@/lib/projects/visualIdentity";

export const dynamic = "force-dynamic";

const PROJECT_SELECT =
  "id, name, is_default, created_at, accent_color, icon_emoji, use_branding_logo";

// ────────────────────────────────────────────
// GET : liste des projets + plan actuel
// ────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Projets du user
    const { data: projects, error: projErr } = await supabase
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });

    if (projErr) {
      return NextResponse.json({ ok: false, error: projErr.message }, { status: 400 });
    }

    // Plan du user (pour gating ELITE côté client)
    let plan: string = "free";
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .maybeSingle();
      plan = profile?.plan ?? "free";
    } catch {
      // fail-open
    }

    return NextResponse.json({ ok: true, projects: projects ?? [], plan });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────
// POST : créer un nouveau projet (ELITE only)
// ────────────────────────────────────────────
const CreateSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(100),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Vérifier plan ELITE
    let plan: string = "free";
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .maybeSingle();
      plan = (profile?.plan ?? "free").toLowerCase();
    } catch {
      // fail-open
    }

    if (plan !== "elite") {
      return NextResponse.json(
        { ok: false, error: "ELITE_REQUIRED", message: "Multi-projets est réservé au plan Elite. Upgrade ton abonnement pour gérer plusieurs projets.", upgrade_url: "/settings?tab=billing" },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Créer le projet
    const { data: project, error: insertErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        is_default: false,
      })
      .select(PROJECT_SELECT)
      .single();

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 });
    }

    // Créer le business_profiles vide pour ce nouveau projet
    // (onboarding_completed = false => il devra faire l'onboarding)
    try {
      await supabase.from("business_profiles").insert({
        user_id: user.id,
        project_id: project.id,
        onboarding_completed: false,
      });
    } catch {
      // fail-open : sera créé lors de l'onboarding sinon
    }

    return NextResponse.json({ ok: true, project });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────
// PATCH : update name / accent_color / icon_emoji / use_branding_logo
// ────────────────────────────────────────────
// All fields optional — caller can update one or several at once. We
// validate accent_color and icon_emoji against our curated palettes
// (lib/projects/visualIdentity) so a malformed value never reaches DB.
const PatchSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100).optional(),
    accent_color: z.string().nullable().optional(),
    icon_emoji: z.string().nullable().optional(),
    use_branding_logo: z.boolean().optional(),
  })
  .refine((v) => {
    return (
      v.name !== undefined ||
      v.accent_color !== undefined ||
      v.icon_emoji !== undefined ||
      v.use_branding_logo !== undefined
    );
  }, "Aucun champ à mettre à jour");

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Validate the visual identity against our curated palettes —
    // null means "reset to default", anything else must be one of
    // ACCENT_COLORS / PROJECT_EMOJI.
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.accent_color !== undefined) {
      if (
        parsed.data.accent_color !== null &&
        !isValidAccentColor(parsed.data.accent_color)
      ) {
        return NextResponse.json(
          { ok: false, error: "accent_color non supporté" },
          { status: 400 },
        );
      }
      update.accent_color = parsed.data.accent_color;
    }
    if (parsed.data.icon_emoji !== undefined) {
      if (
        parsed.data.icon_emoji !== null &&
        !isValidEmoji(parsed.data.icon_emoji)
      ) {
        return NextResponse.json(
          { ok: false, error: "icon_emoji non supporté" },
          { status: 400 },
        );
      }
      update.icon_emoji = parsed.data.icon_emoji;
    }
    if (parsed.data.use_branding_logo !== undefined) {
      update.use_branding_logo = parsed.data.use_branding_logo;
    }

    const { data, error } = await supabase
      .from("projects")
      .update(update)
      .eq("id", parsed.data.id)
      .eq("user_id", user.id)
      .select(PROJECT_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, project: data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────
// DELETE : supprimer un projet (pas le default)
// ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const projectId = url.searchParams.get("id")?.trim();

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "id param required" }, { status: 400 });
    }

    // Vérifier que ce n'est pas le projet par défaut
    const { data: proj } = await supabase
      .from("projects")
      .select("id, is_default")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!proj) {
      return NextResponse.json({ ok: false, error: "Projet introuvable" }, { status: 404 });
    }

    if (proj.is_default) {
      return NextResponse.json(
        { ok: false, error: "Impossible de supprimer le projet principal" },
        { status: 400 },
      );
    }

    // Cascade delete via FK ON DELETE CASCADE sur toutes les tables liées
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
