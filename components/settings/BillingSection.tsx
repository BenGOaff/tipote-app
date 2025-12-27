// components/settings/BillingSection.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Props = {
  email: string;
};

type SubscriptionPayload = {
  contactId?: number | string | null;
  profile?: {
    id?: string;
    email?: string | null;
    first_name?: string | null;
    locale?: string | null;
    plan?: string | null;
    sio_contact_id?: string | null;
    product_id?: string | null;
    [key: string]: unknown;
  } | null;
  subscriptions?: any[];
  activeSubscription?: any | null;
  latestSubscription?: any | null;
  error?: string;
};

function safeString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

function statusLabel(status: string) {
  const s = status.trim().toLowerCase();
  if (!s) return "—";
  if (s === "active") return "Actif";
  if (s === "trialing") return "Essai";
  if (s === "paid") return "Payé";
  if (s === "canceled" || s === "cancelled") return "Annulé";
  if (s === "refunded") return "Remboursé";
  return status;
}

function formatMaybeDate(v: unknown): string | null {
  const s = safeString(v).trim();
  if (!s) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const dt = new Date(`${s}T00:00:00.000Z`);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    }
  }

  // ISO
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }

  // parfois timestamp (sec ou ms)
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 0) {
    const dt2 = new Date(asNum * (asNum > 10_000_000_000 ? 1 : 1000));
    if (!Number.isNaN(dt2.getTime())) {
      return dt2.toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    }
  }

  return null;
}

function pickNextBillingDate(sub: any): string | null {
  if (!sub) return null;
  return (
    formatMaybeDate(sub.currentPeriodEnd) ||
    formatMaybeDate(sub.current_period_end) ||
    formatMaybeDate(sub.nextBillingAt) ||
    formatMaybeDate(sub.next_billing_at) ||
    formatMaybeDate(sub.endsAt) ||
    formatMaybeDate(sub.ends_at) ||
    formatMaybeDate(sub.renewalDate) ||
    formatMaybeDate(sub.renewal_date) ||
    null
  );
}

export default function BillingSection({ email }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<SubscriptionPayload | null>(null);

  const activeSub = data?.activeSubscription ?? null;
  const latestSub = data?.latestSubscription ?? null;
  const sub = activeSub || latestSub;

  const planName = useMemo(() => {
    const fromProfile = safeString(data?.profile?.plan);
    if (fromProfile) return fromProfile;

    const maybeProduct =
      safeString(sub?.product?.name) ||
      safeString(sub?.productName) ||
      safeString(sub?.product_name) ||
      safeString(sub?.productId) ||
      safeString(sub?.product_id) ||
      safeString(data?.profile?.product_id);

    return maybeProduct || "—";
  }, [data?.profile?.plan, data?.profile?.product_id, sub]);

  const status = useMemo(() => {
    const s = safeString(sub?.status);
    return s || "—";
  }, [sub]);

  const nextBilling = useMemo(() => pickNextBillingDate(sub), [sub]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const json = (await res.json().catch(() => null)) as SubscriptionPayload | null;

      if (!res.ok || !json || json.error) {
        setData(json);
        toast({
          title: "Impossible de charger l'abonnement",
          description: json?.error || "Une erreur est survenue.",
          variant: "destructive",
        });
        return;
      }

      setData(json);
    } catch (e) {
      toast({
        title: "Impossible de charger l'abonnement",
        description: e instanceof Error ? e.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!res.ok || !json?.ok) {
        toast({
          title: "Vérification impossible",
          description: json?.error || "Impossible de vérifier l’abonnement.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Abonnement synchronisé ✅",
        description: "Votre plan Tipote a été mis à jour.",
      });

      await refresh();
    } catch (e) {
      toast({
        title: "Vérification impossible",
        description: e instanceof Error ? e.message : "Impossible de vérifier l’abonnement.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function cancel(cancelMode: "Now" | "WhenBillingCycleEnds") {
    const subscriptionId =
      safeString(sub?.id) || safeString(sub?.subscription_id) || safeString(sub?.subscriptionId);

    if (!subscriptionId) {
      toast({
        title: "Annulation impossible",
        description: "Aucun ID d'abonnement détecté.",
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/billing/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscriptionId,
            mode: cancelMode,
          }),
        });

        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

        if (!res.ok || !json?.ok) {
          toast({
            title: "Annulation impossible",
            description: json?.error || "Une erreur est survenue.",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Demande d'annulation envoyée",
          description:
            cancelMode === "Now"
              ? "Votre abonnement est en cours d'annulation immédiate."
              : "Votre abonnement sera annulé à la fin du cycle.",
        });

        await refresh();
      } catch (e) {
        toast({
          title: "Annulation impossible",
          description: e instanceof Error ? e.message : "Une erreur est survenue.",
          variant: "destructive",
        });
      }
    });
  }

  const canCancel =
    !!sub && ["active", "trialing", "paid"].includes(safeString(sub?.status).toLowerCase());

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">Abonnement</h3>
          <p className="text-xs text-slate-500">Statut et gestion de votre abonnement Tipote.</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading || pending}>
            {loading ? "Chargement…" : "Rafraîchir"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => syncNow()} disabled={loading || pending || syncing}>
            {syncing ? "Vérification…" : "J’ai déjà payé"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Plan</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{loading ? "…" : planName}</p>
          <p className="mt-1 text-[11px] text-slate-500">{email}</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Statut</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="secondary">{loading ? "…" : statusLabel(status)}</Badge>
            {data?.contactId ? (
              <span className="text-[11px] text-slate-500">Contact #{safeString(data.contactId)}</span>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {loading ? "—" : activeSub ? "Abonnement actif détecté." : "Dernier abonnement affiché."}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Prochain renouvellement</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{loading ? "…" : nextBilling || "—"}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            Si la date n’apparaît pas, c’est que Systeme.io ne la renvoie pas sur votre abonnement.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-slate-200 p-4 space-y-2">
        <p className="text-xs text-slate-600">
          Gestion : si vous voulez changer de plan, passez par la page d’abonnement (Systeme.io) ou contactez le support.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-xl">
              ID subscription: {safeString(sub?.id) || safeString(sub?.subscription_id) || safeString(sub?.subscriptionId) || "—"}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancel("WhenBillingCycleEnds")}
              disabled={!canCancel || pending}
            >
              Annuler fin de cycle
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => cancel("Now")}
              disabled={!canCancel || pending}
            >
              Annuler maintenant
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
