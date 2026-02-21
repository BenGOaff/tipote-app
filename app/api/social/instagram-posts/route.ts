// app/api/social/instagram-posts/route.ts
// Returns the user's recent Instagram media for the automation post picker.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com/v21.0";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: connection, error } = await supabase
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "instagram")
    .maybeSingle();

  if (error || !connection) {
    return NextResponse.json({ error: "Instagram not connected" }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(connection.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Token decryption failed" }, { status: 500 });
  }

  const igUserId = connection.platform_user_id;

  const igRes = await fetch(
    `${INSTAGRAM_GRAPH_BASE}/${igUserId}/media?fields=id,caption,timestamp,permalink,media_type&limit=30&access_token=${accessToken}`,
    { cache: "no-store" }
  );

  if (!igRes.ok) {
    const err = await igRes.text();
    console.error("[instagram-posts] Graph API error:", err);
    return NextResponse.json({ error: "Failed to fetch posts from Instagram" }, { status: 502 });
  }

  const igData = await igRes.json();
  const posts = (igData.data ?? []).map((p: any) => ({
    id: p.id,
    message: p.caption ?? "",
    created_time: p.timestamp,
    permalink_url: p.permalink ?? `https://www.instagram.com/p/${p.id}/`,
    media_type: p.media_type,
  }));

  return NextResponse.json({ posts });
}
