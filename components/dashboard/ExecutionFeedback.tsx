'use client';

import { useEffect, useMemo, useState } from 'react';

type StatsResponse =
  | { ok: true; total: number; done: number; completionRate: number }
  | { ok: false; error: string };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function messageFor(rate: number, total: number) {
  if (total === 0) {
    return {
      title: 'Démarrage en douceur',
      body: "Ajoute 1–2 tâches simples et exécute la première aujourd’hui. Petit rythme, gros effet.",
    };
  }

  if (rate >= 80) {
    return {
      title: 'Excellent rythme 🔥',
      body: 'Tu es dans une très bonne dynamique. Garde ce niveau, et évite juste de surcharger ta journée.',
    };
  }

  if (rate >= 50) {
    return {
      title: 'Bon cap ✅',
      body: 'Tu avances bien. Pour passer un cran, verrouille une petite tâche facile en premier, puis attaque le cœur.',
    };
  }

  if (rate >= 25) {
    return {
      title: 'On relance la machine',
      body: "Choisis UNE action ultra-simple maintenant (5–10 min) pour relancer l'élan.",
    };
  }

  return {
    title: 'Un pas, tout de suite',
    body: "Commence par la tâche la plus petite possible. L’objectif : un 1er ✅ aujourd’hui.",
  };
}

export function ExecutionFeedback() {
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
    return messageFor(rate, stats.total);
  }, [stats]);

  if (!content) return null;

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm font-medium">{content.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{content.body}</p>
    </div>
  );
}
