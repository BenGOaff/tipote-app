// app/api/auth/facebook-messenger/route.ts
// Initiates Facebook Messenger OAuth via Tipote ter app.
// This gives users a Page token with pages_messaging permission
// for sending DMs (comment-to-DM automations).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { buildMessengerAuthorizationUrl } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("messenger_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const url = buildMessengerAuthorizationUrl(state);
  return NextResponse.redirect(url);
}
