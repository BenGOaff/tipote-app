// app/affiliate/admin/diagnostic/page.tsx
//
// Admin Béné : vérifier en un coup d'oeil l'état du tracking pour un
// affilié donné. Affiche, pour le SA fourni en query (?sa=...) :
//   - l'identité (email, nom, status) depuis affiliates
//   - les 10 derniers clicks (affiliate_clicks)
//   - les 10 dernières conversions (affiliate_conversions)
//   - les 10 dernières commissions (affiliate_commissions)
//   - les compteurs agrégés (affiliate_stats view)
//
// Drame Gwenn 8 juin 2026 : son dashboard montrait CLICS=0 / INSCRITS=0
// alors qu'une cliente s'était bien inscrite via son lien sur SIO. Sans
// outil de diag, il fallait ouvrir Supabase Studio à chaque fois pour
// localiser le problème (snippet non chargé, conversion non recue,
// mismatch de SA...). Cette page permet d'enquêter en 10 secondes.

import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const SA_RE = /^sa[a-f0-9]{20,80}$/i;

type AffiliateRow = {
  sa: string;
  email: string;
  display_name: string | null;
  status: string;
  created_at: string;
};

type ClickRow = {
  id: number;
  page_url: string | null;
  referrer: string | null;
  created_at: string;
};

type ConversionRow = {
  id: string;
  email: string;
  page_url: string | null;
  created_at: string;
};

type CommissionRow = {
  id: string;
  sio_order_id: string;
  customer_email: string;
  sale_amount_cents: number;
  commission_cents: number;
  status: string;
  sale_at: string;
};

type StatsRow = {
  total_clicks: number;
  total_conversions: number;
  total_sales: number;
  total_commission_cents: number;
};

