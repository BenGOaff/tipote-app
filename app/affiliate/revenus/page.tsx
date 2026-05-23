// app/affiliate/revenus/page.tsx
//
// Onglet Revenus : historique des commissions + calculateur + résumé
// par statut. Lit affiliate_commissions et affiliate_stats.

import { redirect } from "next/navigation";
import { Wallet, Clock, CheckCircle2, XCircle, Calendar, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AffiliateNav } from "../components/AffiliateNav";
import { RevenueCalculator } from "./RevenueCalculator";
import { getDict, interpolate, normaliseLocale } from "../i18n";
import type { AffiliateDict } from "../i18n/types";

export const dynamic = "force-dynamic";

type Commission = {
  id: string;
  source_app: "tipote" | "tiquiz";
  customer_email: string;
  product_name: string | null;
  sale_amount_cents: number;
  commission_rate: number;
  commission_cents: number;
  currency: string;
  status: "pending" | "approved" | "paid" | "cancelled" | "rejected";
  sale_at: string;
  paid_at: string | null;
};

type Totals = {
  total_commission_cents: number;
  pending_commission_cents: number;
  approved_commission_cents: number;
  paid_commission_cents: number;
  total_sales: number;
};

async function fetchCommissions(sa: string): Promise<Commission[]> {
  const { data } = await supabaseAdmin
    .from("affiliate_commissions")
    .select(
      "id, source_app, customer_email, product_name, sale_amount_cents, commission_rate, commission_cents, currency, status, sale_at, paid_at",
    )
    .eq("sa", sa)
    .order("sale_at", { ascending: false })
    .limit(100);
  return (data ?? []) as Commission[];
}

async function fetchTotals(sa: string): Promise<Totals> {
  const { data } = await supabaseAdmin
    .from("affiliate_stats")
    .select(
      "total_commission_cents, pending_commission_cents, approved_commission_cents, paid_commission_cents, total_sales",
    )
    .eq("sa", sa)
    .maybeSingle();
  const row = data as Totals | null;
  return (
    row ?? {
      total_commission_cents: 0,
      pending_commission_cents: 0,
      approved_commission_cents: 0,
      paid_commission_cents: 0,
      total_sales: 0,
    }
  );
}

function eur(cents: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visibleLocal = local.length <= 2 ? local : local.slice(0, 2);
  return `${visibleLocal}***@${domain}`;
}

function statusConfig(t: AffiliateDict): Record<
  Commission["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }
> {
  return {
    pending: { label: t.revenus.status_pending, variant: "secondary", icon: Clock },
    approved: { label: t.revenus.status_approved, variant: "default", icon: CheckCircle2 },
    paid: { label: t.revenus.status_paid, variant: "default", icon: CheckCircle2 },
    cancelled: { label: t.revenus.status_cancelled, variant: "outline", icon: XCircle },
    rejected: { label: t.revenus.status_rejected, variant: "destructive", icon: XCircle },
  };
}

export default async function RevenusPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const sConfig = statusConfig(t);

  const [commissions, totals] = await Promise.all([
    fetchCommissions(session.sa),
    fetchTotals(session.sa),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <AffiliateNav displayName={session.display_name ?? session.email.split("@")[0]} />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.revenus.page_title}</h1>
          <p className="text-muted-foreground mt-1">{t.revenus.page_subtitle}</p>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <TotalCard
            label={t.revenus.total_gains}
            value={eur(totals.total_commission_cents)}
            icon={Wallet}
            highlight
          />
          <TotalCard
            label={t.revenus.pending}
            value={eur(totals.pending_commission_cents)}
            icon={Clock}
          />
          <TotalCard
            label={t.revenus.approved}
            value={eur(totals.approved_commission_cents)}
            icon={Calendar}
          />
          <TotalCard
            label={t.revenus.paid}
            value={eur(totals.paid_commission_cents)}
            icon={CheckCircle2}
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t.revenus.history_title}</CardTitle>
            <CardDescription>
              {interpolate(t.revenus.history_description, { count: commissions.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {commissions.length === 0 ? (
              <div className="py-12 text-center">
                <Wallet className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t.revenus.empty_title}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.revenus.empty_subtitle}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.revenus.th_date}</TableHead>
                      <TableHead>{t.revenus.th_product}</TableHead>
                      <TableHead>{t.revenus.th_customer}</TableHead>
                      <TableHead className="text-right">{t.revenus.th_sale}</TableHead>
                      <TableHead className="text-right">{t.revenus.th_commission}</TableHead>
                      <TableHead>{t.revenus.th_status}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((c) => {
                      const sc = sConfig[c.status];
                      const Icon = sc.icon;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">{formatDate(c.sale_at)}</TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">
                              {c.product_name ?? "—"}
                            </div>
                            <Badge variant="outline" className="text-[10px] mt-1">
                              {c.source_app}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-mono">
                            {maskEmail(c.customer_email)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {eur(c.sale_amount_cents, c.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium">
                              {eur(c.commission_cents, c.currency)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {Math.round(c.commission_rate * 100)}%
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={sc.variant} className="gap-1">
                              <Icon className="h-3 w-3" />
                              {sc.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {t.revenus.calculator_title}
            </CardTitle>
            <CardDescription>{t.revenus.calculator_subtitle}</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueCalculator currentTier={totals.total_sales} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function TotalCard({
  label,
  value,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={`text-2xl font-bold tracking-tight ${highlight ? "text-primary" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
