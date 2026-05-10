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
import {
  computeFiscalDeadlinesBE,
  type FiscalProfileBE,
} from "@/lib/compta/fiscalCalendarBE";
import {
  computeFiscalDeadlinesES,
  type FiscalProfileES,
} from "@/lib/compta/fiscalCalendarES";
import {
  computeFiscalDeadlinesCA,
  type FiscalProfileCA,
} from "@/lib/compta/fiscalCalendarCA";
import {
  computeFiscalDeadlinesUS,
  type FiscalProfileUS,
} from "@/lib/compta/fiscalCalendarUS";
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
      "country, accounting_status, ae_activity_type, ae_started_at, ae_versement_liberatoire, ae_vat_franchise, ae_urssaf_periodicity, ae_vat_regime, sasu_fiscal_year_calendar, sasu_fiscal_year_start_month, sasu_vat_regime, sasu_vat_intra_enabled, sasu_dirigeant_remunere, eurl_is_election, sarl_gerant_majoritaire, ch_canton, ch_vat_assujetti, ch_vat_periodicity, ch_vat_method, ch_started_at, pt_nif, pt_region, pt_iva_isento, pt_iva_periodicity, pt_tax_regime, pt_started_at, be_region, be_company_number, be_vat_franchise, be_vat_periodicity, be_intra_eu_listing, be_started_at, es_community, es_company_number, es_iva_regime, es_iva_periodicity, es_redeme, es_irpf_method, es_started_at, ca_province, ca_business_number, ca_gst_registered, ca_gst_periodicity, ca_petit_fournisseur, ca_fiscal_year_calendar, ca_fiscal_year_start_month, ca_started_at, us_state, us_ein, us_llc_tax_classification, us_sales_tax_states, us_fiscal_year_calendar, us_fiscal_year_start_month, us_started_at",
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
  if (country !== "FR" && country !== "CH" && country !== "PT" && country !== "BE" && country !== "ES" && country !== "CA" && country !== "US") {
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

  if (country === "PT") {
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

  if (country === "BE") {
    const profile: FiscalProfileBE = {
      accounting_status: row.accounting_status as FiscalProfileBE["accounting_status"],
      be_region: (row.be_region ?? null) as FiscalProfileBE["be_region"],
      be_company_number: (row.be_company_number ?? null) as string | null,
      be_vat_franchise: Boolean(row.be_vat_franchise),
      be_vat_periodicity: (row.be_vat_periodicity ?? null) as FiscalProfileBE["be_vat_periodicity"],
      be_intra_eu_listing: Boolean(row.be_intra_eu_listing),
      be_started_at: (row.be_started_at ?? null) as string | null,
      sasu_fiscal_year_calendar: Boolean(row.sasu_fiscal_year_calendar),
      sasu_fiscal_year_start_month: (row.sasu_fiscal_year_start_month ?? null) as number | null,
    };
    const deadlines = computeFiscalDeadlinesBE(profile, now, to);
    return NextResponse.json({ ok: true, deadlines, country: "BE" });
  }

  if (country === "ES") {
    const profile: FiscalProfileES = {
      accounting_status: row.accounting_status as FiscalProfileES["accounting_status"],
      es_community: (row.es_community ?? null) as FiscalProfileES["es_community"],
      es_company_number: (row.es_company_number ?? null) as string | null,
      es_iva_regime: (row.es_iva_regime ?? null) as FiscalProfileES["es_iva_regime"],
      es_iva_periodicity: (row.es_iva_periodicity ?? null) as FiscalProfileES["es_iva_periodicity"],
      es_redeme: Boolean(row.es_redeme),
      es_irpf_method: (row.es_irpf_method ?? null) as FiscalProfileES["es_irpf_method"],
      es_started_at: (row.es_started_at ?? null) as string | null,
      sasu_fiscal_year_calendar: Boolean(row.sasu_fiscal_year_calendar),
      sasu_fiscal_year_start_month: (row.sasu_fiscal_year_start_month ?? null) as number | null,
    };
    const deadlines = computeFiscalDeadlinesES(profile, now, to);
    return NextResponse.json({ ok: true, deadlines, country: "ES" });
  }

  if (country === "CA") {
    const profile: FiscalProfileCA = {
      accounting_status: row.accounting_status as FiscalProfileCA["accounting_status"],
      ca_province: (row.ca_province ?? null) as FiscalProfileCA["ca_province"],
      ca_business_number: (row.ca_business_number ?? null) as string | null,
      ca_gst_registered: Boolean(row.ca_gst_registered),
      ca_gst_periodicity: (row.ca_gst_periodicity ?? null) as FiscalProfileCA["ca_gst_periodicity"],
      ca_petit_fournisseur: Boolean(row.ca_petit_fournisseur),
      ca_fiscal_year_calendar: row.ca_fiscal_year_calendar !== false,
      ca_fiscal_year_start_month: (row.ca_fiscal_year_start_month ?? null) as number | null,
      ca_started_at: (row.ca_started_at ?? null) as string | null,
    };
    const deadlines = computeFiscalDeadlinesCA(profile, now, to);
    return NextResponse.json({ ok: true, deadlines, country: "CA" });
  }

  // US
  const salesTaxStates = Array.isArray(row.us_sales_tax_states)
    ? (row.us_sales_tax_states as string[])
    : [];
  const profile: FiscalProfileUS = {
    accounting_status: row.accounting_status as FiscalProfileUS["accounting_status"],
    us_state: (row.us_state ?? null) as string | null,
    us_ein: (row.us_ein ?? null) as string | null,
    us_llc_tax_classification: (row.us_llc_tax_classification ?? null) as FiscalProfileUS["us_llc_tax_classification"],
    us_sales_tax_states: salesTaxStates,
    us_fiscal_year_calendar: row.us_fiscal_year_calendar !== false,
    us_fiscal_year_start_month: (row.us_fiscal_year_start_month ?? null) as number | null,
    us_started_at: (row.us_started_at ?? null) as string | null,
  };
  const deadlines = computeFiscalDeadlinesUS(profile, now, to);
  return NextResponse.json({ ok: true, deadlines, country: "US" });
}
