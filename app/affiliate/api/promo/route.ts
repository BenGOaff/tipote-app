// app/affiliate/api/promo/route.ts
//
// PATCH /affiliate/api/promo — édite / réinitialise un texte promo
// personnalisé par l'affilié.
//   body: { key: string, value: string | null }
//   value non vide → upsert l'override
//   value null / "" → supprime l'override (= retour au modèle d'origine)
//
// La clé suit le schéma "<kind>:<id>:<field>" (cf. migration). On la
// valide pour éviter d'écrire des clés arbitraires / trop longues.

import { NextRequest, NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// kind:id:field — kind ∈ email|post, id et field alphanum + tirets.
const KEY_RE = /^(email|post):[a-z0-9-]{1,60}:[a-z0-9_]{1,30}$/;
const MAX_LEN = 20000;

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: { key?: string; value?: string | null };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const key = typeof body.key === "string" ? body.key : "";
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, reason: "invalid_key" }, { status: 400 });
  }

  const rawValue = typeof body.value === "string" ? body.value : null;
  if (rawValue !== null && rawValue.length > MAX_LEN) {
    return NextResponse.json({ ok: false, reason: "too_long" }, { status: 400 });
  }

  const { data: current } = await supabaseAdmin
    .from("affiliates")
    .select("promo_overrides")
    .eq("sa", session.sa)
    .maybeSingle();

  const map = ((current as { promo_overrides?: Record<string, string> } | null)?.promo_overrides) ?? {};

  const trimmed = rawValue?.trim() ?? "";
  if (trimmed) {
    map[key] = rawValue!;
  } else {
    delete map[key];
  }

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({ promo_overrides: map, updated_at: new Date().toISOString() })
    .eq("sa", session.sa);

  if (error) {
    console.error("[affiliate/promo] update error:", error.message);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, key, reset: !trimmed });
}
