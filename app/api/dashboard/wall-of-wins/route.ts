// app/api/dashboard/wall-of-wins/route.ts
//
// GET /api/dashboard/wall-of-wins?period=month|30d|90d
//
// Retourne le payload Wall of Wins pour l'user connecté + son projet
// actif (multi-projet Elite). Lu par <WallOfWins /> au mount du
// dashboard.
//
// Sécurité : auth obligatoire (cookies Supabase). RLS implicite côté
// helpers : countUserEvents lit business_events via supabaseAdmin mais
// est filtré par user_id passé. Aucun risque qu'un user voie le Wall
// of Wins d'un autre.

import { NextRequest, NextResponse } from "next/server";

import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  getWallOfWinsPayload,
  resolveWindowForPeriod,
  type WallOfWinsPeriod,
} from "@/lib/wallOfWins/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_PERIODS: readonly WallOfWinsPeriod[] = ["month", "30d", "90d"];

function parsePeriod(raw: string | null): WallOfWinsPeriod {
  if (!raw) return "month";
  return (VALID_PERIODS as readonly string[]).includes(raw)
    ? (raw as WallOfWinsPeriod)
    : "month";
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const projectId = await getActiveProjectId(supabase, user.id);
  const { since, until } = resolveWindowForPeriod(period);

  try {
    const payload = await getWallOfWinsPayload({
      userId: user.id,
      projectId: projectId ?? null,
      since,
      until,
    });
    return NextResponse.json({ ok: true, period, ...payload });
  } catch (err) {
    console.error("[wall-of-wins] failed", err);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
