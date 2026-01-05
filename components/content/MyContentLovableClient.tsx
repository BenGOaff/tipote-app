// components/content/MyContentLovableClient.tsx
"use client";

// UI 1:1 Lovable (MyContent) + data Tipote
// - SidebarProvider + AppSidebar + header sticky
// - List / Calendar toggle
// - Search
// - Stats cards
// - Edit Dialog + Delete Dialog (branchés sur /api/content/:id)

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Plus,
  Search,
  List,
  CalendarDays,
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  Mail,
  Video,
  MessageSquare,
  Clock,
} from "lucide-react";

import { format } from "date-fns";
import { fr } from "date-fns/locale";

import type { ContentListItem } from "@/lib/types/content";
import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { toast } from "@/components/ui/use-toast";

type Props = {
  userEmail: string;
  initialView: "list" | "calendar";
  items: ContentListItem[];
  error?: string;
};

const typeIcons: Record<string, any> = {
  post: MessageSquare,
  email: Mail,
  article: FileText,
  video: Video,
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  planned: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifié",
  planned: "Planifié",
  published: "Publié",
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeKeyType(type: string | null) {
  const t = safeString(type).toLowerCase();
  if (t.includes("email")) return "email";
  if (t.includes("video") || t.includes("vidéo")) return "video";
  if (t.includes("article") || t.includes("blog")) return "article";
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return "post";
  return "post";
}

function normalizeKeyStatus(status: string | null) {
  const s = safeString(status).toLowerCase();
  if (s === "planned") return "scheduled";
  return s;
}

function toDateSafe(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export default function MyContentLovableClient({ initialView, items, error }: Props) {
  const router = useRouter();

  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState("");

  // dialogs
  const [editingContent, setEditingContent] = useState<ContentListItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ContentListItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState<"edit" | "delete" | null>(null);

  const filteredContents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((c) => {
      const title = safeString(c.title).toLowerCase();
      const body = safeString(c.content).toLowerCase();
      return title.includes(q) || body.includes(q);
    });
  }, [items, search]);

  const stats = useMemo(() => {
    const total = items.length;
    const published = items.filter((c) => normalizeKeyStatus(c.status) === "published").length;
    const draft = items.filter((c) => normalizeKeyStatus(c.status) === "draft").length;
    const scheduled = items.filter((c) => normalizeKeyStatus(c.status) === "scheduled").length;
    return { total, published, draft, scheduled };
  }, [items]);

  const openEdit = (content: ContentListItem) => {
    setEditingContent(content);
    setEditTitle(safeString(content.title));
    setEditBody(safeString(content.content));
  };

  const handleSaveEdit = async () => {
    if (!editingContent) return;
    setBusy("edit");
    try {
      const res = await fetch(`/api/content/${editingContent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          content: editBody,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        toast({
          title: "Erreur",
          description: json?.error ?? "Impossible de mettre à jour le contenu",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Enregistré ✅", description: "Le contenu a été mis à jour." });
      setEditingContent(null);
      router.refresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de mettre à jour le contenu",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/content/${deleteConfirm.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        toast({
          title: "Erreur",
          description: json?.error ?? "Impossible de supprimer le contenu",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Supprimé ✅", description: "Le contenu a été supprimé." });
      setDeleteConfirm(null);
      router.refresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de supprimer le contenu",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const groupByDate = (list: ContentListItem[]) => {
    const groups: Record<string, ContentListItem[]> = {};
    list.forEach((item) => {
      const base = toDateSafe(item.created_at) ?? new Date();
      const date = format(base, "yyyy-MM-dd");
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return groups;
  };

  const grouped = useMemo(() => groupByDate(filteredContents), [filteredContents]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          {/* Header Lovable 1:1 */}
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

          <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Filters & Toggle (Lovable 1:1) */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={view === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView("list")}
                >
                  <List className="w-4 h-4 mr-2" />
                  Liste
                </Button>
                <Button
                  variant={view === "calendar" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setView("calendar")}
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Calendrier
                </Button>
              </div>
            </div>

            {/* Stats (Lovable 1:1) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-muted-foreground">Brouillons</p>
                <p className="text-2xl font-bold">{stats.draft}</p>
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

            {/* Content Display (Lovable behavior) */}
            {error ? (
              <Card className="p-8">
                <p className="text-muted-foreground">Erreur : {error}</p>
              </Card>
            ) : filteredContents.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-bold mb-2">Aucun contenu</h3>
                <p className="text-muted-foreground mb-4">Commencez par créer votre premier contenu</p>
                <Link href="/create">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Créer du contenu
                  </Button>
                </Link>
              </Card>
            ) : view === "calendar" ? (
              <ContentCalendarView contents={filteredContents as any} onSelectContent={(c) => openEdit(c as any)} />
            ) : (
              <div className="space-y-6">
                {Object.entries(grouped)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, dayItems]) => (
                    <div key={date}>
                      <p className="text-sm font-medium text-muted-foreground mb-3 capitalize">
                        {format(new Date(date), "EEEE d MMMM yyyy", { locale: fr })}
                      </p>

                      <div className="space-y-2">
                        {dayItems.map((item) => {
                          const Icon = typeIcons[normalizeKeyType(item.type)] || FileText;

                          const statusKey = normalizeKeyStatus(item.status);
                          const badgeClass = statusColors[statusKey] ?? statusColors.draft;
                          const badgeLabel = statusLabels[statusKey] ?? safeString(item.status) ?? "—";

                          const scheduled = toDateSafe(item.scheduled_date);
                          const scheduledTime =
                            scheduled && item.scheduled_date?.includes("T")
                              ? format(scheduled, "HH:mm")
                              : "";

                          return (
                            <Card key={item.id} className="p-4 hover:shadow-md transition-shadow">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                  <Icon className="w-5 h-5 text-muted-foreground" />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{safeString(item.title) || "Sans titre"}</p>
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    {safeString(item.channel) ? (
                                      <span className="capitalize">{safeString(item.channel)}</span>
                                    ) : null}
                                    {scheduledTime ? (
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {scheduledTime}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                <Badge className={badgeClass}>{badgeLabel}</Badge>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openEdit(item)}>
                                      <Edit className="w-4 h-4 mr-2" />
                                      Modifier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => setDeleteConfirm(item)}
                                      className="text-destructive"
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
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Edit Dialog (Lovable 1:1) */}
      <Dialog open={!!editingContent} onOpenChange={() => setEditingContent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier le contenu</DialogTitle>
            <DialogDescription>Modifiez les informations de votre contenu</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Titre</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-content">Contenu</Label>
              <Textarea
                id="edit-content"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={8}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContent(null)} disabled={busy === "edit"}>
              Annuler
            </Button>
            <Button onClick={handleSaveEdit} disabled={busy === "edit"}>
              {busy === "edit" ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation (Lovable 1:1) */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce contenu ?</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Le contenu sera définitivement supprimé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={busy === "delete"}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy === "delete"}>
              {busy === "delete" ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
