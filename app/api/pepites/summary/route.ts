// app/api/pepites/summary/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getOrCreatePepitesState,
  fetchUserPepiteById,
  assignNextPepiteIfDue,
} from "@/lib/pepites/pepitesServer";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const state = await getOrCreatePepitesState(supabase, user.id);

  let current = state.current_user_pepite_id
    ? await fetchUserPepiteById(supabase, state.current_user_pepite_id, user.id)
    : null;

  const now = new Date();
  const due = new Date(state.next_reveal_at).getTime() <= now.getTime();

  if (due) {
    const adminState = await getOrCreatePepitesState(supabaseAdmin, user.id);
    const res = await assignNextPepiteIfDue(supabaseAdmin, user.id, adminState, now);
    current = res.current;
  }

  const hasUnread = Boolean(current && !current.seen_at);

  return NextResponse.json({
    ok: true,
    hasUnread,
    current: current
      ? {
          userPepiteId: current.id,
          assignedAt: current.assigned_at,
          seenAt: current.seen_at,
          pepite: current.pepites
            ? { id: current.pepites.id, title: current.pepites.title, body: current.pepites.body }
            : null,
        }
      : null,
  });
}
