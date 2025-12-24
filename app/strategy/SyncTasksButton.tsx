// app/strategy/SyncTasksButton.tsx

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Props = {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  after?: "refresh" | "goTasks";
};

export default function SyncTasksButton({
  className,
  variant = "default",
  size = "default",
  after = "refresh",
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      className={className}
      variant={variant}
      size={size}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const res = await fetch("/api/tasks/sync", { method: "POST" });
            const json = (await res.json().catch(() => null)) as
              | { ok?: boolean; inserted?: number; error?: string }
              | null;

            if (!res.ok || !json?.ok) {
              toast({
                title: "Sync impossible",
                description: json?.error || "Une erreur est survenue.",
                variant: "destructive",
              });
              return;
            }

            toast({
              title: "Tâches synchronisées",
              description:
                typeof json.inserted === "number"
                  ? `${json.inserted} tâche(s) ajoutée(s) depuis votre plan.`
                  : "Synchronisation terminée.",
            });

            if (after === "goTasks") {
              router.push("/tasks");
              return;
            }

            router.refresh();
          } catch (e) {
            toast({
              title: "Sync impossible",
              description: e instanceof Error ? e.message : "Une erreur est survenue.",
              variant: "destructive",
            });
          }
        });
      }}
    >
      {pending ? "Synchronisation…" : "Synchroniser mes tâches"}
    </Button>
  );
}
