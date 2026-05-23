// app/affiliate/components/BadgesCard.tsx
//
// Grille de 6 badges débloqués au fur et à mesure de la progression
// de l'affilié. Tout est dérivé de affiliate_stats — pas de schéma
// dédié pour V1. Si on veut tracker les unlock timestamps un jour,
// ajouter une colonne JSONB sur affiliates.
//
// Les badges Top 10 du mois et autres rankings ranking-based seront
// ajoutés en V2 quand la base d'affiliés sera assez grosse.

import { MousePointerClick, UserPlus, ShoppingCart, TrendingUp, Award, Wallet, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AffiliateDict } from "../i18n/types";
import { interpolate } from "../i18n";

type Stats = {
  total_clicks: number;
  total_conversions: number;
  total_sales: number;
  total_commission_cents: number;
};

type BadgeDef = {
  key: string;
  icon: typeof MousePointerClick;
  title: string;
  body: string;
  achieved: boolean;
};

export function BadgesCard({ stats, t }: { stats: Stats; t: AffiliateDict }) {
  const badges: BadgeDef[] = [
    {
      key: "first_click",
      icon: MousePointerClick,
      title: t.overview.badge_first_click_title,
      body: t.overview.badge_first_click_body,
      achieved: stats.total_clicks >= 1,
    },
    {
      key: "first_signup",
      icon: UserPlus,
      title: t.overview.badge_first_signup_title,
      body: t.overview.badge_first_signup_body,
      achieved: stats.total_conversions >= 1,
    },
    {
      key: "first_sale",
      icon: ShoppingCart,
      title: t.overview.badge_first_sale_title,
      body: t.overview.badge_first_sale_body,
      achieved: stats.total_sales >= 1,
    },
    {
      key: "tier_mid",
      icon: TrendingUp,
      title: t.overview.badge_tier_mid_title,
      body: t.overview.badge_tier_mid_body,
      achieved: stats.total_sales >= 10,
    },
    {
      key: "tier_high",
      icon: Award,
      title: t.overview.badge_tier_high_title,
      body: t.overview.badge_tier_high_body,
      achieved: stats.total_sales >= 25,
    },
    {
      key: "100eur",
      icon: Wallet,
      title: t.overview.badge_100eur_title,
      body: t.overview.badge_100eur_body,
      achieved: stats.total_commission_cents >= 10000,
    },
  ];

  const doneCount = badges.filter((b) => b.achieved).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            {t.overview.badges_title}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {interpolate(t.overview.badges_progress, { done: doneCount, total: badges.length })}
          </Badge>
        </div>
        <CardDescription>{t.overview.badges_subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {badges.map((b) => {
            const Icon = b.achieved ? b.icon : Lock;
            return (
              <div
                key={b.key}
                className={`rounded-xl border p-3 text-center transition-all ${
                  b.achieved
                    ? "border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5"
                    : "border-border bg-muted/30 opacity-60"
                }`}
              >
                <div
                  className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                    b.achieved
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground/50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <p className={`text-xs font-semibold ${b.achieved ? "" : "text-muted-foreground"}`}>
                  {b.title}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {b.achieved ? b.body : t.overview.badge_locked}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
