// components/admin/AdminUsersPageClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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

const PLANS = ["free", "basic", "pro", "elite"] as const;

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

  const filteredUsers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => (u.email ?? "").toLowerCase().includes(needle));
  }, [q, users]);

  async function loadUsers() {
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
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="text-base font-semibold">Utilisateurs</div>
            <div className="text-sm text-muted-foreground">
              Modifier le plan d’un user met à jour{" "}
              <span className="font-mono">profiles.plan</span>.
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
          </div>
        </div>
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

        <div className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[320px]">Email</TableHead>
                <TableHead className="w-[160px]">Plan</TableHead>
                <TableHead className="w-[220px]">Updated</TableHead>
                <TableHead className="w-[140px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredUsers.map((u) => {
                const current = (u.plan ?? "free").toLowerCase();
                const draft = (draftPlanById[u.id] ?? current).toLowerCase();
                const dirty = draft !== current;

                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="font-medium">{u.email ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {u.id}
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

                    <TableCell className="text-sm text-muted-foreground">
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
                    colSpan={4}
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
