// POST /api/pod/posts
// Signalé par l'extension de l'AUTEUR quand on détecte qu'il vient de
// publier sur LinkedIn (DOM observer + confirmation Voyager pour récup
// l'URN officiel). Le backend insère pod_posts (idempotent via UNIQUE
// linkedin_post_urn) et fait le fan-out vers les pod-mates eligibles.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { signalPostPublished } from "@/lib/podBoostService";

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    linkedin_post_urn?: string;
    post_url?: string;
    content_excerpt?: string;
    language?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const urn = (body.linkedin_post_urn ?? "").trim();
  // Format URN LinkedIn d'un post : `urn:li:activity:<id>` ou `urn:li:share:<id>`
  // ou `urn:li:ugcPost:<id>`. Garde-fou minimal.
  if (!/^urn:li:(activity|share|ugcPost):[A-Za-z0-9_-]+$/.test(urn)) {
    return NextResponse.json({ ok: false, error: "invalid_post_urn" }, { status: 400 });
  }

  const result = await signalPostPublished({
    authorUserId: user.id,
    linkedinPostUrn: urn,
    postUrl: body.post_url?.trim() || null,
    contentExcerpt: body.content_excerpt?.trim() || null,
    language: body.language?.trim().toLowerCase() || null,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
