"use client";

// components/settings/SettingsAchievements.tsx
// Achievements gallery for the Tiquiz settings → account tab. Fetches
// the user's quiz/lead snapshot once on mount, derives the badge state
// via lib/achievements.ts, renders the gallery + summary chip.
//
// We keep the fetch self-contained here (the dashboard already does its
// own — replicating once on the settings page is fine, no global cache
// gymnastics for an infrequently-visited page).

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AchievementList, AchievementSummary } from "@/components/ui/achievement-list";
import { detectAchievements, type AchievementInput } from "@/lib/achievements";

type QuizSummary = {
  id: string;
  status: string;
  starts_count: number;
  views_count: number;
  locale: string | null;
  mode: "quiz" | "survey" | null;
  created_at: string;
  leads_count?: number;
};

export function SettingsAchievements() {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quiz");
        const json = await res.json();
        if (!cancelled && json?.ok) {
          // Lead counts aren't on the list endpoint — we accept that
          // achievements driven by lead totals will tick on once the
          // user visits the dashboard (which fetches them N+1). A
          // proper aggregate endpoint can ship later.
          const enriched: QuizSummary[] = await Promise.all(
            (json.quizzes ?? []).map(async (q: QuizSummary) => {
              try {
                const detail = await fetch(`/api/quiz/${q.id}`).then((r) => r.json());
                return { ...q, leads_count: detail?.leads?.length ?? 0 };
              } catch {
                return { ...q, leads_count: 0 };
              }
            }),
          );
          if (!cancelled) {
            setQuizzes(enriched);
            setLoaded(true);
          }
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const achievements = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const totalLeads = quizzes.reduce((s, q) => s + (q.leads_count ?? 0), 0);
    const distinctLocales = new Set(
      quizzes.map((q) => (q.locale ?? "").trim()).filter(Boolean),
    ).size;
    // Hot streak: any project earned ≥7 leads AND was active in the
    // last 7 days. Approximation — refine when we have per-day events.
    const weeklyHotStreak = quizzes.some(
      (q) => (q.leads_count ?? 0) >= 7 && new Date(q.created_at).getTime() > sevenDaysAgo,
    );
    const bestConversionRate = quizzes.reduce((best, q) => {
      if (q.starts_count < 5) return best;
      const r = (q.leads_count ?? 0) / q.starts_count;
      return r > best ? r : best;
    }, 0);

    const input: AchievementInput = {
      publishedCount: quizzes.filter((q) => q.status === "active").length,
      activeCount: quizzes.filter((q) => q.status === "active").length,
      totalLeads,
      distinctLocales,
      activeSurveyCount: quizzes.filter(
        (q) => q.status === "active" && q.mode === "survey",
      ).length,
      bestConversionRate,
      weeklyHotStreak,
    };
    return detectAchievements(input);
  }, [quizzes]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Mes badges</CardTitle>
        {loaded && <AchievementSummary items={achievements} />}
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-surface-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <AchievementList items={achievements} />
        )}
      </CardContent>
    </Card>
  );
}
