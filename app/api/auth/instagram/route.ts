// app/api/auth/instagram/route.ts
// Initie le flow OAuth Instagram Professional Login.
// Redirige vers instagram.com/oauth/authorize avec les scopes métier.
// OAuth complètement séparé de Facebook Login (app Meta distincte).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildInstagramAuthorizationUrl } from "@/lib/meta";

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
  cookieStore.set("instagram_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  const url = buildInstagramAuthorizationUrl(state);
  return NextResponse.redirect(url);
}