function eur(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function AffiliateDiagnosticPage({
  searchParams,
}: {
  searchParams: Promise<{ sa?: string; email?: string }>;
}) {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  const sp = await searchParams;
  const saInput = (sp.sa ?? "").trim();
  const emailInput = (sp.email ?? "").trim().toLowerCase();

  // Si pas de query, on affiche un mini-form de recherche.
  if (!saInput && !emailInput) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Diagnostic affiliation</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Recherche par SA ou par email. Affiche clicks, conversions, commissions et compteurs
          dans une seule vue. Pratique pour vérifier que le snippet de tracking remonte
          bien les évènements après un test de partage.
        </p>
        <form method="get" className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">SA</label>
            <input
              name="sa"
              placeholder="sa00126869547ccc..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="text-xs text-center text-muted-foreground">OU</div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Email affilié</label>
            <input
              name="email"
              type="email"
              placeholder="contact.webyneo@gmail.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Diagnostiquer
          </button>
        </form>
      </main>
    );
  }

  // Resolution affiliate : par SA (validé) ou par email.
  let affiliate: AffiliateRow | null = null;
  if (saInput) {
    if (!SA_RE.test(saInput)) {
      return (
        <Wrap>
          <p className="text-destructive">SA invalide. Format attendu : <code>sa</code> + 20 à 80 caractères hex.</p>
          <BackLink />
        </Wrap>
      );
    }
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("sa, email, display_name, status, created_at")
      .eq("sa", saInput)
      .maybeSingle();
    affiliate = (data as AffiliateRow | null) ?? null;
  } else if (emailInput) {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("sa, email, display_name, status, created_at")
      .ilike("email", emailInput)
      .maybeSingle();
    affiliate = (data as AffiliateRow | null) ?? null;
  }

  if (!affiliate) {
    return (
      <Wrap>
        <p className="text-destructive">Aucun affilié trouvé pour cette recherche.</p>
        <p className="text-xs text-muted-foreground">
          Vérifie que le contact est bien dans la table <code>affiliates</code> avec status
          <code> active</code>.
        </p>
        <BackLink />
      </Wrap>
    );
  }

  const sa = affiliate.sa;
  const [clicksRes, conversionsRes, commissionsRes, statsRes] = await Promise.all([
    supabaseAdmin
      .from("affiliate_clicks")
      .select("id, page_url, referrer, created_at")
      .eq("sa", sa)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("affiliate_conversions")
      .select("id, email, page_url, created_at")
      .eq("sa", sa)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("affiliate_commissions")
      .select("id, sio_order_id, customer_email, sale_amount_cents, commission_cents, status, sale_at")
      .eq("sa", sa)
      .order("sale_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("affiliate_stats")
      .select("total_clicks, total_conversions, total_sales, total_commission_cents")
      .eq("sa", sa)
      .maybeSingle(),
  ]);

  const clicks = (clicksRes.data ?? []) as ClickRow[];
  const conversions = (conversionsRes.data ?? []) as ConversionRow[];
  const commissions = (commissionsRes.data ?? []) as CommissionRow[];
  const stats = (statsRes.data as StatsRow | null) ?? {
    total_clicks: 0,
    total_conversions: 0,
    total_sales: 0,
    total_commission_cents: 0,
  };

  return (
    <Wrap>
      <header className="rounded-lg border bg-card p-4 space-y-1">
        <div className="text-xs text-muted-foreground">Affilié</div>
        <div className="font-semibold">
          {affiliate.display_name || affiliate.email}
        </div>
        <div className="text-xs text-muted-foreground">{affiliate.email}</div>
        <div className="text-xs text-muted-foreground font-mono break-all">SA : {affiliate.sa}</div>
        <div className="text-xs">
          Status :{" "}
          <span
            className={`font-semibold ${
              affiliate.status === "active" ? "text-emerald-600" : "text-destructive"
            }`}
          >
            {affiliate.status}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Clicks" value={stats.total_clicks} />
        <Stat label="Conversions" value={stats.total_conversions} />
        <Stat label="Ventes" value={stats.total_sales} />
        <Stat label="Commissions" value={eur(stats.total_commission_cents)} />
      </section>

      <Section title={`Derniers clicks (${clicks.length})`}>
        {clicks.length === 0 ? (
          <Empty>
            Aucun click enregistré. Vérifie que <code>affiliate-tracker.js</code> est chargé sur
            la page (Network -&gt; <code>app.tipote.com/widgets/affiliate-tracker.js</code> 200).
          </Empty>
        ) : (
          <ul className="text-sm space-y-1">
            {clicks.map((c) => (
              <li key={c.id} className="border-b last:border-0 py-1.5">
                <div className="text-xs text-muted-foreground">{formatDate(c.created_at)}</div>
                <div className="text-xs truncate">{c.page_url ?? "—"}</div>
                {c.referrer && (
                  <div className="text-[11px] text-muted-foreground truncate">← {c.referrer}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Dernières conversions (${conversions.length})`}>
        {conversions.length === 0 ? (
          <Empty>
            Aucune conversion enregistrée. Vérifie : (1) snippet JS chargé sur la page opt-in ;
            (2) automation SIO &quot;Envoyer un webhook&quot; vers{" "}
            <code>/api/affiliate/sio-conversion</code> configurée en backup.
          </Empty>
        ) : (
          <ul className="text-sm space-y-1">
            {conversions.map((c) => (
              <li key={c.id} className="border-b last:border-0 py-1.5">
                <div className="text-xs text-muted-foreground">{formatDate(c.created_at)}</div>
                <div className="font-medium">{c.email}</div>
                {c.page_url && (
                  <div className="text-[11px] text-muted-foreground truncate">{c.page_url}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Commissions (${commissions.length})`}>
        {commissions.length === 0 ? (
          <Empty>Aucune commission attribuée à cet affilié.</Empty>
        ) : (
          <ul className="text-sm space-y-1">
            {commissions.map((c) => (
              <li key={c.id} className="border-b last:border-0 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.customer_email}</span>
                  <span className="text-xs">{eur(c.commission_cents)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(c.sale_at)} - vente {eur(c.sale_amount_cents)} - {c.status}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <BackLink />
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Diagnostic affiliation</h1>
      </div>
      {children}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="rounded-lg border bg-card p-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function BackLink() {
  return (
    <Link
      href="/admin/diagnostic"
      className="text-xs text-primary underline inline-flex items-center gap-1"
    >
      <ExternalLink className="h-3 w-3" />
      Nouvelle recherche
    </Link>
  );
}
