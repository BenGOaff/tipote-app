// POST /api/popquiz/playback-url
//
// Mints short-lived playback URLs for a freshly-uploaded video so the
// editor preview can stream it before the popquiz row is even saved.
// Path ownership is enforced server-side: only paths that start with
// `<app>/raw/<auth.uid>/` are allowed, so users can't fish around in
// each other's storage by guessing video ids.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  POPQUIZ_APP,
  signedPlaybackUrl,
} from "@/lib/popquiz/playback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const path = typeof body.path === "string" ? body.path : "";
  const thumbnailPath =
    typeof body.thumbnailPath === "string" ? body.thumbnailPath : null;

  const expectedPrefix = `${POPQUIZ_APP}/raw/${user.id}/`;
  if (!path || !path.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { ok: false, error: "Invalid path" },
      { status: 400 },
    );
  }
  if (thumbnailPath && !thumbnailPath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { ok: false, error: "Invalid thumbnail path" },
      { status: 400 },
    );
  }

  try {
    const signedUrl = signedPlaybackUrl(path);
    const thumbnailUrl = thumbnailPath ? signedPlaybackUrl(thumbnailPath) : null;
    return NextResponse.json({ ok: true, signedUrl, thumbnailUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "playback signing failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
