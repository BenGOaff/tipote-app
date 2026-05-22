// app/affiliate/page.tsx
//
// Vue d'ensemble du dashboard affilié. Affichage des stats clés :
//   - Lien d'affiliation à copier
//   - Clics / inscriptions / ventes / commission
//   - Palier de commission courant + progression
//   - Guide de lancement (gamification, sprint 3)
//
// Toutes les pages /affiliate/* requièrent une session affiliée active.
// Le gating est fait ici via getAffiliateSession() → si null on redirect
// vers /login. Pas de middleware-level auth pour pas mélanger avec le
// gating dashboard principal Tipote.

import { redirect } from "next/navigation";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

function currentTier(salesCount: number): { rate: number; label: string; nextTarget: number | null } {
  let active = TIERS[0];
  let next: typeof TIERS[number] | null = null;
  for (let i = 0; i < TIERS.length; i++) {
    if (salesCount >= TIERS[i].minSales) {
      active = TIERS[i];
      next = TIERS[i + 1] ?? null;
    }
  }
  return {
    rate: active.rate,
    label: active.label,
    nextTarget: next?.minSales ?? null,
  };
}

export default async function AffiliateOverviewPage() {
  const session = await getAffiliateSession();
  if (!session) {
    redirect("/login");
  }

  const stats = await fetchStats(session.sa);
  const tier = currentTier(stats.total_sales);
  const linkUrl = `https://www.tipote.fr/?sa=${session.sa}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Bonjour {session.display_name ?? session.email.split("@")[0]} 👋
        </h1>
        <p className="text-slate-400 mt-1">
          Voici ta vue d&apos;ensemble du programme Tipote × Tiquiz.
        </p>
      </div>

      {/* Lien d'affiliation */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
          Ton lien d&apos;affiliation
        </h2>
        <AffiliateLinkCopy url={linkUrl} />
        <p className="text-xs text-slate-500 mt-3">
          Tu peux remplacer la page de destination par n&apos;importe quelle URL
          tipote.fr, tipote.com ou tipote.blog : ajoute juste{" "}
          <code className="bg-slate-800 px-1.5 py-0.5 rounded">?sa={session.sa}</code> à la fin.
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Clics" value={stats.total_clicks.toLocaleString("fr-FR")} icon="✨" />
        <StatCard
          label="Inscriptions"
          value={stats.total_conversions.toLocaleString("fr-FR")}
          icon="👥"
        />
        <StatCard label="Ventes" value={stats.total_sales.toLocaleString("fr-FR")} icon="🛒" />
        <StatCard
          label="Taux conversion"
          value={
            stats.total_clicks > 0
              ? `${((stats.total_sales / stats.total_clicks) * 100).toFixed(1)}%`
              : "—"
          }
          icon="📈"
        />
      </section>

      {/* Gains */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GainCard
          label="Gains totaux"
          value={eur(stats.total_commission_cents)}
          color="from-amber-500/20 to-orange-500/10 border-amber-700/40"
          textColor="text-amber-300"
        />
        <GainCard
          label="En attente"
          value={eur(stats.pending_commission_cents)}
          color="from-yellow-500/20 to-yellow-600/10 border-yellow-700/40"
          textColor="text-yellow-300"
        />
        <GainCard
          label="Déjà payé"
          value={eur(stats.paid_commission_cents)}
          color="from-emerald-500/20 to-green-600/10 border-emerald-700/40"
          textColor="text-emerald-300"
        />
      </section>

      {/* Palier de commission */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Palier de commission</h2>
          <span className="text-3xl font-bold text-indigo-400">{Math.round(tier.rate * 100)}%</span>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Tu es actuellement au palier <strong>{tier.label}</strong>.
          {tier.nextTarget !== null && (
            <>
              {" "}
              Plus que{" "}
              <strong className="text-indigo-400">
                {tier.nextTarget - stats.total_sales}
              </strong>{" "}
              vente{tier.nextTarget - stats.total_sales > 1 ? "s" : ""} pour atteindre le palier suivant.
            </>
          )}
        </p>
        <div className="space-y-2">
          {TIERS.map((t, i) => {
            const reached = stats.total_sales >= t.minSales;
            const active = i === TIERS.findIndex((x) => x.minSales === tier.nextTarget) - 1 ||
                           (tier.nextTarget === null && i === TIERS.length - 1);
            return (
              <div
                key={t.minSales}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                  active
                    ? "bg-indigo-900/30 border-indigo-700/50"
                    : reached
                      ? "bg-slate-800/40 border-slate-700"
                      : "bg-slate-900/40 border-slate-800 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{reached ? "✓" : "○"}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                </div>
                <span className="text-sm font-bold">{Math.round(t.rate * 100)}%</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Coming soon */}
      <section className="bg-slate-900/30 border border-dashed border-slate-700 rounded-2xl p-6 text-center">
        <p className="text-sm text-slate-400">
          🚧 Bientôt : ressources promos, guide de lancement gamifié, classement, contenus multilangues.
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <span className="text-lg opacity-60">{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function GainCard({
  label,
  value,
  color,
  textColor,
}: {
  label: string;
  value: string;
  color: string;
  textColor: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${color} border rounded-2xl p-5`}>
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">{label}</div>
      <div className={`text-3xl font-bold ${textColor}`}>{value}</div>
    </div>
  );
}
