'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

type StatsResponse =
  | { ok: true; total: number; done: number; completionRate: number }
  | { ok: false; error: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function messageKeyFor(rate: number, total: number): { titleKey: string; bodyKey: string } | null {
  if (total === 0) return { titleKey: 'softStart', bodyKey: 'softStartBody' };
  if (rate >= 80) return { titleKey: 'excellentPace', bodyKey: 'excellentPaceBody' };
  if (rate >= 50) return { titleKey: 'goodCourse', bodyKey: 'goodCourseBody' };
  if (rate >= 25) return { titleKey: 'relaunch', bodyKey: 'relaunchBody' };
  return { titleKey: 'oneStep', bodyKey: 'oneStepBody' };
}

export function ExecutionFeedback() {
  const t = useTranslations('executionFeedback');
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch('/api/tasks/stats', { method: 'GET' });
        const json = (await res.json()) as StatsResponse;
        if (!cancelled) setStats(json);
      } catch (e) {
        if (!cancelled) {
          setStats({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(() => {
    if (!stats) return null;
    if (!stats.ok) return null;
    const rate = clamp(stats.completionRate, 0, 100);
    const keys = messageKeyFor(rate, stats.total);
    if (!keys) return null;
    return { title: t(keys.titleKey as any), body: t(keys.bodyKey as any) };
  }, [stats, t]);

  if (!content) return null;

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium">{content.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{content.body}</p>
    </div>
  );
}
