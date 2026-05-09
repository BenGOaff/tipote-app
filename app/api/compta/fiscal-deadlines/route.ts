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
import {
  computeFiscalDeadlinesCH,
  type FiscalProfileCH,
} from "@/lib/compta/fiscalCalendarCH";
import {
  computeFiscalDeadlinesPT,
  type FiscalProfilePT,
} from "@/lib/compta/fiscalCalendarPT";
import { detectCountryCode } from "@/lib/compta/countries";

export const dynamic = "force-dynamic";

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
      "country, accounting_status, ae_activity_type, ae_started_at, ae_versement_liberatoire, ae_vat_franchise, ae_urssaf_periodicity, ae_vat_regime, sasu_fiscal_year_calendar, sasu_fiscal_year_start_month, sasu_vat_regime, sasu_vat_intra_enabled, sasu_dirigeant_remunere, eurl_is_election, sarl_gerant_majoritaire, ch_canton, ch_vat_assujetti, ch_vat_periodicity, ch_vat_method, ch_started_at, pt_nif, pt_region, pt_iva_isento, pt_iva_periodicity, pt_tax_regime, pt_started_at",
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
  const country = detectCountryCode((bp as { country?: string | null }).country);
  if (country !== "FR" && country !== "CH" && country !== "PT") {
    return NextResponse.json({ ok: true, deadlines: [], reason: "country_not_supported" });
  }
  if (!(bp as { accounting_status?: string | null }).accounting_status) {
    return NextResponse.json({ ok: true, deadlines: [], reason: "status_not_configured" });
  }

  const daysParam = parseInt(req.nextUrl.searchParams.get("days") ?? "365", 10);
  const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 365, 1), 730);
  const now = new Date();
  const to = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const row = bp as Record<string, unknown>;

  if (country === "FR") {
    const profile: FiscalProfile = {
      accounting_status: row.accounting_status as FiscalProfile["accounting_status"],
      ae_activity_type: (row.ae_activity_type ?? null) as string | null,
      ae_started_at: (row.ae_started_at ?? null) as string | null,
      ae_versement_liberatoire: Boolean(row.ae_versement_liberatoire),
      ae_vat_franchise: Boolean(row.ae_vat_franchise),
      ae_urssaf_periodicity: (row.ae_urssaf_periodicity ?? null) as
        | "mensuelle"
        | "trimestrielle"
        | null,
      ae_vat_regime: (row.ae_vat_regime ?? null) as
        | "reel_mensuel"
        | "reel_trimestriel"
        | "simplifie"
        | null,
      sasu_fiscal_year_calendar: Boolean(row.sasu_fiscal_year_calendar),
      sasu_fiscal_year_start_month: (row.sasu_fiscal_year_start_month ?? null) as number | null,
      sasu_vat_regime: (row.sasu_vat_regime ?? null) as string | null,
      sasu_vat_intra_enabled: Boolean(row.sasu_vat_intra_enabled),
      sasu_dirigeant_remunere: Boolean(row.sasu_dirigeant_remunere),
      eurl_is_election: Boolean(row.eurl_is_election),
      sarl_gerant_majoritaire: Boolean(row.sarl_gerant_majoritaire),
    };
    const deadlines = computeFiscalDeadlines(profile, now, to);
    return NextResponse.json({ ok: true, deadlines, country: "FR" });
  }

  if (country === "CH") {
    const profile: FiscalProfileCH = {
      accounting_status: row.accounting_status as FiscalProfileCH["accounting_status"],
      ch_canton: (row.ch_canton ?? null) as string | null,
      ch_vat_assujetti: Boolean(row.ch_vat_assujetti),
      ch_vat_periodicity: (row.ch_vat_periodicity ?? null) as FiscalProfileCH["ch_vat_periodicity"],
      ch_vat_method: (row.ch_vat_method ?? null) as FiscalProfileCH["ch_vat_method"],
      ch_started_at: (row.ch_started_at ?? null) as string | null,
      sasu_fiscal_year_calendar: Boolean(row.sasu_fiscal_year_calendar),
      sasu_fiscal_year_start_month: (row.sasu_fiscal_year_start_month ?? null) as number | null,
    };
    const deadlines = computeFiscalDeadlinesCH(profile, now, to);
    return NextResponse.json({ ok: true, deadlines, country: "CH" });
  }

  // PT
  const profile: FiscalProfilePT = {
    accounting_status: row.accounting_status as FiscalProfilePT["accounting_status"],
    pt_nif: (row.pt_nif ?? null) as string | null,
    pt_region: (row.pt_region ?? null) as FiscalProfilePT["pt_region"],
    pt_iva_isento: Boolean(row.pt_iva_isento),
    pt_iva_periodicity: (row.pt_iva_periodicity ?? null) as FiscalProfilePT["pt_iva_periodicity"],
    pt_tax_regime: (row.pt_tax_regime ?? null) as FiscalProfilePT["pt_tax_regime"],
    pt_started_at: (row.pt_started_at ?? null) as string | null,
    sasu_fiscal_year_calendar: Boolean(row.sasu_fiscal_year_calendar),
    sasu_fiscal_year_start_month: (row.sasu_fiscal_year_start_month ?? null) as number | null,
  };
  const deadlines = computeFiscalDeadlinesPT(profile, now, to);
  return NextResponse.json({ ok: true, deadlines, country: "PT" });
}
