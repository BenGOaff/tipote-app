// app/contents/page.tsx
// Page "Mes Contenus" — UI Lovable pixel-perfect + data Tipote
// Server component: auth + fetch Supabase + passe les items au client.
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/statut/canal/date_planifiee/contenu)
// -> on tente d'abord la "v2" (title/status/channel/scheduled_date/content), sinon fallback FR avec aliasing.

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import MyContentLovableClient from "@/components/content/MyContentLovableClient";

export type ContentListItem = {
  id: string;
  type: string | null;
  title: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null; // YYYY-MM-DD ou ISO
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
    .select("id, type, title, content, status, scheduled_date, channel, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (q) {
    v2 = v2.or(`title.ilike.%${q}%,content.ilike.%${q}%,type.ilike.%${q}%,channel.ilike.%${q}%`);
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
    .select(
      "id, type, title:titre, content:contenu, status:statut, scheduled_date:date_planifiee, channel:canal, tags, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (q) {
    fb = fb.or(`titre.ilike.%${q}%,contenu.ilike.%${q}%,type.ilike.%${q}%,canal.ilike.%${q}%`);
  }
  if (status) fb = fb.eq("statut", status);
  if (type) fb = fb.eq("type", type);
  if (channel) fb = fb.eq("canal", channel);

  const fbRes = await fb;
  if (fbRes.error) return { data: [] as ContentListItem[], error: fbRes.error.message };
  return { data: (fbRes.data ?? []) as ContentListItem[] };
}

export default async function ContentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect("/");

  const sp = await searchParams;

  const q = safeString(Array.isArray(sp.q) ? sp.q[0] : sp.q);
  const status = normalizeStatusParam(Array.isArray(sp.status) ? sp.status[0] : sp.status);
  const type = normalizeTypeParam(Array.isArray(sp.type) ? sp.type[0] : sp.type);
  const channel = normalizeChannelParam(Array.isArray(sp.channel) ? sp.channel[0] : sp.channel);

  const viewRaw = safeString(Array.isArray(sp.view) ? sp.view[0] : sp.view);
  const initialView = viewRaw === "calendar" ? "calendar" : "list";

  const { data, error } = await fetchContentsForUser(user.id, q, status, type, channel);

  return (
    <MyContentLovableClient
      userEmail={user.email ?? ""}
      initialView={initialView}
      items={data}
      error={error}
    />
  );
}
