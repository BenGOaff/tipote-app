// app/affiliate/trial-tipote/page.tsx
//
// Page de gestion du trial Tipote 1 mois pour les affiliés.
// Trois états possibles selon affiliates.trial_activated_at et
// trial_expires_at :
//   1. Pas encore activé → écran d'explication + bouton "Activer"
//   2. Trial actif → countdown "X jours restants" + lien app.tipote.com
//   3. Trial expiré → message "C'est terminé" + CTA upgrade

import { redirect } from "next/navigation";
import Link from "next/link";
import { Gift, Clock, CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AffiliateNav } from "../components/AffiliateNav";
import { TrialActivateButton } from "./TrialActivateButton";

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function TrialTipotePage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const trial = await fetchTrial(session.sa);
  const now = new Date();

  const isActivated = !!trial.trial_activated_at;
  const expiresAt = trial.trial_expires_at ? new Date(trial.trial_expires_at) : null;
  const isActive = isActivated && expiresAt && expiresAt > now;
  const isExpired = isActivated && expiresAt && expiresAt <= now;

  const displayName = session.display_name ?? session.email.split("@")[0];

  return (
    <div className="min-h-screen bg-background">
      <AffiliateNav displayName={displayName} />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-7 w-7 text-primary" />
            Trial Tipote 1 mois offert
          </h1>
          <p className="text-muted-foreground mt-1">
            Profite de Tipote en Elite gratuitement pendant 30 jours pour
            tester l&apos;outil et créer du contenu de promo.
          </p>
        </div>

        {!isActivated && <TrialNotActivated email={session.email} />}
        {isActive && expiresAt && <TrialActive expiresAt={expiresAt} now={now} />}
        {isExpired && expiresAt && <TrialExpired expiresAt={expiresAt} />}
      </main>
    </div>
  );
}

function TrialNotActivated({ email }: { email: string }) {
  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-xl">Ton trial Tipote t&apos;attend</CardTitle>
          <CardDescription>
            Une activation, valable 30 jours, à utiliser quand tu veux.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <FeatureLine text="Plan Elite débloqué pour ton compte Tipote (le plus complet)" />
            <FeatureLine text="Création illimitée de quiz, popquizs, pages link-in-bio" />
            <FeatureLine text="Accès aux pépites IA, à la stratégie, aux templates premium" />
            <FeatureLine text="Idéal pour créer des screenshots, des vidéos démo, du contenu promo" />
            <FeatureLine text="Aucune carte bancaire requise. Stop automatique à J+30." />
          </div>

          <div className="rounded-lg bg-background/60 border border-border p-4 text-sm space-y-2">
            <p className="font-medium">⏰ Tu choisis quand activer</p>
            <p className="text-muted-foreground">
              Tu ne peux activer ton trial qu&apos;UNE seule fois. Réserve-le
              pour le bon moment — quand tu as 2h devant toi pour explorer,
              créer ton premier quiz, et capturer du contenu pour ta promo.
            </p>
          </div>

          <TrialActivateButton email={email} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pourquoi on t&apos;offre ça ?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>
            Tu seras un meilleur ambassadeur en ayant{" "}
            <strong className="text-foreground">vu Tipote tourner avec tes propres données</strong>.
            Tu pourras montrer des screenshots authentiques à ton audience,
            faire une vidéo &quot;voilà ce que j&apos;ai créé avec Tipote en 10 min&quot;,
            et répondre aux questions de tes leads avec précision.
          </p>
          <p>
            C&apos;est gagnant-gagnant : on te facilite la vente, tu touches
            tes commissions plus facilement.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function TrialActive({ expiresAt, now }: { expiresAt: Date; now: Date }) {
  const daysRemaining = daysBetween(now, expiresAt);
  const totalDays = 30;
  const progressPercent = Math.max(0, Math.min(100, (daysRemaining / totalDays) * 100));

  return (
    <>
      <Card className="border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              Trial actif
            </CardTitle>
            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
              <Clock className="h-3 w-3 mr-1" />
              {daysRemaining} {daysRemaining > 1 ? "jours" : "jour"} restant
              {daysRemaining > 1 ? "s" : ""}
            </Badge>
          </div>
          <CardDescription>
            Ton compte Tipote est en plan <strong>Elite</strong> jusqu&apos;au{" "}
            <strong>{formatDate(expiresAt.toISOString())}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Barre de progression */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Aujourd&apos;hui</span>
              <span>Fin du trial</span>
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
              Accéder à Tipote
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bonnes idées de contenu à créer maintenant</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
          <p>
            ⏱️ <strong className="text-foreground">Screencast 5 minutes</strong> : montre la création
            d&apos;un quiz Tiquiz de bout en bout. Poste-le en Reel /
            short YouTube.
          </p>
          <p>
            📸 <strong className="text-foreground">Screenshots avant/après</strong> : ton dashboard
            vide vs. après 30 leads captés. Avant/après c&apos;est ce
            qui convertit le mieux.
          </p>
          <p>
            🧪 <strong className="text-foreground">Test sur ta propre niche</strong> : crée un quiz
            adapté à ton audience (ex: &quot;Quel type de [ton métier] es-tu ?&quot;),
            partage-le sur ta liste, raconte les résultats.
          </p>
          <p>
            🎁 <strong className="text-foreground">Bonus exclusif</strong> : promets à tes affiliés
            d&apos;envoyer ton quiz template gratuit en bonus s&apos;ils s&apos;inscrivent
            via ton lien. Effet d&apos;urgence + valeur ajoutée.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function TrialExpired({ expiresAt }: { expiresAt: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Ton trial s&apos;est terminé</CardTitle>
        <CardDescription>
          Il a expiré le <strong>{formatDate(expiresAt.toISOString())}</strong>.
          Ton compte Tipote est repassé en plan gratuit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tu as testé Tipote en Elite pendant 30 jours. Tu connais maintenant
          l&apos;outil dans ses détails. C&apos;est tout ce qu&apos;il fallait pour bien
          le vendre à ton audience.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Si tu veux continuer à l&apos;utiliser pour toi-même (sur ton propre
          business), prends un abonnement Elite. Tu peux aussi continuer à
          promouvoir Tipote depuis ton compte gratuit — les liens
          d&apos;affiliation et les ressources promo restent disponibles ici.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button asChild>
            <a
              href="https://www.tipote.fr/commande"
              target="_blank"
              rel="noopener noreferrer"
            >
              Découvrir les plans Tipote
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/promouvoir">Continuer à promouvoir</Link>
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
