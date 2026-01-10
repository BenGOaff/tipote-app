"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  enabled: boolean;
};

export default function AutoSyncTasks({ enabled }: Props) {
  const router = useRouter();
  const ranRef = useRef(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) return;
    if (ranRef.current) return;
    ranRef.current = true;

    startTransition(async () => {
      try {
        const res = await fetch("/api/tasks/sync", { method: "POST" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!res.ok || !json?.ok) return;

        // Re-fetch server props (project_tasks rempli)
        router.refresh();
      } catch {
        // no-op
      }
    });
  }, [enabled, router]);

  // Pas d'UI (zéro impact maquette Lovable)
  void pending;

  return null;
}
