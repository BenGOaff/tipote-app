"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "@/components/ui/use-toast";

import { Button } from "@/components/ui/button";
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

import { MoreVertical, Trash2, Copy, Pencil } from "lucide-react";

type Props = {
  id: string;
  title?: string | null;
};

export function ContentItemActions({ id, title }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"delete" | "duplicate" | null>(null);

  const onDuplicate = async () => {
    setBusy("duplicate");
    try {
      const res = await fetch(`/api/content/${id}/duplicate`, { method: "POST" });
      const json = (await res.json()) as { ok: boolean; id?: string | null; error?: string };

      if (!json.ok) {
        toast({ title: "Duplication impossible", description: json.error ?? "Erreur inconnue", variant: "destructive" });
        return;
      }

      toast({ title: "Dupliqué ✅", description: "Le contenu a été dupliqué en brouillon." });

      if (json.id) {
        router.push(`/contents/${json.id}`);
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
      const json = (await res.json()) as { ok: boolean; error?: string };

      if (!json.ok) {
        toast({ title: "Suppression impossible", description: json.error ?? "Erreur inconnue", variant: "destructive" });
        return;
      }

      toast({ title: "Supprimé ✅", description: "Le contenu a été supprimé." });
      router.push("/contents");
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

  return (
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
              void onDuplicate();
            }}
            className="flex items-center gap-2"
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
  );
}
