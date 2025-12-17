// app/contents/page.tsx
// Page "Mes Contenus" : liste + vue calendrier + accès au détail
// + Filtres (recherche / statut / type / canal) en query params
// + Actions : dupliquer / supprimer (API) + toasts
// Best: compat statut legacy planned/scheduled + fix placeholder + UX stable

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  FileText,
  Mail,
  Video,
  Image as ImageIcon,
  Plus,
  List as ListIcon,
  CalendarDays,
  Filter,
  ArrowRight,
  Search,
  X,
} from "lucide-react";

import { ContentCalendarView, type ContentCalendarItem } from "@/components/content/ContentCalendarView";
import { ContentItemActions } from "@/components/content/ContentItemActions";

type Props = {
  searchParams?: {
    view?: string;
    q?: string;
    status?: string;
    type?: string;
    channel?: string;
  };
};

type ContentItem = ContentCalendarItem;

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
  if (low === "scheduled" || low === "planned") return "Planifié";
  if (low === "draft") return "Brouillon";
  if (low === "archived") return "Archivé";
  return s;
}

function badgeVariantForStatus(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const s = safeString(status).toLowerCase();
  if (s.includes("pub") || s === "published") return "default";
  if (s.includes("plan") || s === "scheduled" || s === "planned") return "secondary";
  if (s.includes("brou") || s === "draft") return "outline";
  if (s.includes("arch") || s === "archived") return "outline";
  if (s.includes("err") || s.includes("fail")) return "destructive";
  return "outline";
}

function iconForType(type: string | null) {
  const t = safeString(type).toLowerCase();
  if (t.includes("email")) return Mail;
  if (t.includes("video") || t.includes("vidéo")) return Video;
  if (t.includes("image") || t.includes("visuel")) return ImageIcon;
  return FileText;
}

function formatDateLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long" }).format(d);
}

