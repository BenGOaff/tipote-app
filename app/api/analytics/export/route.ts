// app/api/analytics/export/route.ts
// Export CSV des contenus sur une période (7/30|90) — V1
// Auth Supabase obligatoire

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

type ContentRow = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  channel: string | null;
  scheduled_date: string | null;
  created_at: string | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - n);
  return startOfDay(d);
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const url = new URL(req.url);
    const periodRaw = String(url.searchParams.get("period") ?? "30");
    const periodDays = periodRaw === "7" ? 7 : periodRaw === "90" ? 90 : 30;

    const since = daysAgo(periodDays).toISOString();

    const { data, error } = await supabase
      .from("content_item")
      .select("id, title, type, status, channel, scheduled_date, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    const rows: ContentRow[] = Array.isArray(data) ? (data as ContentRow[]) : [];

    const header = [
      "id",
      "title",
      "type",
      "status",
      "channel",
      "scheduled_date",
      "created_at",
    ].join(",");

    const lines = rows.map((r) =>
      [
        csvEscape(r.id),
        csvEscape(r.title),
        csvEscape(r.type),
        csvEscape(r.status),
        csvEscape(r.channel),
        csvEscape(r.scheduled_date),
        csvEscape(r.created_at),
      ].join(","),
    );

    const csv = [header, ...lines].join("\n");
    const filename = `tipote-analytics-${periodDays}j-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[GET /api/analytics/export] error", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
