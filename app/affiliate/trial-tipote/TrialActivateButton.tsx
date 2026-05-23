"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AlertTriangle } from "lucide-react";
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
import { Button } from "@/components/ui/button";

export function TrialActivateButton({ email }: { email: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/affiliate/api/trial/activate", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.reason === "already_paid_user") {
          setError(data.message ?? "Tu as déjà un compte Tipote payant.");
        } else if (data.reason === "already_activated") {
          setError("Ton trial a déjà été activé. Reload la page.");
        } else {
          setError("Une erreur s'est produite. Réessaie ou contacte le support.");
        }
        setLoading(false);
        return;
      }
      // Reload côté server pour afficher le state "actif"
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
      setLoading(false);
    }
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="lg" className="w-full">
            Activer mon trial Tipote 1 mois
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activer ton trial Tipote ?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Tu vas débloquer <strong>30 jours d&apos;accès Elite gratuit</strong> à
                Tipote sur ton compte ({email}).
              </span>
              <span className="block">
                C&apos;est offert <strong>UNE seule fois</strong>. Tu ne peux pas
                réactiver plus tard.
              </span>
              <span className="block text-amber-700 dark:text-amber-300 flex gap-2 mt-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Si tu as déjà un compte Tipote payant, l&apos;activation sera
                  refusée pour ne pas écraser ton plan actuel.
                </span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate} disabled={loading}>
              {loading ? "Activation…" : "Oui, activer maintenant"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </>
  );
}
