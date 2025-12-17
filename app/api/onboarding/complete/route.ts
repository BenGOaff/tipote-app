// app/api/onboarding/complete/route.ts
// Mark onboarding as completed (or skipped) in `public.profiles.onboarding_done`.
// NOTE: Strategy generation is intentionally NOT done here anymore to avoid long blocking calls.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const BodySchema = z
  .object({
    skip: z.boolean().optional(),
  })
  .optional();

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

    let body: z.infer<typeof BodySchema> = undefined;
    try {
      body = BodySchema.parse(await req.json());
    } catch {
      body = undefined;
    }

    const now = new Date().toISOString();

    // Make sure a profiles row exists, and mark onboarding as done.
    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          onboarding_done: true,
          onboarding_done_at: now,
          updated_at: now,
        },
        { onConflict: "id" },
      );

    if (error) {
      // Fallback: some schemas don't have onboarding_done_at
      const { error: fallbackError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            onboarding_done: true,
            updated_at: now,
          },
          { onConflict: "id" },
        );

      if (fallbackError) {
        return NextResponse.json({ ok: false, error: fallbackError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, skipped: Boolean(body?.skip) }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/onboarding/complete] Unexpected error", err);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error", details: `${err}` },
      { status: 500 },
    );
  }
}
