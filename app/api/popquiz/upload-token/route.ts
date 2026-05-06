// POST /api/popquiz/upload-token
//
// Mints a tus upload session for the caller. We hand back two tokens
// (source video + thumbnail) bound to the same `videoId`, so a single
// roundtrip equips the client for the whole upload flow.
//
// Tokens are short-lived (1 h), HS256-signed, and carry the user id,
// videoId, ext and kind. The tus server uses those claims as the only
// authority for where the file lands — the client cannot redirect a
// file into another user's folder by tampering with metadata.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  POPQUIZ_APP,
  normalizeExt,
  signUploadToken,
  uploadEndpoint,
} from "@/lib/popquiz/playback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 20 * 1024 ** 3; // 20 Gio — keep aligned with VideoUploader hint

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

  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const fileSize =
    typeof body.fileSize === "number" && Number.isFinite(body.fileSize)
      ? body.fileSize
      : 0;
  const wantThumbnail = body.thumbnail !== false;

  if (!fileName) {
    return NextResponse.json(
      { ok: false, error: "fileName is required" },
      { status: 400 },
    );
  }
  if (fileSize <= 0 || fileSize > MAX_SOURCE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Fichier trop volumineux (max 20 Go)." },
      { status: 400 },
    );
  }

  const sourceExt = normalizeExt(fileName, "source");
  if (!sourceExt) {
    return NextResponse.json(
      { ok: false, error: "Format vidéo non supporté (mp4, webm, mov, m4v, mkv)." },
      { status: 400 },
    );
  }

  const videoId = randomUUID();
  const uploadUrl = uploadEndpoint();

  const source = signUploadToken({
    sub: user.id,
    app: POPQUIZ_APP,
    videoId,
    ext: sourceExt,
    kind: "source",
  });

  const thumbnail = wantThumbnail
    ? signUploadToken({
        sub: user.id,
        app: POPQUIZ_APP,
        videoId,
        ext: "jpg",
        kind: "thumbnail",
      })
    : null;

  // The path the client must POST as `storage_path` after upload.
  // Mirrors the tus server's namingFunction so frontend and backend
  // agree on where the file actually lives.
  const sourcePath = `${POPQUIZ_APP}/raw/${user.id}/${videoId}/source.${sourceExt}`;
  const thumbnailPath = wantThumbnail
    ? `${POPQUIZ_APP}/raw/${user.id}/${videoId}/thumbnail.jpg`
    : null;

  return NextResponse.json({
    ok: true,
    videoId,
    uploadUrl,
    source: {
      token: source.token,
      expiresAt: source.expiresAt,
      ext: sourceExt,
      storagePath: sourcePath,
    },
    thumbnail: thumbnail
      ? {
          token: thumbnail.token,
          expiresAt: thumbnail.expiresAt,
          ext: "jpg",
          storagePath: thumbnailPath,
        }
      : null,
  });
}
