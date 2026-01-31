// app/api/coach/actions/reject/route.ts
// Rejet d'une suggestion (MVP: log minimal côté serveur)
// On garde une API dédiée pour analytics/itérations futures.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RejectBodySchema = z
  .object({
    suggestionId: z.string().trim().min(1).max(128),
    type: z.enum(["update_offer_pyramid", "update_tasks", "open_tipote_tool"]).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    const parsed = RejectBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    // MVP: no DB write (on pourra logger dans une table dédiée plus tard)
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
