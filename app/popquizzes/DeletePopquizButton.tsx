"use client";

// Petit composant client pour supprimer un popquiz depuis la liste
// /popquizzes. Confirmation native + appel DELETE /api/popquiz/[id]
// + refresh de la page (router.refresh()) pour mettre à jour la liste
// rendue server-side. Pattern aligné sur celui de /quizzes
// (handleDelete dans QuizzesClient.tsx).

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function DeletePopquizButton({
  popquizId,
  popquizTitle,
}: {
  popquizId: string;
  popquizTitle: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = window.confirm(
      `Supprimer le popquiz « ${popquizTitle || "(sans titre)"} » ?\n\n` +
        "La vidéo et les marqueurs (cues) seront supprimés. Les quiz référencés " +
        "restent intacts dans Mes projets. Cette action est définitive.",
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/popquiz/${popquizId}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({ ok: false }));
        if (!res.ok || !data.ok) {
          toast.error(data.error || "Suppression échouée");
          return;
        }
        toast.success("Popquiz supprimé");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur réseau");
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={pending}
      title="Supprimer ce popquiz"
      aria-label="Supprimer ce popquiz"
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  );
}
