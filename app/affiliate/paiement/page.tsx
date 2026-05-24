// app/affiliate/paiement/page.tsx
//
// Onglet Paiement : config du moyen de paiement (PayPal ou Virement).
// Lit/écrit affiliates.{paypal_email, iban_holder, iban_number}.

import { redirect } from "next/navigation";
import { CreditCard, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { PaymentForm } from "./PaymentForm";
import { getDict, normaliseLocale } from "../i18n";

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

  const t = getDict(normaliseLocale(session.locale));
  const info = await fetchPaymentInfo(session.sa);

  return (
    <>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.paiement.page_title}</h1>
          <p className="text-muted-foreground mt-1">{t.paiement.page_subtitle}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              {t.paiement.method_title}
            </CardTitle>
            <CardDescription>{t.paiement.method_description}</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentForm initial={info} />
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {t.paiement.conditions_title}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>{t.paiement.conditions_frequency}</p>
            <p>{t.paiement.conditions_minimum}</p>
            <p>{t.paiement.conditions_currency}</p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
