// app/contents/page.tsx
// Page "Mes Contenus" : liste + vue calendrier + accès au détail
// + Filtres (recherche / statut / type / canal) en query params
// + Actions : dupliquer / supprimer (API) + toasts
// Best: compat statut legacy planned/scheduled + fix placeholder + UX stable
//
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date), sinon fallback FR avec aliasing.

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { ContentItemActions } from "@/components/content/ContentItemActions";

type ContentListItem = {
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

function normalizeFilterValue(v: string) {
  const s = v.trim();
  return s === "all" ? "" : s;
}

function normalizeStatusForLabel(status: string | null): string {
  const s = safeString(status).trim();
  if (!s) return "—";
  const low = s.toLowerCase();
  if (low === "published") return "Publié";
  if (low === "draft") return "Brouillon";
  if (low === "planned" || low === "scheduled") return "Planifié";
  if (low === "archived") return "Archivé";
  return s;
}

function normalizeTags(tags: ContentListItem["tags"]): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean).map((t) => String(t));
  if (typeof tags === "string") {
    // support legacy "a,b,c"
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function isMissingColumnError(message: string | undefined | null) {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") && m.includes("column");
}

async function fetchContentList({
  userId,
  q,
  status,
  type,
  channel,
}: {
  userId: string;
  q: string;
  status: string;
  type: string;
  channel: string;
}) {
  const supabase = await getSupabaseServerClient();

  // 1) Try v2 schema (EN columns)
  let query = supabase
    .from("content_item")
    .select("id, type, title, status, scheduled_date, channel, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(`title.ilike.%${q}%,type.ilike.%${q}%,channel.ilike.%${q}%`);
  }

  // statut : support planned/scheduled (legacy)
  if (status) {
    const low = status.toLowerCase();
    if (low === "planned" || low === "scheduled") {
      query = query.in("status", ["planned", "scheduled"]);
    } else {
      query = query.eq("status", status);
    }
  }

  if (type) query = query.eq("type", type);
  if (channel) query = query.eq("channel", channel);

  const v2Res = await query;

  if (!v2Res.error) {
    return { data: (v2Res.data ?? []) as ContentListItem[], error: null as string | null };
  }

  // 2) Fallback FR schema with aliasing
  if (!isMissingColumnError(v2Res.error.message)) {
    return { data: [] as ContentListItem[], error: v2Res.error.message };
  }

  let fb = supabase
    .from("content_item")
    // PostgREST supports alias: newName:oldName
    .select(
      "id, type, title:titre, status:statut, scheduled_date:date_planifiee, channel:canal, tags, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (q) {
    fb = fb.or(`titre.ilike.%${q}%,type.ilike.%${q}%,canal.ilike.%${q}%`);
  }

  if (status) {
    const low = status.toLowerCase();
    if (low === "planned" || low === "scheduled") {
      fb = fb.in("statut", ["planned", "scheduled"]);
    } else {
      fb = fb.eq("statut", status);
    }
  }

  if (type) fb = fb.eq("type", type);
  if (channel) fb = fb.eq("canal", channel);

  const fbRes = await fb;

  if (fbRes.error) return { data: [] as ContentListItem[], error: fbRes.error.message };
  return { data: (fbRes.data ?? []) as ContentListItem[], error: null as string | null };
}

export default async function ContentsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const q = safeString(searchParams?.q).trim();
  const status = normalizeFilterValue(safeString(searchParams?.status));
  const type = normalizeFilterValue(safeString(searchParams?.type));
  const channel = normalizeFilterValue(safeString(searchParams?.channel));

  const { data: items, error } = await fetchContentList({
    userId: session.user.id,
    q,
    status,
    type,
    channel,
  });

  // data for calendar
  const scheduled = items
    .map((i) => i.scheduled_date)
    .filter((d): d is string => Boolean(d));

  const itemsByDate = scheduled.reduce<Record<string, ContentListItem[]>>((acc, d) => {
    acc[d] = acc[d] || [];
    return acc;
  }, {});

  for (const item of items) {
    if (!item.scheduled_date) continue;
    (itemsByDate[item.scheduled_date] ||= []).push(item);
  }

  const uniqueTypes = Array.from(new Set(items.map((i) => safeString(i.type)).filter(Boolean))).sort();
  const uniqueChannels = Array.from(new Set(items.map((i) => safeString(i.channel)).filter(Boolean))).sort();

  return (
    <AppShell userEmail={session.user.email ?? ""}>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Mes contenus</h1>
            <p className="text-sm text-slate-600">Retrouve, planifie et édite tes contenus.</p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/create">
              <Button className="rounded-xl bg-[#b042b4] text-white hover:opacity-95">Créer</Button>
            </Link>
          </div>
        </div>

        <Card className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Rechercher (titre, type, canal)…"
              className="h-10 rounded-xl"
            />

            <Select name="status" defaultValue={status || "all"}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="planned">Planifié</SelectItem>
                <SelectItem value="published">Publié</SelectItem>
                <SelectItem value="archived">Archivé</SelectItem>
              </SelectContent>
            </Select>

            <Select name="type" defaultValue={type || "all"}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {uniqueTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Select name="channel" defaultValue={channel || "all"}>
                <SelectTrigger className="h-10 flex-1 rounded-xl">
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les canaux</SelectItem>
                  {uniqueChannels.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button type="submit" variant="outline" className="h-10 rounded-xl">
                Filtrer
              </Button>
            </div>
          </form>
        </Card>

        {error ? (
          <Card className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Erreur : {error}
          </Card>
        ) : (
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="mb-4 w-full justify-start rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
              <TabsTrigger value="list" className="rounded-xl">
                Liste
              </TabsTrigger>
              <TabsTrigger value="calendar" className="rounded-xl">
                Calendrier
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list">
              <div className="grid gap-3">
                {items.length === 0 ? (
                  <Card className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                    Aucun contenu pour le moment.{" "}
                    <Link href="/create" className="font-semibold text-slate-900 hover:underline">
                      Créer un contenu →
                    </Link>
                  </Card>
                ) : (
                  items.map((item) => {
                    const tags = normalizeTags(item.tags);
                    return (
                      <Card
                        key={item.id}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/contents/${item.id}`}
                              className="truncate font-semibold text-slate-900 hover:underline"
                            >
                              {safeString(item.title) || "Sans titre"}
                            </Link>
                            <Badge variant="secondary" className="rounded-xl">
                              {safeString(item.type) || "—"}
                            </Badge>
                            <Badge variant="outline" className="rounded-xl">
                              {normalizeStatusForLabel(item.status)}
                            </Badge>
                            {item.scheduled_date ? (
                              <Badge variant="outline" className="rounded-xl">
                                {item.scheduled_date}
                              </Badge>
                            ) : null}
                            {safeString(item.channel) ? (
                              <Badge variant="secondary" className="rounded-xl">
                                {item.channel}
                              </Badge>
                            ) : null}
                          </div>

                          {tags.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {tags.slice(0, 6).map((t) => (
                                <Badge key={t} variant="outline" className="rounded-xl text-[11px]">
                                  {t}
                                </Badge>
                              ))}
                              {tags.length > 6 ? (
                                <span className="text-[11px] text-slate-500">+{tags.length - 6}</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <Link href={`/contents/${item.id}`}>
                            <Button variant="outline" className="h-9 rounded-xl">
                              Ouvrir
                            </Button>
                          </Link>
                          <ContentItemActions id={item.id} />
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="calendar">
              <ContentCalendarView
                scheduledDates={Array.from(new Set(scheduled)).sort()}
                itemsByDate={Object.fromEntries(
                  Object.entries(itemsByDate).map(([d, arr]) => [
                    d,
                    arr.map((it) => ({
                      id: it.id,
                      type: safeString(it.type),
                      title: safeString(it.title),
                      status: safeString(it.status),
                      scheduled_date: it.scheduled_date,
                      channel: safeString(it.channel),
                      tags: normalizeTags(it.tags),
                      created_at: it.created_at,
                    })),
                  ])
                )}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
