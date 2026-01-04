"use client";

// COPIE 1:1 Lovable : tipote-front-genie-main/src/pages/MyContent.tsx
// Adaptations minimales Tipote :
// - Router: react-router-dom -> next/link + useRouter
// - Data: Lovable useContents() -> props `items` (server fetched)
// - Dates: Lovable scheduled_at (datetime) -> Tipote scheduled_date (date) ; heure fallback = created_at

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ContentCalendarView } from "@/components/content/ContentCalendarView";

import {
  Search,
  Plus,
  List,
  CalendarDays,
  FileText,
  Mail,
  Video,
  MessageSquare,
  Clock,
  MoreVertical,
  Edit,
  Trash2,
} from "lucide-react";

import type { ContentListItem } from "@/app/contents/page";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Props = {
  userEmail: string;
  initialView: "list" | "calendar";
  initialSearch: string;
  items: ContentListItem[];
  error?: string;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeTypeKey(type: string | null): string {
  const t = safeString(type).toLowerCase().trim();
  if (!t) return "article";
  if (t.includes("email")) return "email";
  if (t.includes("video") || t.includes("vidéo")) return "video";
  if (t.includes("post") || t.includes("social") || t.includes("réseau") || t.includes("reseau")) return "post";
  if (t.includes("article") || t.includes("blog")) return "article";
  return t;
}

const typeIcons: Record<string, any> = {
  post: MessageSquare,
  email: Mail,
  article: FileText,
  video: Video,
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifié",
  published: "Publié",
};

function normalizeStatusKey(status: string | null): "draft" | "scheduled" | "published" {
  const s = safeString(status).toLowerCase().trim();
  if (s === "published") return "published";
  if (s === "scheduled" || s === "planned") return "scheduled";
  return "draft";
}

function buildQueryString(next: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(next).forEach(([k, v]) => {
    if (v && v.trim()) sp.set(k, v);
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export default function MyContentLovableClient({ initialView, initialSearch, items, error }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState(initialSearch);

  const [deleteConfirm, setDeleteConfirm] = useState<ContentListItem | null>(null);
  const [localItems, setLocalItems] = useState<ContentListItem[]>(items);

  // Keep localItems in sync when server props change (filters/query params)
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // Keep view/search synced with URL when navigating back/forward
  useEffect(() => {
    const urlView = (searchParams?.get("view") || "").toLowerCase() === "calendar" ? "calendar" : "list";
    setView(urlView);

    const urlQ = searchParams?.get("q") ?? "";
    setSearch(urlQ);
  }, [searchParams]);

  const filteredContents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return localItems;

    return localItems.filter((c) => {
      const title = safeString(c.title).toLowerCase();
      const type = safeString(c.type).toLowerCase();
      const platform = safeString(c.channel).toLowerCase();
      return title.includes(q) || type.includes(q) || platform.includes(q);
    });
  }, [localItems, search]);

  const stats = useMemo(() => {
    const total = filteredContents.length;
    const drafts = filteredContents.filter((c) => normalizeStatusKey(c.status) === "draft").length;
    const scheduled = filteredContents.filter((c) => normalizeStatusKey(c.status) === "scheduled").length;
    const published = filteredContents.filter((c) => normalizeStatusKey(c.status) === "published").length;
    return { total, drafts, scheduled, published };
  }, [filteredContents]);

  const syncUrl = (next: { view?: "list" | "calendar"; q?: string }) => {
    const current = {
      q: searchParams?.get("q") ?? "",
      view: (searchParams?.get("view") || "").toLowerCase() === "calendar" ? "calendar" : "list",
      status: searchParams?.get("status") ?? "",
      type: searchParams?.get("type") ?? "",
      channel: searchParams?.get("channel") ?? "",
    };

    const merged = {
      ...current,
      q: typeof next.q === "string" ? next.q : current.q,
      view: next.view ?? (current.view as "list" | "calendar"),
    };

    router.replace(`/contents${buildQueryString(merged)}`);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    const id = deleteConfirm.id;
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (!res.ok) {
        // On garde le comportement silencieux type Lovable
        // (les toasts existants Tipote restent ailleurs)
      } else {
        setLocalItems((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setDeleteConfirm(null);
      router.refresh();
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Mes Contenus</h1>
            </div>

            <Link href="/create">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Créer
              </Button>
            </Link>
          </header>

          <div className="p-6 space-y-6">
            {/* Search and View Toggle */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearch(v);
                    syncUrl({ q: v });
                  }}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={view === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setView("list");
                    syncUrl({ view: "list" });
                  }}
                >
                  <List className="w-4 h-4 mr-2" />
                  Liste
                </Button>
                <Button
                  variant={view === "calendar" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setView("calendar");
                    syncUrl({ view: "calendar" });
                  }}
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Calendrier
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Brouillons</p>
                <p className="text-2xl font-bold">{stats.drafts}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Planifiés</p>
                <p className="text-2xl font-bold">{stats.scheduled}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Publiés</p>
                <p className="text-2xl font-bold">{stats.published}</p>
              </Card>
            </div>

            {/* Content View */}
            {error ? (
              <Card className="p-6">
                <p className="text-sm text-destructive">Erreur : {error}</p>
              </Card>
            ) : view === "list" ? (
              <div className="space-y-4">
                {filteredContents.map((item) => {
                  const typeKey = normalizeTypeKey(item.type);
                  const statusKey = normalizeStatusKey(item.status);
                  const Icon = typeIcons[typeKey] || FileText;

                  const platform = safeString(item.channel);
                  const hasTime = Boolean(item.scheduled_date);
                  const timeLabel = (() => {
                    if (!hasTime) return "";
                    const created = safeString(item.created_at);
                    const dt = created ? new Date(created) : null;
                    if (!dt || Number.isNaN(dt.getTime())) return "";
                    return format(dt, "HH:mm", { locale: fr });
                  })();

                  return (
                    <Card key={item.id} className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-muted-foreground" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{safeString(item.title) || "Sans titre"}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {platform ? <span className="capitalize">{platform}</span> : null}
                            {hasTime && timeLabel ? (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {timeLabel}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <Badge className={statusColors[statusKey]}>{statusLabels[statusKey]}</Badge>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/contents/${item.id}`} className="flex items-center">
                                <Edit className="w-4 h-4 mr-2" />
                                Modifier
                              </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => setDeleteConfirm(item)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  );
                })}

                {filteredContents.length === 0 ? (
                  <Card className="p-6">
                    <p className="text-sm text-muted-foreground">Aucun contenu.</p>
                  </Card>
                ) : null}
              </div>
            ) : (
              <ContentCalendarView contents={filteredContents} />
            )}
          </div>
        </main>
      </div>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le contenu</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer &quot;{safeString(deleteConfirm?.title) || "Sans titre"}&quot; ? Cette
              action est irréversible.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
