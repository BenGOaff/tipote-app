// app/api/visual-studio/styles/route.ts
//
// CRUD des STYLES enregistrés du Studio visuel (combinaisons nommées) +
// recommandation apprise des votes. Auth Supabase (Tipote OU affilié) ; RLS
// garantit que chaque user ne touche que ses lignes. Pas de crédit (réglages).
//
//   GET    → { styles: SavedStyle[], recommended: { preferred, avoid } }
//   POST   → crée/maj un style { id?, name, settings, isDefault? }
//   DELETE → supprime un style { id }

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizeStyleSettings, learnPreferredStyle, type SavedStyle } from "@/lib/visualStudio/stylePrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const [{ data: styleRows }, { data: voteRows }] = await Promise.all([
    supabase
      .from("visual_studio_styles")
      .select("id, name, settings, is_default")
      .order("updated_at", { ascending: false }),
    supabase.from("visual_studio_votes").select("vote, ai_style").limit(500),
  ]);

  const styles: SavedStyle[] = (styleRows ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    name: String((r as { name: string }).name),
    settings: sanitizeStyleSettings((r as { settings: unknown }).settings),
    isDefault: !!(r as { is_default: boolean }).is_default,
  }));

  const recommended = learnPreferredStyle(
    (voteRows ?? []).map((v) => ({ vote: Number((v as { vote: number }).vote), ai_style: (v as { ai_style: string | null }).ai_style })),
  );

  return NextResponse.json({ ok: true, styles, recommended });
}

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

  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ ok: false, error: "Nom manquant" }, { status: 400 });
  const settings = sanitizeStyleSettings(body.settings);
  const isDefault = body.isDefault === true;
  const id = typeof body.id === "string" ? body.id : undefined;

  // Un seul défaut à la fois : si on marque celui-ci par défaut, on retire le flag des autres.
  if (isDefault) {
    await supabase.from("visual_studio_styles").update({ is_default: false }).eq("user_id", user.id);
  }

  const row = {
    user_id: user.id,
    name,
    settings,
    is_default: isDefault,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? supabase.from("visual_studio_styles").update(row).eq("id", id).eq("user_id", user.id).select("id").maybeSingle()
    : supabase.from("visual_studio_styles").insert(row).select("id").maybeSingle();

  const { data, error } = await query;
  if (error) {
    console.error("[visual-studio/styles] save error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "Id manquant" }, { status: 400 });

  const { error } = await supabase.from("visual_studio_styles").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
