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
import { useDict } from "../i18n/context";
import { interpolate } from "../i18n";

export function TrialActivateButton({ email }: { email: string }) {
  const t = useDict();
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
          setError(data.message ?? t.trial.err_already_paid);
        } else if (data.reason === "already_activated") {
          setError(t.trial.err_already_activated);
        } else {
          setError(t.trial.err_generic);
        }
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError(t.trial.err_network);
      setLoading(false);
    }
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="lg" className="w-full">
            {t.trial.activate_button}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.trial.activate_modal_title}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {interpolate(t.trial.activate_modal_body_1, { email })}
              </span>
              <span className="block">
                {t.trial.activate_modal_body_2}
              </span>
              <span className="block text-amber-700 dark:text-amber-300 flex gap-2 mt-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{t.trial.activate_modal_warning}</span>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>{t.trial.activate_modal_cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleActivate} disabled={loading}>
              {loading ? t.trial.activate_loading : t.trial.activate_modal_confirm}
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
