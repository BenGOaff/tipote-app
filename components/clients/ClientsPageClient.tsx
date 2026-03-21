"use client";

import { useState, useMemo, useCallback } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
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
  Briefcase,
  Plus,
  Search,
  Users,
  UserCheck,
  Clock,
  Pause,
  Trash2,
  Pencil,
  Save,
  X,
  ChevronRight,
  ArrowLeft,
  LayoutTemplate,
  ListChecks,
  Calendar,
  Phone,
  Mail,
  FileText,
  Loader2,
  DollarSign,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────
type ProcessSummary = {
  template_id: string | null;
  name: string;
  progress: number;
};

export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  lead_id: string | null;
  created_at: string;
  process_summaries?: ProcessSummary[];
};

type ProcessItem = {
  id: string;
  title: string;
  is_done: boolean;
  position: number;
  due_date: string | null;
};

type ClientPayment = {
  id: string;
  amount: number;
  paid_at: string;
  note: string | null;
};

type ClientProcess = {
  id: string;
  name: string;
  status: string;
  due_date: string | null;
  template_id: string | null;
  items: ProcessItem[];
  total: number;
  done: number;
  progress: number;
  amount_total: number | null;
  amount_collected: number | null;
  payment_type: string;
  installments_count: number | null;
  payments?: ClientPayment[];
};

type TemplateItem = {
  id: string;
  title: string;
  position: number;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  items: TemplateItem[];
};

type Props = {
  clients: Client[];
  templates: Template[];
  error?: string;
};

// ─── Status config ──────────────────────────────────────────
const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  prospect: { color: "bg-blue-100 text-blue-700 border-blue-200", icon: Users },
  active: { color: "bg-green-100 text-green-700 border-green-200", icon: UserCheck },
  completed: { color: "bg-slate-100 text-slate-600 border-slate-200", icon: Clock },
  paused: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: Pause },
};

// ─── Template colors ────────────────────────────────────────
const TEMPLATE_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
];

