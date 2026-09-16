// app/api/leads/export/route.ts
// GET — export leads as CSV (decrypts PII before export)

import { NextRequest, NextResponse } from "next/server";
import { colonnesChampsPersonnalises, valeurChamp } from "@/lib/quiz/champsPersonnalises";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getUserDEK } from "@/lib/piiKeys";
import { decryptLeadPII } from "@/lib/piiCrypto";
import { computeLockedLeadIds } from "@/lib/leadLock";
import { isPaidPlan } from "@/lib/planLimits";

export const dynamic = "force-dynamic";

function escapeCsv(val: string | null | undefined): string {
  if (!val) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);
    const dek = await getUserDEK(supabase, user.id);

    const ids = req.nextUrl.searchParams.get("ids");
    const idList = ids ? ids.split(",").filter(Boolean) : null;

    let query = supabase
      .from("leads")
      .select("*")
      .eq("user_id", user.id);

    // Inclut les leads legacy sans project_id (jamais masquer un lead).
    if (projectId) query = query.or(`project_id.eq.${projectId},project_id.is.null`);
    if (idList && idList.length > 0) query = query.in("id", idList);

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Free-tier export = unlocked leads only. The same rolling-window lock
    // computation as the listing API; locked rows are filtered out before
    // we even decrypt them, so plain-text PII never reaches the CSV buffer.
    const { data: planRow } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();
    const plan = String((planRow as { plan?: string | null } | null)?.plan ?? "free");
    let lockedIds = new Set<string>();
    if (!isPaidPlan(plan)) {
      let timelineQuery = supabase
        .from("leads")
        .select("id, created_at")
        .eq("user_id", user.id);
      if (projectId) timelineQuery = timelineQuery.or(`project_id.eq.${projectId},project_id.is.null`);
      const { data: timeline } = await timelineQuery;
      lockedIds = computeLockedLeadIds(timeline ?? [], plan);
    }

    const leads = (data ?? [])
      .filter((row: any) => !lockedIds.has(row.id))
      .map((row: any) => {
        const pii = decryptLeadPII(row, dek);
        return { ...row, ...pii };
      });

    // Les champs personnalisés : une colonne par champ, sous son libellé,
    // en fin de ligne (16 septembre 2026). Best-effort : la colonne peut
    // manquer, et l'export ne doit pas échouer pour ça.
    const { data: quizzesChamps } = await supabase.from("quizzes").select("id, custom_fields").eq("user_id", user.id);
    const colonnesPerso = colonnesChampsPersonnalises((quizzesChamps ?? []) as Array<{ custom_fields?: unknown }>);

    const headers = [
      "Email",
      "Prénom",
      "Nom",
      "Téléphone",
      "Source",
      "Origine",
      "Résultat quiz",
      "Exporté Systeme.io",
      "Date de capture",
      ...colonnesPerso.map((c) => escapeCsv(c.label)),
    ];

    const rows = leads.map((lead: any) => [
      escapeCsv(lead.email),
      escapeCsv(lead.first_name),
      escapeCsv(lead.last_name),
      escapeCsv(lead.phone),
      escapeCsv(lead.source),
      escapeCsv(lead.source_name),
      escapeCsv(lead.quiz_result_title),
      lead.exported_sio ? "Oui" : "Non",
      lead.created_at ? new Date(lead.created_at).toLocaleDateString("fr-FR") : "",
      ...colonnesPerso.map((c) => escapeCsv(valeurChamp(lead.custom_fields, c.id))),
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row: string[]) => row.join(",")),
    ].join("\n");

    const bom = "\uFEFF";

    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
