// app/api/settings/ui-locale/route.ts
// PATCH: save the user's interface language preference to business_profiles.ui_locale

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SUPPORTED_LOCALES } from "@/i18n/config";

// LA LISTE VIENT DE `i18n/config.ts`, ELLE N'EST PLUS RECOPIÉE.
//
// Elle était figée à cinq langues alors que le sélecteur en propose
// SEPT (`components/LanguageSwitcher.tsx` lit `SUPPORTED_LOCALES`).
// Choisir "Português" posait donc le cookie, rechargeait la page en
// portugais, et cette route répondait 400 : la préférence n'était
// JAMAIS écrite en base.
//
// Le symptôme est le pire possible parce qu'il est différé : ça marche
// tout de suite, et la langue revient au français sur un autre appareil,
// après un nettoyage de cookies, ou à l'expiration. `persistLocaleToDb`
// avale l'erreur (`catch {}`, non bloquant), donc rien ne le disait.

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
  if (typeof ui_locale !== "string" || !(SUPPORTED_LOCALES as readonly string[]).includes(ui_locale)) {
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
