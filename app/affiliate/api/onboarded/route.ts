// app/affiliate/api/onboarded/route.ts
//
// PATCH /affiliate/api/onboarded — marque le tutoriel comme terminé
//   body: { action: "complete" | "reset" }
//   complete → set onboarded_at = now()
//   reset    → set onboarded_at = null (relance le tour)

import { NextRequest, NextResponse } from "next/server";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getAffiliateSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = body.action === "reset" ? "reset" : "complete";
  const onboardedAt = action === "reset" ? null : new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("affiliates")
    .update({
      onboarded_at: onboardedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("sa", session.sa);

  if (error) {
    console.error("[affiliate/onboarded] update error:", error.message);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action, onboarded_at: onboardedAt });
}
