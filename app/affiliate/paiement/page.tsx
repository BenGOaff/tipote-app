// app/affiliate/paiement/page.tsx
//
// COMMENT ELLE VEUT ÊTRE PAYÉE, ET QUAND ÇA PART.
//
// Béné, 25 août 2026 : "on doit proposer le choix aux affiliés : Paypal
// ou virement bancaire. Ils doivent pouvoir indiquer leur mail paypal OU
// leur rib pour un virement."
//
// -- CE QUE CETTE PAGE ÉTAIT, ET POURQUOI ------------------------------
//
// Purement informative depuis le 8 juin, et à raison : elle portait un
// formulaire PayPal/IBAN qui faisait croire que la configuration était
// chez nous, alors que tout se passait chez Systeme.io. Les affiliées
// remplissaient et n'étaient pas payées (drame Béné : "arrête d'inventer
// n'importe quoi"). On l'avait donc débranchée en disant la vérité.
//
// **Le formulaire revient parce que le cycle existe enfin** : les
// coordonnées sont lues par `preparerLot`, le lot fige les montants, et
// le fichier SEPA ou la liste PayPal en sortent. Ce qu'elle saisit ici
// sert vraiment à la payer.
//
// -- CE QUI RESTE CHEZ SYSTEME.IO --------------------------------------
//
// Les commissions des ANCIENNES ventes, celles arrivées par leurs
// tunnels. Elles continuent d'être versées là-bas, et la page le dit :
// deux systèmes qui paient en parallèle pendant la transition, et une
// affiliée qui ne saurait pas lequel regarde son argent, c'est un ticket
// de support par mois et par personne.

import { redirect } from "next/navigation";
import { ExternalLink, Info, Calendar, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { getDict, normaliseLocale } from "../i18n";
import CoordonneesVersement from "../components/CoordonneesVersement";
import ChoixRecompense from "../components/ChoixRecompense";

export const dynamic = "force-dynamic";

const SIO_AFFILIATE_SETTINGS_URL = "https://systeme.io/dashboard/profile/affiliate-settings";
const SIO_AFFILIATE_INVOICES_URL = "https://systeme.io/dashboard/affiliations";

export default async function PaiementPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t.paiement.page_title}</h1>
        <p className="text-muted-foreground mt-1">{t.paiement.page_subtitle_sio}</p>
      </div>

      {/* SA RÉCOMPENSE, et le choix qui va avec (Béné, 25 août 2026 :
          "c'est lui qui choisit quand il remplit son profil"). Elle est
          au dessus des coordonnées parce que c'est la bonne nouvelle :
          la page commence par ce qu'il gagne, pas par un formulaire. */}
      <ChoixRecompense />

      {/* LE CHOIX ET LES COORDONNÉES, chez nous. */}
      <CoordonneesVersement t={t} />

      {/* ET CE QUI RESTE CHEZ EUX, dit clairement : les commissions des
          ventes arrivées par leurs anciens tunnels s'y versent encore.
          Une affiliée qui ne sait pas lequel des deux regarde son
          argent, c'est un ticket de support par mois et par personne. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" />
            {t.paiement.sio_config_title}
          </CardTitle>
          <CardDescription>{t.paiement.sio_config_body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
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
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
