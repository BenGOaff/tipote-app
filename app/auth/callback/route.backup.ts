// app/auth/callback/route.backup.ts
// ⚠️ Backup (ancien handler serveur) — ne doit PAS s'appeler route.ts sinon conflit avec page.tsx.
// Rôle historique : callback Supabase pour PKCE + reset password + première connexion.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tipote.com";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type"); // 'recovery', 'magiclink', 'signup', etc.

  const baseUrl = new URL(SITE_URL);

  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=missing_code", baseUrl));
  }

  try {
    const supabase = await getSupabaseServerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error.message)}`, baseUrl));
    }

    // Redirections dédiées
    if (type === "recovery") {
      return NextResponse.redirect(new URL("/auth/reset-password", baseUrl));
    }

    if (type === "invite") {
      return NextResponse.redirect(new URL("/auth/set-password", baseUrl));
    }

    // Default
    return NextResponse.redirect(new URL("/app", baseUrl));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(msg)}`, baseUrl));
  }
}
