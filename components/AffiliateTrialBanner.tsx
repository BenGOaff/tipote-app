// components/AffiliateTrialBanner.tsx
//
// Bandeau qui s'affiche dans le dashboard Tipote (haut de page) quand
// l'utilisateur connecté est un affilié en mois Tiquiz Plus offert.
// Indique les jours restants et renvoie vers Tiquiz.
//
// Server component mounté dans le root layout Tipote. Lit la row
// affiliates en faisant le join via l'email auth du user — la table
// affiliates (côté Tipote) reste la source de vérité du trial même
// après le swap Tipote→Tiquiz (Béné 2 juin 2026), pour pouvoir afficher
// le bandeau sans avoir à interroger la DB Tiquiz à chaque page Tipote.

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
  if (!user?.email) return null;

  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("trial_expires_at, trial_activated_at")
    .ilike("email", user.email)
    .maybeSingle();
  const aff = data as {
    trial_expires_at: string | null;
    trial_activated_at: string | null;
  } | null;

  if (!aff?.trial_activated_at || !aff.trial_expires_at) return null;

  const expiresAt = aff.trial_expires_at;
  const daysLeft = daysUntil(expiresAt);
  if (daysLeft < 0) return null;

  // Locale : on suit la locale Tipote de l'user (cookie ui_locale).
  // Le banner s'affiche dans le contexte Tipote, donc on respecte ce
  // choix-là (et non la locale de la session affilié).
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
            href="https://www.tipote.fr/tiquiz/commande"
            className="underline text-xs font-medium whitespace-nowrap"
          >
            {t.banner.keep_tipote}
          </Link>
        )}
        <Link
          href="/affiliate/trial-tiquiz"
          className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap"
        >
          {t.banner.my_trial}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
