// app/api/upload/video/signed-url/route.ts
// POST : génère une signed URL pour upload direct vers Supabase Storage (contourne la limite 4.5MB de Vercel)
// Body : { filename, contentType, contentId? }
// Retourne : { ok, signedUrl, path, token }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const BUCKET = "content-videos";

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const filename = body?.filename as string | undefined;
  const contentType = body?.contentType as string | undefined;
  const contentId = (body?.contentId as string) || "drafts";

  if (!filename || !contentType) {
    return NextResponse.json(
      { error: "filename et contentType requis." },
      { status: 400 }
    );
  }

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: `Format non supporté (${contentType}). Formats acceptés : MP4, WebM, MOV.` },
      { status: 400 }
    );
  }

  const timestamp = Date.now();
  const safeName = sanitizeFilename(filename);
  const storagePath = `${user.id}/${contentId}/${timestamp}-${safeName}`;

  // Create a signed upload URL (valid 10 minutes)
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("[video/signed-url] Error creating signed URL:", error);
    return NextResponse.json(
      { error: `Erreur création URL signée : ${error?.message ?? "inconnue"}` },
      { status: 500 }
    );
  }

  // Also get the public URL for after upload
  const { data: urlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return NextResponse.json({
    ok: true,
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
    publicUrl: urlData.publicUrl,
    filename: safeName,
  });
}
