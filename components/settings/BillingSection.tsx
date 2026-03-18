"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, ExternalLink, Coins, RefreshCcw, AlertTriangle, Star } from "lucide-react";
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
    last_name?: string | null;
    surname?: string | null;
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
    safeString(sub?.pricePlan?.recurringOptions?.interval) ||
    safeString(sub?.pricePlan?.interval) ||
    safeString(sub?.pricePlan?.name) ||
    safeString(sub?.pricePlan?.innerName) ||
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

/* ─── Feature list per plan ─── */

type Feature = { key: string; included: boolean; bold?: boolean };

const FREE_FEATURES: Feature[] = [
  { key: "credits25", included: true, bold: true },
  { key: "strategy", included: true },
  { key: "contentGen", included: true },
  { key: "stats", included: true },
  { key: "calendar", included: true },
  { key: "quiz", included: true },
  { key: "connect1", included: true, bold: true },
  { key: "multiprofiles", included: false },
  { key: "analytics", included: false },
  { key: "persona", included: false },
  { key: "competition", included: false },
  { key: "buyCredits", included: false },
  { key: "coach", included: false },
];

const BASIC_FEATURES: Feature[] = [
  { key: "credits40", included: true, bold: true },
  { key: "strategy", included: true },
  { key: "contentGen", included: true },
  { key: "stats", included: true },
  { key: "calendar", included: true },
  { key: "quiz", included: true },
  { key: "connect2", included: true, bold: true },
  { key: "analytics", included: true },
  { key: "persona", included: true },
  { key: "competition", included: true },
  { key: "buyCredits", included: true },
  { key: "multiprofiles", included: false },
  { key: "coach", included: false },
];

const PRO_FEATURES: Feature[] = [
  { key: "credits150", included: true, bold: true },
  { key: "strategy", included: true },
  { key: "contentGen", included: true },
  { key: "stats", included: true },
  { key: "calendar", included: true },
  { key: "quiz", included: true },
  { key: "connect4", included: true, bold: true },
  { key: "analytics", included: true },
  { key: "persona", included: true },
  { key: "competition", included: true },
  { key: "buyCredits", included: true },
  { key: "coach", included: true, bold: true },
  { key: "multiprofiles", included: false },
];

const ELITE_FEATURES: Feature[] = [
  { key: "credits500", included: true, bold: true },
  { key: "strategy", included: true },
  { key: "contentGen", included: true },
  { key: "stats", included: true },
  { key: "calendar", included: true },
  { key: "quiz", included: true },
  { key: "connectAll", included: true, bold: true },
  { key: "analytics", included: true },
  { key: "persona", included: true },
  { key: "competition", included: true },
  { key: "buyCredits", included: true },
  { key: "coach", included: true },
  { key: "multiprofiles", included: true },
];

/* ─── Animated number hook ─── */

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

/* ─── Component ─── */

