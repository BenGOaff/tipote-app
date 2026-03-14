// app/api/webinars/offers/route.ts
// GET — list user's offers for the "offre liée" selector in events

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { loadAllOffers } from "@/lib/offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const offers = await loadAllOffers(supabase);

    return NextResponse.json({
      ok: true,
      offers: offers.map((o) => ({
        id: o.id,
        name: o.name,
        level: o.level,
        price_min: o.price_min,
        price_max: o.price_max,
      })),
    });
  } catch (e: any) {
    console.error("[webinars/offers] GET error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
