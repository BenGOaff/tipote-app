"use client";

// Manual "Synchroniser Systeme.io" button on the analytics page.
//
// Triggers POST /api/analytics/sio-sync which pulls SIO sales for the
// active project, matches them to user offers, and upserts into
// offer_metrics. The daily cron does the same thing — this button is
// for users who want fresh numbers right now (e.g. just made a sale,
// wants it on the dashboard).
//
// Surfaces a structured summary toast :
//   "12 ventes · 1 247 € sur 4 offres. 1 vente non liée à une offre."
// so the user knows when manual matching might be needed.

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  onSynced?: () => void;
  size?: "default" | "sm";
}

export function SioSyncButton({ onSynced, size = "sm" }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const res = await fetch("/api/analytics/sio-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const msg =
          (typeof json?.error === "string" && json.error) ||
          `HTTP ${res.status}`;
        toast.error(`Synchronisation impossible : ${msg}`);
        return;
      }
      const sales = Number(json.salesPulled ?? 0);
      const revenue = Number(json.totalRevenue ?? 0);
      const rows = Number(json.rowsTouched ?? 0);
      const unmatched = Number(json.unmatchedCount ?? 0);
      const lines = [
        `${sales} vente${sales > 1 ? "s" : ""} · ${revenue.toLocaleString("fr-FR")} € sur ${rows} offre${rows > 1 ? "s" : ""}.`,
      ];
      if (unmatched > 0) {
        lines.push(
          `${unmatched} vente${unmatched > 1 ? "s" : ""} non liée${unmatched > 1 ? "s" : ""} à une offre — ouvre Settings → Mes offres pour les binder à un produit Systeme.io.`,
        );
      }
      toast.success(lines.join(" "));
      onSynced?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur réseau";
      toast.error(`Synchronisation impossible : ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      onClick={handleClick}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin mr-1.5" />
      ) : (
        <RefreshCw className="size-4 mr-1.5" />
      )}
      {busy ? "Synchronisation…" : "Synchroniser Systeme.io"}
    </Button>
  );
}
