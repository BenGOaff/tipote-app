// app/api/social/twitter-tweets/route.ts
// Returns the user's recent tweets for the automation post picker.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/crypto";
import { getUserTweets } from "@/lib/twitterScraper";

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

  const { data: connection, error } = await supabase
    .from("social_connections")
    .select("platform_user_id, platform_username, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", "twitter")
    .maybeSingle();

  if (error || !connection) {
    return NextResponse.json({ error: "Twitter not connected" }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(connection.access_token_encrypted);
  } catch {
    return NextResponse.json({ error: "Token decryption failed" }, { status: 500 });
  }

  const twitterUserId = connection.platform_user_id;
  if (!twitterUserId) {
    return NextResponse.json({ error: "No Twitter user ID" }, { status: 500 });
  }

  try {
    const tweets = await getUserTweets(accessToken, twitterUserId, 20);
    const username = (connection.platform_username ?? "").replace("@", "");

    const posts = tweets.map((t) => ({
      id: t.id,
      message: t.text,
      created_time: t.created_at,
      permalink_url: username
        ? `https://x.com/${username}/status/${t.id}`
        : "",
    }));

    return NextResponse.json({ posts });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[twitter-tweets] API error:", errMsg);
    return NextResponse.json(
      { error: "Failed to fetch tweets from Twitter" },
      { status: 502 }
    );
  }
}
