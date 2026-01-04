// app/contents/page.tsx
// Page "Mes Contenus" : liste + vue calendrier + accès au détail
// + Filtres (recherche / statut / type / canal) en query params
// + Actions : dupliquer / supprimer (API) + toasts
//
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date), sinon fallback FR avec aliasing.

import { redirect } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import MyContentPageClient from "@/components/content/MyContentPageClient";

export type ContentListItem = {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null;
  scheduled_date: string | null; // YYYY-MM-DD
  channel: string | null;
  tags: string[] | string | null;
  created_at: string;
};

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
    .select("id, type, title, status, scheduled_date, channel, tags, created_at")
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
    return { data: (v2Res.data ?? []) as ContentListItem[] };
  }

  // Si erreur colonne manquante => fallback FR
  if (!isMissingColumnError(v2Res.error.message)) {
    return { data: [] as ContentListItem[], error: v2Res.error.message };
  }

  let fb = supabase
    .from("content_item")
    .select("id, type, title:titre, status:statut, scheduled_date:date_planifiee, channel:canal, tags, created_at")
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

  return { data: (fbRes.data ?? []) as ContentListItem[] };
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

  const { data: items, error } = await fetchContentsForUser(session.user.id, q, status, type, channel);

  return (
    <MyContentPageClient
      userEmail={session.user.email ?? ""}
      initialView={initialView}
      items={items}
      error={error}
      initialFilters={{ q, status, type, channel }}
    />
  );
}
