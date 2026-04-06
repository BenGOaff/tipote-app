// app/api/systeme-io/courses/route.ts
// Fetch available courses from the user's Systeme.io account

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { sioUserRequest } from "@/lib/sio/userApiClient";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const projectId = await getActiveProjectId(supabase, user.id);
    let profileQuery = supabase
      .from("business_profiles")
      .select("sio_user_api_key")
      .eq("user_id", user.id);
    if (projectId) profileQuery = profileQuery.eq("project_id", projectId);
    const { data: profile } = await profileQuery.maybeSingle();

    const apiKey = String(profile?.sio_user_api_key ?? "").trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "NO_API_KEY", courses: [] }, { status: 400 });
    }

    // Fetch courses from SIO (paginate if needed)
    const courses: { id: string; name: string }[] = [];
    let cursor: string | undefined;
    let pages = 0;

    while (pages < 5) {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("startingAfter", cursor);

      const res = await sioUserRequest(apiKey, `/school/courses?${params}`);
      if (!res.ok || !res.data?.items) break;

      for (const item of res.data.items) {
        courses.push({ id: String(item.id), name: String(item.name || item.title || `Course ${item.id}`) });
      }

      if (!res.data.hasMore) break;
      cursor = res.data.items[res.data.items.length - 1]?.id;
      pages++;
    }

    return NextResponse.json({ ok: true, courses });
  } catch (e) {
    console.error("[SIO courses] Error:", e);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
