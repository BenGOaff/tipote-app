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
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────
export type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  lead_id: string | null;
  created_at: string;
};

type ProcessItem = {
  id: string;
  title: string;
  is_done: boolean;
  position: number;
  due_date: string | null;
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
  }, [clients, search, statusFilter]);

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

  const applyTemplate = useCallback(async (templateId: string, dueDate?: string) => {
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

  function resetTemplateForm() {
    setNewTplName("");
    setNewTplDescription("");
    setNewTplColor("#6366f1");
    setNewTplItems([""]);
  }

  // ─── Render ────────────────────────────────────────
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-screen bg-background">
        <PageHeader />

        <div className="flex-1 p-4 sm:p-5 lg:p-6 max-w-[1200px] w-full mx-auto space-y-5">
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
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("searchPlaceholder")}
                      className="pl-9"
                    />
                  </div>

                  <div className="flex gap-1">
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
}: {
  process: ClientProcess;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  onToggleItem: (itemId: string, isDone: boolean) => void;
  onAddItem: (title: string) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const [newItemTitle, setNewItemTitle] = useState("");
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="p-4">
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
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
      </div>

      <Progress value={process.progress} className="h-1.5 mt-3" />

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
                <span
                  className={`flex-1 text-sm ${item.is_done ? "line-through text-slate-400" : "text-slate-700"}`}
                >
                  {item.title}
                </span>
                {item.due_date && (
                  <span className="text-xs text-muted-foreground">{new Date(item.due_date).toLocaleDateString()}</span>
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
  onApply: (templateId: string, dueDate?: string) => void;
  onCreateTemplate: () => void;
  loading: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  const [selectedTpl, setSelectedTpl] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

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

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (selectedTpl) onApply(selectedTpl, dueDate || undefined);
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
