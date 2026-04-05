// app/api/pepites/list/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cookies } from "next/headers";

const SUPPORTED_LOCALES = ["fr", "en", "es", "it", "ar"];

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Use ui_locale cookie (same source as LanguageSwitcher / next-intl)
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get("ui_locale")?.value ?? "fr";
  const userLocale = SUPPORTED_LOCALES.includes(rawLocale) ? rawLocale : "fr";

  // Note: pas de filtre project_id car les pépites sont globales (pas liées à un projet)
  const { data, error } = await supabase
    .from("user_pepites")
    .select("id,assigned_at,seen_at,pepites(id,title,body,created_at,group_key,locale)")
    .eq("user_id", user.id)
    .order("assigned_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // If user locale != fr, look up translated versions for assigned pepites
  let translationMap: Map<string, { title: string; body: string }> | null = null;
  if (userLocale !== "fr" && data && data.length > 0) {
    const groupKeys = (data ?? [])
      .map((r: any) => {
        const p = Array.isArray(r.pepites) ? r.pepites[0] : r.pepites;
        return p?.group_key;
      })
      .filter(Boolean);

    if (groupKeys.length > 0) {
      const { data: translations } = await supabaseAdmin
        .from("pepites")
        .select("group_key,title,body")
        .eq("locale", userLocale)
        .in("group_key", groupKeys);

      if (translations && translations.length > 0) {
        translationMap = new Map();
        for (const t of translations) {
          translationMap.set(t.group_key, { title: t.title, body: t.body });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    items: (data ?? []).map((row: any) => {
      const pepite = Array.isArray(row.pepites) ? row.pepites[0] : row.pepites;
      const groupKey = pepite?.group_key;

      // Use translated version if available
      const translated = groupKey && translationMap ? translationMap.get(groupKey) : null;

      return {
        userPepiteId: row.id,
        assignedAt: row.assigned_at,
        seenAt: row.seen_at,
        pepite: pepite
          ? {
              id: pepite.id,
              title: translated?.title ?? pepite.title,
              body: translated?.body ?? pepite.body,
            }
          : null,
      };
    }),
  });
}
