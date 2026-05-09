// app/api/compta/fec-export/route.ts
//
// GET — télécharge le FEC (Fichier des Écritures Comptables) au
// format légal pour la SASU de l'user, sur la période demandée.
//
// Query params :
//   ?from=YYYY-MM-DD  — date début (inclus). Défaut : 1er jour de
//                       l'exercice fiscal courant (1er janvier ou
//                       sasu_fiscal_year_start_month).
//   ?to=YYYY-MM-DD    — date fin (inclus). Défaut : aujourd'hui.
//
// Réponse :
//   - SASU avec SIREN configuré → text/plain (FEC) en attachment
//     avec filename `<SIREN>FEC<AAAAMMJJ>.txt`.
//   - Sinon 400 avec un message clair.
//
// Restrictions : seules les SASU peuvent générer un FEC (les AE et
// particuliers n'en ont pas besoin). On valide ça côté API même si
// la UI cache déjà le bouton.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { buildFecExport } from "@/lib/compta/fecExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function ymdNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Calcule le 1er jour de l'exercice fiscal courant (par défaut
 *  1er janvier ; ou le 1er du mois `sasu_fiscal_year_start_month`
 *  si exercice décalé). */
function fiscalYearStartYmd(startMonth: number): string {
  const now = new Date();
  const m = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  // Si on est avant le mois de début (ex. mai 2026, exercice juillet),
  // on est encore dans l'exercice qui a commencé l'an passé.
  const isBeforeStart = now.getUTCMonth() + 1 < m;
  const year = isBeforeStart ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return `${year}-${String(m).padStart(2, "0")}-01`;
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

  // Charge le profil compta pour valider statut + récupérer SIREN +
  // régime TVA + mois de début d'exercice.
  let bpQuery = supabase
    .from("business_profiles")
    .select(
      "accounting_status, sasu_siren, sasu_fiscal_year_calendar, sasu_fiscal_year_start_month, sasu_vat_regime",
    )
    .eq("user_id", user.id);
  if (projectId) bpQuery = bpQuery.eq("project_id", projectId);
  const { data: bp, error: bpError } = await bpQuery.maybeSingle();
  if (bpError) {
    return NextResponse.json({ ok: false, error: bpError.message }, { status: 400 });
  }
  const profile = bp as {
    accounting_status?: string | null;
    sasu_siren?: string | null;
    sasu_fiscal_year_calendar?: boolean | null;
    sasu_fiscal_year_start_month?: number | null;
    sasu_vat_regime?: string | null;
  } | null;

  if (!profile || profile.accounting_status !== "sasu") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Le FEC n'est obligatoire que pour les SASU (et autres sociétés à l'IS). Configure-toi en SASU dans l'onglet Compta si applicable.",
      },
      { status: 400 },
    );
  }

  const siren = (profile.sasu_siren ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(siren)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Renseigne ton SIREN à 9 chiffres dans la configuration SASU avant de générer ton FEC (l'admin fiscal exige le SIREN dans le nom du fichier).",
      },
      { status: 400 },
    );
  }

  // Période
  const fromQ = req.nextUrl.searchParams.get("from") ?? "";
  const toQ = req.nextUrl.searchParams.get("to") ?? "";
  const startMonth = profile.sasu_fiscal_year_calendar
    ? 1
    : profile.sasu_fiscal_year_start_month ?? 1;

  const fromYmd = YMD_RE.test(fromQ) ? fromQ : fiscalYearStartYmd(startMonth);
  const toYmd = YMD_RE.test(toQ) ? toQ : ymdNow();

  if (fromYmd > toYmd) {
    return NextResponse.json(
      { ok: false, error: "La date de début doit être antérieure à la date de fin." },
      { status: 400 },
    );
  }

  const result = await buildFecExport({
    userId: user.id,
    projectId,
    fromYmd,
    toYmd,
    siren,
    vatRegime: (profile.sasu_vat_regime ?? null) as
      | "reel_mensuel"
      | "reel_trimestriel"
      | "simplifie"
      | null,
  });

  // BOM UTF-8 pour qu'Excel/LibreOffice ouvre proprement les
  // accents en cas de double-clic — l'admin fiscal accepte UTF-8
  // avec ou sans BOM.
  const body = "﻿" + result.content;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Tipote-FEC-Entries": String(result.entryCount),
    },
  });
}
