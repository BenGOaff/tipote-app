// app/api/compta/fiscal-deadlines/route.ts
//
// GET — retourne les échéances fiscales calculées pour les 12 mois
// à venir (par défaut) en se basant sur le profil compta de l'user
// pour le projet actif.
//
// Query params :
//   ?days=N  — fenêtre en jours à partir d'aujourd'hui (défaut 365,
//              max 730). Le cron de rappel utilise days=7.
//
// Réponse :
//   { ok: true, deadlines: FiscalDeadline[] }
//   ou si pays != France ou statut non configuré :
//   { ok: true, deadlines: [], reason: "country_not_supported" | "status_not_configured" }
//
// Le calendrier est calculé à la volée (cf. lib/compta/fiscalCalendar.ts)
// — pas de table dédiée, donc pas de cache : si l'user change son
// régime TVA ou sa périodicité URSSAF, l'affichage est instantané.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import {
  computeFiscalDeadlines,
  type FiscalProfile,
} from "@/lib/compta/fiscalCalendar";

export const dynamic = "force-dynamic";

const FRANCE_TOKENS = ["france", "fr", "française", "francaise", "fra"];

function isFrance(country: string | null | undefined): boolean {
  if (!country) return false;
  return FRANCE_TOKENS.includes(country.trim().toLowerCase());
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let bpQuery = supabase
    .from("business_profiles")
    .select(
      "country, accounting_status, ae_activity_type, ae_started_at, ae_versement_liberatoire, ae_vat_franchise, ae_urssaf_periodicity, ae_vat_regime, sasu_fiscal_year_calendar, sasu_fiscal_year_start_month, sasu_vat_regime, sasu_vat_intra_enabled, sasu_dirigeant_remunere, eurl_is_election, sarl_gerant_majoritaire",
    )
    .eq("user_id", user.id);
  if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
  const { data: bp, error: bpError } = await bpQuery.maybeSingle();

  if (bpError) {
    return NextResponse.json({ ok: false, error: bpError.message }, { status: 400 });
  }
  if (!bp) {
    return NextResponse.json({ ok: true, deadlines: [], reason: "no_profile" });
  }
  if (!isFrance((bp as { country?: string | null }).country)) {
    return NextResponse.json({ ok: true, deadlines: [], reason: "country_not_supported" });
  }
  if (!(bp as { accounting_status?: string | null }).accounting_status) {
    return NextResponse.json({ ok: true, deadlines: [], reason: "status_not_configured" });
  }

  const daysParam = parseInt(req.nextUrl.searchParams.get("days") ?? "365", 10);
  const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 365, 1), 730);

  const profile: FiscalProfile = {
    accounting_status: (bp as Record<string, unknown>).accounting_status as FiscalProfile["accounting_status"],
    ae_activity_type: ((bp as Record<string, unknown>).ae_activity_type ?? null) as string | null,
    ae_started_at: ((bp as Record<string, unknown>).ae_started_at ?? null) as string | null,
    ae_versement_liberatoire: Boolean((bp as Record<string, unknown>).ae_versement_liberatoire),
    ae_vat_franchise: Boolean((bp as Record<string, unknown>).ae_vat_franchise),
    ae_urssaf_periodicity: ((bp as Record<string, unknown>).ae_urssaf_periodicity ?? null) as
      | "mensuelle"
      | "trimestrielle"
      | null,
    ae_vat_regime: ((bp as Record<string, unknown>).ae_vat_regime ?? null) as
      | "reel_mensuel"
      | "reel_trimestriel"
      | "simplifie"
      | null,
    sasu_fiscal_year_calendar: Boolean((bp as Record<string, unknown>).sasu_fiscal_year_calendar),
    sasu_fiscal_year_start_month: ((bp as Record<string, unknown>).sasu_fiscal_year_start_month ?? null) as number | null,
    sasu_vat_regime: ((bp as Record<string, unknown>).sasu_vat_regime ?? null) as string | null,
    sasu_vat_intra_enabled: Boolean((bp as Record<string, unknown>).sasu_vat_intra_enabled),
    sasu_dirigeant_remunere: Boolean((bp as Record<string, unknown>).sasu_dirigeant_remunere),
    eurl_is_election: Boolean((bp as Record<string, unknown>).eurl_is_election),
    sarl_gerant_majoritaire: Boolean((bp as Record<string, unknown>).sarl_gerant_majoritaire),
  };

  const now = new Date();
  const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const deadlines = computeFiscalDeadlines(profile, now, to);

  return NextResponse.json({ ok: true, deadlines });
}
