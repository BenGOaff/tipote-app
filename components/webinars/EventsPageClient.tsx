"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { PageBanner } from "@/components/PageBanner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  Loader2,
  Video,
  Users,
  Eye,
  TrendingUp,
  DollarSign,
  Target,
  ChevronDown,
  ChevronUp,
  Trophy,
  BookOpen,
  BarChart3,
} from "lucide-react";
import EventPlaybook from "@/components/webinars/EventPlaybook";

interface Webinar {
  id: string;
  title: string;
  topic: string | null;
  offer_name: string | null;
  webinar_date: string | null;
  status: string;
  registrants: number;
  attendees: number;
  replay_viewers: number;
  offers_presented: number;
  sales_count: number;
  revenue: number;
  notes: string | null;
  created_at: string;
  event_type: string;
  end_date: string | null;
  offer_id: string | null;
  program: string | null;
  playbook_progress?: Record<string, boolean>;
  playbook_data?: Record<string, unknown>;
}

type OfferOption = {
  id: string;
  name: string;
  level: string;
  price_min: number | null;
  price_max: number | null;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Planifié", color: "bg-blue-100 text-blue-700" },
  live: { label: "En direct", color: "bg-green-100 text-green-700" },
  completed: { label: "Terminé", color: "bg-purple-100 text-purple-700" },
};

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  webinar: { label: "Webinaire", color: "bg-indigo-100 text-indigo-700" },
  challenge: { label: "Challenge", color: "bg-amber-100 text-amber-700" },
};

function pct(a: number, b: number): string {
  if (!b || b <= 0) return "\u2014";
  return `${((a / b) * 100).toFixed(1)}%`;
}

