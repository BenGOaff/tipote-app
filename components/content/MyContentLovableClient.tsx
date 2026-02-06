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
  CheckCircle2,
  Calendar,
  CalendarX,
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

function toYmdOrEmpty(v: string | null | undefined) {
  const s = safeString(v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = s.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return "";
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
  if (s === "schedule") return "scheduled";
  if (!s) return "draft";
  return s;
}

function formatDate(dateString: string | null) {
  if (!dateString) return "";
  try {
    return format(new Date(dateString), "dd MMMM yyyy", { locale: fr });
  } catch {
    return dateString;
  }
}

export default function MyContentLovableClient({
  userEmail,
  initialView,
  items: initialItems,
  error,
}: Props) {
  const router = useRouter();

  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState("");

  const [editingContent, setEditingContent] = useState<ContentListItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ContentListItem | null>(null);

  const [busy, setBusy] = useState<"edit" | "delete" | "plan" | "unplan" | "publish" | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const [planningContent, setPlanningContent] = useState<ContentListItem | null>(null);
  const [planDate, setPlanDate] = useState<string>("");

  const openPlan = (content: ContentListItem) => {
    setPlanningContent(content);
    setPlanDate(toYmdOrEmpty(content.scheduled_date));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialItems;

    return initialItems.filter((c) => {
      const t = safeString(c.title).toLowerCase();
      const body = safeString(c.content).toLowerCase();
      const type = safeString(c.type).toLowerCase();
      const channel = safeString(c.channel).toLowerCase();
      return t.includes(q) || body.includes(q) || type.includes(q) || channel.includes(q);
    });
  }, [initialItems, search]);

  const stats = useMemo(() => {
    const total = initialItems.length;
    const published = initialItems.filter((c) => normalizeKeyStatus(c.status) === "published").length;
    const draft = initialItems.filter((c) => normalizeKeyStatus(c.status) === "draft").length;
    const scheduled = initialItems.filter((c) => normalizeKeyStatus(c.status) === "scheduled").length;
    return { total, published, draft, scheduled };
  }, [initialItems]);

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

  const handleSavePlan = async () => {
    if (!planningContent) return;
    if (!planDate) {
      toast({
        title: "Date manquante",
        description: "Choisis une date de planification.",
        variant: "destructive",
      });
      return;
    }
    setBusy("plan");
    try {
      const res = await fetch(`/api/content/${planningContent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduledDate: planDate,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        toast({
          title: "Erreur",
          description: json?.error ?? "Impossible de planifier le contenu",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Planifié ✅", description: "La date de publication a été enregistrée." });
      setPlanningContent(null);
      router.refresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de planifier le contenu",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleUnplan = async (item: ContentListItem) => {
    setBusy("unplan");
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "draft",
          scheduledDate: null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        toast({
          title: "Erreur",
          description: json?.error ?? "Impossible de déplanifier le contenu",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Déplanifié ✅", description: "Le contenu repasse en brouillon." });
      router.refresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de déplanifier le contenu",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleMarkPublished = async (item: ContentListItem) => {
    setBusy("publish");
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "published",
          scheduledDate: null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        toast({
          title: "Erreur",
          description: json?.error ?? "Impossible de marquer le contenu comme publié",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Publié ✅", description: "Le statut a été mis à jour." });
      router.refresh();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de marquer le contenu comme publié",
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
      const res = await fetch(`/api/content/${deleteConfirm.id}`, {
        method: "DELETE",
      });

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

  if (error) {
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

              <Button asChild>
                <Link href="/create">
                  <Plus className="w-4 h-4 mr-2" />
                  Créer
                </Link>
              </Button>
            </header>

            <div className="p-6 max-w-6xl mx-auto space-y-6">
              <Card className="p-6">
                <p className="text-sm text-muted-foreground">Impossible de charger tes contenus pour le moment.</p>
                <p className="mt-2 text-sm text-rose-600">{error}</p>
              </Card>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          {/* ✅ Header EXACT Lovable */}
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Mes Contenus</h1>
            </div>

            <Button asChild>
              <Link href="/create">
                <Plus className="w-4 h-4 mr-2" />
                Créer
              </Link>
            </Button>
          </header>

          {/* ✅ Container EXACT Lovable */}
          <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Filters & Toggle (structure Lovable) */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-md w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={view === "list" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setView("list")}
                >
                  <List className="w-4 h-4" />
                  Liste
                </Button>

                <Button
                  variant={view === "calendar" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setView("calendar")}
                >
                  <CalendarDays className="w-4 h-4" />
                  Calendrier
                </Button>
              </div>
            </div>

            {/* Stats (on garde les mêmes cartes mais dans le bon container) */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Total</div>
                <div className="mt-2 text-3xl font-semibold">{stats.total}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Brouillons</div>
                <div className="mt-2 text-3xl font-semibold">{stats.draft}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Planifiés</div>
                <div className="mt-2 text-3xl font-semibold">{stats.scheduled}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Publiés</div>
                <div className="mt-2 text-3xl font-semibold">{stats.published}</div>
              </Card>
            </div>

            {/* Content */}
            <div className="space-y-6">
              {view === "calendar" ? (
                <ContentCalendarView contents={filtered} />
              ) : (
                <div className="space-y-6">
                  {filtered.length === 0 ? (
                    <Card className="p-6">
                      <p className="text-sm text-muted-foreground">Aucun contenu trouvé.</p>
                    </Card>
                  ) : (
                    <div className="space-y-8">
                      {Object.entries(
                        filtered.reduce<Record<string, ContentListItem[]>>((acc, item) => {
                          const key = item.created_at ? formatDate(item.created_at) : "—";
                          acc[key] = acc[key] || [];
                          acc[key].push(item);
                          return acc;
                        }, {})
                      )
                        .sort((a, b) => {
                          const da = a[0] === "—" ? 0 : new Date(a[0]).getTime();
                          const db = b[0] === "—" ? 0 : new Date(b[0]).getTime();
                          return db - da;
                        })
                        .map(([day, dayItems]) => (
                          <div key={day} className="space-y-3">
                            <div className="text-sm text-muted-foreground">{day}</div>

                            <div className="space-y-3">
                              {dayItems.map((item) => {
                                const typeKey = normalizeKeyType(item.type);
                                const statusKey = normalizeKeyStatus(item.status);
                                const Icon = typeIcons[typeKey] ?? FileText;

                                const badgeClasses =
                                  statusColors[statusKey] ?? "bg-muted text-muted-foreground";
                                const badgeLabel = statusLabels[statusKey] ?? "—";

                                return (
                                  <Card key={item.id} className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex items-start gap-3">
                                        <div className="mt-0.5 rounded-md bg-muted p-2">
                                          <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>

                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-medium truncate">
                                              {safeString(item.title) || "Sans titre"}
                                            </div>
                                            <Badge className={badgeClasses}>{badgeLabel}</Badge>
                                          </div>

                                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {safeString(item.channel) ? (
                                              <span className="capitalize">{safeString(item.channel)}</span>
                                            ) : null}

                                            {statusKey === "scheduled" && item.scheduled_date ? (
                                              <span className="inline-flex items-center gap-1">
                                                <Clock className="h-3.5 w-3.5" />
                                                {formatDate(item.scheduled_date)}
                                              </span>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" asChild>
                                          <Link href={`/contents/${item.id}`}>Voir</Link>
                                        </Button>

                                        <DropdownMenu>
                                          <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                              <MoreVertical className="w-4 h-4" />
                                            </Button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEdit(item)} disabled={busy !== null}>
                                              <Edit className="w-4 h-4 mr-2" />
                                              Modifier
                                            </DropdownMenuItem>

                                            {normalizeKeyStatus(item.status) !== "published" ? (
                                              <DropdownMenuItem
                                                onClick={() => handleMarkPublished(item)}
                                                disabled={busy !== null}
                                              >
                                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                                Marquer comme publié
                                              </DropdownMenuItem>
                                            ) : null}

                                            <DropdownMenuItem onClick={() => openPlan(item)} disabled={busy !== null}>
                                              <Calendar className="w-4 h-4 mr-2" />
                                              {normalizeKeyStatus(item.status) === "scheduled"
                                                ? "Modifier date"
                                                : "Planifier"}
                                            </DropdownMenuItem>

                                            {normalizeKeyStatus(item.status) === "scheduled" ? (
                                              <DropdownMenuItem
                                                onClick={() => handleUnplan(item)}
                                                disabled={busy !== null}
                                              >
                                                <CalendarX className="w-4 h-4 mr-2" />
                                                Déplanifier
                                              </DropdownMenuItem>
                                            ) : null}

                                            <DropdownMenuItem
                                              className="text-rose-600 focus:text-rose-600"
                                              onClick={() => setDeleteConfirm(item)}
                                              disabled={busy !== null}
                                            >
                                              <Trash2 className="w-4 h-4 mr-2" />
                                              Supprimer
                                            </DropdownMenuItem>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </div>
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
              )}
            </div>

            {/* Edit Dialog (Lovable 1:1) */}
            <Dialog open={!!editingContent} onOpenChange={(open) => (!open ? setEditingContent(null) : null)}>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Modifier le contenu</DialogTitle>
                  <DialogDescription>Modifiez le titre et le contenu ci-dessous.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">Titre</Label>
                    <Input
                      id="edit-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titre..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-body">Contenu</Label>
                    <Textarea
                      id="edit-body"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={12}
                      placeholder="Contenu..."
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

            {/* Plan Dialog (Lovable-style) */}
            <Dialog open={!!planningContent} onOpenChange={(open) => (!open ? setPlanningContent(null) : null)}>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Planifier le contenu</DialogTitle>
                  <DialogDescription>
                    Choisis une date de publication. Le statut passera sur “Planifié”.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                  <Label htmlFor="plan-date">Date</Label>
                  <Input
                    id="plan-date"
                    type="date"
                    value={planDate}
                    onChange={(e) => setPlanDate(e.target.value)}
                  />
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setPlanningContent(null)} disabled={busy === "plan"}>
                    Annuler
                  </Button>
                  <Button onClick={handleSavePlan} disabled={busy === "plan"}>
                    {busy === "plan" ? "Enregistrement..." : "Enregistrer"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog (Lovable 1:1) */}
            <Dialog open={!!deleteConfirm} onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>Supprimer le contenu</DialogTitle>
                  <DialogDescription>
                    Cette action est irréversible. Le contenu sera supprimé définitivement.
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

            {/* Footer info (email) */}
            <div className="text-xs text-muted-foreground">
              Connecté en tant que <span className="font-medium">{userEmail}</span>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
