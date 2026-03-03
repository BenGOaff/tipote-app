// components/admin/AdminUsersPageClient.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR");
}

export default function AdminUsersPageClient({ adminEmail }: { adminEmail: string }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [draftPlanById, setDraftPlanById] = useState<Record<string, string>>({});

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

  const filteredUsers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => (u.email ?? "").toLowerCase().includes(needle));
  }, [q, users]);

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

  return (
    <div className="space-y-4">
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
              placeholder="Rechercher par email…"
              className="w-full sm:w-72"
            />
            <Button onClick={loadUsers} disabled={loading}>
              {loading ? "Chargement…" : "Rafraîchir"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCreateForm((v) => !v)}
            >
              {showCreateForm ? "Annuler" : "+ Créer user"}
            </Button>
          </div>
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
                {creating ? "Création…" : "Créer et envoyer magic link"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {filteredUsers.length} user(s)
          </div>
          <Badge variant="secondary" className="font-normal">
            Admin: {adminEmail}
          </Badge>
        </div>

        <div className="p-4 overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Email</TableHead>
                <TableHead className="min-w-[120px]">Plan</TableHead>
                <TableHead className="min-w-[140px]">Crédits IA</TableHead>
                <TableHead className="min-w-[120px] hidden sm:table-cell">Updated</TableHead>
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

                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="font-medium text-sm">{u.email ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {u.id.slice(0, 8)}…
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
                          {isLoadingCredits ? "…" : "Voir crédits"}
                        </Button>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                      {fmtDate(u.updated_at)}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => savePlan(u)}
                        disabled={savingId === u.id || loading || !dirty}
                      >
                        {savingId === u.id ? "Envoi…" : "Appliquer"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
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
    </div>
  );
}
