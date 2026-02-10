// app/contents/page.tsx
// Page "Mes Contenus" (pixel layout Lovable).
// Server component: auth + fetch Supabase + passe les items au client.
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/statut/canal/date_planifiee)
// -> on tente d'abord la "v2" (title/status/channel/scheduled_date), sinon fallback FR avec aliasing.

import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import MyContentLovableClient from "@/components/content/MyContentLovableClient";
import type { ContentListItem } from "@/lib/types/content";

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStatusParam(status: string | undefined): string {
  const s = safeString(status).trim().toLowerCase();
  if (!s || s === "all") return "";
  if (s === "planned") return "scheduled";
  return s;
}

function normalizeTypeParam(type: string | undefined): string {
  const s = safeString(type).trim();
  return s === "all" ? "" : s;
}

function normalizeChannelParam(channel: string | undefined): string {
  const s = safeString(channel).trim();
  return s === "all" ? "" : s;
}

function isMissingColumnError(message: string | undefined | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("unknown"));
}

async function fetchContentsForUser(
  userId: string,
  q: string,
  status: string,
  type: string,
  channel: string
): Promise<{ data: ContentListItem[]; error?: string }> {
  const supabase = await getSupabaseServerClient();

  // V2 (colonnes EN)
  let v2 = supabase
    .from("content_item")
    .select("id, type, title, content, status, scheduled_date, channel, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (q) {
    v2 = v2.or(`title.ilike.%${q}%,type.ilike.%${q}%,channel.ilike.%${q}%`);
  }
  if (status) v2 = v2.eq("status", status);
  if (type) v2 = v2.eq("type", type);
  if (channel) v2 = v2.eq("channel", channel);

  const v2Res = await v2;
  if (!v2Res.error) {
    const mapped = (v2Res.data ?? []).map((r: any) => ({
      id: String(r.id),
      type: r.type ?? null,
      title: r.title ?? null,
      content: r.content ?? null,
      status: r.status ?? null,
      scheduled_date: r.scheduled_date ?? null,
      channel: r.channel ?? null,
      tags: r.tags ?? null,
      created_at: String(r.created_at),
    })) as ContentListItem[];

    return { data: mapped };
  }

  // Si erreur colonne manquante => fallback FR
  if (!isMissingColumnError(v2Res.error.message)) {
    return { data: [] as ContentListItem[], error: v2Res.error.message };
  }

  let fb = supabase
    .from("content_item")
    .select(
      "id, type, title:titre, content:contenu, status:statut, scheduled_date:date_planifiee, channel:canal, tags, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (q) {
    fb = fb.or(`titre.ilike.%${q}%,type.ilike.%${q}%,canal.ilike.%${q}%`);
  }
  if (status) fb = fb.eq("statut", status);
  if (type) fb = fb.eq("type", type);
  if (channel) fb = fb.eq("canal", channel);

  const fbRes = await fb;
  if (fbRes.error) {
    return { data: [] as ContentListItem[], error: fbRes.error.message };
  }

  const mapped = (fbRes.data ?? []).map((r: any) => ({
    id: String(r.id),
    type: r.type ?? null,
    title: r.title ?? null,
    content: r.content ?? null,
    status: r.status ?? null,
    scheduled_date: r.scheduled_date ?? null,
    channel: r.channel ?? null,
    tags: r.tags ?? null,
    created_at: String(r.created_at),
  })) as ContentListItem[];

  return { data: mapped };
}

export default async function ContentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const sp = await searchParams;

  const qRaw = sp.q;
  const statusRaw = sp.status;
  const typeRaw = sp.type;
  const channelRaw = sp.channel;
  const viewRaw = sp.view;

  const q = safeString(Array.isArray(qRaw) ? qRaw[0] : qRaw).trim();
  const status = normalizeStatusParam(Array.isArray(statusRaw) ? statusRaw[0] : statusRaw);
  const type = normalizeTypeParam(Array.isArray(typeRaw) ? typeRaw[0] : typeRaw);
  const channel = normalizeChannelParam(Array.isArray(channelRaw) ? channelRaw[0] : channelRaw);

  const initialView =
    safeString(Array.isArray(viewRaw) ? viewRaw[0] : viewRaw).toLowerCase() === "calendar" ? "calendar" : "list";

  const [{ data: items, error }, quizzesResult] = await Promise.all([
    fetchContentsForUser(session.user.id, q, status, type, channel),
    supabase
      .from("quizzes")
      .select("id, title, status, views_count, shares_count, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false }),
  ]);

  // Count leads per quiz
  const quizRows = (quizzesResult?.data as any[]) ?? [];
  const quizzes = quizRows.map((qz: any) => ({
    id: String(qz.id),
    title: qz.title ?? "",
    status: qz.status ?? "draft",
    views_count: qz.views_count ?? 0,
    shares_count: qz.shares_count ?? 0,
    leads_count: 0,
    created_at: String(qz.created_at),
  }));

  // Fetch lead counts if there are quizzes
  if (quizzes.length > 0) {
    const quizIds = quizzes.map((qz) => qz.id);
    const { data: leadCounts } = await supabase
      .from("quiz_leads")
      .select("quiz_id")
      .in("quiz_id", quizIds);
    if (Array.isArray(leadCounts)) {
      const countMap: Record<string, number> = {};
      for (const l of leadCounts) {
        const qid = String(l.quiz_id);
        countMap[qid] = (countMap[qid] ?? 0) + 1;
      }
      for (const qz of quizzes) {
        qz.leads_count = countMap[qz.id] ?? 0;
      }
    }
  }

  return (
    <MyContentLovableClient
      userEmail={session.user.email ?? ""}
      initialView={initialView}
      items={items}
      quizzes={quizzes}
      error={error}
    />
  );
}
