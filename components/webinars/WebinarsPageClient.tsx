"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
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
} from "lucide-react";

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
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Brouillon", color: "bg-slate-100 text-slate-600" },
  scheduled: { label: "Planifi\u00e9", color: "bg-blue-100 text-blue-700" },
  live: { label: "En direct", color: "bg-green-100 text-green-700" },
  completed: { label: "Termin\u00e9", color: "bg-purple-100 text-purple-700" },
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

export default function WebinarsPageClient() {
  const t = useTranslations("webinars");
  const { toast } = useToast();

  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebinar, setEditingWebinar] = useState<Webinar | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formTopic, setFormTopic] = useState("");
  const [formOffer, setFormOffer] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStatus, setFormStatus] = useState("draft");
  const [formNotes, setFormNotes] = useState("");

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

  const filtered = useMemo(() => {
    if (statusFilter === "all") return webinars;
    return webinars.filter((w) => w.status === statusFilter);
  }, [webinars, statusFilter]);

  const stats = useMemo(() => ({
    total: webinars.length,
    completed: webinars.filter((w) => w.status === "completed").length,
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
    setDialogOpen(true);
  }

  const handleSave = useCallback(async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        topic: formTopic.trim() || null,
        offer_name: formOffer.trim() || null,
        webinar_date: formDate || null,
        status: formStatus,
        notes: formNotes.trim() || null,
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
        toast({ title: t("webinarUpdated") });
      } else {
        const res = await fetch("/api/webinars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error ?? "Erreur");
        setWebinars((prev) => [data.webinar, ...prev]);
        toast({ title: t("webinarCreated") });
      }
      setDialogOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [editingWebinar, formTitle, formTopic, formOffer, formDate, formStatus, formNotes, t, toast]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/webinars/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data?.ok) {
        setWebinars((prev) => prev.filter((w) => w.id !== id));
        toast({ title: t("webinarDeleted") });
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

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
        <PageHeader
          left={
            <h1 className="text-lg font-display font-bold truncate">{t("title")}</h1>
          }
        />
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6 w-full">
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">{t("totalWebinars")}</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">{t("completedWebinars")}</p>
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
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              {t("newWebinar")}
            </Button>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center">
              <Video className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground">{t("noWebinars")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("noWebinarsHint")}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((w) => {
                const isExpanded = expandedId === w.id;
                const sc = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.draft;
                const attendanceRate = w.registrants > 0 ? (w.attendees / w.registrants) * 100 : 0;
                const totalViewers = w.attendees + w.replay_viewers;
                const conversionRate = totalViewers > 0 ? (w.sales_count / totalViewers) * 100 : 0;

                return (
                  <Card key={w.id} className="overflow-hidden">
                    {/* Header row */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : w.id)}
                    >
                      <Video className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">{w.title}</p>
                          <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(w.webinar_date)}
                          {w.offer_name ? ` \u00b7 ${w.offer_name}` : ""}
                          {w.registrants > 0 ? ` \u00b7 ${w.registrants} inscrits` : ""}
                        </p>
                      </div>

                      {/* Quick KPIs */}
                      {w.registrants > 0 && (
                        <div className="hidden md:flex items-center gap-4 text-xs">
                          <span className={kpiColor(attendanceRate, 30, 45)}>
                            {pct(w.attendees, w.registrants)} pr\u00e9sence
                          </span>
                          <span className={kpiColor(conversionRate, 5, 10)}>
                            {pct(w.sales_count, totalViewers)} conv.
                          </span>
                          {Number(w.revenue) > 0 && (
                            <span className="text-green-600 font-medium">
                              {Number(w.revenue).toLocaleString()}&nbsp;&euro;
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-blue-500"
                          onClick={(e) => { e.stopPropagation(); openEdit(w); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-red-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("deleteWebinar")}</AlertDialogTitle>
                              <AlertDialogDescription>{t("deleteWebinarDesc")}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(w.id)}>
                                {t("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded KPIs */}
                    {isExpanded && (
                      <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
                        {/* KPI Input Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                                  // Optimistic update
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
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <Card className="p-3 text-center">
                              <p className={`text-lg font-bold ${kpiColor(attendanceRate, 30, 45)}`}>
                                {pct(w.attendees, w.registrants)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.attendanceRate")}</p>
                              <p className="text-[9px] text-muted-foreground/60">bon &gt;30% / top &gt;45%</p>
                            </Card>
                            <Card className="p-3 text-center">
                              <p className="text-lg font-bold">{pct(w.replay_viewers, w.registrants)}</p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.replayRate")}</p>
                            </Card>
                            <Card className="p-3 text-center">
                              <p className={`text-lg font-bold ${kpiColor(conversionRate, 5, 10)}`}>
                                {pct(w.sales_count, totalViewers)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.conversionRate")}</p>
                              <p className="text-[9px] text-muted-foreground/60">bon &gt;5% / top &gt;10%</p>
                            </Card>
                            <Card className="p-3 text-center">
                              <p className="text-lg font-bold">
                                {avg(Number(w.revenue), w.registrants)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.revenuePerRegistrant")}</p>
                            </Card>
                            <Card className="p-3 text-center">
                              <p className="text-lg font-bold">
                                {avg(Number(w.revenue), w.sales_count)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{t("kpi.avgOrderValue")}</p>
                            </Card>
                          </div>
                        )}

                        {w.notes && (
                          <p className="text-xs text-muted-foreground italic">{w.notes}</p>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWebinar ? t("editWebinar") : t("newWebinar")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t("fields.title")} *</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Ex: Webinaire offre premium" />
            </div>
            <div className="space-y-1">
              <Label>{t("fields.topic")}</Label>
              <Input value={formTopic} onChange={(e) => setFormTopic(e.target.value)} placeholder="Ex: Comment tripler tes ventes" />
            </div>
            <div className="space-y-1">
              <Label>{t("fields.offerName")}</Label>
              <Input value={formOffer} onChange={(e) => setFormOffer(e.target.value)} placeholder="Ex: Programme Elite" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("fields.date")}</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t("fields.status")}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
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
