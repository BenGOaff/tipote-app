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
import { useTranslations } from "next-intl";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
// Design-system primitives (Phase 2 pilot). Replaces the bulky gradient
// PageBanner + hand-rolled paddings with a cohesive heading + container +
// card grammar shared across pages.
import { PageContainer, PageHeading, SectionCard } from "@/components/ui/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TopPerformerBadge, TrendingBadge } from "@/components/ui/highlight-badge";
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
  ClipboardList,
  Eye,
  Users,
  Share2,
  ChevronLeft,
  Package,
  Route,
  Globe,
  ExternalLink,
  Download,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import { format } from "date-fns";
import { fr } from "date-fns/locale";

import type { ContentListItem } from "@/lib/types/content";
import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { toast } from "@/components/ui/use-toast";

type QuizListItem = {
  id: string;
  title: string;
  status: string;
  // mode='survey' rows still live in the same `quizzes` table — we just
  // render a different badge + lighter metric set (surveys have no virality
  // counter so the share count is irrelevant for them).
  mode?: "quiz" | "survey" | null;
  views_count: number;
  shares_count: number;
  leads_count: number;
  created_at: string;
};

type FunnelListItem = {
  id: string;
  title: string;
  slug: string;
  page_type: string;
  status: string;
  template_id: string;
  views_count: number;
  leads_count: number;
  payment_url: string;
  created_at: string;
  updated_at: string;
};

type Props = {
  userEmail: string;
  initialView: "list" | "calendar";
  items: ContentListItem[];
  quizzes?: QuizListItem[];
  funnels?: FunnelListItem[];
  error?: string;
};

type ContentFolder = {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  matchType: (type: string | null) => boolean;
};

// Colors and icons 1:1 with Créer page (CreateLovableClient contentTypes)
const CONTENT_FOLDERS: ContentFolder[] = [
  {
    id: "posts",
    label: "Mes Posts",
    icon: MessageSquare,
    color: "text-white",
    bgColor: "bg-blue-500",
    matchType: (t) => {
      const s = safeString(t).toLowerCase();
      return s.includes("post") || s.includes("réseau") || s.includes("reseau") || s.includes("social");
    },
  },
  {
    id: "emails",
    label: "Mes Emails",
    icon: Mail,
    color: "text-white",
    bgColor: "bg-green-500",
    matchType: (t) => safeString(t).toLowerCase().includes("email"),
  },
  {
    id: "articles",
    label: "Mes Articles",
    icon: FileText,
    color: "text-white",
    bgColor: "bg-purple-500",
    matchType: (t) => {
      const s = safeString(t).toLowerCase();
      return s.includes("article") || s.includes("blog");
    },
  },
  {
    id: "scripts",
    label: "Mes Scripts",
    icon: Video,
    color: "text-white",
    bgColor: "bg-red-500",
    matchType: (t) => {
      const s = safeString(t).toLowerCase();
      return s.includes("video") || s.includes("vidéo") || s.includes("script");
    },
  },
  {
    id: "offres",
    label: "Mes Offres",
    icon: Package,
    color: "text-white",
    bgColor: "bg-orange-500",
    matchType: (t) => {
      const s = safeString(t).toLowerCase();
      return s.includes("offer") || s.includes("offre");
    },
  },
  {
    id: "funnels",
    label: "Mes Pages",
    icon: Route,
    color: "text-white",
    bgColor: "bg-indigo-500",
    matchType: (t) => safeString(t).toLowerCase().includes("funnel"),
  },
  {
    id: "strategies",
    label: "Mes Stratégies",
    icon: CalendarDays,
    color: "text-white",
    bgColor: "bg-amber-500",
    matchType: (t) => safeString(t).toLowerCase().includes("strategy") || safeString(t).toLowerCase().includes("stratégie"),
  },
  {
    id: "quiz",
    label: "Mes Quiz",
    icon: ClipboardList,
    color: "text-white",
    bgColor: "bg-teal-500",
    matchType: () => false, // Quiz uses separate data source
  },
];

