// app/affiliate/paiement/page.tsx
//
// Onglet Paiement : config du moyen de paiement (PayPal ou Virement).
// Lit/écrit affiliates.{paypal_email, iban_holder, iban_number}.

import { redirect } from "next/navigation";
import { CreditCard, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AffiliateNav } from "../components/AffiliateNav";
import { PaymentForm } from "./PaymentForm";

export const dynamic = "force-dynamic";

type PaymentInfo = {
  paypal_email: string | null;
  iban_holder: string | null;
  iban_number: string | null;
};

async function fetchPaymentInfo(sa: string): Promise<PaymentInfo> {
  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("paypal_email, iban_holder, iban_number")
    .eq("sa", sa)
    .maybeSingle();
  return (data as PaymentInfo | null) ?? {
    paypal_email: null,
    iban_holder: null,
    iban_number: null,
  };
}

export default async function PaiementPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const info = await fetchPaymentInfo(session.sa);

  return (
    <div className="min-h-screen bg-background">
      <AffiliateNav displayName={session.display_name ?? session.email.split("@")[0]} />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paiement</h1>
          <p className="text-muted-foreground mt-1">
            Configure ton moyen de paiement pour recevoir tes commissions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Méthode de paiement
            </CardTitle>
            <CardDescription>
              Tu peux choisir l&apos;une ou l&apos;autre méthode. PayPal est plus rapide, le
              virement bancaire (RIB) est gratuit pour toi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentForm initial={info} />
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Conditions de paiement
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">Fréquence</strong> : les commissions sont
              versées le <strong className="text-foreground">10 de chaque mois</strong>,
              minimum 30 jours après la vente (délai d&apos;éventuelle annulation client).
            </p>
            <p>
              <strong className="text-foreground">Seuil minimum</strong> :{" "}
              <strong className="text-foreground">50 €</strong>. Si ton solde éligible est
              inférieur le 10, on reporte au mois suivant.
            </p>
            <p>
              <strong className="text-foreground">Devise</strong> : EUR. Pour PayPal,
              vérifie que ton compte accepte EUR.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
