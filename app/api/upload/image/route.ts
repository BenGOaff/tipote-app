// app/api/upload/image/route.ts
// POST : upload d'image vers Supabase Storage (bucket content-images)
// Body : FormData avec champ "file" (image) et optionnel "contentId"
// Retourne : { ok: true, url: string, path: string }
// Stockage : {user_id}/{contentId|"drafts"}/{timestamp}-{filename}
// Taille max : 10MB
// Formats : PNG, JPG/JPEG, GIF

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
const BUCKET = "content-images";

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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide. Envoie un FormData avec un champ 'file'." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Champ 'file' manquant ou invalide." },
      { status: 400 }
    );
  }

  // Validate file type
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Format non supporté (${file.type}). Formats acceptés : PNG, JPG, GIF.` },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return NextResponse.json(
      { error: `Fichier trop volumineux (${sizeMB}MB). Taille max : 10MB.` },
      { status: 400 }
    );
  }

  const contentId = (formData.get("contentId") as string) || "drafts";
  const timestamp = Date.now();
  const safeName = sanitizeFilename(file.name);
  const storagePath = `${user.id}/${contentId}/${timestamp}-${safeName}`;

  // Upload to Supabase Storage using admin client (bypasses RLS for reliability)
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Image upload error:", uploadError);
    return NextResponse.json(
      { error: `Erreur d'upload : ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Get public URL
  const { data: urlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return NextResponse.json({
    ok: true,
    url: urlData.publicUrl,
    path: storagePath,
    filename: safeName,
    size: file.size,
    type: file.type,
  });
}

// DELETE : supprime une image du storage
export async function DELETE(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const path = body?.path as string | undefined;

  if (!path) {
    return NextResponse.json({ error: "Chemin manquant." }, { status: 400 });
  }

  // Security: ensure user can only delete their own images
  if (!path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);

  if (error) {
    console.error("Image delete error:", error);
    return NextResponse.json(
      { error: `Erreur de suppression : ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
