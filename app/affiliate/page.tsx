// app/affiliate/page.tsx
//
// Vue d'ensemble du dashboard affiliation. Design system Tipote
// (Card, Button, icônes lucide, light theme).

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDict, interpolate, normaliseLocale } from "./i18n";
import { buildAffiliateLink } from "@/lib/affiliate/links";
import { assurerRefAffiliee } from "@/lib/affiliate/refServer";
import { getLinkPath } from "@/lib/affiliate/linkDestinations";
import type { AffiliateDict } from "./i18n/types";
import { TrendingUp, MousePointerClick, Users, ShoppingCart, GraduationCap, Wrench, ArrowRight, Gift } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AffiliateLinkCopy from "./components/AffiliateLinkCopy";
import { LaunchGuideCard } from "./components/LaunchGuideCard";
import { BadgesCard } from "./components/BadgesCard";
import { LeaderboardCard } from "./components/LeaderboardCard";
import NouveautesProgramme from "./components/NouveautesProgramme";
import { conditionsAffiliationUrl } from "@/lib/affiliate/conditionsUrl";

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
              <Link href="/trial-tiquiz">
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
  /**
   * GAGNÉ ET PAS ENCORE VERSÉ. Optionnel : la vue ne le rend qu'une fois
   * la migration `20260831_affiliate_stats_honnetes.sql` passée, et un
   * écran qui plante en attendant serait pire que le chiffre qu'il
   * corrige.
   *
   * Ce qu'il ferme : "En attente" ne comptait que `pending`. Une
   * commission mûre passe `approved` à J+30 et n'est virée qu'entre le
   * 10 et le 13 : pendant cette fenêtre elle n'était NI en attente NI
   * payée. Son argent disparaissait de deux compteurs sur trois.
   */
  a_venir_commission_cents?: number | null;
  /**
   * ANNULÉ (remboursement, impayé). Affiché quand il n'est pas nul.
   *
   * Il était COMPTÉ DANS LE TOTAL jusqu'au 31 août : l'affilié lisait un
   * chiffre qu'il ne toucherait jamais, et l'écart n'apparaissait qu'au
   * virement. Une somme retirée en silence est une décision qu'on ne
   * peut plus expliquer, ni à lui, ni à un comptable.
   */
  cancelled_commission_cents?: number | null;
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
      a_venir_commission_cents: 0,
      cancelled_commission_cents: 0,
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

