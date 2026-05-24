// app/affiliate/page.tsx
//
// Vue d'ensemble du dashboard affiliation. Design system Tipote
// (Card, Button, icônes lucide, light theme).

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDict, interpolate, normaliseLocale } from "./i18n";
import type { AffiliateDict } from "./i18n/types";
import { TrendingUp, MousePointerClick, Users, ShoppingCart, Sparkles, Award, ArrowRight, Gift } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AffiliateTour } from "./components/AffiliateTour";
import AffiliateLinkCopy from "./components/AffiliateLinkCopy";
import { LaunchGuideCard } from "./components/LaunchGuideCard";
import { BadgesCard } from "./components/BadgesCard";
import { LeaderboardCard } from "./components/LeaderboardCard";

async function TrialTipoteCard({ sa, t }: { sa: string; t: AffiliateDict }) {
  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("trial_activated_at, trial_expires_at")
    .eq("sa", sa)
    .maybeSingle();
  const row = data as { trial_activated_at: string | null; trial_expires_at: string | null } | null;
  if (row?.trial_activated_at) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-purple-500/5">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">
              {t.overview.trial_cta_title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {t.overview.trial_cta_description}
            </p>
            <Button asChild className="mt-3">
              <Link href="/trial-tipote">
                {t.overview.trial_cta_button}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const dynamic = "force-dynamic";

type Stats = {
  total_clicks: number;
  total_conversions: number;
  total_sales: number;
  total_sale_cents: number;
  total_commission_cents: number;
  pending_commission_cents: number;
  approved_commission_cents: number;
  paid_commission_cents: number;
};

async function fetchStats(sa: string): Promise<Stats> {
  const { data } = await supabaseAdmin
    .from("affiliate_stats")
    .select("*")
    .eq("sa", sa)
    .maybeSingle();
  const row = data as Stats | null;
  return (
    row ?? {
      total_clicks: 0,
      total_conversions: 0,
      total_sales: 0,
      total_sale_cents: 0,
      total_commission_cents: 0,
      pending_commission_cents: 0,
      approved_commission_cents: 0,
      paid_commission_cents: 0,
    }
  );
}

function eur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// Paliers — doit rester en sync avec lib/affiliate/attribution.ts
const TIERS = [
  { minSales: 0, rate: 0.4, label: "0–9 ventes" },
  { minSales: 10, rate: 0.45, label: "10–24 ventes" },
  { minSales: 25, rate: 0.5, label: "25+ ventes" },
];

function currentTier(salesCount: number) {
  let active = TIERS[0];
  let next: typeof TIERS[number] | null = null;
  for (let i = 0; i < TIERS.length; i++) {
    if (salesCount >= TIERS[i].minSales) {
      active = TIERS[i];
      next = TIERS[i + 1] ?? null;
    }
  }
  return { rate: active.rate, label: active.label, nextTarget: next?.minSales ?? null };
}

export default async function AffiliateOverviewPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const displayName = session.display_name ?? session.email.split("@")[0];

  // Stats + onboarded_at en parallèle (un seul round-trip Supabase)
  const [stats, { data: meta }] = await Promise.all([
    fetchStats(session.sa),
    supabaseAdmin
      .from("affiliates")
      .select("onboarded_at")
      .eq("sa", session.sa)
      .maybeSingle(),
  ]);
  const onboardedAt = (meta as { onboarded_at: string | null } | null)?.onboarded_at ?? null;

  const tier = currentTier(stats.total_sales);
  const linkUrl = `https://www.tipote.fr/?sa=${session.sa}`;
  const conversionRate =
    stats.total_clicks > 0
      ? `${((stats.total_sales / stats.total_clicks) * 100).toFixed(1)}%`
      : "—";

  return (
    <>
      {/* Tutoriel guidé : s'auto-déclenche si onboardedAt = null (premier
          login) ; sinon dormant. Peut être relancé via l'événement
          "affiliate-tour-start" depuis Support. */}
      <AffiliateTour onboardedAt={onboardedAt} />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {interpolate(t.overview.greeting, { name: displayName })}
          </h1>
          <p className="text-muted-foreground mt-1">{t.overview.subtitle}</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {t.overview.link_card_title}
            </CardTitle>
            <CardDescription>
              {interpolate(t.overview.link_card_help, { sa: session.sa })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AffiliateLinkCopy url={linkUrl} />
          </CardContent>
        </Card>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={MousePointerClick} label={t.overview.stat_clicks} value={stats.total_clicks.toLocaleString("fr-FR")} />
          <StatCard icon={Users} label={t.overview.stat_signups} value={stats.total_conversions.toLocaleString("fr-FR")} />
          <StatCard icon={ShoppingCart} label={t.overview.stat_sales} value={stats.total_sales.toLocaleString("fr-FR")} />
          <StatCard icon={TrendingUp} label={t.overview.stat_conversion_rate} value={conversionRate} />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GainCard label={t.overview.gain_total} value={eur(stats.total_commission_cents)} variant="primary" />
          <GainCard label={t.overview.gain_pending} value={eur(stats.pending_commission_cents)} variant="warning" />
          <GainCard label={t.overview.gain_paid} value={eur(stats.paid_commission_cents)} variant="success" />
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{t.overview.tier_card_title}</CardTitle>
              </div>
              <Badge variant="default" className="text-base px-3 py-1">
                {Math.round(tier.rate * 100)}%
              </Badge>
            </div>
            <CardDescription>
              {interpolate(t.overview.tier_current, { label: tier.label })}
              {tier.nextTarget !== null && (
                <>
                  {" "}
                  {interpolate(t.overview.tier_remaining, {
                    count: tier.nextTarget - stats.total_sales,
                  })}
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {TIERS.map((tierItem, i) => {
              const reached = stats.total_sales >= tierItem.minSales;
              const isCurrent = reached && (TIERS[i + 1] ? stats.total_sales < TIERS[i + 1].minSales : true);
              return (
                <div
                  key={tierItem.minSales}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                    isCurrent
                      ? "border-primary bg-primary/5"
                      : reached
                        ? "border-border bg-muted/50"
                        : "border-border opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-lg ${reached ? "text-primary" : "text-muted-foreground"}`}>
                      {reached ? "✓" : "○"}
                    </span>
                    <span className="text-sm font-medium">{tierItem.label}</span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-xs">
                        {t.overview.tier_current_badge}
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm font-bold">{Math.round(tierItem.rate * 100)}%</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <TrialTipoteCard sa={session.sa} t={t} />

        <LaunchGuideCard sa={session.sa} locale={session.locale} />

        <BadgesCard stats={stats} t={t} />

        <LeaderboardCard sa={session.sa} locale={session.locale} />
      </main>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function GainCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "primary" | "warning" | "success";
}) {
  const variantClasses = {
    primary: "border-primary/30 bg-primary/5",
    warning: "border-amber-300/40 bg-amber-50 dark:bg-amber-950/20",
    success: "border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20",
  }[variant];

  const textClasses = {
    primary: "text-primary",
    warning: "text-amber-700 dark:text-amber-300",
    success: "text-emerald-700 dark:text-emerald-300",
  }[variant];

  return (
    <Card className={variantClasses}>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
        <div className={`text-3xl font-bold tracking-tight ${textClasses}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
