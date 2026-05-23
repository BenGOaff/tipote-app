"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RestartTourButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      // Reset le flag onboarded_at côté DB pour que le tour se
      // relance au prochain chargement de l'overview.
      await fetch("/affiliate/api/onboarded", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      setDone(true);
      // Redirige vers l'overview où le tour va se déclencher
      setTimeout(() => router.push("/"), 600);
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={loading || done}>
      {done ? (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
          Redirection…
        </>
      ) : (
        <>
          <PlayCircle className="mr-2 h-4 w-4" />
          {loading ? "Préparation…" : "Refaire le tour guidé"}
        </>
      )}
    </Button>
  );
}
