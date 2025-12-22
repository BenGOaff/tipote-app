// app/api/analytics/export/route.ts
// Export CSV des contenus sur une période (7/30|90) — V1
// Auth Supabase obligatoire

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function csvEscape(s: string) {
  const x = String(s ?? "");
  if (x.includes('"') || x.includes(",") || x.includes("\n")) {
    return `"${x.replaceAll('"', '""')}"`;
  }
  return x;
}

function safeString(v: unknown) {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "30";
  const periodDays = period === "7" ? 7 : period === "90" ? 90 : 30;

  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const since = daysAgo(periodDays).toISOString();

    const v2 = await supabase
      .from("content_item")
      .select("id, title, type, status, channel, scheduled_date, created_at")
      .eq("user_id", session.user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    let data = v2.data;
    let error = v2.error;

    if (error) {
      const fb = await supabase
        .from("content_item")
        .select(
          "id, title:titre, type, status:statut, channel:canal, scheduled_date:date_planifiee, created_at"
        )
        .eq("user_id", session.user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);

      data = fb.data;
      error = fb.error;
    }

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          details: error.details,
          hint: error.hint,
        },
        { status: 400 }
      );
    }

    const rows = Array.isArray(data) ? data : [];

    const header = [
      "id",
      "title",
      "type",
      "status",
      "channel",
      "scheduled_date",
      "created_at",
    ].join(",");

    const lines = rows.map((r: any) => {
      const id = safeString(r?.id);
      const title = safeString(r?.title);
      const type = safeString(r?.type);
      const status = safeString(r?.status);
      const channel = safeString(r?.channel);
      const scheduled = safeString(r?.scheduled_date);
      const created = safeString(r?.created_at);

      return [
        csvEscape(id),
        csvEscape(title),
        csvEscape(type),
        csvEscape(status),
        csvEscape(channel),
        csvEscape(scheduled),
        csvEscape(created),
      ].join(",");
    });

    const csv = [header, ...lines].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tipote-contents-${periodDays}d.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
