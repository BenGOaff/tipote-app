"use client";

// components/quiz/SurveyResponsesTable.tsx (Tipote)
//
// Vue "Réponses" individuelles d'un sondage (style Typeform / Tally) : une
// ligne = un répondant, avec son identité ET sa réponse à chaque question.
// Complète SurveyTrends (qui n'affiche QUE l'agrégat) pour répondre au besoin
// "je veux savoir QUI a donné QUELLE réponse" (drame Béné 26 juin 2026 :
// impossible de récompenser les bonnes réponses car l'export était anonyme).
//
// Les libellés de réponse passent par le helper partagé formatSurveyAnswer →
// fini les "Option 1" au lieu de "Oui".

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatSurveyAnswer,
  indexAnswers,
  type SurveyAnswerLike,
  type SurveyQuestionLike,
} from "@/lib/survey/format";
import { stripHtml } from "@/lib/richText";

type ResponsesLead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  country: string | null;
  answers: SurveyAnswerLike[] | null;
  created_at: string;
};

export function SurveyResponsesTable({
  quizId,
  questions,
  leads,
  locale,
}: {
  quizId: string;
  questions: SurveyQuestionLike[];
  leads: ResponsesLead[];
  locale?: string | null;
}) {
  const t = useTranslations("survey");
  const [query, setQuery] = useState("");

  // Pré-calcule chaque ligne (identité + réponses formatées) une seule fois,
  // puis filtre par recherche texte sur l'ensemble (identité + réponses).
  const rows = useMemo(() => {
    return leads.map((l) => {
      const byQ = indexAnswers(l.answers);
      const cells = questions.map((q, qi) => formatSurveyAnswer(q, byQ.get(qi), locale));
      const name = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
      const haystack = [name, l.email, l.phone, l.country, ...cells]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return { lead: l, name, cells, haystack };
    });
  }, [leads, questions, locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.haystack.includes(q));
  }, [rows, query]);

  const handleExportCsv = () => {
    window.location.href = `/api/quiz/${quizId}/survey-results?format=csv`;
  };

  if (leads.length === 0) {
    return (
      <Card className="p-12 text-center text-muted-foreground">{t("responsesEmpty")}</Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("responsesSearchPlaceholder")}
            className="w-full h-9 pl-8 pr-3 rounded-lg border bg-background text-sm outline-none focus:border-primary"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length}/{rows.length}
        </span>
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download className="w-4 h-4 mr-1.5" />
          {t("exportCsv")}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-semibold whitespace-nowrap sticky left-0 bg-muted/40 z-10">
                  {t("colRespondent")}
                </th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">{t("colDate")}</th>
                {questions.map((q, qi) => (
                  <th key={qi} className="px-3 py-2 font-semibold min-w-[160px] max-w-[280px]">
                    {stripHtml(String(q.question_text ?? "")).trim() || `Q${qi + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ lead, name, cells }) => (
                <tr key={lead.id} className="border-b last:border-0 align-top hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-background z-10">
                    <div className="font-medium">{name || t("responsesAnonymous")}</div>
                    {lead.email && (
                      <div className="text-xs text-muted-foreground">{lead.email}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                  {cells.map((cell, qi) => (
                    <td key={qi} className="px-3 py-2 max-w-[280px] whitespace-pre-wrap break-words">
                      {cell || <span className="text-muted-foreground/50">-</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={questions.length + 2}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    {t("responsesNoMatch")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
