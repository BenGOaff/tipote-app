// app/api/visual-studio/vote/route.ts
//
// Enregistre un 👍/👎 sur un visuel généré + un snapshot des réglages. Sert à
// apprendre le style préféré de l'user (cf. learnPreferredStyle, exploité par
// GET /styles → `recommended`). Auth Supabase (Tipote/affilié), RLS par user.
// Pas de crédit (feedback).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizeStyleSettings } from "@/lib/visualStudio/stylePrefs";
import { isAiStyleId } from "@/lib/visualStudio/aiPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const vote = body.vote === 1 || body.vote === -1 ? body.vote : null;
  if (vote === null) return NextResponse.json({ ok: false, error: "Vote invalide" }, { status: 400 });
  const aiStyle = isAiStyleId(body.aiStyle) ? body.aiStyle : null;

  const { error } = await supabase.from("visual_studio_votes").insert({
    user_id: user.id,
    vote,
    ai_style: aiStyle,
    settings: sanitizeStyleSettings(body.settings),
  });
  if (error) {
    console.error("[visual-studio/vote] error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