export default async function AffiliateOverviewPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const displayName = session.display_name ?? session.email.split("@")[0];

  // onboarded_at est lu côté layout pour le tour (cf. layout.tsx), pas
  // besoin de re-fetch ici.
  const stats = await fetchStats(session.sa);

  const isFr = normaliseLocale(session.locale) === "fr";
  // Lien principal du marché de l'affilié (FR → tipote.fr, EN → tipote.blog).
  // Drame Bene 8 juin 2026 : avant ce fix on construisait "/" (racine =
  // page d'accueil Tipote) -> Tipote n'est PAS en vente, on n'en parle
  // NULLE PART en affiliation. Maintenant on prend le path "tiquiz_main"
  // depuis la table affiliate_link_destinations (admin-editable, defaut
  // /part-tiquiz).
  const mainPath = await getLinkPath("tiquiz_main");
  // LE CODE PUBLIC, JAMAIS LE `sa` (Béné, 24 août 2026). Fabriqué au
  // premier passage si l'affiliée n'en a pas encore.
  const refCode = await assurerRefAffiliee({
    sa: session.sa,
    email: session.email,
    displayName: session.display_name,
    refConnu: session.ref,
  });
  const linkUrl = refCode ? buildAffiliateLink(session.locale, mainPath, refCode) : null;
  // Lien Atelier du Quiz (formation, 70%). Bene 31 juillet 2026 : le
  // dashboard donnait l'impression que seul Tiquiz comptait, alors que
  // la priorite strategique est la formation. Les deux produits sont
  // desormais presentes cote a cote, l'Atelier en premier. Formation
  // vendue en FR uniquement -> carte affichee seulement en FR.
  const atelierPath = await getLinkPath("atelier");
  const atelierUrl = refCode ? buildAffiliateLink(session.locale, atelierPath, refCode) : null;
  const conversionRate =
    stats.total_clicks > 0
      ? `${((stats.total_sales / stats.total_clicks) * 100).toFixed(1)}%`
      : "-";

  return (
    <>
      <main className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {interpolate(t.overview.greeting, { name: displayName })}
          </h1>
          <p className="text-muted-foreground mt-1">{t.overview.subtitle}</p>
        </div>

        {/* CE QUI A CHANGÉ, ANNONCÉ (Béné, 26 août 2026 : "je ne vois
            toujours rien des nouveaux liens ni nouveau système ni rien
            sur affiliate : en l'état je peux pas dire à mes users allez
            sur affiliate vous verrez tout est à jour et expliqué !").

            Tout était corrigé et rien n'était annoncé : un affilié qui
            revient voit la même page qu'avant, donc pour lui il ne s'est
            rien passé. C'est la leçon du 3 août appliquée ici, une
            nouveauté qu'on ne montre pas n'existe pas.

            En TÊTE, avant les liens : c'est ce qui explique pourquoi ses
            liens ont changé de forme. Se ferme et s'en souvient. */}
        <NouveautesProgramme
          t={t}
          sa={session.sa}
          conditionsUrl={conditionsAffiliationUrl(session.locale)}
        />

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.overview.promote_title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t.overview.promote_subtitle}</p>
          </div>

          <div className={`grid gap-4 ${isFr ? "md:grid-cols-2" : ""}`}>
            {/* L'Atelier du Quiz en premier : commission la plus haute et
                produit prioritaire. Formation vendue en FR uniquement. */}
            {isFr && (
              <PromoteCard
                icon={GraduationCap}
                kind={t.overview.promote_atelier_kind}
                name="L'Atelier du Quiz"
                rate="70%"
                badge={t.overview.promote_atelier_badge}
                pitch={t.overview.promote_atelier_pitch}
                url={atelierUrl}
                hint={interpolate(t.overview.promote_link_hint, { ref: refCode ?? "" })}
                urlIndisponible={t.promouvoir.link_unavailable}
                ctaLabel={t.overview.promote_atelier_cta}
                ctaHref="/contenus"
                highlight
              />
            )}
            <PromoteCard
              icon={Wrench}
              kind={t.overview.promote_tiquiz_kind}
              name="Tiquiz"
              rate="40%"
              pitch={t.overview.promote_tiquiz_pitch}
              url={linkUrl}
              hint={interpolate(t.overview.promote_link_hint, { ref: refCode ?? "" })}
              urlIndisponible={t.promouvoir.link_unavailable}
              ctaLabel={t.overview.promote_tiquiz_cta}
              ctaHref="/promouvoir"
            />
          </div>

          {isFr && (
            <Card className="border-dashed bg-muted/40">
              <CardContent className="pt-5 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{t.overview.promote_combo_title}.</span>{" "}
                {t.overview.promote_combo_body}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Guide de lancement AVANT les compteurs : un affilie qui debute
            voit quoi faire, pas quatre statistiques a zero. Une fois les
            6 etapes faites, la carte se reduit a un bandeau de felicitations
            puis disparait (logique du composant). */}
        <LaunchGuideCard sa={session.sa} locale={session.locale} />

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={MousePointerClick} label={t.overview.stat_clicks} value={stats.total_clicks.toLocaleString("fr-FR")} />
          <StatCard icon={Users} label={t.overview.stat_signups} value={stats.total_conversions.toLocaleString("fr-FR")} />
          <StatCard icon={ShoppingCart} label={t.overview.stat_sales} value={stats.total_sales.toLocaleString("fr-FR")} />
          <StatCard icon={TrendingUp} label={t.overview.stat_conversion_rate} value={conversionRate} />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GainCard label={t.overview.gain_total} value={eur(stats.total_commission_cents)} variant="primary" />
          <GainCard
            label={t.overview.gain_pending}
            // CE QUI EST GAGNÉ ET PAS ENCORE VERSÉ, `pending` comme
            // `approved`. Le repli sur `pending` seul couvre la période
            // où la migration n'est pas encore passée : il vaut mieux
            // l'ancien chiffre qu'un tiret.
            value={eur(stats.a_venir_commission_cents ?? stats.pending_commission_cents)}
            variant="warning"
          />
          <GainCard label={t.overview.gain_paid} value={eur(stats.paid_commission_cents)} variant="success" />
        </section>

        {/*
          L'ANNULÉ SE DIT, il ne se soustrait pas en silence. Rien ne
          s'affiche quand il n'y en a pas : un zéro permanent ferait
          croire à un problème là où il n'y en a aucun.
        */}
        {(stats.cancelled_commission_cents ?? 0) > 0 && (
          <p className="text-sm text-muted-foreground">
            {interpolate(t.overview.gain_annule, {
              montant: eur(stats.cancelled_commission_cents ?? 0),
            })}
          </p>
        )}

        <TrialTipoteCard sa={session.sa} t={t} />

        <BadgesCard stats={stats} t={t} />

        <LeaderboardCard sa={session.sa} locale={session.locale} />
      </main>
    </>
  );
}

/** Carte produit : un produit promouvable = une commission, un pitch, son
 *  propre lien tracké, et le raccourci vers son matériel. `highlight`
 *  marque le produit prioritaire (l'Atelier). */
function PromoteCard({
  icon: Icon,
  kind,
  name,
  rate,
  badge,
  pitch,
  url,
  hint,
  urlIndisponible,
  ctaLabel,
  ctaHref,
  highlight = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  kind: string;
  name: string;
  rate: string;
  badge?: string;
  pitch: string;
  /** `null` = le code public n'a pas pu être préparé. On le DIT. */
  url: string | null;
  hint: string;
  /** La phrase à afficher quand il n'y a pas de lien. */
  urlIndisponible: string;
  ctaLabel: string;
  ctaHref: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary bg-primary/5" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                highlight ? "bg-primary/15" : "bg-muted"
              }`}
            >
              <Icon className={`h-5 w-5 ${highlight ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{kind}</span>
              <CardTitle className="text-lg leading-tight">{name}</CardTitle>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge variant={highlight ? "default" : "secondary"} className="text-base px-3 py-1">
              {rate}
            </Badge>
            {badge && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">
                {badge}
              </span>
            )}
          </div>
        </div>
        <CardDescription className="leading-relaxed pt-2">{pitch}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Pas de code = pas de lien. Un champ vide se copie quand même,
            et un lien muet se partage : chaque partage est alors une
            vente perdue que personne ne peut plus retrouver. */}
        {url ? (
          <>
            <AffiliateLinkCopy url={url} />
            <p className="text-xs text-muted-foreground">{hint}</p>
          </>
        ) : (
          <p className="text-sm text-destructive">{urlIndisponible}</p>
        )}
        <Button variant={highlight ? "default" : "outline"} size="sm" asChild className="mt-1">
          <Link href={ctaHref}>
            {ctaLabel}
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
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
