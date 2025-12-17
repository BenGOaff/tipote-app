// app/contents/page.tsx
// Page "Mes Contenus" : liste + vue calendrier + accès au détail
// Design calé sur Lovable (MyContent) tout en gardant la data Supabase existante.

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import {
  FileText,
  Mail,
  Video,
  Image as ImageIcon,
  MoreVertical,
  Plus,
  List as ListIcon,
  CalendarDays,
  Filter,
  ArrowRight,
} from "lucide-react";

import { ContentCalendarView, type ContentCalendarItem } from "@/components/content/ContentCalendarView";

type Props = {
  searchParams?: { view?: string };
};

type ContentItem = ContentCalendarItem;

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function iconForType(type: string | null) {
  const t = safeString(type).toLowerCase();
  if (t.includes("email")) return Mail;
  if (t.includes("video") || t.includes("vidéo")) return Video;
  if (t.includes("image") || t.includes("visuel")) return ImageIcon;
  return FileText;
}

function badgeVariantForStatus(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const s = safeString(status).toLowerCase();
  if (s.includes("pub")) return "default";
  if (s.includes("plan")) return "secondary";
  if (s.includes("brou") || s.includes("draft")) return "outline";
  if (s.includes("err") || s.includes("fail")) return "destructive";
  return "outline";
}

function statusLabel(status: string | null): string {
  const s = safeString(status).trim();
  if (!s) return "—";
  const low = s.toLowerCase();
  if (low === "published") return "Publié";
  if (low === "scheduled") return "Planifié";
  if (low === "draft") return "Brouillon";
  return s;
}

export default async function MyContentPage({ searchParams }: Props) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/auth/login");

  const userEmail = session.user.email ?? "Utilisateur";

  const view = (searchParams?.view ?? "list").toLowerCase();
  const initialTab = view === "calendar" ? "calendar" : "list";

  const { data: items, error } = await supabase
    .from("content_item")
    .select("id, type, title, status, scheduled_date, channel, tags, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[contents] list error", error);
  }

  const safeItems: ContentItem[] = Array.isArray(items) ? (items as ContentItem[]) : [];

  // group by scheduled_date for calendar view
  const itemsByDate: Record<string, ContentItem[]> = {};
  for (const it of safeItems) {
    if (!it.scheduled_date) continue;
    if (!itemsByDate[it.scheduled_date]) itemsByDate[it.scheduled_date] = [];
    itemsByDate[it.scheduled_date].push(it);
  }

  const scheduledDates = Object.keys(itemsByDate).sort();

  return (
    <AppShell userEmail={userEmail}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
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
                <Link href="/contents?view=list" className="gap-2">
                  <ListIcon className="w-4 h-4" />
                  Liste
                </Link>
              </TabsTrigger>
              <TabsTrigger asChild value="calendar">
                <Link href="/contents?view=calendar" className="gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Calendrier
                </Link>
              </TabsTrigger>
            </TabsList>

            <Button variant="outline" className="gap-2" disabled>
              <Filter className="w-4 h-4" />
              Filtres (bientôt)
            </Button>
          </div>

          <TabsContent value="list" className="space-y-4">
            {safeItems.length === 0 ? (
              <Card className="p-10 text-center">
                <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="font-semibold">Aucun contenu pour l’instant</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Lance une génération (Réseaux sociaux, emails, blog, scripts…) et on les retrouvera ici.
                </p>
                <div className="mt-6">
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
                                <Badge variant={badgeVariantForStatus(it.status)}>{statusLabel(it.status)}</Badge>
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

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Actions">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/contents/${it.id}`}>Voir / éditer</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled>Dupliquer (bientôt)</DropdownMenuItem>
                              <DropdownMenuItem disabled>Supprimer (bientôt)</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

function formatDateLabel(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long" }).format(d);
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
