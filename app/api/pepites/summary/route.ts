// app/api/pepites/summary/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cookies } from "next/headers";
import {
  getOrCreatePepitesState,
  fetchUserPepiteById,
  assignNextPepiteIfDue,
} from "@/lib/pepites/pepitesServer";

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

  const state = await getOrCreatePepitesState(supabase, user.id);

  let current = state.current_user_pepite_id
    ? await fetchUserPepiteById(supabase, state.current_user_pepite_id, user.id)
    : null;

  const now = new Date();
  const due = new Date(state.next_reveal_at).getTime() <= now.getTime();

  // ✅ Si l'user n'a JAMAIS reçu de pépite, on force l'assignation maintenant
  // Note: pas de filtre project_id car les pépites sont globales (pas liées à un projet)
  const { count: receivedCount, error: countErr } = await supabase
    .from("user_pepites")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const hasNeverReceived = !countErr && (receivedCount ?? 0) === 0;

  if (due || (hasNeverReceived && !current)) {
    const adminState = await getOrCreatePepitesState(supabaseAdmin, user.id);

    // 🔥 force due si jamais reçu (cas import après coup)
    const forcedState = hasNeverReceived
      ? { ...adminState, next_reveal_at: now.toISOString() }
      : adminState;

    const res = await assignNextPepiteIfDue(supabaseAdmin, user.id, forcedState, now, userLocale);
    current = res.current;
  }

  const hasUnread = Boolean(current && !current.seen_at);

  // If user locale != fr, look up translated version of current pepite
  let pepiteTitle = current?.pepites?.title ?? null;
  let pepiteBody = current?.pepites?.body ?? null;
  if (current?.pepites && userLocale !== "fr") {
    const groupKey = (current.pepites as any).group_key ?? current.pepites.id;
    const { data: translated } = await supabaseAdmin
      .from("pepites")
      .select("title, body")
      .eq("group_key", groupKey)
      .eq("locale", userLocale)
      .maybeSingle();
    if (translated) {
      pepiteTitle = translated.title;
      pepiteBody = translated.body;
    }
  }

  return NextResponse.json({
    ok: true,
    hasUnread,
    current: current
      ? {
          userPepiteId: current.id,
          assignedAt: current.assigned_at,
          seenAt: current.seen_at,
          pepite: current.pepites
            ? { id: current.pepites.id, title: pepiteTitle, body: pepiteBody }
            : null,
        }
      : null,
  });
}
