// app/api/settings/ui-locale/route.ts
// PATCH: save the user's interface language preference to business_profiles.ui_locale

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SUPPORTED_LOCALES = ["fr", "en", "es", "it", "ar"];

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ui_locale = (body as any)?.ui_locale;
  if (typeof ui_locale !== "string" || !SUPPORTED_LOCALES.includes(ui_locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("business_profiles")
    .update({ ui_locale })
    .eq("user_id", session.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ui_locale });
}
