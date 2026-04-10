// app/api/settings/ui-locale/route.ts
// Save interface language preference
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const { locale } = await req.json();
    if (!locale) return NextResponse.json({ ok: false }, { status: 400 });

    await supabaseAdmin
      .from("profiles")
      .update({ ui_locale: locale, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