function countItemsForFolder(folder: ContentFolder, items: ContentListItem[], quizzes: QuizListItem[], funnels: FunnelListItem[]): number {
  if (folder.id === "quiz") return quizzes.length;
  if (folder.id === "funnels") return funnels.length;
  return items.filter((it) => folder.matchType(it.type)).length;
}

const typeIcons: Record<string, any> = {
  post: MessageSquare,
  email: Mail,
  article: FileText,
  video: Video,
  quiz: ClipboardList,
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  planned: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifié",
  planned: "Planifié",
  published: "Publié",
  failed: "Erreur",
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
  quizzes = [],
  funnels: initialFunnels = [],
  error,
}: Props) {
  const router = useRouter();
  const t = useTranslations("myContent");
  const tc = useTranslations("common");

  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  const [editingContent, setEditingContent] = useState<ContentListItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ContentListItem | null>(null);

  const [busy, setBusy] = useState<"edit" | "delete" | "plan" | "unplan" | "publish" | null>(null);

  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const [planningContent, setPlanningContent] = useState<ContentListItem | null>(null);
  const [planDate, setPlanDate] = useState<string>("");
  const [planTime, setPlanTime] = useState<string>("09:00");

  // Funnel state
  const [funnels, setFunnels] = useState<FunnelListItem[]>(initialFunnels);
  const [deleteFunnelConfirm, setDeleteFunnelConfirm] = useState<FunnelListItem | null>(null);
  const [funnelLeads, setFunnelLeads] = useState<{ pageId: string; leads: any[] } | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);

  const openPlan = (content: ContentListItem) => {
    setPlanningContent(content);
    setPlanDate(toYmdOrEmpty(content.scheduled_date));
    // Pré-remplir l'heure depuis meta.scheduled_time si disponible
    const metaTime = (content.meta as any)?.scheduled_time;
    setPlanTime(typeof metaTime === "string" && metaTime.trim() ? metaTime : "09:00");
  };

  // Top-performer (highest leads count) and recently-trending quiz IDs.
  // Used to show contextual badges on a single row each — never on more
  // than one or they stop meaning anything.
  const topQuizId = useMemo(() => {
    let best: { id: string; leads: number } | null = null;
    for (const qz of quizzes) {
      if ((qz.leads_count ?? 0) < 3) continue; // sample threshold
      if (!best || (qz.leads_count ?? 0) > best.leads) best = { id: qz.id, leads: qz.leads_count ?? 0 };
    }
    return best?.id ?? null;
  }, [quizzes]);

  const trendingQuizIds = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return new Set(
      quizzes
        .filter(
          (qz) =>
            (qz.leads_count ?? 0) >= 3 &&
            new Date(qz.created_at).getTime() > sevenDaysAgo,
        )
        .map((qz) => qz.id),
    );
  }, [quizzes]);

  const filtered = useMemo(() => {
    let result = initialItems;

    // Filter by active folder
    if (activeFolder && activeFolder !== "quiz") {
      const folder = CONTENT_FOLDERS.find((f) => f.id === activeFolder);
      if (folder) {
        result = result.filter((c) => folder.matchType(c.type));
      }
    }

    // Filter by search
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((c) => {
        const t = safeString(c.title).toLowerCase();
        const body = safeString(c.content).toLowerCase();
        const type = safeString(c.type).toLowerCase();
        const channel = safeString(c.channel).toLowerCase();
        return t.includes(q) || body.includes(q) || type.includes(q) || channel.includes(q);
      });
    }

    return result;
  }, [initialItems, search, activeFolder]);

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
          title: t("toast.error"),
          description: json?.error ?? t("toast.cannotUpdate"),
          variant: "destructive",
        });
        return;
      }

      toast({ title: t("toast.saved"), description: t("toast.savedDesc") });
      setEditingContent(null);
      router.refresh();
    } catch (e) {
      toast({
        title: t("toast.error"),
        description: e instanceof Error ? e.message : t("toast.cannotUpdate"),
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
        title: t("toast.missingDate"),
        description: t("toast.missingDateDesc"),
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
          meta: planTime ? { scheduled_time: planTime } : undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        toast({
          title: t("toast.error"),
          description: json?.error ?? t("toast.cannotSchedule"),
          variant: "destructive",
        });
        return;
      }

      const isReschedule = normalizeKeyStatus(planningContent.status) === "scheduled";
      toast({
        title: isReschedule ? t("toast.rescheduled") : t("toast.scheduled"),
        description: isReschedule
          ? t("toast.rescheduledDesc", { date: planDate, time: planTime || "09:00" })
          : t("toast.scheduledDesc"),
      });
      setPlanningContent(null);
      router.refresh();
    } catch (e) {
      toast({
        title: t("toast.error"),
        description: e instanceof Error ? e.message : t("toast.cannotSchedule"),
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
          title: t("toast.error"),
          description: json?.error ?? t("toast.cannotUnschedule"),
          variant: "destructive",
        });
        return;
      }

      toast({ title: t("toast.unscheduled"), description: t("toast.unscheduledDesc") });
      router.refresh();
    } catch (e) {
      toast({
        title: t("toast.error"),
        description: e instanceof Error ? e.message : t("toast.cannotUnschedule"),
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
          title: t("toast.error"),
          description: json?.error ?? t("toast.cannotPublish"),
          variant: "destructive",
        });
        return;
      }

      toast({ title: t("toast.published"), description: t("toast.publishedDesc") });
      router.refresh();
    } catch (e) {
      toast({
        title: t("toast.error"),
        description: e instanceof Error ? e.message : t("toast.cannotPublish"),
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
          title: t("toast.error"),
          description: json?.error ?? t("toast.cannotDelete"),
          variant: "destructive",
        });
        return;
      }

      toast({ title: t("toast.deleted"), description: t("toast.deletedDesc") });
      setDeleteConfirm(null);
      router.refresh();
    } catch (e) {
      toast({
        title: t("toast.error"),
        description: e instanceof Error ? e.message : t("toast.cannotDelete"),
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

          <main className="flex-1 overflow-auto bg-background flex flex-col">
            <PageHeader
              left={<h1 className="text-lg font-display font-bold truncate">Mes Contenus</h1>}
            />

            <div className="flex-1 p-4 sm:p-5 lg:p-6">
              <div className="max-w-[1200px] mx-auto w-full space-y-5">
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Impossible de charger tes contenus pour le moment.</p>
                  <p className="mt-2 text-sm text-rose-600">{error}</p>
                </Card>
              </div>
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

        <main className="flex-1 overflow-auto bg-background flex flex-col">
          <PageHeader
            left={<h1 className="text-lg font-display font-bold truncate">Mes Contenus</h1>}
          />

          {/* Phase-2 design-system pilot: clean heading replaces the heavy
              gradient PageBanner; PageContainer enforces consistent padding
              + max-width + section gap; SectionCard houses the filter strip
              so the visual rhythm matches the rest of the (refreshed) app. */}
          <PageContainer>
            <PageHeading
              title="Mes contenus"
              subtitle={t("ui.subtitle")}
              actions={
                <Button asChild className="rounded-full">
                  <Link href="/create">
                    <Plus className="w-4 h-4 mr-1.5" />
                    Créer
                  </Link>
                </Button>
              }
            />

            {/* Filters & Toggle — wrapped in a SectionCard so the search bar
                + view toggle sit on the same elevated surface as the lists
                below, instead of floating directly on the page bg. */}
            <SectionCard padding="sm" className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("ui.search")}
                  className="pl-9 border-transparent bg-surface-muted focus-visible:bg-card"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-1.5 bg-surface-muted rounded-full p-0.5 w-fit">
                <button
                  onClick={() => setView("list")}
                  className={`gap-1.5 inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    view === "list" ? "bg-card shadow-soft text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  Liste
                </button>
                <button
                  onClick={() => setView("calendar")}
                  className={`gap-1.5 inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    view === "calendar" ? "bg-card shadow-soft text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Calendrier
                </button>
              </div>
            </SectionCard>

            {/* Content */}
            <div className="space-y-6">
              {view === "calendar" ? (
                <ContentCalendarView
                  contents={filtered}
                  onSelectContent={(content) => {
                    const ct = normalizeKeyType(content.type);
                    // For posts (draft or scheduled): open in full editor
                    if (ct === "post") {
                      router.push(`/create?edit=${content.id}`);
                    } else {
                      router.push(`/contents/${content.id}`);
                    }
                  }}
                />
              ) : activeFolder === null ? (
                /* ===== Folder Grid View ===== */
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {CONTENT_FOLDERS.map((folder) => {
                      const count = countItemsForFolder(folder, initialItems, quizzes, funnels);
                      const FIcon = folder.icon;
                      return (
                        <button
                          key={folder.id}
                          onClick={() => setActiveFolder(folder.id)}
                          className="group text-left"
                        >
                          <Card className="p-5 transition-all hover:shadow-md hover:border-primary/30 cursor-pointer h-full">
                            <div className={`w-11 h-11 rounded-xl ${folder.bgColor} flex items-center justify-center mb-3`}>
                              <FIcon className={`w-5 h-5 ${folder.color}`} />
                            </div>
                            <div className="font-semibold text-sm group-hover:text-primary transition-colors">
                              {t(`folders.${folder.id}` as any)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {count} {count <= 1 ? t("ui.elementOne") : t("ui.elementMany")}
                            </div>
                          </Card>
                        </button>
                      );
                    })}
                  </div>

                  {/* Recent content preview below folders */}
                  {initialItems.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Derniers contenus
                      </h3>
                      <div className="space-y-3">
                        {initialItems.slice(0, 5).map((item) => {
                          const typeKey = normalizeKeyType(item.type);
                          const statusKey = normalizeKeyStatus(item.status);
                          const Icon = typeIcons[typeKey] ?? FileText;
                          const badgeClasses = statusColors[statusKey] ?? "bg-muted text-muted-foreground";
                          const badgeLabel = statusKey in { draft:1, scheduled:1, planned:1, published:1, failed:1 } ? t(`status.${statusKey}` as any) : "—";

                          return (
                            <Card key={item.id} className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                  <div className="mt-0.5 rounded-md bg-muted p-2 shrink-0">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="font-medium truncate">
                                        {safeString(item.title) || "Sans titre"}
                                      </div>
                                      <Badge className={`${badgeClasses} shrink-0`}>{badgeLabel}</Badge>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                      {safeString(item.channel) ? (
                                        <span className="capitalize">{safeString(item.channel)}</span>
                                      ) : null}
                                      {statusKey === "scheduled" && item.scheduled_date ? (
                                        <button
                                          className="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer rounded px-1 -mx-1 hover:bg-primary/5"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openPlan(item);
                                          }}
                                          title={t("ui.editPublishDate")}
                                        >
                                          <Clock className="h-3.5 w-3.5" />
                                          {formatDate(item.scheduled_date)}
                                          {(item.meta as any)?.scheduled_time ? ` ${t("ui.atTime")} ${(item.meta as any).scheduled_time}` : ""}
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                                <Button variant="outline" size="sm" asChild className="shrink-0">
                                  <Link href={`/contents/${item.id}`}>Voir</Link>
                                </Button>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : activeFolder === "quiz" ? (
                /* ===== Quiz Folder View ===== */
                <div className="space-y-4">
                  <button
                    onClick={() => setActiveFolder(null)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Retour aux dossiers
                  </button>

                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-teal-600" />
                      Mes Quiz
                    </h2>
                    <Button size="sm" asChild>
                      <Link href="/quiz/new">
                        <Plus className="w-4 h-4 mr-1" /> Créer un quiz
                      </Link>
                    </Button>
                  </div>

                  {quizzes.length === 0 ? (
                    <Card className="p-6">
                      <p className="text-sm text-muted-foreground text-center py-4">{t("ui.noQuiz")}</p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {quizzes.map((qz) => {
                        const isActive = qz.status === "active";
                        // Survey-aware rendering. mode defaults to "quiz"
                        // for any row that doesn't carry one (legacy data,
                        // pre-migration deployments) so existing quizzes
                        // keep their teal icon, "Quiz sans titre" fallback,
                        // and full "shares" counter — nothing changes for
                        // them. Only mode === "survey" gets the purple
                        // theming + the shorter metric set (no shares).
                        const isSurvey = qz.mode === "survey";
                        return (
                          <Card key={qz.id} className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div
                                  className={`mt-0.5 rounded-md p-2 shrink-0 ${
                                    isSurvey
                                      ? "bg-purple-100 dark:bg-purple-900"
                                      : "bg-teal-100 dark:bg-teal-900"
                                  }`}
                                >
                                  <ClipboardList
                                    className={`h-4 w-4 ${
                                      isSurvey
                                        ? "text-purple-700 dark:text-purple-300"
                                        : "text-teal-700 dark:text-teal-300"
                                    }`}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="font-medium truncate">
                                      {qz.title || (isSurvey ? "Sondage sans titre" : "Quiz sans titre")}
                                    </div>
                                    {isSurvey && (
                                      <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                        Sondage
                                      </Badge>
                                    )}
                                    <Badge
                                      className={
                                        isActive
                                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                          : "bg-muted text-muted-foreground"
                                      }
                                    >
                                      {isActive ? "Actif" : "Brouillon"}
                                    </Badge>
                                    {/* Contextual highlight: at most one
                                        per row, top-performer wins over
                                        trending if both apply. */}
                                    {topQuizId === qz.id && <TopPerformerBadge />}
                                    {trendingQuizIds.has(qz.id) && topQuizId !== qz.id && <TrendingBadge />}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                      <Eye className="h-3.5 w-3.5" /> {qz.views_count} vues
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      <Users className="h-3.5 w-3.5" /> {qz.leads_count} {isSurvey ? "réponses" : "emails"}
                                    </span>
                                    {!isSurvey && (
                                      <span className="inline-flex items-center gap-1">
                                        <Share2 className="h-3.5 w-3.5" /> {qz.shares_count} partages
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/quiz/${qz.id}`}>{t("ui.manage")}</Link>
                              </Button>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : activeFolder === "funnels" ? (
                /* ===== Funnels Folder View ===== */
                <div className="space-y-4">
                  <button
                    onClick={() => setActiveFolder(null)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Retour aux dossiers
                  </button>

                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Route className="w-5 h-5 text-indigo-600" />
                      Mes Pages
                    </h2>
                    <Button size="sm" asChild>
                      <Link href="/pages">
                        <Plus className="w-4 h-4 mr-1" /> Créer une page
                      </Link>
                    </Button>
                  </div>

                  {funnels.length === 0 ? (
                    <Card className="p-6">
                      <p className="text-sm text-muted-foreground text-center py-4">{t("ui.noPages")}</p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {funnels.map((page) => {
                        const isPublished = page.status === "published";
                        const publicUrl = typeof window !== "undefined"
                          ? `${window.location.origin}/p/${page.slug}`
                          : `/p/${page.slug}`;
                        return (
                          <Card key={page.id} className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="mt-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900 p-2 shrink-0">
                                  <Globe className="h-4 w-4 text-indigo-700 dark:text-indigo-300" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <div className="font-medium truncate max-w-[300px]">
                                      {page.title || "Page sans titre"}
                                    </div>
                                    <Badge className={isPublished
                                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                      : "bg-muted text-muted-foreground"
                                    }>
                                      {isPublished ? "En ligne" : "Brouillon"}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {page.page_type === "sales" ? "Vente" : "Capture"}
                                    </Badge>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                      <Eye className="h-3.5 w-3.5" /> {page.views_count} vues
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                      <Users className="h-3.5 w-3.5" /> {page.leads_count} leads
                                    </span>
                                    {isPublished && (
                                      <a
                                        href={publicUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                                      >
                                        <ExternalLink className="h-3 w-3" /> Voir en ligne
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => router.push(`/pages?edit=${page.id}`)}>
                                    <Edit className="w-4 h-4 mr-2" /> Éditer
                                  </DropdownMenuItem>
                                  {isPublished && (
                                    <DropdownMenuItem onClick={() => window.open(publicUrl, "_blank")}>
                                      <ExternalLink className="w-4 h-4 mr-2" /> Ouvrir
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={async () => {
                                    setLoadingLeads(true);
                                    setFunnelLeads(null);
                                    try {
                                      const res = await fetch(`/api/pages/${page.id}/leads`);
                                      const data = await res.json();
                                      setFunnelLeads({ pageId: page.id, leads: data.leads ?? [] });
                                    } catch { /* ignore */ } finally {
                                      setLoadingLeads(false);
                                    }
                                  }}>
                                    <Users className="w-4 h-4 mr-2" /> Voir les leads ({page.leads_count})
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => setDeleteFunnelConfirm(page)}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {/* Leads modal */}
                  {funnelLeads && (
                    <Dialog open onOpenChange={() => setFunnelLeads(null)}>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{t("ui.capturedLeads")}</DialogTitle>
                          <DialogDescription>{funnelLeads.leads.length} lead(s)</DialogDescription>
                        </DialogHeader>
                        {funnelLeads.leads.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">{t("ui.noLeads")}</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b text-left">
                                    <th className="pb-2 font-medium">Email</th>
                                    <th className="pb-2 font-medium">{t("ui.firstName")}</th>
                                    <th className="pb-2 font-medium">Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {funnelLeads.leads.map((lead: any, i: number) => (
                                    <tr key={lead.id ?? i} className="border-b last:border-0">
                                      <td className="py-2">{lead.email}</td>
                                      <td className="py-2">{lead.first_name || "—"}</td>
                                      <td className="py-2 text-muted-foreground">
                                        {lead.created_at ? formatDate(lead.created_at) : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const csv = [t("ui.csvHeader")];
                                for (const l of funnelLeads.leads) {
                                  csv.push(`${l.email ?? ""},${l.first_name ?? ""},${l.created_at ?? ""}`);
                                }
                                const blob = new Blob([csv.join("\n")], { type: "text/csv" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `leads-${funnelLeads.pageId}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                            >
                              <Download className="w-4 h-4 mr-2" /> Télécharger en CSV
                            </Button>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  )}

                  {/* Loading leads */}
                  {loadingLeads && (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Chargement des leads...
                    </div>
                  )}

                  {/* Delete funnel confirmation */}
                  {deleteFunnelConfirm && (
                    <Dialog open onOpenChange={() => setDeleteFunnelConfirm(null)}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Supprimer cette page ?</DialogTitle>
                          <DialogDescription>
                            &laquo; {deleteFunnelConfirm.title || "Page sans titre"} &raquo; sera archivé et ne sera plus accessible.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setDeleteFunnelConfirm(null)}>
                            Annuler
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={async () => {
                              const id = deleteFunnelConfirm.id;
                              setDeleteFunnelConfirm(null);
                              try {
                                await fetch(`/api/pages/${id}`, { method: "DELETE" });
                                setFunnels((prev) => prev.filter((p) => p.id !== id));
                                toast({ title: t("toast.pageDeleted") });
                              } catch { /* ignore */ }
                            }}
                          >
                            Supprimer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              ) : (
                /* ===== Content Folder View (filtered by type) ===== */
                <div className="space-y-4">
                  <button
                    onClick={() => setActiveFolder(null)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Retour aux dossiers
                  </button>

                  {(() => {
                    const folder = CONTENT_FOLDERS.find((f) => f.id === activeFolder);
                    if (!folder) return null;
                    const FIcon = folder.icon;
                    return (
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        <FIcon className={`w-5 h-5 ${folder.color}`} />
                        {t(`folders.${folder.id}` as any)}
                      </h2>
                    );
                  })()}

                  {filtered.length === 0 ? (
                    <Card className="p-6">
                      <p className="text-sm text-muted-foreground text-center py-4">Aucun contenu dans ce dossier.</p>
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
                                const badgeLabel = statusKey in { draft:1, scheduled:1, planned:1, published:1, failed:1 } ? t(`status.${statusKey}` as any) : "—";

                                return (
                                  <Card key={item.id} className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex items-start gap-3 min-w-0 flex-1">
                                        <div className="mt-0.5 rounded-md bg-muted p-2 shrink-0">
                                          <Icon className="h-4 w-4 text-muted-foreground" />
                                        </div>

                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <div className="font-medium truncate">
                                              {safeString(item.title) || "Sans titre"}
                                            </div>
                                            <Badge className={`${badgeClasses} shrink-0`}>{badgeLabel}</Badge>
                                          </div>

                                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                            {safeString(item.channel) ? (
                                              <span className="capitalize">{safeString(item.channel)}</span>
                                            ) : null}

                                            {statusKey === "scheduled" && item.scheduled_date ? (
                                              <button
                                                className="inline-flex items-center gap-1 hover:text-primary transition-colors cursor-pointer rounded px-1 -mx-1 hover:bg-primary/5"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openPlan(item);
                                                }}
                                                title={t("ui.editPublishDate")}
                                              >
                                                <Clock className="h-3.5 w-3.5" />
                                                {formatDate(item.scheduled_date)}
                                                {(item.meta as any)?.scheduled_time ? ` ${t("ui.atTime")} ${(item.meta as any).scheduled_time}` : ""}
                                              </button>
                                            ) : null}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
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
                                                ? t("ui.editDate")
                                                : t("ui.schedule")}
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
                      placeholder={t("ui.titlePh")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-body">Contenu</Label>
                    <Textarea
                      id="edit-body"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={12}
                      placeholder={t("ui.contentPh")}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingContent(null)} disabled={busy === "edit"}>
                    {tc("cancel")}
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={busy === "edit"}>
                    {busy === "edit" ? t("ui.saving") : tc("save")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Plan / Reschedule Dialog */}
            <Dialog open={!!planningContent} onOpenChange={(open) => (!open ? setPlanningContent(null) : null)}>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    {planningContent && normalizeKeyStatus(planningContent.status) === "scheduled"
                      ? t("ui.rescheduleTitle")
                      : t("ui.scheduleTitle")}
                  </DialogTitle>
                  <DialogDescription>
                    {planningContent && normalizeKeyStatus(planningContent.status) === "scheduled"
                      ? t("ui.rescheduleDesc")
                      : t("ui.scheduleDesc")}
                  </DialogDescription>
                </DialogHeader>

                {/* Resume du contenu */}
                {planningContent && (
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <p className="text-sm font-medium truncate">
                      {safeString(planningContent.title) || t("ui.untitled")}
                    </p>
                    {safeString(planningContent.channel) && (
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">
                        {safeString(planningContent.channel)}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="plan-date">{t("ui.publishDate")}</Label>
                    <Input
                      id="plan-date"
                      type="date"
                      value={planDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setPlanDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="plan-time">{t("ui.publishTime")}</Label>
                    <Input
                      id="plan-time"
                      type="time"
                      value={planTime}
                      onChange={(e) => setPlanTime(e.target.value)}
                    />
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setPlanningContent(null)} disabled={busy === "plan"}>
                    {tc("cancel")}
                  </Button>
                  <Button onClick={handleSavePlan} disabled={busy === "plan" || !planDate}>
                    {busy === "plan"
                      ? t("ui.saving")
                      : planningContent && normalizeKeyStatus(planningContent.status) === "scheduled"
                        ? t("ui.reschedule")
                        : t("ui.schedule")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Confirm Dialog (Lovable 1:1) */}
            <Dialog open={!!deleteConfirm} onOpenChange={(open) => (!open ? setDeleteConfirm(null) : null)}>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>{t("ui.deleteTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("ui.deleteDesc")}
                  </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={busy === "delete"}>
                    {tc("cancel")}
                  </Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={busy === "delete"}>
                    {busy === "delete" ? t("ui.deleting") : tc("delete")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Footer info (email) */}
            <div className="text-xs text-muted-foreground">
              Connecté en tant que <span className="font-medium">{userEmail}</span>
            </div>
          </PageContainer>
        </main>
      </div>
    </SidebarProvider>
  );
}
