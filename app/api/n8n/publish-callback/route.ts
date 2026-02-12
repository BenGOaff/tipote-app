// app/api/n8n/publish-callback/route.ts
// POST : appelé par n8n après publication d'un post.
// Met à jour le statut du content_item.
// Body : { content_id, success, postUrn?, error? }

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth par header secret
  const secret = req.headers.get("x-n8n-secret");
  if (!secret || secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const contentId = body?.content_id as string | undefined;
  const success = body?.success as boolean | undefined;
  const postUrn = body?.postUrn as string | undefined;
  const errorMsg = body?.error as string | undefined;

  if (!contentId) {
    return NextResponse.json({ error: "content_id manquant" }, { status: 400 });
  }

  if (success) {
    // Marquer comme publié + stocker l'URN du post LinkedIn dans meta
    const meta: Record<string, string> = {
      published_at: new Date().toISOString(),
    };
    if (postUrn) meta.linkedin_post_urn = postUrn;

    const { error } = await supabaseAdmin
      .from("content_item")
      .update({ status: "published", meta })
      .eq("id", contentId);

    if (error) {
      console.error("publish-callback update error:", error);

      // Fallback : juste mettre le statut
      await supabaseAdmin
        .from("content_item")
        .update({ status: "published" })
        .eq("id", contentId);
    }
  } else {
    console.error(`n8n publish failed for ${contentId}: ${errorMsg}`);
    // On ne change pas le statut pour ne pas perdre le "scheduled"
  }

  return NextResponse.json({ ok: true });
}
