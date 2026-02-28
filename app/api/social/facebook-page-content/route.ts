// app/api/social/facebook-page-content/route.ts
// Lit le contenu utilisateur d'une Page Facebook (commentaires, visitor posts, tagged posts).
// Utilise la permission pages_read_user_content.
// Sert à démontrer l'usage de cette permission pour l'App Review Meta.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: connection } = await supabase
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "facebook")
    .maybeSingle();

  if (!connection?.access_token_encrypted) {
    return NextResponse.json({ error: "Facebook not connected" }, { status: 404 });
  }

  let token: string;
  try {
    token = decrypt(connection.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Token decryption failed" }, { status: 500 });
  }

  const pageId = connection.platform_user_id;

  // Fetch en parallèle : infos page + posts avec commentaires + tagged posts
  const [pageInfo, postsWithComments, taggedPosts] = await Promise.all([
    fetchPageInfo(pageId, token),
    fetchPostsWithComments(pageId, token),
    fetchTaggedPosts(pageId, token),
  ]);

  return NextResponse.json({
    page: pageInfo,
    posts: postsWithComments,
    tagged: taggedPosts,
  });
}

async function fetchPageInfo(pageId: string, token: string) {
  try {
    const res = await fetch(
      `${GRAPH}/${pageId}?fields=name,picture,fan_count,category&access_token=${token}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPostsWithComments(pageId: string, token: string) {
  try {
    const res = await fetch(
      `${GRAPH}/${pageId}/feed?fields=id,message,story,created_time,from,permalink_url,comments.limit(5){message,from,created_time}&limit=10&access_token=${token}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error("[facebook-page-content] posts error:", err);
      return [];
    }
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

async function fetchTaggedPosts(pageId: string, token: string) {
  try {
    const res = await fetch(
      `${GRAPH}/${pageId}/tagged?fields=id,message,from,created_time,permalink_url&limit=10&access_token=${token}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}
