// app/api/analytics/metrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

const PayloadSchema = z.object({
  emailOpenRate: z.union([z.string(), z.number()]).optional(),
  conversionRate: z.union([z.string(), z.number()]).optional(),
  newSubscribers: z.union([z.string(), z.number()]).optional(),
  pageViews: z.union([z.string(), z.number()]).optional(),
});

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const parsed = PayloadSchema.parse(json);

    const row = {
      user_id: user.id,
      week_start: new Date().toISOString().slice(0, 10),
      email_open_rate: toNumber(parsed.emailOpenRate),
      conversion_rate: toNumber(parsed.conversionRate),
      new_subscribers: toNumber(parsed.newSubscribers),
      page_views: toNumber(parsed.pageViews),
      updated_at: new Date().toISOString(),
    };

    // 1) tentative table dédiée (si elle existe côté Supabase)
    const { error: insertErr } = await supabase
      .from("analytics_metrics")
      .upsert(row, { onConflict: "user_id,week_start" });

    if (!insertErr) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 2) fallback: tenter d'écrire dans business_profiles.analytics_metrics (si la colonne existe)
    const { error: profileErr } = await supabase
      .from("business_profiles")
      .update({
        analytics_metrics: {
          latest: {
            email_open_rate: row.email_open_rate,
            conversion_rate: row.conversion_rate,
            new_subscribers: row.new_subscribers,
            page_views: row.page_views,
            updated_at: row.updated_at,
          },
        },
      } as any)
      .eq("user_id", user.id);

    if (!profileErr) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Si aucune des structures n'existe, on renvoie ok=false (le client a un fallback localStorage)
    return NextResponse.json(
      { ok: false, error: insertErr.message || profileErr.message },
      { status: 501 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
