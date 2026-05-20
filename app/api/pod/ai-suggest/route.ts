// POST /api/pod/ai-suggest
//
// Appelé par l'extension Chrome quand l'utilisateur ouvre le badge
// Tipote sur un post LinkedIn HORS pod ("mode Kawaak" pour commenter
// rapidement n'importe quel post avec assistance IA — Béné, 19 mai 2026).
//
// Pour les posts du pod, les suggestions sont pré-générées au fan-out
// (cf. fanOutForPod dans podBoostService.ts), donc l'extension lit
// directement depuis la task. Ici c'est juste pour le cas on-demand.
//
// Rate limiting : pas de quota strict pour l'instant — Phase 4. À
// surveiller dans les logs si abus.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { generateSuggestions } from "@/lib/podAiSuggest";

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    activity_urn?: string;
    content_excerpt?: string;
    language?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // activity_urn pas strictement requis pour le call IA (le contenu
  // suffit) — utile en log pour diag + futur cache par URN.
  const language = body.language?.trim().toLowerCase() || "fr";
  const excerpt = body.content_excerpt?.trim() || null;

  const suggestions = await generateSuggestions({
    contentExcerpt: excerpt,
    language,
  });

  return NextResponse.json({ ok: true, suggestions });
}
