// app/api/milestones/unseen/route.ts
//
// GET : retourne les milestones débloqués mais pas encore vus par l'user
// connecté. Lu par <MilestoneToastListener /> au mount du DashboardLayout
// pour afficher un toast "🎉 Tu viens de…".
//
// La sécurité repose sur le scope auth.uid() : un user ne peut lire que
// ses propres milestones, RLS Postgres assure le filtrage même si la
// route a un bug.

import { NextResponse } from "next/server";

import { getMilestoneByKey } from "@/lib/milestones/catalog";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface UnseenMilestoneRow {
  id: string;
  milestone_key: string;
  unlocked_at: string;
  payload: Record<string, unknown> | null;
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Rate-limit serveur (Béné 3 juin 2026) : 1 batch / semaine max.
  // Si profiles.next_milestone_toast_at est dans le futur, on retourne
  // 0 milestones — le client n'affichera donc aucun toast. Sans ça,
  // chaque chargement du dashboard re-affichait les toasts non vus,
  // et chaque nouveau milestone débloqué pop instantanément. Trop
  // intrusif (retour Gwenn + Béné).
  const { data: profile } = await supabase
    .from("profiles")
    .select("next_milestone_toast_at")
    .eq("id", user.id)
    .maybeSingle();
  const nextAt =
    (profile as { next_milestone_toast_at: string | null } | null)?.next_milestone_toast_at;
  if (nextAt && new Date(nextAt) > new Date()) {
    return NextResponse.json({ ok: true, milestones: [] });
  }

  const { data, error } = await supabase
    .from("user_milestones")
    .select("id,milestone_key,unlocked_at,payload")
    .eq("user_id", user.id)
    .is("seen_at", null)
    .order("unlocked_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("[milestones/unseen] read failed", error.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  const rows = (data ?? []) as UnseenMilestoneRow[];
  const milestones = rows.flatMap((row) => {
    const def = getMilestoneByKey(row.milestone_key);
    if (!def) {
      // Clé retirée du catalog : on ignore côté UI. La ligne reste en
      // DB (historique du user). On la marque seen pour qu'elle ne
      // remonte plus, ça se fait via le POST /seen quand le client
      // confirme l'affichage — ici on évite juste de l'inclure dans
      // le payload du toast.
      return [];
    }
    return [
      {
        // BIGSERIAL -> string (cf. seen route, drame Gwenn 8 juin 2026).
        id: String(row.id),
        key: row.milestone_key,
        emoji: def.emoji,
        title: def.title,
        body: def.body,
        ctaLabel: def.ctaLabel ?? null,
        ctaUrl: def.ctaUrl ?? null,
        unlockedAt: row.unlocked_at,
      },
    ];
  });

  return NextResponse.json({ ok: true, milestones });
}
