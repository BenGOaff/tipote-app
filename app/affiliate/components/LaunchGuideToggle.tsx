"use client";

// Bouton client pour marquer une étape self-attestée du guide de
// lancement comme faite. Refresh la page après pour mettre à jour
// le state côté serveur (les autres steps auto-détectées suivent).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDict } from "../i18n/context";

type Props = {
  step: "link_copied" | "first_email" | "first_post" | "payment_set";
  done: boolean;
};

export function LaunchGuideToggle({ step, done }: Props) {
  const t = useDict();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      await fetch("/affiliate/api/guide", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, done: !done }),
      });
      router.refresh();
    } catch {
      // best effort
    }
    setLoading(false);
  }

  return (
    <Button
      variant={done ? "ghost" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={loading}
      className="text-xs h-7"
    >
      {done ? (
        t.overview.guide_mark_undone
      ) : (
        <>
          <Check className="h-3.5 w-3.5 mr-1.5" />
          {t.overview.guide_mark_done}
        </>
      )}
    </Button>
  );
}
