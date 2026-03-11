// components/leads/LeadsPageClient.tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { PageBanner } from "@/components/PageBanner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

import {
  Users,
  Search,
  Download,
  Trash2,
  Pencil,
  X,
  Mail,
  Phone,
  Calendar,
  HelpCircle,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

export type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  source: string;
  source_name: string | null;
  quiz_answers: Array<{ question_text: string; answer_text: string }> | null;
  quiz_result_title: string | null;
  exported_sio: boolean;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type Props = {
  leads: Lead[];
  error?: string;
};

const SOURCES = ["quiz", "landing_page", "website", "manual"] as const;
const PAGE_SIZE = 20;

function sourceLabel(source: string, t: (key: string) => string): string {
  const key = `source_${source}`;
  return t(key);
}

function formatDate(dateStr: string, locale: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(locale === "fr" ? "fr-FR" : locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function LeadsPageClient({ leads: initialLeads, error }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("leads");
  const locale = useTranslations()("" as any) ? "fr" : "fr"; // fallback
  const tLocale = useTranslations();

  const [leads, setLeads] = useState(initialLeads);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  // Detail sheet
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter leads
  const filtered = useMemo(() => {
    let result = leads;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.email.toLowerCase().includes(q) ||
          (l.first_name ?? "").toLowerCase().includes(q) ||
          (l.last_name ?? "").toLowerCase().includes(q)
      );
    }
    if (sourceFilter !== "all") {
      result = result.filter((l) => l.source === sourceFilter);
    }
    return result;
  }, [leads, search, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const allOnPageSelected = paginated.length > 0 && paginated.every((l) => selectedIds.has(l.id));

  function toggleSelectAll() {
    const newSet = new Set(selectedIds);
    if (allOnPageSelected) {
      paginated.forEach((l) => newSet.delete(l.id));
    } else {
      paginated.forEach((l) => newSet.add(l.id));
    }
    setSelectedIds(newSet);
  }

  function toggleSelect(id: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  }

  async function handleExport() {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds).join(",") : "";
    const url = ids ? `/api/leads/export?ids=${ids}` : "/api/leads/export";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: t("exportSuccess") });
    } catch {
      toast({ title: t("exportError"), variant: "destructive" });
    }
  }

  function openDetail(lead: Lead) {
    setDetailLead(lead);
    setEditMode(false);
    setEditForm({
      first_name: lead.first_name ?? "",
      last_name: lead.last_name ?? "",
      email: lead.email,
      phone: lead.phone ?? "",
    });
  }

  async function handleSaveLead() {
    if (!detailLead) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/leads/${detailLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Save failed");

      // Update local state
      setLeads((prev) =>
        prev.map((l) =>
          l.id === detailLead.id
            ? { ...l, ...editForm }
            : l
        )
      );
      setDetailLead((prev) => (prev ? { ...prev, ...editForm } : prev));
      setEditMode(false);
      toast({ title: t("saveSuccess") });
    } catch (e) {
      toast({
        title: t("saveError"),
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteLead() {
    if (!detailLead) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/leads/${detailLead.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");

      setLeads((prev) => prev.filter((l) => l.id !== detailLead.id));
      setSelectedIds((prev) => {
        const ns = new Set(prev);
        ns.delete(detailLead.id);
        return ns;
      });
      setDetailLead(null);
      toast({ title: t("deleteSuccess") });
    } catch {
      toast({ title: t("deleteError"), variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          <PageHeader
            left={
              <h1 className="text-lg font-display font-bold truncate">{t("title")}</h1>
            }
          />

          <div className="flex-1 p-4 sm:p-5 lg:p-6">
          <div className="max-w-[1200px] mx-auto w-full space-y-5">
            <PageBanner icon={<Users className="w-5 h-5" />} title={t("title")} subtitle="Gère tes contacts et leads depuis un seul endroit." />

            {error && (
              <Card className="p-4 border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </Card>
            )}

            {/* Stats bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold">{leads.length}</p>
                <p className="text-xs text-muted-foreground">{t("totalLeads")}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold">{leads.filter((l) => l.source === "quiz").length}</p>
                <p className="text-xs text-muted-foreground">{t("source_quiz")}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold">{leads.filter((l) => l.exported_sio).length}</p>
                <p className="text-xs text-muted-foreground">{t("exported")}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {leads.filter((l) => {
                    const d = new Date(l.created_at);
                    const now = new Date();
                    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                  }).length}
                </p>
                <p className="text-xs text-muted-foreground">{t("thisMonth")}</p>
              </Card>
            </div>

            {/* Security badge */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800">
              <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-xs text-green-700 dark:text-green-300">{t("encryptionBadge")}</p>
            </div>

            {/* Toolbar */}
            <Card className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="flex flex-1 gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder={t("searchPlaceholder")}
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                      className="pl-9"
                    />
                  </div>
                  <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder={t("allSources")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("allSources")}</SelectItem>
                      {SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {sourceLabel(s, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  className="shrink-0"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {selectedIds.size > 0
                    ? t("exportSelected", { count: selectedIds.size })
                    : t("exportAll")}
                </Button>
              </div>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 w-10">
                        <Checkbox
                          checked={allOnPageSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label={t("selectAll")}
                        />
                      </th>
                      <th className="p-3 text-left font-medium text-muted-foreground">{t("colEmail")}</th>
                      <th className="p-3 text-left font-medium text-muted-foreground hidden sm:table-cell">{t("colName")}</th>
                      <th className="p-3 text-left font-medium text-muted-foreground hidden md:table-cell">{t("colSource")}</th>
                      <th className="p-3 text-left font-medium text-muted-foreground hidden md:table-cell">{t("colDate")}</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">{t("colExported")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <Users className="w-10 h-10 text-muted-foreground/50" />
                            <p>{t("noLeads")}</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paginated.map((lead) => (
                        <tr
                          key={lead.id}
                          className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => openDetail(lead)}
                        >
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(lead.id)}
                              onCheckedChange={() => toggleSelect(lead.id)}
                            />
                          </td>
                          <td className="p-3">
                            <span className="font-medium">{lead.email}</span>
                          </td>
                          <td className="p-3 hidden sm:table-cell text-muted-foreground">
                            {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="p-3 hidden md:table-cell">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {sourceLabel(lead.source, t)}
                            </Badge>
                          </td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground">
                            {formatDate(lead.created_at, "fr")}
                          </td>
                          <td className="p-3">
                            <Badge
                              className={
                                lead.exported_sio
                                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                  : "bg-muted text-muted-foreground"
                              }
                            >
                              {lead.exported_sio ? t("yes") : t("no")}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    {t("showing", {
                      from: page * PAGE_SIZE + 1,
                      to: Math.min((page + 1) * PAGE_SIZE, filtered.length),
                      total: filtered.length,
                    })}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
          </div>
        </main>
      </div>

      {/* Lead Detail Sheet */}
      <Sheet open={!!detailLead} onOpenChange={(open) => { if (!open) setDetailLead(null); }}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>{t("leadDetail")}</span>
              <div className="flex gap-1">
                {!editMode && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditMode(true)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={handleDeleteLead}
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
            </SheetTitle>
          </SheetHeader>

          {detailLead && (
            <div className="mt-6 space-y-6">
              {/* Contact info */}
              <div className="space-y-4">
                {editMode ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>{t("firstName")}</Label>
                        <Input
                          value={editForm.first_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("lastName")}</Label>
                        <Input
                          value={editForm.last_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("colEmail")}</Label>
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("phone")}</Label>
                      <Input
                        value={editForm.phone}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveLead} disabled={isSaving} size="sm">
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {t("save")}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                        {t("cancel")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-lg truncate">
                          {[detailLead.first_name, detailLead.last_name].filter(Boolean).join(" ") || t("noName")}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">{detailLead.email}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {detailLead.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-muted-foreground" />
                          <span>{detailLead.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>{formatDate(detailLead.created_at, "fr")}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Source & export info */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("info")}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-sm text-muted-foreground">{t("colSource")}</span>
                    <Badge variant="secondary" className="capitalize">{sourceLabel(detailLead.source, t)}</Badge>
                  </div>
                  {detailLead.source_name && (
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-muted-foreground">{t("origin")}</span>
                      <span className="text-sm font-medium">{detailLead.source_name}</span>
                    </div>
                  )}
                  {detailLead.quiz_result_title && (
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm text-muted-foreground">{t("quizResult")}</span>
                      <span className="text-sm font-medium">{detailLead.quiz_result_title}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-sm text-muted-foreground">{t("exportedSio")}</span>
                    <Badge
                      className={
                        detailLead.exported_sio
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {detailLead.exported_sio ? t("yes") : t("no")}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Quiz answers */}
              {detailLead.quiz_answers && detailLead.quiz_answers.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <HelpCircle className="w-4 h-4" />
                    {t("quizAnswers")}
                  </h4>
                  <div className="space-y-2">
                    {detailLead.quiz_answers.map((qa, i) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">{qa.question_text}</p>
                        <p className="text-sm font-medium">{qa.answer_text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
