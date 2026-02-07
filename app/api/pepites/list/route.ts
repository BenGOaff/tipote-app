// app/api/pepites/list/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_pepites")
    .select("id,assigned_at,seen_at,pepites(id,title,body,created_at)")
    .eq("user_id", user.id)
    .order("assigned_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    items: (data ?? []).map((row: any) => ({
      userPepiteId: row.id,
      assignedAt: row.assigned_at,
      seenAt: row.seen_at,
      pepite: row.pepites
        ? { id: row.pepites.id, title: row.pepites.title, body: row.pepites.body }
        : null,
    })),
  });
}
