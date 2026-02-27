// app/contents/page.tsx
// Page "Mes Contenus" : liste + vue calendrier + accès au détail
// + Filtres (recherche / statut / type / canal) en query params
// + Actions : dupliquer / supprimer (API) + toasts
//
// NOTE DB compat: certaines instances ont encore les colonnes FR (titre/contenu/statut/canal/date_planifiee)
// -> on tente d'abord la "v2" (title/content/status/channel/scheduled_date), sinon fallback FR avec aliasing.

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { ContentItemActions } from "@/components/content/ContentItemActions";
import { ContentFiltersBar } from "@/components/content/ContentFiltersBar";

import { CalendarDays, List, Plus } from "lucide-react";

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
    return tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
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
  const view =
    safeString(Array.isArray(viewRaw) ? viewRaw[0] : viewRaw).toLowerCase() === "calendar" ? "calendar" : "list";

  const { data: items, error } = await fetchContentsForUser(session.user.id, q, status, type, channel);

  const uniqueTypes = Array.from(new Set(items.map((i) => safeString(i.type)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  const uniqueChannels = Array.from(new Set(items.map((i) => safeString(i.channel)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );

  // Stats cards
  const totalCount = items.length;
  const publishedCount = items.filter((i) => safeString(i.status).toLowerCase() === "published").length;
  const draftCount = items.filter((i) => safeString(i.status).toLowerCase() === "draft").length;
  const scheduledCount = items.filter((i) => {
    const s = safeString(i.status).toLowerCase();
    return s === "scheduled" || s === "planned";
  }).length;

  return (
    <AppShell userEmail={session.user.email ?? ""} headerTitle="Mes contenus">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Header (Lovable) : titre + toggle + bouton créer */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mes contenus</h1>
            <p className="mt-1 text-sm text-muted-foreground">Retrouve, planifie et édite tes contenus.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs defaultValue={view} value={view}>
              <TabsList className="h-10 rounded-xl">
                <TabsTrigger value="list" asChild className="gap-2 rounded-lg">
                  <Link
                    href={{
                      pathname: "/contents",
                      query: {
                        q: q || undefined,
                        status: status || undefined,
                        type: type || undefined,
                        channel: channel || undefined,
                        view: "list",
                      },
                    }}
                  >
                    <List className="h-4 w-4" />
                    Liste
                  </Link>
                </TabsTrigger>

                <TabsTrigger value="calendar" asChild className="gap-2 rounded-lg">
                  <Link
                    href={{
                      pathname: "/contents",
                      query: {
                        q: q || undefined,
                        status: status || undefined,
                        type: type || undefined,
                        channel: channel || undefined,
                        view: "calendar",
                      },
                    }}
                  >
                    <CalendarDays className="h-4 w-4" />
                    Calendrier
                  </Link>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button asChild className="h-10 rounded-xl gap-2">
              <Link href="/create">
                <Plus className="h-4 w-4" />
                Créer
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats cards (Lovable) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Total contenus</p>
            <p className="mt-2 text-2xl font-bold">{totalCount}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Publiés</p>
            <p className="mt-2 text-2xl font-bold">{publishedCount}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Planifiés</p>
            <p className="mt-2 text-2xl font-bold">{scheduledCount}</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">Brouillons</p>
            <p className="mt-2 text-2xl font-bold">{draftCount}</p>
          </Card>
        </div>

        {/* Filters card (client – pour que Select marche en query params) */}
        <ContentFiltersBar
          initialQ={q}
          initialStatus={status}
          initialType={type}
          initialChannel={channel}
          view={view}
          typeOptions={uniqueTypes}
          channelOptions={uniqueChannels}
        />

        {/* Content view */}
        {error ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">Erreur : {error}</p>
          </Card>
        ) : (
          <Tabs value={view} defaultValue={view} className="w-full">
            {/* (Les triggers sont dans le header pour coller au template) */}
            <TabsContent value="list" className="mt-0">
              <div className="space-y-3">
                {items.length === 0 ? (
                  <Card className="p-8">
                    <p className="text-sm text-muted-foreground">
                      Aucun contenu trouvé. Essaie de modifier tes filtres, ou crée ton premier contenu.
                    </p>
                    <div className="mt-4">
                      <Button asChild className="rounded-xl">
                        <Link href="/create">Créer un contenu</Link>
                      </Button>
                    </div>
                  </Card>
                ) : (
                  items.map((item) => {
                    const tags = normalizeTags(item.tags);
                    return (
                      <Card
                        key={item.id}
                        className="flex flex-col gap-3 rounded-2xl border-border/50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/contents/${item.id}`}
                              className="truncate font-semibold text-foreground hover:underline"
                            >
                              {safeString(item.title) || "Sans titre"}
                            </Link>

                            <span className="inline-flex items-center rounded-xl bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {safeString(item.type) || "—"}
                            </span>

                            <span className="inline-flex items-center rounded-xl border px-2 py-1 text-xs text-muted-foreground">
                              {normalizeStatusForLabel(item.status)}
                            </span>

                            {item.scheduled_date ? (
                              <span className="inline-flex items-center rounded-xl border px-2 py-1 text-xs text-muted-foreground">
                                {item.scheduled_date}
                              </span>
                            ) : null}

                            {safeString(item.channel) ? (
                              <span className="inline-flex items-center rounded-xl bg-muted px-2 py-1 text-xs text-muted-foreground">
                                {item.channel}
                              </span>
                            ) : null}
                          </div>

                          {tags.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {tags.slice(0, 6).map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center rounded-xl border px-2 py-1 text-xs text-muted-foreground"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <Button asChild variant="outline" className="rounded-xl">
                            <Link href={`/contents/${item.id}`}>Voir</Link>
                          </Button>

                          <ContentItemActions id={item.id} title={safeString(item.title) || "Sans titre"} channel={item.channel} type={item.type} />
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="calendar" className="mt-0">
              <ContentCalendarView contents={items} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
