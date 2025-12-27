"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "@/components/ui/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { MoreVertical, Trash2, Copy, Pencil, Calendar, CalendarX } from "lucide-react";

type Props = {
  id: string;
  title?: string | null;
  status?: string | null;
  scheduledDate?: string | null; // YYYY-MM-DD
};

type ApiResponse = { ok: true; id?: string | null } | { ok: false; error?: string; code?: string };

export function ContentItemActions({ id, title, status, scheduledDate }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"delete" | "duplicate" | "plan" | "unplan" | null>(null);

  const [planOpen, setPlanOpen] = React.useState(false);
  const [planDate, setPlanDate] = React.useState<string>(scheduledDate ?? "");
  const planInputId = React.useMemo(() => `plan-date-${id}`, [id]);

  const normalizedStatus = (status ?? "").toLowerCase().trim();
  const isPlanned = normalizedStatus === "scheduled" || normalizedStatus === "planned";

  React.useEffect(() => {
    if (planOpen) setPlanDate(scheduledDate ?? "");
  }, [planOpen, scheduledDate]);

  const onDuplicate = async () => {
    setBusy("duplicate");
    try {
      const res = await fetch(`/api/content/${id}/duplicate`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;

      if (!res.ok || json?.ok === false) {
        toast({
          title: "Duplication impossible",
          description: (json as any)?.error ?? "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      const newId = (json as any)?.id as string | undefined;
      toast({ title: "Dupliqué ✅", description: "Le contenu a été dupliqué en brouillon." });

      if (newId) {
        router.push(`/contents/${newId}`);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (e) {
      toast({
        title: "Duplication impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    setBusy("delete");
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;

      if (!res.ok || json?.ok === false) {
        toast({
          title: "Suppression impossible",
          description: (json as any)?.error ?? "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Supprimé ✅", description: "Le contenu a été supprimé." });
      router.refresh();
    } catch (e) {
      toast({
        title: "Suppression impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onPlan = async () => {
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
      const res = await fetch(`/api/content/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduledDate: planDate,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;

      if (!res.ok || json?.ok === false) {
        toast({
          title: "Planification impossible",
          description: (json as any)?.error ?? "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Planifié ✅", description: "La date de publication a été enregistrée." });
      setPlanOpen(false);
      router.refresh();
    } catch (e) {
      toast({
        title: "Planification impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onUnplan = async () => {
    setBusy("unplan");
    try {
      const res = await fetch(`/api/content/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "draft",
          scheduledDate: null,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;

      if (!res.ok || json?.ok === false) {
        toast({
          title: "Déplanification impossible",
          description: (json as any)?.error ?? "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Déplanifié ✅", description: "Le contenu repasse en brouillon." });
      router.refresh();
    } catch (e) {
      toast({
        title: "Déplanification impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const planLabel = isPlanned && scheduledDate ? "Modifier date" : "Planifier";

  return (
    <>
      {/* Dialog planification (séparé du dialog suppression pour éviter les conflits de focus) */}
      <AlertDialog open={planOpen} onOpenChange={setPlanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Planifier ce contenu</AlertDialogTitle>
            <AlertDialogDescription>
              Choisis une date de publication. Le statut sera automatiquement mis sur “Planifié”.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor={planInputId}>Date</Label>
            <Input id={planInputId} type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "plan"}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onPlan();
              }}
              disabled={busy === "plan"}
            >
              {busy === "plan" ? "Planification…" : "Enregistrer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog suppression + menu actions */}
      <AlertDialog>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions" disabled={busy !== null}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/contents/${id}`} className="flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                Voir / éditer
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setPlanOpen(true);
              }}
              className="flex items-center gap-2"
              disabled={busy !== null}
            >
              <Calendar className="w-4 h-4" />
              {planLabel}
            </DropdownMenuItem>

            {isPlanned ? (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void onUnplan();
                }}
                className="flex items-center gap-2"
                disabled={busy !== null}
              >
                <CalendarX className="w-4 h-4" />
                {busy === "unplan" ? "Déplanification…" : "Déplanifier"}
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void onDuplicate();
              }}
              className="flex items-center gap-2"
              disabled={busy !== null}
            >
              <Copy className="w-4 h-4" />
              {busy === "duplicate" ? "Duplication…" : "Dupliquer"}
            </DropdownMenuItem>

            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="flex items-center gap-2 text-rose-600 focus:text-rose-600"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer
              </DropdownMenuItem>
            </AlertDialogTrigger>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce contenu ?</AlertDialogTitle>
            <AlertDialogDescription>
              {title?.trim()
                ? `“${title.trim()}” sera supprimé définitivement. Cette action est irréversible.`
                : "Ce contenu sera supprimé définitivement. Cette action est irréversible."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onDelete();
              }}
              className="bg-rose-600 hover:bg-rose-700"
              disabled={busy === "delete"}
            >
              {busy === "delete" ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
