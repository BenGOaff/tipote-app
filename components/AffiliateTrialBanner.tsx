// components/AffiliateTrialBanner.tsx
//
// Bandeau qui s'affiche dans le dashboard Tipote (haut de page) quand
// l'utilisateur est en trial affilié actif. Indique les jours restants.
//
// Server component qui lit profiles.trial_expires_at. Mounté dans le
// root layout Tipote. Utilise les traductions affilié (getDict du
// dossier /app/affiliate/i18n) avec fallback sur la locale Tipote
// next-intl pour suivre le choix global de l'user.

import Link from "next/link";
import { Gift, ArrowRight } from "lucide-react";
import { getLocale } from "next-intl/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDict, interpolate, normaliseLocale } from "@/app/affiliate/i18n";

function daysUntil(dateIso: string): number {
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

export async function AffiliateTrialBanner() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("trial_expires_at, plan_source")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data as { trial_expires_at: string | null; plan_source: string | null } | null;

  if (!profile?.trial_expires_at || profile.plan_source !== "affiliate_trial") return null;

  const expiresAt = profile.trial_expires_at;
  const daysLeft = daysUntil(expiresAt);
  if (daysLeft < 0) return null;

  // Locale : on suit la locale Tipote de l'user (cookie ui_locale).
  // Pas besoin de lire la locale affiliate spécifiquement — le banner
  // s'affiche dans le contexte Tipote, donc on respecte ce choix-là.
  const tipoteLocale = await getLocale();
  const t = getDict(normaliseLocale(tipoteLocale));

  const isUrgent = daysLeft <= 3;
  const remainingText =
    daysLeft === 0
      ? t.banner.expires_today
      : daysLeft === 1
        ? t.banner.expires_singular
        : interpolate(t.banner.expires_plural, { days: daysLeft });

  return (
    <div
      className={`border-b px-4 py-2.5 text-sm flex items-center justify-between gap-3 flex-wrap ${
        isUrgent
          ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 text-amber-900 dark:text-amber-100"
          : "bg-primary/5 border-primary/20 text-foreground"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Gift className={`h-4 w-4 flex-shrink-0 ${isUrgent ? "text-amber-600 dark:text-amber-400" : "text-primary"}`} />
        <span className="truncate">
          <strong>{t.banner.title_active}</strong>{" "}
          {remainingText}
          {!isUrgent && (
            <span className="text-muted-foreground ml-1 hidden sm:inline">
              {t.banner.offered_via_affiliate}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isUrgent && (
          <Link
            href="https://www.tipote.fr/commande"
            className="underline text-xs font-medium whitespace-nowrap"
          >
            {t.banner.keep_tipote}
          </Link>
        )}
        <Link
          href="https://affiliate.tipote.com/trial-tipote"
          className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap"
        >
          {t.banner.my_trial}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
