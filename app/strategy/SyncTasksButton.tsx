// app/strategy/SyncTasksButton.tsx

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("syncTasks");
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
                title: t("syncImpossible"),
                description: json?.error || t("genericError"),
                variant: "destructive",
              });
              return;
            }

            toast({
              title: t("tasksSynced"),
              description:
                typeof json.inserted === "number"
                  ? t("tasksSyncedDesc", { n: json.inserted })
                  : t("syncDone"),
            });

            if (after === "goTasks") {
              router.push("/tasks");
              return;
            }

            router.refresh();
          } catch (e) {
            toast({
              title: t("syncImpossible"),
              description: e instanceof Error ? e.message : t("genericError"),
              variant: "destructive",
            });
          }
        });
      }}
    >
      {pending ? t("syncing") : t("syncButton")}
    </Button>
  );
}