export default function BillingSection({ email }: Props) {
  const t = useTranslations("billing");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionPayload | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

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
    return () => { cancelled = true; };
  }, [email, toast, t]);

  // Auto-detect billing cycle from subscription
  useEffect(() => {
    if (isAnnual) setBillingCycle("annual");
  }, [isAnnual]);

  const openOrderForm = (plan: "basic" | "pro" | "elite") => {
    const url = billingCycle === "annual" ? ORDER_FORMS[plan].annual : ORDER_FORMS[plan].monthly;
    window.location.href = url;
  };

  const openCreditsPack = () => {
    const qs = new URLSearchParams();
    const profileEmail = safeString(data?.profile?.email) ?? email;
    const firstName = safeString(data?.profile?.first_name) ?? safeString((data?.profile as any)?.firstName) ?? null;
    const surname = safeString((data?.profile as any)?.surname) ?? safeString((data?.profile as any)?.last_name) ?? safeString((data?.profile as any)?.lastName) ?? null;
    const streetAddress = safeString((data?.profile as any)?.street_address) ?? safeString((data?.profile as any)?.address) ?? safeString((data?.profile as any)?.streetAddress) ?? null;
    const postcode = safeString((data?.profile as any)?.postcode) ?? safeString((data?.profile as any)?.postal_code) ?? safeString((data?.profile as any)?.zip) ?? null;
    const city = safeString((data?.profile as any)?.city) ?? null;
    const country = safeString((data?.profile as any)?.country) ?? safeString((data?.profile as any)?.country_code) ?? null;

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

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) {
        throw new Error(json?.error ?? t("cancelError"));
      }
      toast({
        title: t("cancelSuccess"),
        description: t("cancelSuccessDesc"),
      });
      setShowCancelConfirm(false);
      window.location.reload();
    } catch (e) {
      toast({
        title: t("errorTitle"),
        description: e instanceof Error ? e.message : t("cancelError"),
        variant: "destructive",
      });
    } finally {
      setCanceling(false);
    }
  };

  const isBeta = currentPlan === "beta";
  const isFree = currentPlan === "free";
  const hasPaidPlan = !isBeta && !isFree;

  function isPlanCurrent(plan: string) {
    if (plan === "pro" && isBeta) return true;
    return currentPlan === plan;
  }

  function ctaLabel(plan: string) {
    if (isPlanCurrent(plan)) return t("currentLabel");
    if (plan === "free") return t("cta.free");
    const planRank = { free: 0, basic: 1, pro: 2, elite: 3, beta: 2 } as Record<string, number>;
    const current = planRank[currentPlan] ?? 0;
    const target = planRank[plan] ?? 0;
    return target > current ? t("upgrade") : t("downgrade");
  }

  const PLAN_CARDS: {
    plan: "free" | "basic" | "pro" | "elite";
    features: Feature[];
    highlighted?: boolean;
  }[] = [
    { plan: "free", features: FREE_FEATURES },
    { plan: "basic", features: BASIC_FEATURES },
    { plan: "pro", features: PRO_FEATURES, highlighted: true },
    { plan: "elite", features: ELITE_FEATURES },
  ];

  return (
    <>
      {/* ─── Credits card ─── */}
      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
              <Coins className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-bold text-base">{t("credits.title")}</p>
                <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wide border-primary/40 text-primary">
                  {currentPlan === "beta" ? "Beta" : currentPlan.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{t("credits.desc")}</p>
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
            {creditsLoading ? "\u2014" : creditsError ? "\u2014" : animatedRemainingCredits}
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

      {/* ─── Billing cycle toggle ─── */}
      <div className="flex flex-col items-center gap-3">
        {billingCycle === "annual" && (
          <p className="text-sm italic text-primary font-medium">
            {t("annualPromo")}
          </p>
        )}

        <div className="inline-flex rounded-full border border-border bg-muted p-1">
          <button
            type="button"
            className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
              billingCycle === "monthly"
                ? "bg-white shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setBillingCycle("monthly")}
          >
            {t("toggle.monthly")}
          </button>
          <button
            type="button"
            className={`rounded-full px-6 py-2 text-sm font-semibold transition-all ${
              billingCycle === "annual"
                ? "bg-white shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setBillingCycle("annual")}
          >
            {t("toggle.annual")}
          </button>
        </div>
      </div>

      {/* ─── Plan cards grid ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {PLAN_CARDS.map(({ plan, features, highlighted }) => {
          const isCurrent = isPlanCurrent(plan);
          const prices = {
            free: { monthly: 0, annual: 0 },
            basic: { monthly: 19, annual: 190 },
            pro: { monthly: 49, annual: 490 },
            elite: { monthly: 99, annual: 990 },
          };
          const price = prices[plan][billingCycle];
          const creditsLabel = t(`planCards.${plan}.creditsLabel`);

          return (
            <Card
              key={plan}
              className={`relative flex flex-col p-6 ${
                isCurrent
                  ? "border-2 border-primary shadow-lg ring-2 ring-primary/50"
                  : ""
              }`}
            >
              {/* Badge "Ton plan actuel" on user's current plan */}
              {isCurrent && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3 py-1 whitespace-nowrap">
                    <Star className="w-3.5 h-3.5 mr-1 fill-current" />
                    {t("currentLabel")}
                  </Badge>
                </div>
              )}

              {/* Plan name */}
              <h3 className="text-2xl font-black italic text-primary text-center mt-1" style={{ fontFamily: "serif" }}>
                {plan.toUpperCase()}
              </h3>

              {/* Description */}
              <p className="text-xs text-muted-foreground text-center mt-1 min-h-[2rem]">
                {t(`planCards.${plan}.subtitle`)}
              </p>

              {/* Price */}
              <p className="text-4xl font-black text-center mt-3" style={{ fontFamily: "serif" }}>
                {price}&euro;
              </p>
              <p className="text-xs text-muted-foreground text-center mt-1">
                {plan === "free"
                  ? t("planCards.free.period")
                  : billingCycle === "monthly"
                  ? t("periodMonthly")
                  : t("periodAnnual")}
              </p>

              {/* Credits badge */}
              <div className="flex justify-center mt-4">
                <span className="inline-block rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
                  {creditsLabel}
                </span>
              </div>

              {/* Features heading */}
              <p className="text-xs font-semibold text-foreground mt-5 mb-3">
                {t("featuresIncluded")}
              </p>

              {/* Feature list */}
              <ul className="space-y-2 text-sm flex-1">
                {features.map((f) => (
                  <li
                    key={f.key}
                    className={`flex items-start gap-2 ${
                      f.included ? "" : "text-muted-foreground/60"
                    }`}
                  >
                    {f.included ? (
                      <Plus className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                    )}
                    <span className={f.bold ? "font-bold" : ""}>
                      {t(`features.${f.key}`)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <div className="mt-6">
                {plan === "free" ? (
                  <Button
                    variant="outline"
                    className="w-full rounded-full"
                    disabled={loading || isCurrent}
                  >
                    {isCurrent ? t("currentLabel") : t("cta.free")}
                  </Button>
                ) : (
                  <Button
                    variant={isCurrent ? "default" : "outline"}
                    className={`w-full rounded-full ${isCurrent ? "bg-primary hover:bg-primary/90" : ""}`}
                    onClick={() => openOrderForm(plan)}
                    disabled={loading || isCurrent}
                  >
                    {ctaLabel(plan)}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ─── Beta info card ─── */}
      {isBeta && (
        <Card className="p-6 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <Star className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium">{t("beta.title")}</p>
              <p className="text-sm text-muted-foreground">{t("beta.desc")}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Manage / Cancel subscription ─── */}
      {hasPaidPlan && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t("manage.title")}</p>
              <p className="text-sm text-muted-foreground">{t("manage.desc")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <a href="https://systeme.io/dashboard/profile/manage-subscriptions" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {t("manage.cta")}
                </a>
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowCancelConfirm(true)}
                disabled={canceling}
              >
                {t("cancelBtn")}
              </Button>
            </div>
          </div>

          {showCancelConfirm && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-destructive">{t("cancelConfirm.title")}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t("cancelConfirm.desc")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleCancelSubscription}
                      disabled={canceling}
                    >
                      {canceling ? t("cancelConfirm.canceling") : t("cancelConfirm.yes")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={canceling}
                    >
                      {t("cancelConfirm.no")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
