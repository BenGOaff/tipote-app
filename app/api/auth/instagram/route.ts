// app/api/auth/instagram/route.ts
// Initie le flow OAuth Instagram (via Facebook Login for Business).
// Utilise META_IG_CONFIG_ID (config "tipote-ig", variant "API Graph pour Instagram")
// qui inclut instagram_basic + pages permissions.
// Redirige vers Facebook OAuth, le callback est /api/auth/instagram/callback.

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
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
  }

  // Generer un state CSRF et le stocker en cookie HTTP-only
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
