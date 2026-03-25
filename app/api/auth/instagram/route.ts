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
    // Redirect to settings with error instead of returning JSON
    // (this is a browser navigation, not an API call)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return NextResponse.redirect(
      `${appUrl}/settings?tab=connections&instagram_error=${encodeURIComponent("Session expirée. Reconnecte-toi à Tipote et réessaie.")}`
    );
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

  let url: string;
  try {
    url = buildInstagramAuthorizationUrl(state);
  } catch (err) {
    console.error("[Instagram auth] Failed to build authorization URL:", err);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return NextResponse.redirect(
      `${appUrl}/settings?tab=connections&instagram_error=${encodeURIComponent(
        "Configuration Instagram incomplète. Contacte le support."
      )}`
    );
  }

  console.log("[Instagram auth] Redirecting to Instagram OAuth:", url.slice(0, 100) + "...");
  return NextResponse.redirect(url);
}
