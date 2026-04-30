// app/api/leads/export/route.ts
// GET — export leads as CSV (decrypts PII before export)

import { NextRequest, NextResponse } from "next/server";
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

    if (projectId) query = query.eq("project_id", projectId);
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
      if (projectId) timelineQuery = timelineQuery.eq("project_id", projectId);
      const { data: timeline } = await timelineQuery;
      lockedIds = computeLockedLeadIds(timeline ?? [], plan);
    }

    const leads = (data ?? [])
      .filter((row: any) => !lockedIds.has(row.id))
      .map((row: any) => {
        const pii = decryptLeadPII(row, dek);
        return { ...row, ...pii };
      });

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
