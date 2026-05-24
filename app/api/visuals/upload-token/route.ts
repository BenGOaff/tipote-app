// POST /api/visuals/upload-token
//
// Mint a tus upload token for a Studio visual (PNG/JPG/WebP). Reuses the
// self-hosted popquiz pipeline (tus.tipote.com → /srv/popquiz-videos →
// signed playback via videos.tipote.com). The file lands at
// <app>/raw/<auth.uid>/<visualId>/visual.<ext> — placement is decided
// server-side from the JWT claims, the browser can't redirect it.
//
// Generic on purpose: any authenticated user (dashboard, affiliate
// sub-domain — same Supabase cookies) can mint a token for their own
// folder. Reused as-is when the Studio is ported to Tiquiz/Tipote.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  POPQUIZ_APP,
  signUploadToken,
  uploadEndpoint,
} from "@/lib/popquiz/playback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // body optionnel — défaut PNG
  }
  const contentType = typeof body.contentType === "string" ? body.contentType : "image/png";
  const ext = EXT_BY_TYPE[contentType.toLowerCase()];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Format non supporté (png, jpg, webp)." },
      { status: 400 },
    );
  }

  const visualId = randomUUID();
  const { token, expiresAt } = signUploadToken({
    sub: user.id,
    app: POPQUIZ_APP,
    videoId: visualId,
    ext,
    kind: "visual",
  });

  // Doit refléter le namingFunction du serveur tus (visual.<ext>).
  const storagePath = `${POPQUIZ_APP}/raw/${user.id}/${visualId}/visual.${ext}`;

  return NextResponse.json({
    ok: true,
    visualId,
    uploadUrl: uploadEndpoint(),
    token,
    expiresAt,
    ext,
    storagePath,
  });
}
