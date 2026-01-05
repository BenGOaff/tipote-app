// app/analytics/page.tsx
// Analytics — wrapper server minimal + data Tipote, UI pixel-perfect via AnalyticsLovableClient

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import AnalyticsLovableClient from "@/components/analytics/AnalyticsLovableClient";

type ContentRow = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  channel: string | null;
  scheduled_date: string | null;
  created_at: string | null;
};

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function csvPeriod(p: string) {
  if (p === "7") return 7;
  if (p === "90") return 90;
  return 30;
}

function pctDelta(curr: number, prev: number) {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function parseDateMaybe(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: { period?: string };
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/");

  const periodDays = csvPeriod(String(searchParams?.period ?? "90"));

  // --- content_item (Tipote)
  const v2 = await supabase
    .from("content_item")
    .select("id, title, type, status, channel, scheduled_date, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(800);

  let rows: ContentRow[] = [];

  if (!v2.error) {
    rows = Array.isArray(v2.data) ? (v2.data as ContentRow[]) : [];
  } else {
    // fallback FR schema aliasing
    const fb = await supabase
      .from("content_item")
      .select(
        "id, title:titre, type, status:statut, channel:canal, scheduled_date:date_planifiee, created_at"
      )
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(800);

    rows = Array.isArray(fb.data) ? (fb.data as ContentRow[]) : [];
  }

  const sincePeriod = daysAgo(periodDays).getTime();
  const sincePrev = daysAgo(periodDays * 2).getTime();

  const inPeriod = rows.filter((r) => {
    const created = parseDateMaybe(r.created_at)?.getTime() ?? 0;
    return created >= sincePeriod;
  });

  const inPrev = rows.filter((r) => {
    const created = parseDateMaybe(r.created_at)?.getTime() ?? 0;
    return created >= sincePrev && created < sincePeriod;
  });

  const isPublished = (s: string | null) => {
    const x = (s ?? "").toLowerCase();
    return x === "published" || x === "publie" || x === "publié";
  };
  const isScheduled = (s: string | null) => {
    const x = (s ?? "").toLowerCase();
    return x === "scheduled" || x === "planifie" || x === "planifié";
  };

  const publishedNow = inPeriod.filter((r) => isPublished(r.status));
  const publishedPrev = inPrev.filter((r) => isPublished(r.status));
  const scheduledNow = inPeriod.filter((r) => isScheduled(r.status));
  const scheduledPrev = inPrev.filter((r) => isScheduled(r.status));

  const allNow = inPeriod.length;
  const allPrev = inPrev.length;

  const deltaPublished = pctDelta(publishedNow.length, publishedPrev.length);
  const deltaScheduled = pctDelta(scheduledNow.length, scheduledPrev.length);
  const deltaAll = pctDelta(allNow, allPrev);

  // prochaine échéance (planifié le plus proche)
  const nextScheduled = rows
    .map((r) => {
      const d = parseDateMaybe(r.scheduled_date);
      if (!d) return null;
      return { ...r, _d: d };
    })
    .filter(Boolean)
    .map((r) => r as ContentRow & { _d: Date })
    .filter((r) => r._d.getTime() >= Date.now())
    .sort((a, b) => a._d.getTime() - b._d.getTime())[0];

  // “Engagement chart” proxy : volume/jour sur 14 points (2 semaines)
  const days14 = Array.from({ length: 14 }).map((_, i) => {
    const d = startOfDay(daysAgo(13 - i));
    return d;
  });
  const volumes14 = days14.map((d) => {
    const key = toIsoDate(d);
    const createdCount = inPeriod.filter((r) => {
      const created = parseDateMaybe(r.created_at);
      if (!created) return false;
      return toIsoDate(created) === key;
    }).length;
    const schedCount = inPeriod.filter((r) => {
      const sched = parseDateMaybe(r.scheduled_date);
      if (!sched) return false;
      return toIsoDate(sched) === key;
    }).length;
    return createdCount + schedCount;
  });

  const maxVol = Math.max(1, ...volumes14);
  const bars = volumes14.map((v) => clamp(Math.round((v / maxVol) * 100), 8, 100));

  // “Top contenus” proxy : derniers contenus publiés / planifiés
  const topContents = rows
    .slice(0, 8)
    .map((r) => ({
      id: r.id,
      title: r.title || "Sans titre",
      channel: r.channel || "—",
      status: r.status || "—",
      scheduled_date: r.scheduled_date,
      created_at: r.created_at,
    }));

  // “Sources trafic” proxy : répartition par channel sur période
  const channelCounts = inPeriod.reduce<Record<string, number>>((acc, r) => {
    const k = (r.channel || "—").trim() || "—";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const channelsSorted = Object.entries(channelCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const totalChannels = Math.max(1, channelsSorted.reduce((s, [, n]) => s + n, 0));
  const trafficSources = channelsSorted.map(([source, n]) => ({
    source,
    percentage: Math.round((n / totalChannels) * 100),
    visitors: `${n}`, // proxy
  }));

  // project_tasks -> progression objectifs proxy
  const { data: tasks } = await supabase
    .from("project_tasks")
    .select("id, status, due_date, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(400);

  const taskRows = Array.isArray(tasks) ? tasks : [];
  const tasksDone = taskRows.filter((t) => {
    const s = (t?.status ?? "").toLowerCase();
    return s === "done" || s === "completed" || s === "termine" || s === "terminé";
  }).length;
  const tasksTotal = taskRows.length;
  const tasksPct = tasksTotal > 0 ? clamp(Math.round((tasksDone / tasksTotal) * 100), 0, 100) : 0;

  return (
    <AnalyticsLovableClient
      periodDays={periodDays}
      kpis={{
        publishedNow: publishedNow.length,
        publishedPrev: publishedPrev.length,
        scheduledNow: scheduledNow.length,
        scheduledPrev: scheduledPrev.length,
        totalNow: allNow,
        totalPrev: allPrev,
        tasksDone,
        tasksTotal,
        tasksPct,
        deltaPublished,
        deltaScheduled,
        deltaAll,
      }}
      bars={bars}
      topContents={topContents}
      trafficSources={trafficSources}
      nextScheduled={
        nextScheduled
          ? {
              id: nextScheduled.id,
              title: nextScheduled.title || "Sans titre",
              type: nextScheduled.type || "—",
              channel: nextScheduled.channel || "—",
              status: nextScheduled.status || "—",
              scheduledAt: nextScheduled._d.toISOString(),
            }
          : null
      }
    />
  );
}
