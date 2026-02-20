// app/api/social/facebook-posts/route.ts
// Returns the user's recent Facebook page posts for the automation post picker.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

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

  // Get project_id from query params (optional)
  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get("project_id");

  // Look up user's Facebook connection
  let query = supabase
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "facebook")
    .maybeSingle();

  const { data: connection, error } = await query;

  if (error || !connection) {
    return NextResponse.json({ error: "Facebook not connected" }, { status: 404 });
  }

  let pageAccessToken: string;
  try {
    pageAccessToken = decrypt(connection.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Token decryption failed" }, { status: 500 });
  }

  const pageId = connection.platform_user_id;

  // Fetch recent posts from the Facebook Page
  const fbRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,message,story,created_time,permalink_url&limit=30&access_token=${pageAccessToken}`,
    { cache: "no-store" }
  );

  if (!fbRes.ok) {
    const err = await fbRes.text();
    console.error("[facebook-posts] Graph API error:", err);
    return NextResponse.json({ error: "Failed to fetch posts from Facebook" }, { status: 502 });
  }

  const fbData = await fbRes.json();
  const posts: FbPost[] = (fbData.data ?? []).map((p: any) => ({
    id: p.id,
    message: p.message ?? p.story ?? "",
    created_time: p.created_time,
    permalink_url: p.permalink_url ?? `https://www.facebook.com/${p.id.replace("_", "/posts/")}`,
  }));

  return NextResponse.json({ posts });
}

interface FbPost {
  id: string;
  message: string;
  created_time: string;
  permalink_url: string;
}
