// app/api/auth/meta/route.ts
// Initie le flow OAuth Facebook Login : redirige vers Facebook avec state CSRF.
// Donne accès aux Pages Facebook + Instagram Business.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildAuthorizationUrl } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  // Vérifier que l'user est connecté à Tipote
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Générer un state CSRF et le stocker en cookie HTTP-only
  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("meta_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const url = buildAuthorizationUrl(state);
  return NextResponse.redirect(url);
}
