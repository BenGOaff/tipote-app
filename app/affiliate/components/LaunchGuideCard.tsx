// app/affiliate/components/LaunchGuideCard.tsx
//
// Carte du guide de lancement 6 étapes affichée sur l'overview tant
// que l'affilié n'a pas terminé. Une fois les 6 étapes done, on
// affiche un mini-bandeau "bravo" pendant quelques jours puis on
// masque totalement (logique du parent).
//
// 3 steps auto-détectées (profile, payment, trial) + 3 self-attestées
// (link_copied, first_email, first_post) via /affiliate/api/guide.

import { Sparkles, Check, Circle, Trophy } from "lucide-react";
import { lireCoordonnees, peutEtrePayee } from "@/lib/affiliate/coordonnees";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDict, interpolate, normaliseLocale } from "../i18n";
import { LaunchGuideToggle } from "./LaunchGuideToggle";

type AffiliateRow = {
  display_name: string | null;
  locale: string | null;
  trial_activated_at: string | null;
  launch_guide_completed: Record<string, string> | null;
  // Les coordonnées de versement, pour SAVOIR si l'étape est faite au
  // lieu de le demander. Voir plus bas.
  payout_method: string | null;
  paypal_email: string | null;
  iban_holder: string | null;
  iban_number: string | null;
};

type Step = {
  key: string;
  title: string;
  body: string;
  done: boolean;
  selfAttest: "link_copied" | "first_email" | "first_post" | "payment_set" | null;
};

export async function LaunchGuideCard({
  sa,
  locale,
}: {
  sa: string;
  locale: string;
}) {
  const { data } = await supabaseAdmin
    .from("affiliates")
    .select(
      "display_name, locale, trial_activated_at, launch_guide_completed, " +
        "payout_method, paypal_email, iban_holder, iban_number",
    )
    .eq("sa", sa)
    .maybeSingle();
  const row = data as AffiliateRow | null;
  if (!row) return null;

  const t = getDict(normaliseLocale(locale));
  const self = row.launch_guide_completed ?? {};

  const steps: Step[] = [
    {
      key: "profile",
      title: t.overview.guide_step_profile_title,
      body: t.overview.guide_step_profile_body,
      done: !!(row.display_name && row.locale),
      selfAttest: null,
    },
    {
      key: "link",
      title: t.overview.guide_step_link_title,
      body: t.overview.guide_step_link_body,
      done: !!self.link_copied,
      selfAttest: "link_copied",
    },
    {
      // CETTE ÉTAPE N'EST PLUS AUTO-DÉCLARÉE (audit du 30 août 2026).
      //
      // Elle l'était depuis le 8 juin, parce qu'à l'époque le paiement
      // se configurait VRAIMENT chez Systeme.io et qu'on ne pouvait
      // donc pas le vérifier. Depuis le 25 août, c'est NOUS qui virons,
      // et `construireLot` ÉCARTE (raison "coordonnees") tout affilié
      // dont `peutEtrePayee()` est faux.
      //
      // Un affilié pouvait donc cocher "fait", croire que tout était en
      // ordre, et n'être jamais payé. Sans le moindre symptôme, et sans
      // que personne ne puisse le lui dire.
      //
      // On lit maintenant la MÊME fonction que le lot de versement :
      // l'étape est verte quand l'argent peut vraiment partir, et pas
      // avant. C'est la seule façon que la case et le virement soient
      // d'accord.
      key: "payment",
      title: t.overview.guide_step_payment_title,
      body: t.overview.guide_step_payment_body,
      done: peutEtrePayee(
        lireCoordonnees({
          payout_method: row.payout_method,
          paypal_email: row.paypal_email,
          iban_holder: row.iban_holder,
          iban_number: row.iban_number,
        }),
      ),
      selfAttest: null,
    },
    {
      key: "trial",
      title: t.overview.guide_step_trial_title,
      body: t.overview.guide_step_trial_body,
      done: !!row.trial_activated_at,
      selfAttest: null,
    },
    {
      key: "email",
      title: t.overview.guide_step_email_title,
      body: t.overview.guide_step_email_body,
      done: !!self.first_email,
      selfAttest: "first_email",
    },
    {
      key: "post",
      title: t.overview.guide_step_post_title,
      body: t.overview.guide_step_post_body,
      done: !!self.first_post,
      selfAttest: "first_post",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  // Tout fait : carte de félicitations compacte.
  if (allDone) {
    return (
      <Card className="border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20">
        <CardContent className="pt-5 pb-5 flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">
              {t.overview.guide_completed_title}
            </p>
            <p className="text-sm text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
              {t.overview.guide_completed_body}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{t.overview.guide_title}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {interpolate(t.overview.guide_progress, { done: doneCount, total: steps.length })}
          </Badge>
        </div>
        <CardDescription>{t.overview.guide_subtitle}</CardDescription>
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((s) => (
          <div
            key={s.key}
            className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${
              s.done ? "border-primary/30 bg-primary/5" : "border-border"
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {s.done ? (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${s.done ? "text-foreground" : ""}`}>
                {s.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.body}</p>
            </div>
            {s.selfAttest && (
              <div className="flex-shrink-0">
                <LaunchGuideToggle step={s.selfAttest} done={s.done} />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
