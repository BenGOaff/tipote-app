// app/api/pepites/admin/create/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function assertPepitesAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.user_id) return false;
  return true;
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const isAdmin = await assertPepitesAdmin(user.id);
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  const text = String(body?.body ?? "").trim();

  if (!title || !text) {
    return NextResponse.json({ ok: false, error: "missing_title_or_body" }, { status: 400 });
  }

  // Generate a group_key upfront (UUID) so the NOT NULL constraint is satisfied on insert
  const groupKey = crypto.randomUUID();

  // Insert the FR original with group_key
  const { data: inserted, error } = await supabaseAdmin
    .from("pepites")
    .upsert({ title, body: text, locale: "fr", group_key: groupKey }, { onConflict: "title" })
    .select("id, group_key")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Use the actual group_key (could be the existing one if upsert matched an existing title)
  const finalGroupKey = inserted?.group_key ?? groupKey;
  const pepiteId = inserted?.id;

  // Auto-translate into other languages (non-blocking)
  if (finalGroupKey) {
    (async () => {
      try {
        const { translatePepite } = await import("@/lib/pepites/translatePepite");
        const translations = await translatePepite(title, text);
        for (const t of translations) {
          await supabaseAdmin
            .from("pepites")
            .upsert(
              { title: t.title, body: t.body, locale: t.locale, group_key: finalGroupKey },
              { onConflict: "group_key,locale" },
            );
        }
        if (translations.length > 0) {
          console.log(`[pepites] Auto-translated "${title}" into ${translations.map((t) => t.locale).join(", ")}`);
        }
      } catch (e) {
        console.error("[pepites] Auto-translation failed:", e);
      }
    })();
  }

  return NextResponse.json({ ok: true });
}
