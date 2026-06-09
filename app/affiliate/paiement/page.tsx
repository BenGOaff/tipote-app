// app/affiliate/paiement/page.tsx
//
// Page Paiement (drame Bene 8 juin 2026) : info-only.
//
// Le paiement de l'affiliation est gere DIRECTEMENT par Systeme.io
// (pas par Tipote). L'affilie configure PayPal ou virement (RIB) dans
// son profil SIO -> systeme.io/dashboard/profile/affiliate-settings.
// Bene effectue les virements entre le 10 et le 13 de chaque mois,
// apres validation des commissions au terme du delai de retractation
// legal. L'historique des factures se consulte aussi cote SIO.
//
// Avant ce fix, cette page contenait un formulaire PayPal/IBAN qui
// faisait croire a tort que la config etait cote Tipote -> les
// affilies remplissaient mais n'etaient pas payes (drame Bene :
// "arrete d'inventer n'importe quoi"). Les colonnes paypal_email /
// iban_holder / iban_number restent en DB pour ne pas casser l'API
// existante mais ne sont plus exposees ni consultees.

import { redirect } from "next/navigation";
import { ExternalLink, Info, Calendar, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { getDict, normaliseLocale } from "../i18n";

export const dynamic = "force-dynamic";

const SIO_AFFILIATE_SETTINGS_URL = "https://systeme.io/dashboard/profile/affiliate-settings";
const SIO_AFFILIATE_INVOICES_URL = "https://systeme.io/dashboard/affiliations";

export default async function PaiementPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t.paiement.page_title}</h1>
        <p className="text-muted-foreground mt-1">{t.paiement.page_subtitle_sio}</p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" />
            {t.paiement.sio_config_title}
          </CardTitle>
          <CardDescription>{t.paiement.sio_config_body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a
              href={SIO_AFFILIATE_SETTINGS_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.paiement.sio_config_cta}
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            {t.paiement.schedule_title}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>{t.paiement.schedule_when}</p>
          <p>{t.paiement.schedule_cooloff}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {t.paiement.invoices_title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t.paiement.invoices_body}</p>
          <Button variant="outline" asChild>
            <a
              href={SIO_AFFILIATE_INVOICES_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.paiement.invoices_cta}
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-amber-300/40 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="pt-5 flex items-start gap-3">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {t.paiement.note_no_action_in_tipote}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