function avg(total: number, count: number): string {
  if (!count || count <= 0) return "\u2014";
  return `${(total / count).toFixed(0)}\u00a0\u20ac`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// KPI benchmark thresholds
function kpiColor(value: number, good: number, excellent: number): string {
  if (value >= excellent) return "text-green-600";
  if (value >= good) return "text-amber-600";
  return "text-red-500";
}

export default function EventsPageClient() {
  const t = useTranslations("webinars");
  const { toast } = useToast();

  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "webinar" | "challenge">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"kpis" | "playbook">("playbook");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebinar, setEditingWebinar] = useState<Webinar | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formOffer, setFormOffer] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStatus, setFormStatus] = useState("draft");
  const [formNotes, setFormNotes] = useState("");
  const [formEventType, setFormEventType] = useState<"webinar" | "challenge">("webinar");
  const [formEndDate, setFormEndDate] = useState("");
  const [formOfferId, setFormOfferId] = useState("");
  const [formOfferCustom, setFormOfferCustom] = useState("");
  const [formProgram, setFormProgram] = useState("");
  const [offers, setOffers] = useState<OfferOption[]>([]);

  const fetchWebinars = useCallback(async () => {
    try {
      const res = await fetch("/api/webinars");
      const data = await res.json();
      if (data?.ok) setWebinars(data.webinars ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebinars();
  }, [fetchWebinars]);

  // Load offers on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/webinars/offers");
        const data = await res.json();
        if (data?.ok) setOffers(data.offers ?? []);
      } catch {
        // silent
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = webinars;
    if (typeFilter !== "all") list = list.filter((w) => w.event_type === typeFilter);
    if (statusFilter !== "all") list = list.filter((w) => w.status === statusFilter);
    return list;
  }, [webinars, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    total: webinars.length,
    completed: webinars.filter((w) => w.status === "completed").length,
    challenges: webinars.filter((w) => w.event_type === "challenge").length,
    totalRegistrants: webinars.reduce((s, w) => s + (w.registrants || 0), 0),
    totalRevenue: webinars.reduce((s, w) => s + Number(w.revenue || 0), 0),
  }), [webinars]);

  function resetForm() {
    setFormTitle("");
    setFormTopic("");
    setFormOffer("");
    setFormDate("");
    setFormStatus("draft");
    setFormNotes("");
    setFormEventType("webinar");
    setFormEndDate("");
    setFormOfferId("");
    setFormOfferCustom("");
    setFormProgram("");
    setEditingWebinar(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(w: Webinar) {
    setEditingWebinar(w);
    setFormTitle(w.title);
    setFormTopic(w.topic || "");
    setFormOffer(w.offer_name || "");
    setFormDate(w.webinar_date ? w.webinar_date.slice(0, 10) : "");
    setFormStatus(w.status);
    setFormNotes(w.notes || "");
    setFormEventType((w.event_type as "webinar" | "challenge") || "webinar");
    setFormEndDate(w.end_date ? w.end_date.slice(0, 10) : "");
    setFormOfferId(w.offer_id || "");
    setFormOfferCustom("");
    setFormProgram(w.program || "");
    setDialogOpen(true);
  }

  const handleSave = useCallback(async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        topic: formTopic.trim() || null,
        offer_name: formOfferId === "__other__"
          ? formOfferCustom.trim() || null
          : formOfferId
            ? offers.find((o) => o.id === formOfferId)?.name || null
            : null,
        webinar_date: formDate || null,
        status: formStatus,
        notes: formNotes.trim() || null,
        event_type: formEventType,
        end_date: formEventType === "challenge" ? formEndDate || null : null,
        // offer_id is UUID in DB — only send real UUIDs (not synthetic IDs like "user:xxx:0")
        offer_id: formOfferId && formOfferId !== "__other__" && !formOfferId.startsWith("user:") ? formOfferId : null,
        program: formEventType === "challenge" ? formProgram.trim() || null : null,
      };

      if (editingWebinar) {
        const res = await fetch(`/api/webinars/${editingWebinar.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error ?? "Erreur");
        setWebinars((prev) => prev.map((w) => (w.id === data.webinar.id ? data.webinar : w)));
        toast({ title: t("eventUpdated") ?? t("webinarUpdated") });
      } else {
        const res = await fetch("/api/webinars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error ?? "Erreur");
        setWebinars((prev) => [data.webinar, ...prev]);
        toast({ title: t("eventCreated") ?? t("webinarCreated") });
      }
      setDialogOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [editingWebinar, formTitle, formTopic, formOffer, formDate, formStatus, formNotes, formEventType, formEndDate, formOfferId, formOfferCustom, formProgram, offers, t, toast]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/webinars/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data?.ok) {
        setWebinars((prev) => prev.filter((w) => w.id !== id));
        toast({ title: t("eventDeleted") ?? t("webinarDeleted") });
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  }, [t, toast]);

  const updateKpi = useCallback(async (id: string, field: string, value: number) => {
    try {
      const res = await fetch(`/api/webinars/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data?.ok) {
        setWebinars((prev) => prev.map((w) => (w.id === data.webinar.id ? data.webinar : w)));
      }
    } catch {
      // silent
    }
  }, []);

  const updatePlaybookProgress = useCallback(async (id: string, progress: Record<string, boolean>) => {
    // Optimistic update
    setWebinars((prev) => prev.map((w) => (w.id === id ? { ...w, playbook_progress: progress } : w)));
    try {
      await fetch(`/api/webinars/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook_progress: progress }),
      });
    } catch { /* silent */ }
  }, []);

  const updatePlaybookData = useCallback(async (id: string, data: Record<string, unknown>) => {
    setWebinars((prev) => prev.map((w) => (w.id === id ? { ...w, playbook_data: data } : w)));
    try {
      await fetch(`/api/webinars/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbook_data: data }),
      });
    } catch { /* silent */ }
  }, []);

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm";

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
        <PageHeader
          left={
            <h1 className="text-lg font-display font-bold truncate">{t("title")}</h1>
          }
        />
        <div className="flex-1 p-4 sm:p-5 lg:p-6">
        <div className="max-w-[1200px] mx-auto w-full space-y-5">
          <PageBanner
            icon={<Video className="w-5 h-5" />}
            title={t("title")}
            subtitle={t("subtitle")}
          />

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">{t("totalEvents") ?? t("totalWebinars")}</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.challenges}</p>
              <p className="text-xs text-muted-foreground">{t("eventType.challenge") ?? "Challenges"}</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.totalRegistrants.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{t("kpi.registrants")}</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.totalRevenue.toLocaleString()}&nbsp;&euro;</p>
              <p className="text-xs text-muted-foreground">{t("kpi.revenue")}</p>
            </Card>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Type filter */}
              <div className="flex gap-2">
                {(["all", "webinar", "challenge"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={typeFilter === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypeFilter(s)}
                  >
                    {s === "all" ? t("allStatuses") : t(`eventType.${s}`)}
                  </Button>
                ))}
              </div>
              {/* Status filter */}
              <div className="flex gap-2">
                {["all", "draft", "scheduled", "completed"].map((s) => (
                  <Button
                    key={s}
                    variant={statusFilter === s ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === "all" ? t("allStatuses") : (STATUS_CONFIG[s]?.label ?? s)}
                  </Button>
                ))}
              </div>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              {t("newEvent") ?? t("newWebinar")}
            </Button>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center">
              {Math.random() > 0.5 ? (
                <Video className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
              ) : (
                <Trophy className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
              )}
              <p className="text-muted-foreground">{t("noEvents") ?? t("noWebinars")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("noEventsHint") ?? t("noWebinarsHint")}</p>
            </Card>
          ) : (
            <div className={expandedId ? "space-y-3" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
              {filtered.map((w) => {
                const isExpanded = expandedId === w.id;
                if (expandedId && !isExpanded) return null; // Hide other cards when one is expanded
                const sc = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.draft;
                const ec = EVENT_TYPE_CONFIG[w.event_type] ?? EVENT_TYPE_CONFIG.webinar;
                const attendanceRate = w.registrants > 0 ? (w.attendees / w.registrants) * 100 : 0;
                const totalViewers = w.attendees + w.replay_viewers;
                const conversionRate = totalViewers > 0 ? (w.sales_count / totalViewers) * 100 : 0;
                const isChallenge = w.event_type === "challenge";
                const EventIcon = isChallenge ? Trophy : Video;

                return (
                  <Card
                    key={w.id}
                    className="p-4 hover:shadow-md transition-shadow cursor-pointer group flex flex-col"
                    onClick={() => setExpandedId(isExpanded ? null : w.id)}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <EventIcon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <h3 className="font-semibold text-sm truncate">{w.title}</h3>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); openEdit(w); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("deleteEvent") ?? t("deleteWebinar")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("deleteEventDesc") ?? t("deleteWebinarDesc")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(w.id)}>
                                {t("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <Badge className={`text-[10px] ${ec.color}`}>{ec.label}</Badge>
                      <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                    </div>

                    {/* Date & offer */}
                    <p className="text-xs text-muted-foreground mb-3">
                      {isChallenge && w.end_date
                        ? `Du ${formatDate(w.webinar_date)} \u2192 ${formatDate(w.end_date)}`
                        : formatDate(w.webinar_date)}
                      {w.offer_name ? ` \u00b7 ${w.offer_name}` : ""}
                    </p>

                    {/* Quick KPIs inline */}
                    {w.registrants > 0 && (
                      <div className="grid grid-cols-3 gap-2 text-center bg-muted/40 rounded-md p-2 mb-3">
                        <div>
                          <p className="text-sm font-bold">{w.registrants}</p>
                          <p className="text-[10px] text-muted-foreground">{t("kpi.registrants")}</p>
                        </div>
                        <div>
                          <p className={`text-sm font-bold ${kpiColor(attendanceRate, 30, 45)}`}>
                            {pct(w.attendees, w.registrants)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Pr\u00e9sence</p>
                        </div>
                        <div>
                          {Number(w.revenue) > 0 ? (
                            <>
                              <p className="text-sm font-bold text-green-600">{Number(w.revenue).toLocaleString()}\u00a0\u20ac</p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.revenue")}</p>
                            </>
                          ) : (
                            <>
                              <p className={`text-sm font-bold ${kpiColor(conversionRate, 5, 10)}`}>
                                {pct(w.sales_count, totalViewers)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">Conv.</p>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Expanded: Playbook + KPIs */}
                    {isExpanded && (
                      <div className="border-t pt-3 mt-auto space-y-3" onClick={(e) => e.stopPropagation()}>
                        {/* Back to list */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                          onClick={() => setExpandedId(null)}
                        >
                          &larr; {t("playbook.backToList")}
                        </Button>
                        {/* Tab toggles */}
                        <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
                          <button
                            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              activeTab === "playbook"
                                ? "bg-white shadow-sm text-primary"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            onClick={() => setActiveTab("playbook")}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            {t("playbook.title")}
                          </button>
                          <button
                            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              activeTab === "kpis"
                                ? "bg-white shadow-sm text-primary"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            onClick={() => setActiveTab("kpis")}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            {t("playbook.kpis")}
                          </button>
                        </div>

                        {/* Playbook tab */}
                        {activeTab === "playbook" && (
                          <EventPlaybook
                            webinar={w}
                            onProgressUpdate={(progress) => updatePlaybookProgress(w.id, progress)}
                            onPlaybookDataUpdate={(data) => updatePlaybookData(w.id, data)}
                          />
                        )}

                        {/* KPIs tab */}
                        {activeTab === "kpis" && (
                      <div className="space-y-3">
                        {/* KPI Input Grid */}
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { key: "registrants", icon: Users, label: t("kpi.registrants") },
                            { key: "attendees", icon: Eye, label: t("kpi.attendees") },
                            { key: "replay_viewers", icon: Video, label: t("kpi.replayViewers") },
                            { key: "offers_presented", icon: Target, label: t("kpi.offersPresented") },
                            { key: "sales_count", icon: TrendingUp, label: t("kpi.salesCount") },
                            { key: "revenue", icon: DollarSign, label: t("kpi.revenue") },
                          ] as const).map(({ key, icon: Icon, label }) => (
                            <div key={key} className="space-y-1">
                              <label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Icon className="w-3 h-3" />
                                {label}
                              </label>
                              <Input
                                type="number"
                                min={0}
                                step={key === "revenue" ? "0.01" : "1"}
                                value={(w as any)[key] ?? 0}
                                className="h-8 text-sm"
                                onChange={(e) => {
                                  const val = key === "revenue" ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0;
                                  setWebinars((prev) =>
                                    prev.map((ww) => (ww.id === w.id ? { ...ww, [key]: val } : ww)),
                                  );
                                }}
                                onBlur={(e) => {
                                  const val = key === "revenue" ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0;
                                  updateKpi(w.id, key, val);
                                }}
                              />
                            </div>
                          ))}
                        </div>

                        {/* Calculated KPIs */}
                        {w.registrants > 0 && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-muted/40 rounded-md p-2 text-center">
                              <p className={`text-sm font-bold ${kpiColor(attendanceRate, 30, 45)}`}>
                                {pct(w.attendees, w.registrants)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.attendanceRate")}</p>
                            </div>
                            <div className="bg-muted/40 rounded-md p-2 text-center">
                              <p className="text-sm font-bold">{pct(w.replay_viewers, w.registrants)}</p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.replayRate")}</p>
                            </div>
                            <div className="bg-muted/40 rounded-md p-2 text-center">
                              <p className={`text-sm font-bold ${kpiColor(conversionRate, 5, 10)}`}>
                                {pct(w.sales_count, totalViewers)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.conversionRate")}</p>
                            </div>
                            <div className="bg-muted/40 rounded-md p-2 text-center">
                              <p className="text-sm font-bold">
                                {avg(Number(w.revenue), w.registrants)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.revenuePerRegistrant")}</p>
                            </div>
                          </div>
                        )}

                        {w.notes && (
                          <p className="text-xs text-muted-foreground italic">{w.notes}</p>
                        )}

                        {isChallenge && w.program && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">{t("fields.program") ?? "Programme"}</p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{w.program}</p>
                          </div>
                        )}
                      </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWebinar ? (t("editEvent") ?? t("editWebinar")) : (t("newEvent") ?? t("newWebinar"))}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Event type toggle */}
            <div className="space-y-1">
              <Label>{t("fields.eventType") ?? "Type"}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formEventType === "webinar" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setFormEventType("webinar")}
                >
                  <Video className="h-4 w-4 mr-1" />
                  Webinaire
                </Button>
                <Button
                  type="button"
                  variant={formEventType === "challenge" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setFormEventType("challenge")}
                >
                  <Trophy className="h-4 w-4 mr-1" />
                  Challenge
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t("fields.title")} *</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Ex: Webinaire offre premium" />
            </div>
            <div className="space-y-1">
              <Label>{t("fields.topic")}</Label>
              <Input value={formTopic} onChange={(e) => setFormTopic(e.target.value)} placeholder="Ex: Comment tripler tes ventes" />
            </div>

            {/* Offer selector */}
            <div className="space-y-1">
              <Label>{t("fields.offerName")}</Label>
              <select
                className={selectClassName}
                value={formOfferId}
                onChange={(e) => setFormOfferId(e.target.value)}
              >
                <option value="">{t("fields.noOffer") ?? "Aucune offre"}</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.price_min ? ` (${o.price_min}\u20ac)` : ""}
                  </option>
                ))}
                <option value="__other__">{t("fields.offerOther") ?? "Autre : pr\u00e9ciser"}</option>
              </select>
              {formOfferId === "__other__" && (
                <Input
                  className="mt-2"
                  value={formOfferCustom}
                  onChange={(e) => setFormOfferCustom(e.target.value)}
                  placeholder="Nom de l'offre..."
                />
              )}
            </div>

            {/* Date section */}
            {formEventType === "webinar" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("fields.date")}</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.status")}</Label>
                  <select
                    className={selectClassName}
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                  >
                    <option value="draft">{t("status.draft")}</option>
                    <option value="scheduled">{t("status.scheduled")}</option>
                    <option value="live">{t("status.live")}</option>
                    <option value="completed">{t("status.completed")}</option>
                  </select>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Du</Label>
                    <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Au</Label>
                    <Input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.status")}</Label>
                  <select
                    className={selectClassName}
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                  >
                    <option value="draft">{t("status.draft")}</option>
                    <option value="scheduled">{t("status.scheduled")}</option>
                    <option value="live">{t("status.live")}</option>
                    <option value="completed">{t("status.completed")}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{t("fields.program") ?? "Programme"}</Label>
                  <Textarea
                    value={formProgram}
                    onChange={(e) => setFormProgram(e.target.value)}
                    rows={3}
                    placeholder="Jour 1 : ...\nJour 2 : ..."
                  />
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label>{t("fields.notes")}</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} placeholder="Notes libres..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formTitle.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {t("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
