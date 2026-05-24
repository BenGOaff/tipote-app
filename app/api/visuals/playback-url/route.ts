// POST /api/visuals/playback-url
//
// Mint a short-lived signed URL for a stored Studio visual. Ownership is
// enforced server-side: only paths under `<app>/raw/<auth.uid>/` are
// allowed, so a user can't fish for someone else's files.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { POPQUIZ_APP, signedPlaybackUrl } from "@/lib/popquiz/playback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path : "";
  const expectedPrefix = `${POPQUIZ_APP}/raw/${user.id}/`;
  if (!path || !path.startsWith(expectedPrefix)) {
    return NextResponse.json({ ok: false, error: "Invalid path" }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, signedUrl: signedPlaybackUrl(path) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "playback signing failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
