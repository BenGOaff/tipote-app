import { NextRequest, NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabaseServer";

type ContentRowV2 = {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | string | null;
};

function isMissingColumnError(message: string | null | undefined) {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the '") ||
    (m.includes("column") && m.includes("exist")) ||
    m.includes("schema cache") ||
    m.includes("pgrst")
  );
}

function asTagsArray(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof tags === "string")
    return tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

async function isPaidOrThrowQuota(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  userId: string;
}): Promise<
  | { ok: true; paid: true }
  | { ok: true; paid: false; used: number; limit: number; windowDays: number }
  | { ok: true; paid: false; used: null; limit: number; windowDays: number }
> {
  const { supabase, userId } = params;

  try {
    const { data: billingProfile, error: billingError } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    if (!billingError) {
      const plan = (billingProfile as any)?.plan as string | null | undefined;
      const p = (plan ?? "").toLowerCase().trim();
      const paid = p === "basic" || p === "essential" || p === "elite";
      if (paid) return { ok: true, paid: true };
    }
  } catch {
    return { ok: true, paid: false, used: null, limit: 7, windowDays: 7 };
  }

  const limit = 7;
  const windowDays = 7;
  try {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("content_item")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since);

    if (error) {
      if (isMissingColumnError(error.message)) {
        return { ok: true, paid: false, used: null, limit, windowDays };
      }
      return { ok: true, paid: false, used: null, limit, windowDays };
    }

    return { ok: true, paid: false, used: typeof count === "number" ? count : 0, limit, windowDays };
  } catch {
    return { ok: true, paid: false, used: null, limit, windowDays };
  }
}

async function loadSourceContent(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  id: string,
  userId: string
): Promise<{ ok: true; data: ContentRowV2 } | { ok: false; status: number; error: string }> {
  // 1) Try "V2/EN-ish" columns
  const v2 = await supabase
    .from("content_item")
    .select("id,user_id,type,title,content,status,scheduled_date,channel,tags")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!v2.error) {
    const row = v2.data as any | null;
    if (!row) return { ok: false, status: 404, error: "Not found" };

    return {
      ok: true,
      data: {
        id: String(row.id),
        user_id: String(row.user_id),
        type: typeof row.type === "string" ? row.type : null,
        title: typeof row.title === "string" ? row.title : null,
        content: typeof row.content === "string" ? row.content : null,
        status: typeof row.status === "string" ? row.status : null,
        scheduled_date: typeof row.scheduled_date === "string" ? row.scheduled_date : null,
        channel: typeof row.channel === "string" ? row.channel : null,
        tags: (row.tags ?? null) as any,
      },
    };
  }

  const v2Err = v2.error as PostgrestError;
  if (!isMissingColumnError(v2Err.message)) {
    return { ok: false, status: 400, error: v2Err.message };
  }

  // 2) Fallback FR columns via alias (keeps a V2 shape)
  const fr = await supabase
    .from("content_item")
    .select(
      "id,user_id,type,title:titre,content:contenu,status:statut,scheduled_date:date_planifiee,channel:canal,tags"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fr.error) {
    return { ok: false, status: 400, error: fr.error.message };
  }

  const row = fr.data as any | null;
  if (!row) return { ok: false, status: 404, error: "Not found" };

  return {
    ok: true,
    data: {
      id: String(row.id),
      user_id: String(row.user_id),
      type: typeof row.type === "string" ? row.type : null,
      title: typeof row.title === "string" ? row.title : null,
      content: typeof row.content === "string" ? row.content : null,
      status: typeof row.status === "string" ? row.status : null,
      scheduled_date: typeof row.scheduled_date === "string" ? row.scheduled_date : null,
      channel: typeof row.channel === "string" ? row.channel : null,
      tags: (row.tags ?? null) as any,
    },
  };
}

async function insertDuplicateV2(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  src: ContentRowV2
): Promise<{ ok: true; id: string | null } | { ok: false; missingColumns?: boolean; error: string }> {
  const tagsArray = asTagsArray(src.tags);

  const ins = await supabase
    .from("content_item")
    .insert({
      user_id: userId,
      type: src.type,
      title: src.title ? `${src.title} (copie)` : "Copie",
      content: src.content,
      status: "draft",
      scheduled_date: null,
      channel: src.channel,
      tags: tagsArray,
    })
    .select("id")
    .single();

  if (!ins.error) return { ok: true, id: ins.data?.id ?? null };

  const pe = ins.error as PostgrestError;
  if (isMissingColumnError(pe.message)) return { ok: false, missingColumns: true, error: pe.message };
  return { ok: false, error: pe.message };
}

async function insertDuplicateFR(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  userId: string,
  src: ContentRowV2
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const tagsArray = asTagsArray(src.tags);

  const insFR = await supabase
    .from("content_item")
    .insert({
      user_id: userId,
      type: src.type,
      titre: src.title ? `${src.title} (copie)` : "Copie",
      contenu: src.content,
      statut: "draft",
      date_planifiee: null,
      canal: src.channel,
      tags: tagsArray,
    } as any)
    .select("id")
    .single();

  if (insFR.error) return { ok: false, error: insFR.error.message };
  return { ok: true, id: insFR.data?.id ?? null };
}

// ✅ Next.js 16 (chez toi) typpe `context.params` en Promise.
// Donc on accepte Promise<{id:string}> et on await.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();

    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const userId = auth.user.id;
    const { id } = await context.params;

    // ✅ Gating cohérent avec generate : plan payant => OK ; plan free => quota 7/7j
    const gate = await isPaidOrThrowQuota({ supabase, userId });
    if (!gate.paid) {
      if (typeof gate.used === "number") {
        if (gate.used >= gate.limit) {
          return NextResponse.json(
            {
              ok: false,
              code: "free_quota_reached",
              error: `Limite atteinte : ${gate.limit} contenus / ${gate.windowDays} jours. Choisissez un abonnement pour continuer.`,
              meta: { limit: gate.limit, windowDays: gate.windowDays, used: gate.used },
            },
            { status: 402 }
          );
        }
      }
      // fail-open si on ne peut pas compter
    }

    const srcRes = await loadSourceContent(supabase, id, userId);
    if (!srcRes.ok) {
      return NextResponse.json({ ok: false, error: srcRes.error }, { status: srcRes.status });
    }

    const src = srcRes.data;

    // Insert duplicate (try V2 then FR fallback if columns mismatch)
    const insV2 = await insertDuplicateV2(supabase, userId, src);
    if (insV2.ok) return NextResponse.json({ ok: true, id: insV2.id }, { status: 200 });

    if (!insV2.missingColumns) {
      return NextResponse.json({ ok: false, error: insV2.error }, { status: 400 });
    }

    const insFR = await insertDuplicateFR(supabase, userId, src);
    if (!insFR.ok) return NextResponse.json({ ok: false, error: insFR.error }, { status: 400 });

    return NextResponse.json({ ok: true, id: insFR.id }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