// ─── Main component ─────────────────────────────────────────
export default function ClientsPageClient({ clients: initialClients, templates: initialTemplates, error }: Props) {
  const t = useTranslations("clients");
  const router = useRouter();
  const { toast } = useToast();

  // State
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "detail" | "templates">("list");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientProcesses, setClientProcesses] = useState<ClientProcess[]>([]);
  const [loading, setLoading] = useState(false);

  // ─── Dialogs state ────────────────────────────────
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showApplyTemplate, setShowApplyTemplate] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // ─── Form state ──────────────────────────────────
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientStatus, setNewClientStatus] = useState("active");

  const [newTplName, setNewTplName] = useState("");
  const [newTplDescription, setNewTplDescription] = useState("");
  const [newTplColor, setNewTplColor] = useState("#6366f1");
  const [newTplItems, setNewTplItems] = useState<string[]>([""]);

  // ─── Filtered clients ─────────────────────────────
  const filtered = useMemo(() => {
    let list = clients;
    if (statusFilter !== "all") {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (templateFilter !== "all") {
      list = list.filter((c) =>
        c.process_summaries?.some((ps) => ps.template_id === templateFilter),
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q),
      );
    }
    return list;
  }, [clients, search, statusFilter, templateFilter]);

  // ─── Stats ────────────────────────────────────────
  const stats = useMemo(() => ({
    total: clients.length,
    active: clients.filter((c) => c.status === "active").length,
    prospect: clients.filter((c) => c.status === "prospect").length,
    completed: clients.filter((c) => c.status === "completed").length,
  }), [clients]);

  // ─── API helpers ──────────────────────────────────
  const createClient = useCallback(async () => {
    if (!newClientName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClientName.trim(),
          email: newClientEmail.trim() || null,
          phone: newClientPhone.trim() || null,
          status: newClientStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      setClients((prev) => [json.client, ...prev]);
      setShowNewClient(false);
      setNewClientName("");
      setNewClientEmail("");
      setNewClientPhone("");
      setNewClientStatus("active");
      toast({ title: t("clientCreated") });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [newClientName, newClientEmail, newClientPhone, newClientStatus, t, toast]);

  const updateClient = useCallback(async (clientId: string, data: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      setClients((prev) => prev.map((c) => (c.id === clientId ? json.client : c)));
      if (selectedClient?.id === clientId) setSelectedClient(json.client);
      setEditingClient(null);
      toast({ title: t("clientUpdated") });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedClient, t, toast]);

  const deleteClient = useCallback(async (clientId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      setClients((prev) => prev.filter((c) => c.id !== clientId));
      if (selectedClient?.id === clientId) {
        setSelectedClient(null);
        setView("list");
      }
      toast({ title: t("clientDeleted") });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedClient, t, toast]);

  const openClientDetail = useCallback(async (client: Client) => {
    setSelectedClient(client);
    setView("detail");
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`);
      const json = await res.json();
      if (json.ok) {
        setClientProcesses(json.processes ?? []);
      }
    } catch {
      // Silently fail — will show empty processes
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Template helpers ─────────────────────────────
  const createTemplate = useCallback(async () => {
    if (!newTplName.trim()) return;
    setLoading(true);
    try {
      const items = newTplItems.filter((i) => i.trim());
      const res = await fetch("/api/client-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTplName.trim(),
          description: newTplDescription.trim() || null,
          color: newTplColor,
          items,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      const tpl = json.template;
      tpl.items = (tpl.client_template_items ?? []).sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
      );
      setTemplates((prev) => [tpl, ...prev]);
      setShowNewTemplate(false);
      resetTemplateForm();
      toast({ title: t("templateCreated") });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [newTplName, newTplDescription, newTplColor, newTplItems, t, toast]);

  const deleteTemplate = useCallback(async (tplId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client-templates/${tplId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      setTemplates((prev) => prev.filter((t) => t.id !== tplId));
      toast({ title: t("templateDeleted") });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  const applyTemplate = useCallback(async (templateId: string, dueDate?: string, payment?: { amount_total?: number; payment_type?: string; installments_count?: number }) => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const res = await fetch("/api/client-processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClient.id,
          template_id: templateId,
          due_date: dueDate || null,
          ...(payment?.amount_total ? { amount_total: payment.amount_total } : {}),
          ...(payment?.payment_type ? { payment_type: payment.payment_type } : {}),
          ...(payment?.installments_count ? { installments_count: payment.installments_count } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      const proc = json.process;
      const items = (proc.client_process_items ?? []).sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
      );
      setClientProcesses((prev) => [
        {
          ...proc,
          items,
          total: items.length,
          done: items.filter((i: any) => i.is_done).length,
          progress: items.length > 0 ? Math.round((items.filter((i: any) => i.is_done).length / items.length) * 100) : 0,
        },
        ...prev,
      ]);
      setShowApplyTemplate(false);
      toast({ title: t("processApplied") });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedClient, t, toast]);

  const updateProcess = useCallback(async (processId: string, data: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/client-processes/${processId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      setClientProcesses((prev) =>
        prev.map((p) => (p.id === processId ? { ...p, ...data } : p)),
      );
      toast({ title: t("processUpdated") });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    }
  }, [t, toast]);

  const toggleProcessItem = useCallback(async (processId: string, itemId: string, isDone: boolean) => {
    // Optimistic update
    setClientProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        const items = p.items.map((i) => (i.id === itemId ? { ...i, is_done: isDone } : i));
        const done = items.filter((i) => i.is_done).length;
        return { ...p, items, done, progress: items.length > 0 ? Math.round((done / items.length) * 100) : 0 };
      }),
    );

    try {
      await fetch(`/api/client-processes/${processId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_done: isDone }),
      });
    } catch {
      // Revert on error
      setClientProcesses((prev) =>
        prev.map((p) => {
          if (p.id !== processId) return p;
          const items = p.items.map((i) => (i.id === itemId ? { ...i, is_done: !isDone } : i));
          const done = items.filter((i) => i.is_done).length;
          return { ...p, items, done, progress: items.length > 0 ? Math.round((done / items.length) * 100) : 0 };
        }),
      );
    }
  }, []);

  const addProcessItem = useCallback(async (processId: string, title: string) => {
    try {
      const res = await fetch(`/api/client-processes/${processId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) return;
      setClientProcesses((prev) =>
        prev.map((p) => {
          if (p.id !== processId) return p;
          const items = [...p.items, json.item];
          const done = items.filter((i: any) => i.is_done).length;
          return { ...p, items, total: items.length, done, progress: items.length > 0 ? Math.round((done / items.length) * 100) : 0 };
        }),
      );
    } catch {
      // Silently fail
    }
  }, []);

  const deleteProcessItem = useCallback(async (processId: string, itemId: string) => {
    setClientProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        const items = p.items.filter((i) => i.id !== itemId);
        const done = items.filter((i) => i.is_done).length;
        return { ...p, items, total: items.length, done, progress: items.length > 0 ? Math.round((done / items.length) * 100) : 0 };
      }),
    );
    try {
      await fetch(`/api/client-processes/${processId}/items/${itemId}`, { method: "DELETE" });
    } catch {
      // Revert would be complex, just refresh
    }
  }, []);

  const editProcessItem = useCallback(async (processId: string, itemId: string, title: string) => {
    setClientProcesses((prev) =>
      prev.map((p) => {
        if (p.id !== processId) return p;
        const items = p.items.map((i) => (i.id === itemId ? { ...i, title } : i));
        return { ...p, items };
      }),
    );
    try {
      await fetch(`/api/client-processes/${processId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch {
      // silent
    }
  }, []);

  const deleteProcess = useCallback(async (processId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client-processes/${processId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      setClientProcesses((prev) => prev.filter((p) => p.id !== processId));
      toast({ title: t("processDeleted") });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  function resetTemplateForm() {
    setNewTplName("");
    setNewTplDescription("");
    setNewTplColor("#6366f1");
    setNewTplItems([""]);
  }

  // ─── Template editing ─────────────────────────────
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editTplName, setEditTplName] = useState("");
  const [editTplDescription, setEditTplDescription] = useState("");
  const [editTplColor, setEditTplColor] = useState("#6366f1");
  const [editTplItems, setEditTplItems] = useState<Array<{ id?: string; title: string }>>([]);

  function openEditTemplate(tpl: Template) {
    setEditingTemplate(tpl);
    setEditTplName(tpl.name);
    setEditTplDescription(tpl.description || "");
    setEditTplColor(tpl.color);
    setEditTplItems(tpl.items.map((i) => ({ id: i.id, title: i.title })));
  }

  const updateTemplate = useCallback(async (sync: boolean) => {
    if (!editingTemplate || !editTplName.trim()) return;
    setLoading(true);
    try {
      const items = editTplItems
        .filter((it) => it.title.trim())
        .map((it) => ({ id: it.id, title: it.title.trim() }));
      const res = await fetch(`/api/client-templates/${editingTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editTplName.trim(),
          description: editTplDescription.trim() || null,
          color: editTplColor,
          items,
          sync,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Error");
      const tpl = json.template;
      tpl.items = (tpl.client_template_items ?? []).sort(
        (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
      );
      setTemplates((prev) => prev.map((t) => (t.id === tpl.id ? tpl : t)));
      setEditingTemplate(null);
      const msg = sync && json.synced > 0
        ? t("templateSynced", { count: json.synced })
        : t("templateUpdated");
      toast({ title: msg });
    } catch (e: any) {
      toast({ title: t("error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [editingTemplate, editTplName, editTplDescription, editTplColor, editTplItems, t, toast]);

  // ─── Render ────────────────────────────────────────
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
            icon={<Briefcase className="w-5 h-5" />}
            title={t("title")}
            subtitle={t("subtitle")}
          />

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2">{error}</p>
          )}

          {/* ─── View: List ──────────────────────────── */}
          {view === "list" && (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: t("statsTotal"), value: stats.total, color: "text-slate-700" },
                  { label: t("statsActive"), value: stats.active, color: "text-green-600" },
                  { label: t("statsProspect"), value: stats.prospect, color: "text-blue-600" },
                  { label: t("statsCompleted"), value: stats.completed, color: "text-slate-500" },
                ].map((s) => (
                  <Card key={s.label} className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </Card>
                ))}
              </div>

              {/* Actions bar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <div className="relative flex-1 max-w-xs min-w-[160px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("searchPlaceholder")}
                      className="pl-9"
                    />
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    {["all", "active", "prospect", "completed", "paused"].map((s) => (
                      <Button
                        key={s}
                        variant={statusFilter === s ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => setStatusFilter(s)}
                      >
                        {t(`status_${s}`)}
                      </Button>
                    ))}
                  </div>

                  {templates.length > 0 && (
                    <select
                      value={templateFilter}
                      onChange={(e) => setTemplateFilter(e.target.value)}
                      className="h-8 text-xs border border-slate-200 rounded-md px-2 bg-white text-slate-700"
                    >
                      <option value="all">{t("filterAll")}</option>
                      {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setView("templates")}>
                    <LayoutTemplate className="h-4 w-4 mr-1" />
                    {t("myTemplates")}
                  </Button>
                  <Button size="sm" onClick={() => setShowNewClient(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t("addClient")}
                  </Button>
                </div>
              </div>

              {/* Client list */}
              {filtered.length === 0 ? (
                <Card className="p-8 text-center">
                  <Briefcase className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">{clients.length === 0 ? t("emptyState") : t("noResults")}</p>
                  {clients.length === 0 && (
                    <Button size="sm" className="mt-4" onClick={() => setShowNewClient(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      {t("addFirstClient")}
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((client) => {
                    const cfg = STATUS_CONFIG[client.status] ?? STATUS_CONFIG.active;
                    const StatusIcon = cfg.icon;
                    return (
                      <Card
                        key={client.id}
                        className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
                        onClick={() => openClientDetail(client)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm text-slate-900 truncate">{client.name}</h3>
                            {client.email && (
                              <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                            )}
                          </div>
                          <Badge variant="outline" className={`text-xs shrink-0 ${cfg.color}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {t(`status_${client.status}`)}
                          </Badge>
                        </div>
                        {client.process_summaries && client.process_summaries.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {client.process_summaries.map((ps, i) => (
                              <div key={i} className="flex items-center gap-1.5 bg-slate-50 rounded-md px-2 py-1">
                                <span className="text-xs font-medium text-slate-600 truncate max-w-[120px]">{ps.name}</span>
                                <span className={`text-xs font-bold ${ps.progress === 100 ? "text-green-600" : "text-slate-500"}`}>{ps.progress}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {client.notes && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{client.notes}</p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{new Date(client.created_at).toLocaleDateString()}</span>
                          <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ─── View: Client Detail ─────────────────── */}
          {view === "detail" && selectedClient && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <Button variant="ghost" size="sm" onClick={() => { setView("list"); setSelectedClient(null); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t("back")}
                </Button>
              </div>

              {/* Client card header */}
              <Card className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold text-slate-900">{selectedClient.name}</h2>
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_CONFIG[selectedClient.status]?.color ?? ""}`}
                      >
                        {t(`status_${selectedClient.status}`)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {selectedClient.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {selectedClient.email}
                        </span>
                      )}
                      {selectedClient.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {selectedClient.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(selectedClient.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {selectedClient.notes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        <FileText className="h-3.5 w-3.5 inline mr-1" />
                        {selectedClient.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setEditingClient(selectedClient)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      {t("edit")}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("deleteConfirmDesc")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteClient(selectedClient.id)}>
                            {t("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Status change buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                  {["prospect", "active", "completed", "paused"].map((s) => {
                    const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.active;
                    return (
                      <Button
                        key={s}
                        variant={selectedClient.status === s ? "default" : "outline"}
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          if (selectedClient.status !== s) {
                            updateClient(selectedClient.id, { status: s });
                          }
                        }}
                      >
                        {t(`status_${s}`)}
                      </Button>
                    );
                  })}
                </div>
              </Card>

              {/* Processes section */}
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <ListChecks className="h-5 w-5" />
                  {t("processes")}
                  {clientProcesses.length > 0 && (
                    <Badge variant="secondary">{clientProcesses.length}</Badge>
                  )}
                </h3>
                <Button size="sm" onClick={() => setShowApplyTemplate(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t("applyProcess")}
                </Button>
              </div>

              {loading && clientProcesses.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : clientProcesses.length === 0 ? (
                <Card className="p-6 text-center">
                  <ListChecks className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t("noProcesses")}</p>
                  <Button size="sm" className="mt-3" onClick={() => setShowApplyTemplate(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t("applyFirstProcess")}
                  </Button>
                </Card>
              ) : (
                <div className="space-y-4">
                  {clientProcesses.map((proc) => (
                    <ProcessCard
                      key={proc.id}
                      process={proc}
                      t={t}
                      onToggleItem={(itemId, isDone) => toggleProcessItem(proc.id, itemId, isDone)}
                      onAddItem={(title) => addProcessItem(proc.id, title)}
                      onDeleteItem={(itemId) => deleteProcessItem(proc.id, itemId)}
                      onEditItem={(itemId, title) => editProcessItem(proc.id, itemId, title)}
                      onUpdateProcess={(data) => updateProcess(proc.id, data)}
                      onDeleteProcess={() => deleteProcess(proc.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── View: Templates ─────────────────────── */}
          {view === "templates" && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t("back")}
                </Button>
                <h3 className="text-base font-semibold">{t("myTemplates")}</h3>
              </div>

              <Button size="sm" onClick={() => setShowNewTemplate(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {t("addTemplate")}
              </Button>

              {templates.length === 0 ? (
                <Card className="p-8 text-center">
                  <LayoutTemplate className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">{t("noTemplates")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("noTemplatesHint")}</p>
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {templates.map((tpl) => (
                    <Card key={tpl.id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: tpl.color }}
                          />
                          <h4 className="font-semibold text-sm">{tpl.name}</h4>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-blue-500"
                            onClick={() => openEditTemplate(tpl)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("deleteTemplateTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>{t("deleteTemplateDesc")}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteTemplate(tpl.id)}>
                                  {t("delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      {tpl.description && (
                        <p className="text-xs text-muted-foreground mb-2">{tpl.description}</p>
                      )}
                      <div className="space-y-1">
                        {tpl.items.map((item, i) => (
                          <p key={item.id} className="text-xs text-slate-600 flex items-center gap-1.5">
                            <span className="text-muted-foreground">{i + 1}.</span>
                            {item.title}
                          </p>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {t("templateSteps", { count: tpl.items.length })}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </main>

      {/* ─── Dialog: New Client ────────────────────── */}
      <Dialog open={showNewClient} onOpenChange={setShowNewClient}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("addClient")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("clientName")} *</label>
              <Input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder={t("clientNamePlaceholder")}
                onKeyDown={(e) => { if (e.key === "Enter") createClient(); }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">{t("email")}</label>
                <Input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">{t("phone")}</label>
                <Input
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="+33 6..."
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("initialStatus")}</label>
              <div className="flex gap-2">
                {["prospect", "active"].map((s) => (
                  <Button
                    key={s}
                    variant={newClientStatus === s ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setNewClientStatus(s)}
                  >
                    {t(`status_${s}`)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewClient(false)}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={createClient} disabled={loading || !newClientName.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {t("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Edit Client ───────────────────── */}
      <EditClientDialog
        client={editingClient}
        onClose={() => setEditingClient(null)}
        onSave={updateClient}
        loading={loading}
        t={t}
      />

      {/* ─── Dialog: New Template ──────────────────── */}
      <Dialog open={showNewTemplate} onOpenChange={(open) => { setShowNewTemplate(open); if (!open) resetTemplateForm(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("addTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("templateName")} *</label>
              <Input
                value={newTplName}
                onChange={(e) => setNewTplName(e.target.value)}
                placeholder={t("templateNamePlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("templateDescription")}</label>
              <Input
                value={newTplDescription}
                onChange={(e) => setNewTplDescription(e.target.value)}
                placeholder={t("templateDescPlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("templateColor")}</label>
              <div className="flex gap-2">
                {TEMPLATE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full transition-all ${newTplColor === c ? "ring-2 ring-offset-2 ring-slate-400" : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewTplColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">{t("templateStepsLabel")}</label>
              {newTplItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                  <Input
                    value={item}
                    onChange={(e) => {
                      const copy = [...newTplItems];
                      copy[i] = e.target.value;
                      setNewTplItems(copy);
                    }}
                    placeholder={t("stepPlaceholder")}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setNewTplItems([...newTplItems, ""]);
                      }
                    }}
                  />
                  {newTplItems.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-500"
                      onClick={() => setNewTplItems(newTplItems.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setNewTplItems([...newTplItems, ""])}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t("addStep")}
              </Button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewTemplate(false)}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={createTemplate} disabled={loading || !newTplName.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {t("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Edit Template ──────────────────── */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("templateName")} *</label>
              <Input
                value={editTplName}
                onChange={(e) => setEditTplName(e.target.value)}
                placeholder={t("templateNamePlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("templateDescription")}</label>
              <Input
                value={editTplDescription}
                onChange={(e) => setEditTplDescription(e.target.value)}
                placeholder={t("templateDescPlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("templateColor")}</label>
              <div className="flex gap-2">
                {TEMPLATE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`w-7 h-7 rounded-full transition-all ${editTplColor === c ? "ring-2 ring-offset-2 ring-slate-400" : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditTplColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">{t("templateStepsLabel")}</label>
              {editTplItems.map((item, i) => (
                <div key={item.id ?? `new-${i}`} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                  <Input
                    value={item.title}
                    onChange={(e) => {
                      const copy = [...editTplItems];
                      copy[i] = { ...copy[i], title: e.target.value };
                      setEditTplItems(copy);
                    }}
                    placeholder={t("stepPlaceholder")}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setEditTplItems([...editTplItems, { title: "" }]);
                      }
                    }}
                  />
                  {editTplItems.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-500"
                      onClick={() => setEditTplItems(editTplItems.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setEditTplItems([...editTplItems, { title: "" }])}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t("addStep")}
              </Button>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingTemplate(null)}>
                {t("cancel")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => updateTemplate(false)} disabled={loading || !editTplName.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                {t("save")}
              </Button>
              <Button size="sm" onClick={() => updateTemplate(true)} disabled={loading || !editTplName.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ListChecks className="h-4 w-4 mr-1" />}
                {t("saveAndSync")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Apply template to client ──────── */}
      <ApplyTemplateDialog
        open={showApplyTemplate}
        onOpenChange={setShowApplyTemplate}
        templates={templates}
        onApply={applyTemplate}
        onCreateTemplate={() => { setShowApplyTemplate(false); setShowNewTemplate(true); }}
        loading={loading}
        t={t}
      />
    </SidebarProvider>
  );
}

// ─── Sub-component: Process Card ────────────────────────────
function ProcessCard({
  process,
  t,
  onToggleItem,
  onAddItem,
  onDeleteItem,
  onEditItem,
  onUpdateProcess,
  onDeleteProcess,
}: {
  process: ClientProcess;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  onToggleItem: (itemId: string, isDone: boolean) => void;
  onAddItem: (title: string) => void;
  onDeleteItem: (itemId: string) => void;
  onEditItem: (itemId: string, title: string) => void;
  onUpdateProcess: (data: Record<string, unknown>) => void;
  onDeleteProcess: () => void;
}) {
  const [newItemTitle, setNewItemTitle] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState("");
  const [editingHeader, setEditingHeader] = useState(false);
  const [editName, setEditName] = useState(process.name);
  const [editDueDate, setEditDueDate] = useState(process.due_date || "");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayAmount, setNewPayAmount] = useState("");
  const [newPayDate, setNewPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [newPayNote, setNewPayNote] = useState("");
  const [payments, setPayments] = useState<ClientPayment[]>(process.payments ?? []);
  const [localCollected, setLocalCollected] = useState(process.amount_collected ?? 0);
  const { toast } = useToast();

  const hasPayment = process.amount_total != null && process.amount_total > 0;
  const collectedPct = hasPayment ? Math.round((localCollected / process.amount_total!) * 100) : 0;

  const addPayment = async () => {
    const amount = parseFloat(newPayAmount);
    if (!amount || amount <= 0) return;
    try {
      const res = await fetch(`/api/client-processes/${process.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, paid_at: newPayDate, note: newPayNote.trim() || null }),
      });
      const json = await res.json();
      if (json.ok && json.payment) {
        setPayments((prev) => [json.payment, ...prev]);
        setLocalCollected(json.amount_collected);
        setNewPayAmount("");
        setNewPayNote("");
        setShowAddPayment(false);
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const deletePayment = async (paymentId: string) => {
    try {
      const res = await fetch(`/api/client-processes/${process.id}/payments/${paymentId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setPayments((prev) => prev.filter((p) => p.id !== paymentId));
        setLocalCollected(json.amount_collected);
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const saveHeader = () => {
    const updates: Record<string, unknown> = {};
    if (editName.trim() && editName.trim() !== process.name) updates.name = editName.trim();
    if (editDueDate !== (process.due_date || "")) updates.due_date = editDueDate || null;
    if (Object.keys(updates).length > 0) onUpdateProcess(updates);
    setEditingHeader(false);
  };

  return (
    <Card className="p-4">
      {editingHeader ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 font-semibold text-sm border rounded px-2 py-1"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveHeader(); if (e.key === "Escape") setEditingHeader(false); }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="text-xs border rounded px-2 py-1"
            />
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setEditingHeader(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">
                Annuler
              </button>
              <button type="button" onClick={saveHeader} className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90">
                OK
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
            <h4 className="font-semibold text-sm truncate">{process.name}</h4>
            <Badge variant="secondary" className="text-xs">
              {process.done}/{process.total}
            </Badge>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {process.due_date && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(process.due_date).toLocaleDateString()}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setEditingHeader(true); }}
              className="text-slate-400 hover:text-primary transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteProcessTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("deleteProcessDesc")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={onDeleteProcess}>{t("delete")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
          </div>
        </div>
      )}

      <Progress value={process.progress} className="h-1.5 mt-3" />

      {/* Payment summary + log */}
      {hasPayment && (
        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 text-xs">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="font-medium text-slate-700">
                {localCollected}€ / {process.amount_total}€
              </span>
              <span className="text-muted-foreground">
                ({collectedPct}% {t("collected")})
              </span>
              {process.payment_type === "installments" && process.installments_count && (
                <Badge variant="outline" className="text-xs">
                  {process.installments_count}x {t("paymentInstallments").toLowerCase()}
                </Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAddPayment(!showAddPayment)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Paiement
            </button>
          </div>

          {/* Add payment form */}
          {showAddPayment && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium">Montant (€)</label>
                  <input
                    type="number"
                    value={newPayAmount}
                    onChange={(e) => setNewPayAmount(e.target.value)}
                    className="w-full h-7 text-xs border rounded px-2"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium">Date</label>
                  <input
                    type="date"
                    value={newPayDate}
                    onChange={(e) => setNewPayDate(e.target.value)}
                    className="w-full h-7 text-xs border rounded px-2"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium">Note (optionnel)</label>
                  <input
                    type="text"
                    value={newPayNote}
                    onChange={(e) => setNewPayNote(e.target.value)}
                    className="w-full h-7 text-xs border rounded px-2"
                    placeholder="Ex: Tranche 1"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowAddPayment(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={addPayment}
                  disabled={!newPayAmount || parseFloat(newPayAmount) <= 0}
                  className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90 disabled:opacity-50"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          )}

          {/* Payment log */}
          {payments.length > 0 && (
            <div className="space-y-1">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs px-1 py-0.5 group">
                  <span className="text-muted-foreground w-20 shrink-0">{new Date(p.paid_at).toLocaleDateString("fr-FR")}</span>
                  <span className="font-medium text-green-700">+{p.amount}€</span>
                  {p.note && <span className="text-muted-foreground truncate">{p.note}</span>}
                  <button
                    type="button"
                    onClick={() => deletePayment(p.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-1">
          {process.items
            .sort((a, b) => a.position - b.position)
            .map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <Checkbox
                  checked={item.is_done}
                  onCheckedChange={(checked) => onToggleItem(item.id, !!checked)}
                />
                {editingItemId === item.id ? (
                  <input
                    value={editingItemTitle}
                    onChange={(e) => setEditingItemTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editingItemTitle.trim()) {
                        onEditItem(item.id, editingItemTitle.trim());
                        setEditingItemId(null);
                      }
                      if (e.key === "Escape") setEditingItemId(null);
                    }}
                    onBlur={() => {
                      if (editingItemTitle.trim() && editingItemTitle.trim() !== item.title) {
                        onEditItem(item.id, editingItemTitle.trim());
                      }
                      setEditingItemId(null);
                    }}
                    className="flex-1 text-sm border rounded px-2 py-0.5 text-slate-700"
                    autoFocus
                  />
                ) : (
                  <span
                    className={`flex-1 text-sm cursor-pointer ${item.is_done ? "line-through text-slate-400" : "text-slate-700"}`}
                    onDoubleClick={() => { setEditingItemId(item.id); setEditingItemTitle(item.title); }}
                  >
                    {item.title}
                  </span>
                )}
                {item.due_date && (
                  <span className="text-xs text-muted-foreground">{new Date(item.due_date).toLocaleDateString()}</span>
                )}
                {editingItemId !== item.id && (
                  <button
                    type="button"
                    onClick={() => { setEditingItemId(item.id); setEditingItemTitle(item.title); }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-primary transition-opacity"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

          <div className="flex items-center gap-2 mt-2">
            <Plus className="h-4 w-4 text-slate-400" />
            <input
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItemTitle.trim()) {
                  onAddItem(newItemTitle.trim());
                  setNewItemTitle("");
                }
              }}
              placeholder={t("addStep")}
              className="flex-1 border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              maxLength={500}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Sub-component: Edit Client Dialog ──────────────────────
function EditClientDialog({
  client,
  onClose,
  onSave,
  loading,
  t,
}: {
  client: Client | null;
  onClose: () => void;
  onSave: (id: string, data: Record<string, unknown>) => Promise<void>;
  loading: boolean;
  t: (key: string) => string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  // Sync when client changes
  const clientId = client?.id;
  if (client && name === "" && email === "" && phone === "" && notes === "") {
    // Initialize on first render with this client
    setTimeout(() => {
      setName(client.name);
      setEmail(client.email ?? "");
      setPhone(client.phone ?? "");
      setNotes(client.notes ?? "");
    }, 0);
  }

  function handleClose() {
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    onClose();
  }

  return (
    <Dialog open={!!client} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editClient")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">{t("clientName")} *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("email")}</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">{t("phone")}</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">{t("notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-y min-h-[60px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (clientId) {
                  onSave(clientId, { name, email: email || null, phone: phone || null, notes: notes || null });
                }
              }}
              disabled={loading || !name.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-component: Apply Template Dialog ───────────────────
function ApplyTemplateDialog({
  open,
  onOpenChange,
  templates,
  onApply,
  onCreateTemplate,
  loading,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  onApply: (templateId: string, dueDate?: string, payment?: { amount_total?: number; payment_type?: string; installments_count?: number }) => void;
  onCreateTemplate: () => void;
  loading: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  const [selectedTpl, setSelectedTpl] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [amountTotal, setAmountTotal] = useState("");
  const [paymentType, setPaymentType] = useState("full");
  const [installmentsCount, setInstallmentsCount] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("applyProcess")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {templates.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">{t("noTemplatesYet")}</p>
              <Button size="sm" onClick={onCreateTemplate}>
                <Plus className="h-4 w-4 mr-1" />
                {t("createTemplateFirst")}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("selectTemplate")}</p>
              <div className="space-y-2">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedTpl === tpl.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    onClick={() => setSelectedTpl(tpl.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: tpl.color }}
                      />
                      <span className="text-sm font-medium">{tpl.name}</span>
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {t("templateSteps", { count: tpl.items.length })}
                      </Badge>
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground">{tpl.description}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {t("processDueDate")}
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              {/* Payment info */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <p className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  {t("paymentInfo")}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">{t("amountTotal")}</label>
                    <Input
                      type="number"
                      value={amountTotal}
                      onChange={(e) => setAmountTotal(e.target.value)}
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">{t("paymentType")}</label>
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value)}
                      className="w-full h-9 text-sm border border-slate-200 rounded-md px-2 bg-white"
                    >
                      <option value="full">{t("paymentFull")}</option>
                      <option value="installments">{t("paymentInstallments")}</option>
                    </select>
                  </div>
                </div>
                {paymentType === "installments" && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">{t("installmentsCount")}</label>
                    <Input
                      type="number"
                      value={installmentsCount}
                      onChange={(e) => setInstallmentsCount(e.target.value)}
                      placeholder="3"
                      min="2"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (selectedTpl) {
                      const payment = amountTotal ? {
                        amount_total: parseFloat(amountTotal),
                        payment_type: paymentType,
                        ...(paymentType === "installments" && installmentsCount ? { installments_count: parseInt(installmentsCount) } : {}),
                      } : undefined;
                      onApply(selectedTpl, dueDate || undefined, payment);
                    }
                  }}
                  disabled={loading || !selectedTpl}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ListChecks className="h-4 w-4 mr-1" />}
                  {t("apply")}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
