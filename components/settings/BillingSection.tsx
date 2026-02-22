"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Lock, Coins, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

import { useCreditsBalance } from "@/lib/credits/useCreditsBalance";

type Props = {
  email: string;
};

type SubscriptionPayload = {
  contactId?: number | string | null;
  profile?: {
    id?: string;
    email?: string | null;
    first_name?: string | null;
    // Selon les versions, on peut avoir last_name OU surname (Systeme.io = surname)
    last_name?: string | null;
    surname?: string | null;

    // Adresse (selon ce que tu as déjà stocké côté profiles)
    street_address?: string | null;
    postcode?: string | null;
    city?: string | null;
    country?: string | null;

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

type PlanKey = "free" | "basic" | "pro" | "elite" | "essential" | "beta";

const CREDITS_PACK_URL = "https://www.tipote.com/pack-credits";

function safeString(v: unknown) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizePlan(planName: string | null | undefined): Exclude<PlanKey, "essential"> {
  const s = (planName ?? "").trim().toLowerCase();

  if (!s) return "free";
  if (s.includes("elite")) return "elite";
  if (s.includes("beta")) return "beta";
  if (s.includes("pro")) return "pro";
  if (s.includes("essential")) return "pro";
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

  if (s.includes("year") || s.includes("annual") || s.includes("annuel") || s.includes("année")) return true;
  if (s.includes("month") || s.includes("mensuel") || s.includes("mois")) return false;

  return false;
}

function planMeta(plan: Exclude<PlanKey, "essential">) {
  switch (plan) {
    case "basic":
      return { label: "Basic", price: 19, lifetime: false };
    case "beta":
      return { label: "Beta — Accès à vie", price: 0, lifetime: true };
    case "pro":
      return { label: "Pro", price: 49, lifetime: false };
    case "elite":
      return { label: "Elite", price: 99, lifetime: false };
    default:
      return { label: "Free", price: 0, lifetime: false };
  }
}

const ORDER_FORMS = {
  basic: {
    monthly: "https://www.tipote.com/tipote-basic-mensuel",
    annual: "https://www.tipote.com/tipote-basic-annuel",
  },
  pro: {
    monthly: "https://www.tipote.com/tipote-essential-mensuel",
    annual: "https://www.tipote.com/tipote-essential-annuel",
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

function useAnimatedNumber(value: number, durationMs = 900) {
  const [display, setDisplay] = useState<number>(value);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(value);
  const toRef = useRef<number>(value);
  const startRef = useRef<number>(0);

  useEffect(() => {
    toRef.current = value;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    fromRef.current = display;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(fromRef.current + (toRef.current - fromRef.current) * eased);
      setDisplay(next);

      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return display;
}

export default function BillingSection({ email }: Props) {
  const t = useTranslations("billing");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionPayload | null>(null);

  const { loading: creditsLoading, balance: credits, error: creditsError, refresh: refreshCredits } = useCreditsBalance();

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

  const currentPlan = useMemo<Exclude<PlanKey, "essential">>(() => normalizePlan(planName), [planName]);
  const isAnnual = useMemo(() => isAnnualSubscription(sub), [sub]);
  const currentMeta = useMemo(() => planMeta(currentPlan), [currentPlan]);

  const remainingCredits = useMemo(() => credits?.total_remaining ?? 0, [credits]);
  const animatedRemainingCredits = useAnimatedNumber(remainingCredits, 900);

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

        if (!res.ok || !json) throw new Error(t("errorDesc"));
        if (json?.error) throw new Error(String(json.error));

        setData(json as SubscriptionPayload);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: t("errorTitle"),
            description: e instanceof Error ? e.message : t("errorDesc"),
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (email) void load();
    return () => {
      cancelled = true;
    };
  }, [email, toast, t]);

  const openOrderForm = (plan: "basic" | "pro" | "elite") => {
    const url = isAnnual ? ORDER_FORMS[plan].annual : ORDER_FORMS[plan].monthly;
    window.location.href = url;
  };

  const openCreditsPack = () => {
    const qs = new URLSearchParams();

    const profileEmail = safeString(data?.profile?.email) ?? email;

    const firstName = safeString(data?.profile?.first_name) ?? safeString((data?.profile as any)?.firstName) ?? null;

    const surname =
      safeString((data?.profile as any)?.surname) ??
      safeString((data?.profile as any)?.last_name) ??
      safeString((data?.profile as any)?.lastName) ??
      null;

    const streetAddress =
      safeString((data?.profile as any)?.street_address) ??
      safeString((data?.profile as any)?.address) ??
      safeString((data?.profile as any)?.streetAddress) ??
      null;

    const postcode =
      safeString((data?.profile as any)?.postcode) ??
      safeString((data?.profile as any)?.postal_code) ??
      safeString((data?.profile as any)?.zip) ??
      null;

    const city = safeString((data?.profile as any)?.city) ?? null;

    const country =
      safeString((data?.profile as any)?.country) ??
      safeString((data?.profile as any)?.country_code) ??
      null;

    if (profileEmail) qs.set("email", profileEmail);
    if (firstName) qs.set("first_name", firstName);
    if (surname) qs.set("surname", surname);
    if (streetAddress) qs.set("street_address", streetAddress);
    if (postcode) qs.set("postcode", postcode);
    if (city) qs.set("city", city);
    if (country) qs.set("country", country);

    const url = qs.toString() ? `${CREDITS_PACK_URL}?${qs.toString()}` : CREDITS_PACK_URL;
    window.location.href = url;
  };

  const isBeta = currentPlan === "beta";
  const basicIsCurrent = currentPlan === "basic";
  const proIsCurrent = currentPlan === "pro" || isBeta;
  const eliteIsCurrent = currentPlan === "elite";

  return (
    <>
      <Card className="p-6 gradient-hero border-border/50">
        <div className="flex items-start justify-between">
          <div>
            <Badge className="mb-2 bg-background/20 text-primary-foreground">{t("currentPlanBadge")}</Badge>
            <h2 className="text-2xl font-bold text-primary-foreground mb-1">{loading ? "—" : currentMeta.label}</h2>
            <p className="text-primary-foreground/80">
              {loading ? t("loading") : isBeta ? "Accès PRO à vie — 150 crédits IA/mois — Coach IA inclus" : t(`plan.${currentPlan}.desc`)}
            </p>
          </div>
          <p className="text-3xl font-bold text-primary-foreground">
            {loading ? "—" : currentMeta.lifetime ? (
              <span className="text-xl">Offert</span>
            ) : (
              <>{currentMeta.price}€<span className="text-lg font-normal">{t("perMonth")}</span></>
            )}
          </p>
        </div>
      </Card>

      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
              <Coins className="w-5 h-5 text-primary-foreground" />
            </div>

            <div>
              <p className="font-bold text-base mb-1">{t("credits.title")}</p>
              <p className="text-sm text-muted-foreground">
                {t("credits.desc")}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={refreshCredits}
            disabled={creditsLoading}
            title={t("refreshAria")}
            aria-label={t("refreshAria")}
          >
            <RefreshCcw className={`h-4 w-4 ${creditsLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="text-3xl font-bold tabular-nums">
            {creditsLoading ? "—" : creditsError ? "—" : animatedRemainingCredits}
            <span className="text-base font-medium text-muted-foreground ml-2">{t("credits.unit")}</span>
          </div>

          <Button onClick={openCreditsPack}>{t("credits.recharge")}</Button>
        </div>

        {creditsError ? <p className="text-sm text-destructive mt-3">{creditsError}</p> : null}

        {!creditsLoading && !creditsError && credits ? (
          <p className="text-xs text-muted-foreground mt-3">
            {t("credits.purchased")}<span className="tabular-nums">{credits.total_purchased}</span>{t("credits.consumed")}<span className="tabular-nums">{credits.total_consumed}</span>
          </p>
        ) : null}
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className={basicIsCurrent ? "p-6 border-2 border-primary relative" : "p-6"}>
          {basicIsCurrent ? <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">{t("current")}</Badge> : null}

          <h3 className="font-bold text-lg mb-2">Basic</h3>
          <p className="text-3xl font-bold mb-4">
            19€<span className="text-sm font-normal text-muted-foreground">{t("perMonth")}</span>
          </p>

          <ul className="space-y-2 text-sm mb-6">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.basic.f1")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.basic.f2")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.basic.f3")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.basic.f4")}
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <Lock className="w-4 h-4" />
              {t("plans.basic.f5")}
            </li>
          </ul>

          <Button variant="outline" className="w-full" onClick={() => openOrderForm("basic")} disabled={loading || basicIsCurrent}>
            {basicIsCurrent ? t("currentLabel") : t("downgrade")}
          </Button>
        </Card>

        <Card className={proIsCurrent ? "p-6 border-2 border-primary relative" : "p-6"}>
          {proIsCurrent ? <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">{t("current")}</Badge> : null}

          <h3 className="font-bold text-lg mb-2">Pro</h3>
          <p className="text-3xl font-bold mb-4">
            49€<span className="text-sm font-normal text-muted-foreground">{t("perMonth")}</span>
          </p>

          <ul className="space-y-2 text-sm mb-6">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.pro.f1")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.pro.f2")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.pro.f3")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.pro.f4")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.pro.f5")}
            </li>
          </ul>

          <Button variant="outline" className="w-full" onClick={() => openOrderForm("pro")} disabled={loading || proIsCurrent}>
            {proIsCurrent ? t("currentLabel") : currentPlan === "elite" ? t("downgrade") : t("upgrade")}
          </Button>
        </Card>

        <Card className={eliteIsCurrent ? "p-6 border-2 border-primary relative" : "p-6"}>
          {eliteIsCurrent ? <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">{t("current")}</Badge> : null}

          <h3 className="font-bold text-lg mb-2">Elite</h3>
          <p className="text-3xl font-bold mb-4">
            99€<span className="text-sm font-normal text-muted-foreground">{t("perMonth")}</span>
          </p>

          <ul className="space-y-2 text-sm mb-6">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.elite.f1")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.elite.f2")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.elite.f3")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.elite.f4")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              {t("plans.elite.f5")}
            </li>
          </ul>

          <Button variant="hero" className="w-full" onClick={() => openOrderForm("elite")} disabled={loading || eliteIsCurrent}>
            {eliteIsCurrent ? t("currentLabel") : t("upgrade")}
          </Button>
        </Card>
      </div>

      {isBeta ? (
        <Card className="p-6 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
            <div>
              <p className="font-medium">Accès Beta à vie</p>
              <p className="text-sm text-muted-foreground">
                Tu fais partie des premiers utilisateurs de Tipote. Ton accès PRO est garanti à vie, avec 150 crédits IA par mois et l&apos;accès au coach. Pas d&apos;abonnement, pas d&apos;annulation.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t("manage.title")}</p>
              <p className="text-sm text-muted-foreground">{t("manage.desc")}</p>
            </div>

            <Button variant="outline" asChild>
              <a href="https://systeme.io/dashboard/profile/manage-subscriptions" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                {t("manage.cta")}
              </a>
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
