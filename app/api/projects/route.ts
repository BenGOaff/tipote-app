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

export const dynamic = "force-dynamic";

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
      .select("id, name, is_default, created_at")
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
        { ok: false, error: "ELITE_REQUIRED", message: "Multi-projets est réservé au plan Elite." },
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
      .select("id, name, is_default, created_at")
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
// PATCH : renommer un projet
// ────────────────────────────────────────────
const RenameSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
});

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

    const parsed = RenameSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("projects")
      .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("user_id", user.id)
      .select("id, name, is_default, created_at")
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
