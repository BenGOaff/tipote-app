// app/api/auth/instagram/route.ts
// Initie le flow OAuth Facebook Login for Business pour Instagram.
// Utilise le meme Facebook Login mais avec des permissions Instagram
// et un config_id separe (META_INSTAGRAM_CONFIG_ID).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildInstagramAuthorizationUrl } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("instagram_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = buildInstagramAuthorizationUrl(state);
  return NextResponse.redirect(url);
}
