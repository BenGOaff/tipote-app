// app/api/quiz/[quizId]/survey-results/route.ts
//
// GET ?format=json|csv — résultats d'un sondage pour son créateur.
//   - json : agrégat { totalResponses, questions:[{text, options:[{text,
//     count, pct}]}] } — consommé par le panneau UI + la génération PDF
//     client-side.
//   - csv : export brut, une ligne par répondant, une colonne par
//     question (libellé de l'option choisie). BOM UTF-8 (pattern
//     /api/leads/export).
//
// Owner-scoped : aggregateSurvey vérifie que le quiz appartient au user.

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { aggregateSurvey } from "@/lib/survey/analysis";
import { formatSurveyAnswer, indexAnswers, type SurveyAnswerLike, type SurveyQuestionLike } from "@/lib/survey/format";
import { stripHtml } from "@/lib/richText";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escapeCsv(val: string | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ quizId: string }> },
) {
  const { quizId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const format = (req.nextUrl.searchParams.get("format") ?? "json").toLowerCase();

  // Sécurité : vérifie l'ownership + le titre.
  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id, title, mode, locale")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (format === "json") {
    const aggregate = await aggregateSurvey(quizId, user.id);
    if (!aggregate) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, title: quiz.title, ...aggregate });
  }

  // Export brut par répondant : CSV ou Excel (.xlsx). Même matrice, deux
  // sérialisations → une seule source de vérité (fini les divergences).
  if (format === "csv" || format === "xlsx") {
    const locale = (quiz as { locale?: string | null }).locale ?? "fr";

    // Export brut : 1 ligne par répondant. Les réponses sont indexées par
    // question_index = position 0-based dans l'ordre sort_order (même
    // convention que PublicQuizClient + SurveyTrends). On itère les questions
    // DANS cet ordre et on aligne sur l'index.
    const { data: questionsRaw } = await supabaseAdmin
      .from("quiz_questions")
      .select("question_text, options, sort_order, question_type, config")
      .eq("quiz_id", quizId)
      .order("sort_order", { ascending: true });
    const questions = (questionsRaw ?? []) as Array<SurveyQuestionLike>;

    const { data: leads } = await supabaseAdmin
      .from("quiz_leads")
      .select("created_at, email, first_name, last_name, phone, country, flagged, answers")
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: true });

    // Identité du répondant EN PREMIER (la demande #1 : savoir qui a répondu
    // quoi) + colonne "Marqué", puis une colonne par question avec le VRAI
    // libellé de réponse.
    const headers = [
      "Date",
      "Email",
      "Prénom",
      "Nom",
      "Téléphone",
      "Pays",
      "Marqué",
      ...questions.map((q) => stripHtml(String(q.question_text ?? "")).trim() || "Question"),
    ];
    const rows: string[][] = [];

    for (const lead of leads ?? []) {
      const l = lead as {
        created_at?: string;
        email?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        phone?: string | null;
        country?: string | null;
        flagged?: boolean | null;
        answers?: SurveyAnswerLike[] | null;
      };
      const byQ = indexAnswers(l.answers);
      rows.push([
        l.created_at ? new Date(l.created_at).toLocaleDateString("fr-FR") : "",
        l.email ?? "",
        l.first_name ?? "",
        l.last_name ?? "",
        l.phone ?? "",
        l.country ?? "",
        l.flagged ? "Oui" : "",
        ...questions.map((q, qi) => formatSurveyAnswer(q, byQ.get(qi), locale)),
      ]);
    }

    const safeTitle = String(quiz.title ?? "sondage").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      // SheetJS : colonnes prêtes, pas de conversion côté user.
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = headers.map((h, i) => ({ wch: i < 7 ? Math.max(10, h.length + 2) : 32 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Réponses");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeTitle}-${stamp}.xlsx"`,
        },
      });
    }

    const csv = [
      headers.map(escapeCsv).join(","),
      ...rows.map((r) => r.map(escapeCsv).join(",")),
    ].join("\n");
    const bom = "﻿";
    return new NextResponse(bom + csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeTitle}-${stamp}.csv"`,
      },
    });
  }

  return NextResponse.json({ ok: false, error: "bad_format" }, { status: 400 });
}
