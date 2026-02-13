// app/api/auth/threads/route.ts
// Initie le flow OAuth Threads : redirige vers threads.net/oauth/authorize.
// OAuth completement separe de Facebook Login.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildThreadsAuthorizationUrl } from "@/lib/meta";

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
  cookieStore.set("threads_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const url = buildThreadsAuthorizationUrl(state);
  return NextResponse.redirect(url);
}
