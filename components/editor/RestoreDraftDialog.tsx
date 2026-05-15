"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Format a draft timestamp into a friendly French/English relative line
// (e.g. "il y a 12 minutes"). Falls back to a plain locale string for
// older drafts so the user always sees something readable.
function formatRelative(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  const fmt = new Intl.RelativeTimeFormat(locale || "fr", { numeric: "auto" });
  if (diffSec < 60) return fmt.format(-diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return fmt.format(-diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return fmt.format(-diffH, "hour");
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return fmt.format(-diffD, "day");
  try {
    return new Date(iso).toLocaleString(locale || "fr");
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function RestoreDraftDialog({
  open,
  draftUpdatedAt,
  savedUpdatedAt,
  loading,
  onRestore,
  onDiscard,
  locale,
}: {
  open: boolean;
  draftUpdatedAt: string | null;
  savedUpdatedAt: string | null;
  loading?: boolean;
  onRestore: () => void;
  onDiscard: () => void;
  locale?: string;
}) {
  const t = useTranslations("autosave");
  const draftWhen = draftUpdatedAt ? formatRelative(draftUpdatedAt, locale || "fr") : "";
  const savedWhen = savedUpdatedAt ? formatRelative(savedUpdatedAt, locale || "fr") : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDiscard(); }}>
      {/* Largeur généreuse : les libellés FR sont longs (~35 chars
          chacun) et la classe par défaut <Button> a whitespace-nowrap
          → on retient sm:max-w-lg + on relâche le wrap sur les
          boutons (whitespace-normal + h-auto + py-2.5) pour que tout
          tienne lisible sur 2 lignes max si besoin. */}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("dialogBody", { draftWhen, savedWhen })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={loading}
            onClick={onDiscard}
            className="whitespace-normal text-left h-auto py-2.5 leading-snug"
          >
            {t("discardBtn")}
          </Button>
          <Button
            disabled={loading}
            onClick={onRestore}
            className="gap-2 whitespace-normal text-left h-auto py-2.5 leading-snug"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
            {t("restoreBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
