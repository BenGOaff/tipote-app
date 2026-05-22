// app/affiliate/page.tsx
//
// Vue d'ensemble du dashboard affiliation. Design system Tipote
// (Card, Button, icônes lucide, light theme).

import { redirect } from "next/navigation";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TrendingUp, MousePointerClick, Users, ShoppingCart, Sparkles, Award, ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AffiliateNav } from "./components/AffiliateNav";
import AffiliateLinkCopy from "./components/AffiliateLinkCopy";

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

  const stats = await fetchStats(session.sa);
  const tier = currentTier(stats.total_sales);
  const linkUrl = `https://www.tipote.fr/?sa=${session.sa}`;
  const conversionRate =
    stats.total_clicks > 0
      ? `${((stats.total_sales / stats.total_clicks) * 100).toFixed(1)}%`
      : "—";

  return (
    <div className="min-h-screen bg-background">
      <AffiliateNav displayName={session.display_name ?? session.email.split("@")[0]} />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Bonjour {session.display_name ?? session.email.split("@")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Voici ta vue d&apos;ensemble du programme d&apos;affiliation Tipote × Tiquiz.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Ton lien d&apos;affiliation
            </CardTitle>
            <CardDescription>
              Tu peux remplacer la destination par n&apos;importe quelle URL
              tipote.fr, tipote.com ou tipote.blog — ajoute juste{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
                ?sa={session.sa}
              </code>{" "}
              à la fin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AffiliateLinkCopy url={linkUrl} />
          </CardContent>
        </Card>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={MousePointerClick} label="Clics" value={stats.total_clicks.toLocaleString("fr-FR")} />
          <StatCard icon={Users} label="Inscriptions" value={stats.total_conversions.toLocaleString("fr-FR")} />
          <StatCard icon={ShoppingCart} label="Ventes" value={stats.total_sales.toLocaleString("fr-FR")} />
          <StatCard icon={TrendingUp} label="Taux conversion" value={conversionRate} />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GainCard label="Gains totaux" value={eur(stats.total_commission_cents)} variant="primary" />
          <GainCard label="En attente" value={eur(stats.pending_commission_cents)} variant="warning" />
          <GainCard label="Déjà payé" value={eur(stats.paid_commission_cents)} variant="success" />
        </section>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Palier de commission</CardTitle>
              </div>
              <Badge variant="default" className="text-base px-3 py-1">
                {Math.round(tier.rate * 100)}%
              </Badge>
            </div>
            <CardDescription>
              Tu es actuellement au palier <strong className="text-foreground">{tier.label}</strong>.
              {tier.nextTarget !== null && (
                <>
                  {" "}
                  Plus que{" "}
                  <strong className="text-primary">
                    {tier.nextTarget - stats.total_sales}
                  </strong>{" "}
                  vente{tier.nextTarget - stats.total_sales > 1 ? "s" : ""} pour
                  atteindre le palier suivant.
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {TIERS.map((t, i) => {
              const reached = stats.total_sales >= t.minSales;
              const isCurrent = reached && (TIERS[i + 1] ? stats.total_sales < TIERS[i + 1].minSales : true);
              return (
                <div
                  key={t.minSales}
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
                    <span className="text-sm font-medium">{t.label}</span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-xs">
                        Palier actuel
                      </Badge>
                    )}
                  </div>
                  <span className="text-sm font-bold">{Math.round(t.rate * 100)}%</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              🚧 Bientôt : ressources promo par canal, guide de lancement,
              calculateur de revenus, classement, contenus multilangues.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
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
