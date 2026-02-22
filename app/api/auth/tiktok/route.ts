// app/api/auth/tiktok/route.ts
// Initie le flow OAuth TikTok : redirige vers tiktok.com/v2/auth/authorize.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildAuthorizationUrl } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export async function GET() {
  // Verifier que l'user est connecte a Tipote
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
  cookieStore.set("tiktok_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const url = buildAuthorizationUrl(state);
  return NextResponse.redirect(url);
}
