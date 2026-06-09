// app/affiliate/api/guide/route.ts
//
// PATCH /affiliate/api/guide — marque une étape du guide de lancement
//   body: { step: "link_copied" | "first_email" | "first_post" | "payment_set", done?: boolean }
//   done défaut true. false retire l'étape de la map.
//
// Les autres étapes (profile, trial) sont auto-détectées depuis les
// colonnes natives et ne passent pas par cette route.
//
// payment_set est self-attestée (drame Bene 8 juin 2026) parce que le
// paiement n'est PAS configuré dans Tipote : il vit dans Systeme.io
// (https://systeme.io/dashboard/profile/affiliate-settings). L'user
// configure son PayPal / RIB la-bas, puis clique "fait" dans le guide.

import { NextRequest, NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELF_ATTEST_STEPS = new Set(["link_copied", "first_email", "first_post", "payment_set"]);

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: { step?: string; done?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const step = body.step;
  if (!step || !SELF_ATTEST_STEPS.has(step)) {
    return NextResponse.json({ ok: false, reason: "invalid_step" }, { status: 400 });
  }

  const done = body.done !== false;

  const { data: current } = await supabaseAdmin
    .from("affiliates")
    .select("launch_guide_completed")
    .eq("sa", session.sa)
    .maybeSingle();

  const map = ((current as { launch_guide_completed?: Record<string, string> } | null)?.launch_guide_completed) ?? {};

  if (done) {
    if (!map[step]) map[step] = new Date().toISOString();
  } else {
    delete map[step];
  }

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({
      launch_guide_completed: map,
      updated_at: new Date().toISOString(),
    })
    .eq("sa", session.sa);

  if (error) {
    console.error("[affiliate/guide] update error:", error.message);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, step, done, launch_guide_completed: map });
}
