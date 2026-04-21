// app/api/quiz/[quizId]/slug-available/route.ts
// Lightweight slug-availability probe for the editor.
// Returns `{ ok: true, available: boolean }`. Soft-fails to `available: true`
// on auth/network issues so the final uniqueness check (on save) still wins.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { sanitizeSlug } from "@/lib/quizBranding";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { quizId } = await params;
  const rawSlug = new URL(req.url).searchParams.get("slug") ?? "";
  const cleaned = sanitizeSlug(rawSlug);
  if (!cleaned) {
    return NextResponse.json({ ok: true, available: false, reason: "invalid" });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const { data } = await supabase
      .from("quizzes")
      .select("id")
      .ilike("slug", cleaned)
      .neq("id", quizId)
      .maybeSingle();

    return NextResponse.json({ ok: true, available: !data });
  } catch {
    return NextResponse.json({ ok: true, available: true });
  }
}
