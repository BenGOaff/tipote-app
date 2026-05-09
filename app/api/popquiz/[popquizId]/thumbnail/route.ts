// POST /api/popquiz/[popquizId]/thumbnail/upload-token
//   Mints a tus token for uploading a custom thumbnail bound to the
//   popquiz's existing videoId. Reuses the same tus pipeline as the
//   initial upload — only the `kind` claim differs ("thumbnail-custom").
//
// PATCH /api/popquiz/[popquizId]/thumbnail
//   body: { mode: "custom", storagePath } → switches the playback
//     thumbnail to the freshly-uploaded custom one
//   body: { mode: "auto" }                → restores the auto poster
//
// The auto thumbnail file (thumbnail.jpg) is never deleted, so toggling
// back is a single DB update — no re-upload, no re-extraction.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  POPQUIZ_APP,
  normalizeExt,
  signUploadToken,
  signedPlaybackUrl,
  uploadEndpoint,
} from "@/lib/popquiz/playback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_THUMB_BYTES = 5 * 1024 * 1024; // 5 Mio — we always crop down before upload

function deriveAutoThumbPath(storagePath: string | null): string | null {
  if (!storagePath) return null;
  // sourcePath: <app>/raw/<uid>/<videoId>/source.<ext>
  const lastSlash = storagePath.lastIndexOf("/");
  if (lastSlash < 0) return null;
  return `${storagePath.slice(0, lastSlash)}/thumbnail.jpg`;
}

async function loadVideoForOwner(
  supabase: any,
  popquizId: string,
  userId: string,
) {
  const { data: popquiz, error } = await supabase
    .from("popquizzes")
    .select("id, user_id, video_id, video:popquiz_videos!inner(id, storage_path, thumbnail_path)")
    .eq("id", popquizId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !popquiz) return null;
  const video = Array.isArray(popquiz.video) ? popquiz.video[0] : popquiz.video;
  if (!video) return null;
  return {
    popquizId: popquiz.id as string,
    videoRowId: video.id as string,
    storagePath: (video.storage_path as string | null) ?? null,
    thumbnailPath: (video.thumbnail_path as string | null) ?? null,
  };
}

function extractVideoIdFromPath(storagePath: string | null): string | null {
  if (!storagePath) return null;
  // <app>/raw/<userId>/<videoId>/source.<ext>
  const m = storagePath.match(
    /^[a-z]+\/raw\/[0-9a-f-]+\/([0-9a-f-]+)\/[^/]+$/i,
  );
  return m ? m[1] : null;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ popquizId: string }> },
) {
  const { popquizId } = await ctx.params;
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

  const popquiz = await loadVideoForOwner(supabase, popquizId, user.id);
  if (!popquiz) {
    return NextResponse.json(
      { ok: false, error: "Popquiz introuvable" },
      { status: 404 },
    );
  }

  // VideoId pour le path de stockage : pour les vidéos uploadées on
  // l'extrait du storagePath existant (= même dossier que la vidéo
  // source). Pour les YouTube / Vimeo / URL qui n'ont pas de
  // storagePath, on retombe sur le popquizId — le thumbnail vit alors
  // dans `<app>/raw/<uid>/<popquizId>/thumbnail-custom.<ext>`. Permet
  // d'avoir une vignette custom pour TOUTE source de vidéo.
  const videoId = extractVideoIdFromPath(popquiz.storagePath) ?? popquizId;

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
  if (!fileName) {
    return NextResponse.json(
      { ok: false, error: "fileName required" },
      { status: 400 },
    );
  }
  if (fileSize <= 0 || fileSize > MAX_THUMB_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Fichier trop volumineux (max 5 Mo)." },
      { status: 400 },
    );
  }

  const ext = normalizeExt(fileName, "thumbnail-custom");
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Format non supporté (jpg, jpeg, png, webp)." },
      { status: 400 },
    );
  }

  const signed = signUploadToken({
    sub: user.id,
    app: POPQUIZ_APP,
    videoId,
    ext,
    kind: "thumbnail-custom",
  });

  const storagePath = `${POPQUIZ_APP}/raw/${user.id}/${videoId}/thumbnail-custom.${ext}`;

  return NextResponse.json({
    ok: true,
    uploadUrl: uploadEndpoint(),
    token: signed.token,
    expiresAt: signed.expiresAt,
    ext,
    storagePath,
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ popquizId: string }> },
) {
  const { popquizId } = await ctx.params;
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

  const popquiz = await loadVideoForOwner(supabase, popquizId, user.id);
  if (!popquiz) {
    return NextResponse.json(
      { ok: false, error: "Popquiz introuvable" },
      { status: 404 },
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

  const mode = body.mode === "custom" || body.mode === "auto" ? body.mode : null;
  if (!mode) {
    return NextResponse.json(
      { ok: false, error: "mode required ('custom' | 'auto')" },
      { status: 400 },
    );
  }

  let nextThumbnailPath: string | null = null;

  if (mode === "auto") {
    nextThumbnailPath = deriveAutoThumbPath(popquiz.storagePath);
    if (!nextThumbnailPath) {
      return NextResponse.json(
        { ok: false, error: "Aucune vignette auto disponible" },
        { status: 400 },
      );
    }
  } else {
    const storagePath =
      typeof body.storagePath === "string" ? body.storagePath.trim() : "";
    const expectedPrefix = `${POPQUIZ_APP}/raw/${user.id}/`;
    if (!storagePath || !storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { ok: false, error: "storagePath invalide" },
        { status: 400 },
      );
    }
    if (!storagePath.includes("/thumbnail-custom.")) {
      return NextResponse.json(
        { ok: false, error: "Le path doit pointer sur une vignette custom" },
        { status: 400 },
      );
    }
    nextThumbnailPath = storagePath;
  }

  const { error: updErr } = await supabase
    .from("popquiz_videos")
    .update({ thumbnail_path: nextThumbnailPath })
    .eq("id", popquiz.videoRowId);

  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message },
      { status: 500 },
    );
  }

  // Mint a fresh signed URL so the editor preview can repaint without
  // waiting for a full page refresh / repo.ts mint.
  let thumbnailUrl: string | null = null;
  try {
    thumbnailUrl = signedPlaybackUrl(nextThumbnailPath);
  } catch {
    /* env vars missing — return null, parent UI will refetch later */
  }

  return NextResponse.json({
    ok: true,
    mode,
    thumbnailPath: nextThumbnailPath,
    thumbnailUrl,
  });
}
