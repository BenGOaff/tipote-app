// app/api/visual-studio/brand-kit/route.ts
//
// Renvoie, pour l'utilisateur Tipote connecté, son brand kit (couleurs/logo/
// police) au format Studio + un "voiceHint" (tonalité, offres, puces promesses,
// persona) condensé pour orienter la copy IA. Lecture seule, pas de crédit.
//
// Le studio (TipoteStudioButton) appelle ceci à l'ouverture pour habiller le
// canvas aux couleurs de l'user et nourrir l'IA de SA voix de marque.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { loadBrandBundle, brandVoiceToPromptHint } from "@/lib/visualStudio/brandLoader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);
    const { brand, voice } = await loadBrandBundle(user.id, projectId);

    return NextResponse.json({ ok: true, brand, voiceHint: brandVoiceToPromptHint(voice) });
  } catch (e) {
    console.error("[visual-studio/brand-kit] error:", e);
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
