// GET /api/business/monthly-summary
//
// Endpoint léger qui renvoie le résumé business du mois en cours :
// CA mensuel, YTD, comparaison N-1, progression vers l'objectif.
// Utilisé par le widget RevenueGoalProgress sur Aujourd'hui et le
// dashboard compta. Côté serveur, c'est un wrapper minimal autour de
// `getMonthlyRevenueSummary` (lib/compta/businessSummary.ts).

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getMonthlyRevenueSummary } from "@/lib/compta/businessSummary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);
  const summary = await getMonthlyRevenueSummary(user.id, projectId);
  return NextResponse.json({ ok: true, summary });
}