function buildQueryString(params: Record<string, string | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v.trim()) usp.set(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export default async function MyContentPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "Utilisateur";

  const view = (searchParams?.view ?? "list").toLowerCase();
  const initialTab = view === "calendar" ? "calendar" : "list";

  const q = safeString(searchParams?.q).trim();
  const status = normalizeFilterValue(safeString(searchParams?.status));
  const type = normalizeFilterValue(safeString(searchParams?.type));
  const channel = normalizeFilterValue(safeString(searchParams?.channel));

  let query = supabase
    .from("content_item")
    .select("id, type, title, status, scheduled_date, channel, tags, created_at")
    .eq("user_id", session.user.id)
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
      query = query.ilike("status", status);
    }
  }

  if (type) query = query.ilike("type", `%${type}%`);
  if (channel) query = query.ilike("channel", `%${channel}%`);

  const { data: items, error } = await query;

  if (error) console.error("[contents] list error", error);

  const safeItems: ContentItem[] = Array.isArray(items) ? (items as ContentItem[]) : [];

  const typeOptions = Array.from(new Set(safeItems.map((it) => safeString(it.type).trim()).filter(Boolean).slice(0, 50)))
    .sort((a, b) => a.localeCompare(b, "fr"));

  const channelOptions = Array.from(
    new Set(safeItems.map((it) => safeString(it.channel).trim()).filter(Boolean).slice(0, 50))
  ).sort((a, b) => a.localeCompare(b, "fr"));

  const itemsByDate: Record<string, ContentItem[]> = {};
  for (const it of safeItems) {
    if (!it.scheduled_date) continue;
    if (!itemsByDate[it.scheduled_date]) itemsByDate[it.scheduled_date] = [];
    itemsByDate[it.scheduled_date].push(it);
  }
  const scheduledDates = Object.keys(itemsByDate).sort();

  const hasActiveFilters = Boolean(q || status || type || channel);

  return (
    <AppShell userEmail={userEmail}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mes Contenus</h1>
            <p className="text-sm text-muted-foreground">
              Retrouvez vos contenus générés et planifiés (publication, statut, canal).
            </p>
          </div>

          <Link href="/create">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Créer
            </Button>
          </Link>
        </div>

        <Tabs defaultValue={initialTab} className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TabsList>
              <TabsTrigger asChild value="list">
                <Link href={`/contents${buildQueryString({ view: "list", q, status, type, channel })}`} className="gap-2">
                  <ListIcon className="w-4 h-4" />
                  Liste
                </Link>
              </TabsTrigger>
              <TabsTrigger asChild value="calendar">
                <Link
                  href={`/contents${buildQueryString({ view: "calendar", q, status, type, channel })}`}
                  className="gap-2"
                >
                  <CalendarDays className="w-4 h-4" />
                  Calendrier
                </Link>
              </TabsTrigger>
            </TabsList>

            <Button variant="outline" className="gap-2" disabled>
              <Filter className="w-4 h-4" />
              Filtres
            </Button>
          </div>

          <Card className="p-4">
            <form action="/contents" method="GET" className="grid gap-4 md:grid-cols-12 items-end">
              <input type="hidden" name="view" value={initialTab} />

              <div className="md:col-span-5 grid gap-2">
                <Label htmlFor="q" className="text-xs">
                  Recherche
                </Label>
                <div className="relative">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input id="q" name="q" defaultValue={q} placeholder="Titre, type, canal…" className="pl-9" />
                </div>
              </div>

              <div className="md:col-span-2 grid gap-2">
                <Label className="text-xs">Statut</Label>
                <Select name="status" defaultValue={status || "all"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="planned">Planifié</SelectItem>
                    <SelectItem value="published">Publié</SelectItem>
                    <SelectItem value="archived">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 grid gap-2">
                <Label className="text-xs">Type</Label>
                <Select name="type" defaultValue={type || "all"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    {typeOptions.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 grid gap-2">
                <Label className="text-xs">Canal</Label>
                <Select name="channel" defaultValue={channel || "all"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    {channelOptions.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-1 flex gap-2">
                <Button type="submit" className="w-full">
                  Filtrer
                </Button>
              </div>

              {hasActiveFilters ? (
                <div className="md:col-span-12 flex justify-end">
                  <Link href={`/contents${buildQueryString({ view: initialTab })}`}>
                    <Button type="button" variant="ghost" className="gap-2">
                      <X className="w-4 h-4" />
                      Réinitialiser
                    </Button>
                  </Link>
                </div>
              ) : null}
            </form>
          </Card>

          <TabsContent value="list" className="space-y-4">
            {safeItems.length === 0 ? (
              <Card className="p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="font-semibold">Aucun contenu</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {hasActiveFilters
                    ? "Aucun résultat avec ces filtres. Essaie de réinitialiser."
                    : "Lance une génération (Réseaux sociaux, emails, blog, scripts…) et on les retrouvera ici."}
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                  {hasActiveFilters ? (
                    <Link href={`/contents${buildQueryString({ view: initialTab })}`}>
                      <Button variant="outline" className="gap-2">
                        <X className="w-4 h-4" />
                        Réinitialiser
                      </Button>
                    </Link>
                  ) : null}
                  <Link href="/create">
                    <Button className="gap-2">
                      <Spark />
                      Générer un contenu
                    </Button>
                  </Link>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4">
                {safeItems.map((it) => {
                  const Icon = iconForType(it.type);

                  return (
                    <Card key={it.id} className="p-5 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <Link href={`/contents/${it.id}`} className="flex-1 min-w-0">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                              <Icon className="w-5 h-5 text-muted-foreground" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold truncate">
                                  {it.title?.trim() || `${it.type || "Contenu"} sans titre`}
                                </p>
                                <Badge variant={badgeVariantForStatus(it.status)}>
                                  {normalizeStatusForLabel(it.status)}
                                </Badge>
                              </div>

                              <div className="mt-1 flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                                <span>{it.type || "—"}</span>
                                <span aria-hidden>•</span>
                                <span>{it.channel || "—"}</span>
                                <span aria-hidden>•</span>
                                <span>{it.scheduled_date ? formatDateLabel(it.scheduled_date) : "Non planifié"}</span>
                              </div>

                              {Array.isArray(it.tags) && it.tags.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {it.tags.slice(0, 6).map((t) => (
                                    <Badge key={t} variant="outline" className="text-xs">
                                      {t}
                                    </Badge>
                                  ))}
                                  {it.tags.length > 6 ? (
                                    <Badge variant="outline" className="text-xs">
                                      +{it.tags.length - 6}
                                    </Badge>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </Link>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link href={`/contents/${it.id}`}>
                            <Button variant="ghost" className="gap-2">
                              Ouvrir
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </Link>

                          <ContentItemActions id={it.id} title={it.title} />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="space-y-4">
            <ContentCalendarView itemsByDate={itemsByDate} scheduledDates={scheduledDates} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" aria-hidden>
      <path
        d="M12 2l1.4 5.2L18 9l-4.6 1.8L12 16l-1.4-5.2L6 9l4.6-1.8L12 2Z"
        className="fill-current"
      />
      <path
        d="M19 13l.8 3 2.2 1-2.2 1-.8 3-.8-3-2.2-1 2.2-1 .8-3Z"
        className="fill-current opacity-70"
      />
    </svg>
  );
}
