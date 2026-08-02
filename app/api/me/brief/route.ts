// app/api/me/brief/route.ts
//
// Lecture / écriture du brief d'écriture retenu (cf. lib/generatorBrief.ts).
//
// Le brief est un confort : il ne doit JAMAIS empêcher de générer.
// Toutes les erreurs sortent en 200 avec un `ok: false` explicite, sauf
// l'absence de session. Un échec d'enregistrement ne remonte pas à
// l'écran : l'utilisatrice a son texte, c'est ce qui compte.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isBriefScope, sanitizeBrief } from "@/lib/generatorBrief";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope");
  if (!isBriefScope(scope)) {
    return NextResponse.json({ ok: false, reason: "bad_scope" }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauth" }, { status: 401 });

  const { data } = await supabase
    .from("generator_briefs")
    .select("brief")
    .eq("user_id", user.id)
    .eq("scope", scope)
    .maybeSingle();

  return NextResponse.json({ ok: true, brief: sanitizeBrief(data?.brief) });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { scope?: unknown; brief?: unknown }
    | null;
  if (!body || !isBriefScope(body.scope)) {
    return NextResponse.json({ ok: false, reason: "bad_scope" }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauth" }, { status: 401 });

  const brief = sanitizeBrief(body.brief);

  const { error } = await supabase.from("generator_briefs").upsert(
    {
      user_id: user.id,
      scope: body.scope,
      brief,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,scope" },
  );

  // Table pas encore créée en prod, RLS, réseau : on le dit sans casser
  // l'écran. Le brief sera simplement redemandé la prochaine fois.
  if (error) return NextResponse.json({ ok: false, reason: "db" });

  return NextResponse.json({ ok: true, brief });
}
