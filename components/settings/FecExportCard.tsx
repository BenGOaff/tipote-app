"use client";

// FecExportCard — card visible uniquement pour les SASU. Permet à
// l'user de télécharger son FEC (Fichier des Écritures Comptables)
// au format légal (article A47 A-1 du LPF) sur la période choisie,
// par défaut son exercice fiscal en cours.
//
// Format du fichier : `<SIREN>FEC<AAAAMMJJ>.txt` (encoding UTF-8,
// 18 colonnes pipe-separées). Cf. lib/compta/fecExport.ts pour la
// construction réelle. Cette card est juste un wrapper UI.
//
// Bandeau d'avertissement permanent : on rappelle que Tipote ne
// produit qu'un FEC partiel (ventes uniquement, pas d'achats /
// charges / paie) — le comptable doit y agréger ses propres
// écritures avant tout dépôt à l'admin fiscale.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, FileText, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function ymdNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function startOfYearYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-01-01`;
}

interface Props {
  /** SIREN configuré ? Si pas, on désactive le bouton + on dit pourquoi. */
  hasSiren: boolean;
}

export function FecExportCard({ hasSiren }: Props) {
  const t = useTranslations("compta");
  const [from, setFrom] = useState<string>(startOfYearYmd());
  const [to, setTo] = useState<string>(ymdNow());
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!hasSiren) {
      toast.error(t("fecMissingSiren"));
      return;
    }
    if (from > to) {
      toast.error(t("fecDateRangeError"));
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch(`/api/compta/fec-export?from=${from}&to=${to}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Erreur HTTP ${res.status}`);
      }
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? `FEC-${to}.txt`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const entries = res.headers.get("X-Tipote-FEC-Entries") ?? "?";
      toast.success(t("fecDownloaded", { entries }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("fecDownloadFailed"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold">{t("fecTitle")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("fecDescription")}
          </p>
        </div>
      </div>

      {/* Avertissement clair sur la portée du FEC produit ici */}
      <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          {t("fecScopeWarning")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fec-from">{t("fecDateFrom")}</Label>
          <input
            id="fec-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fec-to">{t("fecDateTo")}</Label>
          <input
            id="fec-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {!hasSiren ? (
        <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          {t("fecSirenRequired")}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleDownload}
          disabled={!hasSiren || downloading}
        >
          {downloading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("fecPreparing")}
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              {t("fecDownload")}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
