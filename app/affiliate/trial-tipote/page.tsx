// app/affiliate/trial-tipote/page.tsx
//
// Page de gestion du trial Tipote 1 mois pour les affiliés.

import { redirect } from "next/navigation";
import Link from "next/link";
import { Gift, Clock, CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { TrialActivateButton } from "./TrialActivateButton";
import { getDict, interpolate, normaliseLocale } from "../i18n";
import type { AffiliateDict } from "../i18n/types";

export const dynamic = "force-dynamic";

type TrialRow = {
  trial_activated_at: string | null;
  trial_expires_at: string | null;
};

async function fetchTrial(sa: string): Promise<TrialRow> {
  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("trial_activated_at, trial_expires_at")
    .eq("sa", sa)
    .maybeSingle();
  return (data as TrialRow | null) ?? {
    trial_activated_at: null,
    trial_expires_at: null,
  };
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (24 * 3600 * 1000));
}

function formatDate(iso: string, locale: string): string {
  const localeMap: Record<string, string> = {
    fr: "fr-FR",
    en: "en-US",
    es: "es-ES",
    it: "it-IT",
    pt: "pt-PT",
    ar: "ar",
  };
  return new Date(iso).toLocaleDateString(localeMap[locale] ?? "fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function TrialTipotePage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const locale = normaliseLocale(session.locale);
  const t = getDict(locale);

  const trial = await fetchTrial(session.sa);
  const now = new Date();

  const isActivated = !!trial.trial_activated_at;
  const expiresAt = trial.trial_expires_at ? new Date(trial.trial_expires_at) : null;
  const isActive = isActivated && expiresAt && expiresAt > now;
  const isExpired = isActivated && expiresAt && expiresAt <= now;


  return (
    <>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-7 w-7 text-primary" />
            {t.trial.page_title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t.trial.page_subtitle}
          </p>
        </div>

        {!isActivated && <TrialNotActivated email={session.email} t={t} />}
        {isActive && expiresAt && <TrialActive expiresAt={expiresAt} now={now} t={t} locale={locale} />}
        {isExpired && expiresAt && <TrialExpired expiresAt={expiresAt} t={t} locale={locale} />}
      </main>
    </>
  );
}

function TrialNotActivated({ email, t }: { email: string; t: AffiliateDict }) {
  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-xl">{t.trial.not_activated_title}</CardTitle>
          <CardDescription>{t.trial.not_activated_subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <FeatureLine text={t.trial.feature_1} />
            <FeatureLine text={t.trial.feature_2} />
            <FeatureLine text={t.trial.feature_3} />
            <FeatureLine text={t.trial.feature_4} />
            <FeatureLine text={t.trial.feature_5} />
          </div>

          <div className="rounded-lg bg-background/60 border border-border p-4 text-sm space-y-2">
            <p className="font-medium">{t.trial.timing_title}</p>
            <p className="text-muted-foreground">{t.trial.timing_body}</p>
          </div>

          <TrialActivateButton email={email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.trial.why_offered_title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>{t.trial.why_offered_body_1}</p>
          <p>{t.trial.why_offered_body_2}</p>
        </CardContent>
      </Card>
    </>
  );
}

function TrialActive({ expiresAt, now, t, locale }: { expiresAt: Date; now: Date; t: AffiliateDict; locale: string }) {
  const daysRemaining = daysBetween(now, expiresAt);
  const totalDays = 30;
  const progressPercent = Math.max(0, Math.min(100, (daysRemaining / totalDays) * 100));
  const remainingText = interpolate(
    daysRemaining > 1 ? t.trial.active_remaining_plural : t.trial.active_remaining_singular,
    { count: daysRemaining },
  );

  return (
    <>
      <Card className="border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              {t.trial.active_title}
            </CardTitle>
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
              <Clock className="h-3 w-3 mr-1" />
              {remainingText}
            </Badge>
          </div>
          <CardDescription>
            {interpolate(t.trial.active_subtitle, { date: formatDate(expiresAt.toISOString(), locale) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t.trial.today_label}</span>
              <span>{t.trial.end_label}</span>
            </div>
            <div className="h-2 bg-emerald-100 dark:bg-emerald-900/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <Button size="lg" className="w-full" asChild>
            <a
              href="https://app.tipote.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.trial.access_tipote}
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.trial.ideas_title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>{t.trial.idea_screencast}</p>
          <p>{t.trial.idea_screenshots}</p>
          <p>{t.trial.idea_niche}</p>
          <p>{t.trial.idea_bonus}</p>
        </CardContent>
      </Card>
    </>
  );
}

function TrialExpired({ expiresAt, t, locale }: { expiresAt: Date; t: AffiliateDict; locale: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t.trial.expired_title}</CardTitle>
        <CardDescription>
          {interpolate(t.trial.expired_subtitle, { date: formatDate(expiresAt.toISOString(), locale) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">{t.trial.expired_body_1}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{t.trial.expired_body_2}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button asChild>
            <a
              href="https://www.tipote.fr/commande"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.trial.discover_plans}
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/promouvoir">{t.trial.continue_promoting}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}
