// lib/pepites/pepitesServer.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type PepiteRow = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export type UserPepiteRow = {
  id: string;
  user_id: string;
  pepite_id: string;
  assigned_at: string;
  seen_at: string | null;
  // ✅ IMPORTANT: on normalise toujours la relation en 1 seul objet (jamais array)
  pepites: PepiteRow | null;
};

export type UserPepitesStateRow = {
  user_id: string;
  next_reveal_at: string;
  current_user_pepite_id: string | null;
  updated_at: string;
};

const INTERVAL_DAYS = 10;
const JITTER_DAYS = 4; // 0..4 jours => l'user ne sait pas exactement quand ça tombe

function addDaysIso(base: Date, days: number) {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function computeNextRevealIso(now: Date) {
  const jitter = Math.floor(Math.random() * (JITTER_DAYS + 1));
  return addDaysIso(now, INTERVAL_DAYS + jitter);
}

function normalizePepite(rel: PepiteRow | PepiteRow[] | null | undefined): PepiteRow | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function normalizeUserPepiteRow(row: any): UserPepiteRow | null {
  if (!row) return null;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    pepite_id: String(row.pepite_id),
    assigned_at: String(row.assigned_at),
    seen_at: row.seen_at ? String(row.seen_at) : null,
    pepites: normalizePepite(row.pepites),
  };
}

export async function getOrCreatePepitesState(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserPepitesStateRow> {
  const { data: existing, error } = await supabase
    .from("user_pepites_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && existing) return existing as UserPepitesStateRow;

  const now = new Date();
  const { data: created, error: insertErr } = await supabase
    .from("user_pepites_state")
    .insert({
      user_id: userId,
      next_reveal_at: now.toISOString(), // 1ère pépite dispo immédiatement
      current_user_pepite_id: null,
    })
    .select("*")
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return created as UserPepitesStateRow;
}

export async function fetchUserPepiteById(
  supabase: SupabaseClient,
  userPepiteId: string,
  userId: string,
): Promise<UserPepiteRow | null> {
  const { data, error } = await supabase
    .from("user_pepites")
    .select("id,user_id,pepite_id,assigned_at,seen_at,pepites(id,title,body,created_at)")
    .eq("id", userPepiteId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return normalizeUserPepiteRow(data);
}

export async function assignNextPepiteIfDue(
  supabase: SupabaseClient,
  userId: string,
  state: UserPepitesStateRow,
  now: Date,
): Promise<{
  state: UserPepitesStateRow;
  current: UserPepiteRow | null;
  assigned: boolean;
}> {
  // 1) Jamais de stack : si current existe et pas vue, on garde
  if (state.current_user_pepite_id) {
    const cur = await fetchUserPepiteById(supabase, state.current_user_pepite_id, userId);
    if (cur && !cur.seen_at) {
      return { state, current: cur, assigned: false };
    }
  }

  const due = new Date(state.next_reveal_at).getTime() <= now.getTime();
  if (!due) {
    const cur = state.current_user_pepite_id
      ? await fetchUserPepiteById(supabase, state.current_user_pepite_id, userId)
      : null;
    return { state, current: cur, assigned: false };
  }

  // 2) Liste des pepites déjà reçues
  const { data: received, error: receivedErr } = await supabase
    .from("user_pepites")
    .select("pepite_id")
    .eq("user_id", userId);

  if (receivedErr) throw new Error(receivedErr.message);
  const receivedIds = new Set((received ?? []).map((r: { pepite_id: string }) => r.pepite_id));

  // 3) Toutes les pepites dispo (doit être appelé avec un supabase qui peut lire pepites)
  const { data: all, error: allErr } = await supabase
    .from("pepites")
    .select("id,title,body,created_at")
    .order("created_at", { ascending: true });

  if (allErr) throw new Error(allErr.message);
  const remaining = (all ?? []).filter((p: PepiteRow) => !receivedIds.has(p.id));

  if (remaining.length === 0) {
    const next = addDaysIso(now, 365);
    const { data: updated, error: upErr } = await supabase
      .from("user_pepites_state")
      .update({
        next_reveal_at: next,
        current_user_pepite_id: null,
      })
      .eq("user_id", userId)
      .select("*")
      .single();

    if (upErr) throw new Error(upErr.message);
    return { state: updated as UserPepitesStateRow, current: null, assigned: false };
  }

  // 4) Choix random parmi remaining
  const picked = remaining[Math.floor(Math.random() * remaining.length)];

  // 5) Insert user_pepites
  const { data: inserted, error: insErr } = await supabase
    .from("user_pepites")
    .insert({
      user_id: userId,
      pepite_id: picked.id,
    })
    .select("id,user_id,pepite_id,assigned_at,seen_at,pepites(id,title,body,created_at)")
    .single();

  if (insErr) throw new Error(insErr.message);

  // 6) Update state
  const nextReveal = computeNextRevealIso(now);
  const { data: updated, error: upErr } = await supabase
    .from("user_pepites_state")
    .update({
      current_user_pepite_id: inserted.id,
      next_reveal_at: nextReveal,
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (upErr) throw new Error(upErr.message);

  return {
    state: updated as UserPepitesStateRow,
    current: normalizeUserPepiteRow(inserted),
    assigned: true,
  };
}
