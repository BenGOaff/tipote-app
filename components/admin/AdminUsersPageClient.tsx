// components/admin/AdminUsersPageClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type AdminUser = {
  id: string;
  email: string | null;
  plan: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_sign_in_at: string | null;
};

type CreditsSnapshot = {
  monthly_credits_total: number;
  monthly_credits_used: number;
  bonus_credits_total: number;
  bonus_credits_used: number;
  monthly_remaining: number;
  bonus_remaining: number;
  total_remaining: number;
};

const PLANS = ["free", "basic", "pro", "beta", "elite"] as const;
const ALL_PLANS_FILTER = "all" as const;

type SortField = "email" | "plan" | "last_sign_in_at" | "updated_at";
type SortDir = "asc" | "desc";

const PLAN_ORDER: Record<string, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  beta: 3,
  elite: 4,
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR");
}

function fmtDateShort(value: string | null) {
  if (!value) return "Jamais";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Jamais";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} sem.`;
  return d.toLocaleDateString("fr-FR");
}

export default function AdminUsersPageClient({ adminEmail }: { adminEmail: string }) {
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState<string>(ALL_PLANS_FILTER);
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [draftPlanById, setDraftPlanById] = useState<Record<string, string>>({});

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action dialog
  const [bulkDialog, setBulkDialog] = useState<"plan" | "credits" | null>(null);
  const [bulkPlan, setBulkPlan] = useState<string>("pro");
  const [bulkCredits, setBulkCredits] = useState<string>("50");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Credits state
  const [creditsById, setCreditsById] = useState<Record<string, CreditsSnapshot>>({});
  const [loadingCreditsId, setLoadingCreditsId] = useState<string | null>(null);

  // Create user state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPlan, setCreatePlan] = useState<string>("beta");
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [creating, setCreating] = useState(false);

  // Notification broadcast state
  const [showNotifForm, setShowNotifForm] = useState(false);
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifIcon, setNotifIcon] = useState("🆕");
  const [notifActionUrl, setNotifActionUrl] = useState("");
  const [notifActionLabel, setNotifActionLabel] = useState("");
  const [sendingNotif, setSendingNotif] = useState(false);

  // Email marketing state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailGreeting, setEmailGreeting] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailCtaLabel, setEmailCtaLabel] = useState("");
  const [emailCtaUrl, setEmailCtaUrl] = useState("");
  const [emailPreheader, setEmailPreheader] = useState("");
  const [emailSegment, setEmailSegment] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  // Plan counts for filter badges
  const planCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      const p = (u.plan ?? "free").toLowerCase();
      counts[p] = (counts[p] ?? 0) + 1;
    }
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    let list = users;

    // Filter by plan
    if (planFilter !== ALL_PLANS_FILTER) {
      list = list.filter((u) => (u.plan ?? "free").toLowerCase() === planFilter);
    }

    // Filter by search
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((u) => (u.email ?? "").toLowerCase().includes(needle));
    }

    // Sort
    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "email":
          cmp = (a.email ?? "").localeCompare(b.email ?? "");
          break;
        case "plan":
          cmp = (PLAN_ORDER[(a.plan ?? "free").toLowerCase()] ?? -1)
            - (PLAN_ORDER[(b.plan ?? "free").toLowerCase()] ?? -1);
          break;
        case "last_sign_in_at": {
          const da = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
          const db = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
          cmp = da - db;
          break;
        }
        case "updated_at": {
          const da = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const db = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          cmp = da - db;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [q, users, planFilter, sortField, sortDir]);

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [planFilter, q]);

  const allFilteredSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.has(u.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUsers.map((u) => u.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "email" ? "asc" : "desc");
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users`, { method: "GET" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load users");
      }
      const list = (json.users ?? []) as AdminUser[];
      setUsers(list);
      const nextDraft: Record<string, string> = {};
      list.forEach((u) => {
        nextDraft[u.id] = (u.plan ?? "free").toLowerCase();
      });
      setDraftPlanById(nextDraft);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function savePlan(user: AdminUser) {
    const nextPlan = (draftPlanById[user.id] ?? user.plan ?? "free").toLowerCase();

    if (!PLANS.includes(nextPlan as any)) {
      toast({
        title: "Plan invalide",
        description: `Valeur: ${nextPlan}`,
        variant: "destructive",
      });
      return;
    }

    setSavingId(user.id);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email,
          plan: nextPlan,
          reason: "admin dashboard",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Update failed");
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, plan: nextPlan, updated_at: new Date().toISOString() }
            : u,
        ),
      );

      // Update credits if returned
      if (json.credits) {
        setCreditsById((prev) => ({ ...prev, [user.id]: json.credits }));
      }

      toast({
        title: "Plan mis à jour",
        description: `${user.email ?? user.id} → ${nextPlan}`,
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de mettre à jour le plan",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function loadCredits(userId: string) {
    setLoadingCreditsId(userId);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action: "get" }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load credits");
      }
      setCreditsById((prev) => ({ ...prev, [userId]: json.credits }));
    } catch (e) {
      toast({
        title: "Erreur crédits",
        description: e instanceof Error ? e.message : "Impossible de charger les crédits",
        variant: "destructive",
      });
    } finally {
      setLoadingCreditsId(null);
    }
  }

  async function executeBulkAction() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);

    try {
      const userIds = Array.from(selectedIds);
      let bodyPayload: Record<string, unknown>;

      if (bulkDialog === "plan") {
        bodyPayload = {
          action: "change_plan",
          user_ids: userIds,
          plan: bulkPlan,
        };
      } else {
        const amount = parseInt(bulkCredits, 10);
        if (!amount || amount <= 0) {
          toast({ title: "Erreur", description: "Montant invalide", variant: "destructive" });
          setBulkLoading(false);
          return;
        }
        bodyPayload = {
          action: "add_bonus_credits",
          user_ids: userIds,
          bonus_amount: amount,
        };
      }

      const res = await fetch(`/api/admin/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Bulk action failed");
      }

      toast({
        title: "Action groupée terminée",
        description: `${json.succeeded} réussi(s), ${json.failed} échoué(s) sur ${json.total}`,
      });

      // Refresh data and clear selection
      setSelectedIds(new Set());
      setCreditsById({});
      setBulkDialog(null);
      await loadUsers();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur action groupée",
        variant: "destructive",
      });
    } finally {
      setBulkLoading(false);
    }
  }

  async function createUser() {
    const email = createEmail.trim().toLowerCase();
    if (!email) {
      toast({ title: "Erreur", description: "Email requis", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          plan: createPlan,
          first_name: createFirstName.trim() || undefined,
          last_name: createLastName.trim() || undefined,
          send_magic_link: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Erreur lors de la création");
      }

      toast({
        title: json.already_existed ? "Utilisateur mis à jour" : "Utilisateur créé",
        description: `${email} → ${createPlan}${json.magic_link_sent ? " (magic link envoyé)" : ""}`,
      });

      // Reset form
      setCreateEmail("");
      setCreateFirstName("");
      setCreateLastName("");
      setCreatePlan("beta");
      setShowCreateForm(false);

      // Refresh user list
      await loadUsers();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de créer l'utilisateur",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function sendBroadcastNotification() {
    if (!notifTitle.trim()) return;
    setSendingNotif(true);
    try {
      const selectedArr = Array.from(selectedIds);
      const payload: Record<string, unknown> = {
        title: notifTitle.trim(),
        body: notifBody.trim() || undefined,
        icon: notifIcon.trim() || undefined,
        action_url: notifActionUrl.trim() || undefined,
        action_label: notifActionLabel.trim() || undefined,
      };
      // If users are selected, send only to them; otherwise broadcast to all
      if (selectedArr.length > 0) {
        payload.user_ids = selectedArr;
      }
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Erreur");
      toast({
        title: "Notification envoyée",
        description: `${json.inserted} utilisateur(s) notifié(s).`,
      });
      setNotifTitle("");
      setNotifBody("");
      setNotifActionUrl("");
      setNotifActionLabel("");
      setShowNotifForm(false);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'envoyer",
        variant: "destructive",
      });
    } finally {
      setSendingNotif(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ─── Notification broadcast card ─── */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-base font-semibold">Notifications</div>
            <div className="text-sm text-muted-foreground">
              Envoyer une notification {selectedIds.size > 0 ? `aux ${selectedIds.size} user(s) sélectionnés` : "à tous les utilisateurs"}.
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowNotifForm((v) => !v)}>
            {showNotifForm ? "Fermer" : "Envoyer une notification"}
          </Button>
        </div>

        {showNotifForm && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input
                value={notifIcon}
                onChange={(e) => setNotifIcon(e.target.value)}
                placeholder="Icône (emoji)"
                className="w-20"
              />
              <Input
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder="Titre de la notification *"
                className="flex-1"
              />
            </div>
            <Input
              value={notifBody}
              onChange={(e) => setNotifBody(e.target.value)}
              placeholder="Description (optionnel)"
            />
            <div className="flex gap-2">
              <Input
                value={notifActionUrl}
                onChange={(e) => setNotifActionUrl(e.target.value)}
                placeholder="URL du bouton (optionnel)"
                className="flex-1"
              />
              <Input
                value={notifActionLabel}
                onChange={(e) => setNotifActionLabel(e.target.value)}
                placeholder="Texte du bouton"
                className="w-48"
              />
            </div>
            <Button onClick={sendBroadcastNotification} disabled={sendingNotif || !notifTitle.trim()}>
              {sendingNotif
                ? "Envoi en cours..."
                : selectedIds.size > 0
                ? `Envoyer à ${selectedIds.size} user(s)`
                : "Envoyer à tous"}
            </Button>
          </div>
        )}
      </Card>
      {/* ─── Email marketing card ─── */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-base font-semibold">📧 Email Marketing</div>
            <div className="text-sm text-muted-foreground">
              Envoyer un email brandé {selectedIds.size > 0 ? `aux ${selectedIds.size} user(s) sélectionnés` : "segmenté par plan"}.
            </div>
          </div>
          <Button variant="outline" onClick={() => { setShowEmailForm((v) => !v); setEmailPreviewHtml(null); setEmailResult(null); }}>
            {showEmailForm ? "Fermer" : "Composer un email"}
          </Button>
        </div>

        {showEmailForm && (
          <div className="mt-4 space-y-3">
            {/* Segment filter (only if no users selected) */}
            {selectedIds.size === 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Segment (plans ciblés) :</div>
                <div className="flex flex-wrap gap-2">
                  {PLANS.map((plan) => (
                    <label key={plan} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={emailSegment.includes(plan)}
                        onCheckedChange={(checked) => {
                          setEmailSegment((prev) =>
                            checked ? [...prev, plan] : prev.filter((p) => p !== plan),
                          );
                        }}
                      />
                      <Badge variant="outline" className="text-xs">{plan}</Badge>
                      <span className="text-xs text-muted-foreground">({planCounts[plan] ?? 0})</span>
                    </label>
                  ))}
                </div>
                {emailSegment.length === 0 && (
                  <div className="text-xs text-amber-600">⚠ Aucun segment = envoi à TOUS les users</div>
                )}
              </div>
            )}

            <Input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Objet de l'email *"
            />
            <Input
              value={emailPreheader}
              onChange={(e) => setEmailPreheader(e.target.value)}
              placeholder="Preheader (texte aperçu inbox, optionnel)"
            />
            <Input
              value={emailGreeting}
              onChange={(e) => setEmailGreeting(e.target.value)}
              placeholder="Salutation (défaut: prénom de l'user ou 'Bonjour,')"
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Corps de l'email * (HTML supporté : <br/>, <strong>, <a>...)"
              rows={6}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex gap-2">
              <Input
                value={emailCtaUrl}
                onChange={(e) => setEmailCtaUrl(e.target.value)}
                placeholder="URL du bouton CTA (optionnel)"
                className="flex-1"
              />
              <Input
                value={emailCtaLabel}
                onChange={(e) => setEmailCtaLabel(e.target.value)}
                placeholder="Texte du bouton"
                className="w-48"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!emailSubject.trim() || !emailBody.trim() || sendingEmail}
                onClick={async () => {
                  setEmailPreviewHtml(null);
                  const res = await fetch("/api/admin/email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      subject: emailSubject,
                      greeting: emailGreeting || undefined,
                      body: emailBody,
                      ctaLabel: emailCtaLabel || undefined,
                      ctaUrl: emailCtaUrl || undefined,
                      preheader: emailPreheader || undefined,
                      preview: true,
                    }),
                  });
                  const data = await res.json();
                  if (data.html) setEmailPreviewHtml(data.html);
                }}
              >
                👁 Prévisualiser
              </Button>
              <Button
                disabled={!emailSubject.trim() || !emailBody.trim() || sendingEmail}
                onClick={async () => {
                  const target = selectedIds.size > 0
                    ? `${selectedIds.size} user(s) sélectionnés`
                    : emailSegment.length > 0
                    ? `tous les users ${emailSegment.join(", ")}`
                    : "TOUS les users";
                  if (!confirm(`Envoyer cet email à ${target} ?`)) return;

                  setSendingEmail(true);
                  setEmailResult(null);
                  try {
                    const res = await fetch("/api/admin/email", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        subject: emailSubject,
                        greeting: emailGreeting || undefined,
                        body: emailBody,
                        ctaLabel: emailCtaLabel || undefined,
                        ctaUrl: emailCtaUrl || undefined,
                        preheader: emailPreheader || undefined,
                        segment: emailSegment.length > 0 ? emailSegment : undefined,
                        user_ids: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
                      }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setEmailResult({ sent: data.sent, failed: data.failed, total: data.total });
                      toast({ title: `✅ ${data.sent}/${data.total} emails envoyés` });
                    } else {
                      toast({ title: "Erreur", description: data.error, variant: "destructive" });
                    }
                  } catch (err) {
                    toast({ title: "Erreur d'envoi", variant: "destructive" });
                  } finally {
                    setSendingEmail(false);
                  }
                }}
              >
                {sendingEmail
                  ? "Envoi en cours..."
                  : selectedIds.size > 0
                  ? `📧 Envoyer à ${selectedIds.size} user(s)`
                  : emailSegment.length > 0
                  ? `📧 Envoyer aux ${emailSegment.join(", ")}`
                  : "📧 Envoyer à tous"}
              </Button>
            </div>

            {/* Result */}
            {emailResult && (
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm">
                ✅ <strong>{emailResult.sent}</strong> envoyé{emailResult.sent > 1 ? "s" : ""} sur {emailResult.total}
                {emailResult.failed > 0 && <span className="text-red-600 ml-2">({emailResult.failed} échec{emailResult.failed > 1 ? "s" : ""})</span>}
              </div>
            )}

            {/* Preview */}
            {emailPreviewHtml && (
              <div className="mt-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Prévisualisation :</div>
                <div className="border rounded-lg overflow-hidden bg-gray-50">
                  <iframe
                    srcDoc={emailPreviewHtml}
                    title="Email preview"
                    className="w-full border-0"
                    style={{ minHeight: 500 }}
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-base font-semibold">Utilisateurs</div>
            <div className="text-sm text-muted-foreground">
              Modifier le plan d&apos;un user met à jour{" "}
              <span className="font-mono">profiles.plan</span> + crédits IA.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher par email..."
              className="w-full sm:w-72"
            />
            <Button onClick={loadUsers} disabled={loading}>
              {loading ? "Chargement..." : "Rafraichir"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCreateForm((v) => !v)}
            >
              {showCreateForm ? "Annuler" : "+ Créer user"}
            </Button>
          </div>
        </div>

        {/* Plan filter tabs */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={planFilter === ALL_PLANS_FILTER ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setPlanFilter(ALL_PLANS_FILTER)}
          >
            Tous ({users.length})
          </Button>
          {PLANS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={planFilter === p ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setPlanFilter(p)}
            >
              {p} ({planCounts[p] ?? 0})
            </Button>
          ))}
        </div>

        {showCreateForm && (
          <div className="mt-4 border-t pt-4 space-y-3">
            <div className="text-sm font-medium">Créer un utilisateur manuellement</div>
            <div className="text-xs text-muted-foreground">
              Crée le compte Supabase + profil + envoie un magic link de connexion.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
              <div className="sm:col-span-2">
                <Input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="Email de l'acheteur *"
                />
              </div>
              <Input
                value={createFirstName}
                onChange={(e) => setCreateFirstName(e.target.value)}
                placeholder="Prénom (optionnel)"
              />
              <Input
                value={createLastName}
                onChange={(e) => setCreateLastName(e.target.value)}
                placeholder="Nom (optionnel)"
              />
              <Select value={createPlan} onValueChange={setCreatePlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={createUser} disabled={creating || !createEmail.trim()}>
                {creating ? "Création..." : "Créer et envoyer magic link"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Card className="p-3 border-primary/50 bg-primary/5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium">
              {selectedIds.size} utilisateur(s) sélectionné(s)
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkDialog("plan")}
              >
                Changer le plan
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkDialog("credits")}
              >
                Ajouter crédits bonus
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Désélectionner
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {filteredUsers.length} user(s)
            {planFilter !== ALL_PLANS_FILTER && (
              <span className="ml-1">
                (filtre : <span className="font-medium">{planFilter}</span>)
              </span>
            )}
          </div>
          <Badge variant="secondary" className="font-normal">
            Admin: {adminEmail}
          </Badge>
        </div>

        <div className="p-4 overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allFilteredSelected && filteredUsers.length > 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Tout sélectionner"
                  />
                </TableHead>
                <TableHead
                  className="min-w-[180px] cursor-pointer select-none"
                  onClick={() => handleSort("email")}
                >
                  Email{sortIndicator("email")}
                </TableHead>
                <TableHead
                  className="min-w-[120px] cursor-pointer select-none"
                  onClick={() => handleSort("plan")}
                >
                  Plan{sortIndicator("plan")}
                </TableHead>
                <TableHead className="min-w-[140px]">Crédits IA</TableHead>
                <TableHead
                  className="min-w-[110px] cursor-pointer select-none hidden sm:table-cell"
                  onClick={() => handleSort("last_sign_in_at")}
                >
                  Dernière co.{sortIndicator("last_sign_in_at")}
                </TableHead>
                <TableHead
                  className="min-w-[110px] cursor-pointer select-none hidden md:table-cell"
                  onClick={() => handleSort("updated_at")}
                >
                  Updated{sortIndicator("updated_at")}
                </TableHead>
                <TableHead className="min-w-[100px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredUsers.map((u) => {
                const current = (u.plan ?? "free").toLowerCase();
                const draft = (draftPlanById[u.id] ?? current).toLowerCase();
                const dirty = draft !== current;
                const credits = creditsById[u.id];
                const isLoadingCredits = loadingCreditsId === u.id;
                const isSelected = selectedIds.has(u.id);

                return (
                  <TableRow
                    key={u.id}
                    className={isSelected ? "bg-primary/5" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(u.id)}
                        aria-label={`Sélectionner ${u.email}`}
                      />
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col">
                        <div className="font-medium text-sm">{u.email ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {u.id.slice(0, 8)}...
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={draft}
                          onValueChange={(v) =>
                            setDraftPlanById((prev) => ({ ...prev, [u.id]: v }))
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Plan" />
                          </SelectTrigger>
                          <SelectContent>
                            {PLANS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {dirty ? (
                          <Badge>modifié</Badge>
                        ) : (
                          <Badge variant="secondary">ok</Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {credits ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {credits.monthly_remaining} / {credits.monthly_credits_total}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Utilisés : {credits.monthly_credits_used}
                            {credits.bonus_credits_total > 0 && (
                              <span className="ml-1">
                                | Bonus : {credits.bonus_remaining}/{credits.bonus_credits_total}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={isLoadingCredits}
                          onClick={() => loadCredits(u.id)}
                        >
                          {isLoadingCredits ? "..." : "Voir crédits"}
                        </Button>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                      <span title={fmtDate(u.last_sign_in_at)}>
                        {fmtDateShort(u.last_sign_in_at)}
                      </span>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                      {fmtDate(u.updated_at)}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => savePlan(u)}
                        disabled={savingId === u.id || loading || !dirty}
                      >
                        {savingId === u.id ? "Envoi..." : "Appliquer"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    Aucun utilisateur trouvé.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Bulk plan change dialog */}
      <Dialog open={bulkDialog === "plan"} onOpenChange={(open) => !open && setBulkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le plan en masse</DialogTitle>
            <DialogDescription>
              Appliquer un nouveau plan à {selectedIds.size} utilisateur(s) sélectionné(s).
              Les crédits seront automatiquement recalculés.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={bulkPlan} onValueChange={setBulkPlan}>
              <SelectTrigger>
                <SelectValue placeholder="Nouveau plan" />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)}>
              Annuler
            </Button>
            <Button onClick={executeBulkAction} disabled={bulkLoading}>
              {bulkLoading
                ? "En cours..."
                : `Appliquer "${bulkPlan}" à ${selectedIds.size} user(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk bonus credits dialog */}
      <Dialog open={bulkDialog === "credits"} onOpenChange={(open) => !open && setBulkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter des crédits bonus</DialogTitle>
            <DialogDescription>
              Ajouter des crédits bonus à {selectedIds.size} utilisateur(s) sélectionné(s).
              Ces crédits s&apos;ajoutent au quota mensuel.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="number"
              min={1}
              value={bulkCredits}
              onChange={(e) => setBulkCredits(e.target.value)}
              placeholder="Nombre de crédits bonus"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)}>
              Annuler
            </Button>
            <Button onClick={executeBulkAction} disabled={bulkLoading}>
              {bulkLoading
                ? "En cours..."
                : `Ajouter ${bulkCredits} crédits à ${selectedIds.size} user(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
