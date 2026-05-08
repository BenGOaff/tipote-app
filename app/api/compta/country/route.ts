// POST /api/compta/country
//
// Met à jour business_profiles.country pour le projet actif de l'user.
// Surface dédiée à l'onglet Compta — réutilise le même champ que
// l'onboarding mais expose une route minimale pour ne pas avoir à
// faire passer toutes les autres validations zod du PATCH /api/profile.
//
// Le champ est partagé avec le reste de l'app (formulaire civilité
// "tu/vous", géolocalisation des contenus, etc.) → on prend soin de
// ne pas écraser involontairement d'autres colonnes.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

const Body = z.object({
  country: z.string().trim().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof Body>;
  try {
    const json = await req.json();
    body = Body.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // Update si la ligne business_profiles existe pour le projet actif,
  // sinon insert. On sépare les 2 cas pour ne pas avoir à passer un
  // upsert avec onConflict (la contrainte d'unicité varie selon les
  // anciennes / nouvelles installations).
  let q = supabaseAdmin
    .from("business_profiles")
    .select("id")
    .eq("user_id", user.id);
  if (projectId) q = q.eq("project_id", projectId);
  const { data: existing } = await q.maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("business_profiles")
      .update({ country: body.country })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
  } else {
    const { error } = await supabaseAdmin
      .from("business_profiles")
      .insert({
        user_id: user.id,
        project_id: projectId,
        country: body.country,
      });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, country: body.country });
}
