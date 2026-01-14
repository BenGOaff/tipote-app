// components/settings/BillingSection.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
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

type PlanKey = "free" | "basic" | "essential" | "elite";

function safeString(v: unknown) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizePlan(planName: string | null | undefined): PlanKey {
  const s = (planName ?? "").trim().toLowerCase();

  if (!s) return "free";
  if (s.includes("elite")) return "elite";
  if (s.includes("essential")) return "essential";
  if (s.includes("basic")) return "basic";
  if (s.includes("free") || s.includes("gratuit")) return "free";

  return "free";
}

function isAnnualSubscription(sub: any): boolean {
  const raw =
    safeString(sub?.interval) ||
    safeString(sub?.billing_interval) ||
    safeString(sub?.billingInterval) ||
    safeString(sub?.offer_price_plan?.interval) ||
    safeString(sub?.offerPricePlan?.interval) ||
    safeString(sub?.offer_price_plan?.name) ||
    safeString(sub?.offerPricePlan?.name) ||
    safeString(sub?.product?.name) ||
    safeString(sub?.productName) ||
    safeString(sub?.product_name) ||
    null;

  const s = (raw ?? "").toLowerCase();
  if (!s) return false;

  if (s.includes("year") || s.includes("annual") || s.includes("annuel") || s.includes("année"))
    return true;
  if (s.includes("month") || s.includes("mensuel") || s.includes("mois")) return false;

  return false;
}

function planMeta(plan: PlanKey) {
  switch (plan) {
    case "basic":
      return { label: "Basic", price: 19, desc: "1 module • Content Hub" };
    case "essential":
      return { label: "Essential", price: 49, desc: "3 modules • Coach IA • Content Hub" };
    case "elite":
      return { label: "Elite", price: 99, desc: "Modules illimités • Support prioritaire" };
    default:
      return { label: "Free", price: 0, desc: "Accès limité" };
  }
}

const ORDER_FORMS = {
  basic: {
    monthly: "https://www.tipote.com/tipote-basic-mensuel",
    annual: "https://www.tipote.com/tipote-basic-annuel",
  },
  essential: {
    monthly: "https://www.tipote.com/tipote-essential-mensuel",
    annual: "https://www.tipote.com/tipote-essential-annuel",
  },
  elite: {
    monthly: "https://www.tipote.com/tipote-elite-mensuel",
    annual: "https://www.tipote.com/tipote-elite-annuel",
  },
} as const;

export default function BillingSection({ email }: Props) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
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

    return maybeProduct || "free";
  }, [data?.profile?.plan, data?.profile?.product_id, sub]);

  const currentPlan = useMemo<PlanKey>(() => normalizePlan(planName), [planName]);
  const isAnnual = useMemo(() => isAnnualSubscription(sub), [sub]);
  const currentMeta = useMemo(() => planMeta(currentPlan), [currentPlan]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/billing/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const json = (await res.json().catch(() => null)) as any;
        if (cancelled) return;

        if (!res.ok || !json) throw new Error("Erreur de récupération de l'abonnement");
        if (json?.error) throw new Error(String(json.error));

        setData(json as SubscriptionPayload);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Impossible de charger l'abonnement",
            description: e instanceof Error ? e.message : "Une erreur est survenue.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (email) load();
    return () => {
      cancelled = true;
    };
  }, [email, toast]);

  const openOrderForm = (plan: "basic" | "essential" | "elite") => {
    const url = isAnnual ? ORDER_FORMS[plan].annual : ORDER_FORMS[plan].monthly;
    window.location.href = url;
  };

  const basicIsCurrent = currentPlan === "basic";
  const essentialIsCurrent = currentPlan === "essential";
  const eliteIsCurrent = currentPlan === "elite";

  const basicCta = "Downgrader";
  const essentialCta = currentPlan === "elite" ? "Downgrader" : "Upgrader";
  const eliteCta = "Upgrader";

  return (
    <>
      <Card className="p-6 gradient-hero border-border/50">
        <div className="flex items-start justify-between">
          <div>
            <Badge className="mb-2 bg-background/20 text-primary-foreground">Plan actuel</Badge>
            <h2 className="text-2xl font-bold text-primary-foreground mb-1">
              {loading ? "—" : currentMeta.label}
            </h2>
            <p className="text-primary-foreground/80">
              {loading ? "Chargement…" : currentMeta.desc}
            </p>
          </div>
          <p className="text-3xl font-bold text-primary-foreground">
            {loading ? "—" : `${currentMeta.price}€`}
            <span className="text-lg font-normal">/mois</span>
          </p>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Basic */}
        <Card className={basicIsCurrent ? "p-6 border-2 border-primary relative" : "p-6"}>
          {basicIsCurrent ? (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
              Actuel
            </Badge>
          ) : null}

          <h3 className="font-bold text-lg mb-2">Basic</h3>
          <p className="text-3xl font-bold mb-4">
            19€<span className="text-sm font-normal text-muted-foreground">/mois</span>
          </p>

          <ul className="space-y-2 text-sm mb-6">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Plan stratégique IA
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              1 module activable
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Contenus illimités
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Content Hub + Calendrier
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <Lock className="w-4 h-4" />
              Pas de coach IA
            </li>
          </ul>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => openOrderForm("basic")}
            disabled={loading || basicIsCurrent}
          >
            {basicIsCurrent ? "Plan actuel" : basicCta}
          </Button>
        </Card>

        {/* Essential */}
        <Card className={essentialIsCurrent ? "p-6 border-2 border-primary relative" : "p-6"}>
          {essentialIsCurrent ? (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
              Actuel
            </Badge>
          ) : null}

          <h3 className="font-bold text-lg mb-2">Essential</h3>
          <p className="text-3xl font-bold mb-4">
            49€<span className="text-sm font-normal text-muted-foreground">/mois</span>
          </p>

          <ul className="space-y-2 text-sm mb-6">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Plan stratégique IA
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              3 modules activables
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Contenus illimités
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Content Hub + Calendrier
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Coach IA
            </li>
          </ul>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => openOrderForm("essential")}
            disabled={loading || essentialIsCurrent}
          >
            {essentialIsCurrent ? "Plan actuel" : essentialCta}
          </Button>
        </Card>

        {/* Elite */}
        <Card className={eliteIsCurrent ? "p-6 border-2 border-primary relative" : "p-6"}>
          {eliteIsCurrent ? (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
              Actuel
            </Badge>
          ) : null}

          <h3 className="font-bold text-lg mb-2">Elite</h3>
          <p className="text-3xl font-bold mb-4">
            99€<span className="text-sm font-normal text-muted-foreground">/mois</span>
          </p>

          <ul className="space-y-2 text-sm mb-6">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Tout Essential +
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Modules illimités
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Accès nouveautés en avant-première
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Automatisations n8n (V2)
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Support prioritaire
            </li>
          </ul>

          <Button
            variant="hero"
            className="w-full"
            onClick={() => openOrderForm("elite")}
            disabled={loading || eliteIsCurrent}
          >
            {eliteIsCurrent ? "Plan actuel" : eliteCta}
          </Button>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Gérer votre abonnement</p>
            <p className="text-sm text-muted-foreground">
              Modifier, upgrader ou annuler via Systeme.io
            </p>
          </div>

          <Button variant="outline" asChild>
            <a href="https://systeme.io" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Gérer sur Systeme.io
            </a>
          </Button>
        </div>
      </Card>
    </>
  );
}
