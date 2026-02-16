// app/api/auth/twitter/route.ts
// Initie le flow OAuth X (Twitter) : redirige vers X avec state CSRF + PKCE.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  buildAuthorizationUrl,
  generateCodeVerifier,
  generateCodeChallenge,
} from "@/lib/twitter";

export const dynamic = "force-dynamic";

export async function GET() {
  // Verifier que l'user est connecte
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
  const isHttps = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https");
  const cookieOptions = {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 900, // 15 minutes (extra time for slow auth flows)
  };

  cookieStore.set("twitter_oauth_state", state, cookieOptions);

  // Generer PKCE code_verifier et le stocker en cookie
  const codeVerifier = generateCodeVerifier();
  cookieStore.set("twitter_code_verifier", codeVerifier, cookieOptions);

  const codeChallenge = generateCodeChallenge(codeVerifier);
  const url = buildAuthorizationUrl(state, codeChallenge);
  return NextResponse.redirect(url);
}
