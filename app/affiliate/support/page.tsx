// app/affiliate/support/page.tsx
//
// Onglet Support : FAQ + bouton "contacter le support". Pas de
// messaging in-app pour la V1 — mailto direct vers hello@tipote.com.

import { redirect } from "next/navigation";
import { HelpCircle, Mail, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RestartTourButton } from "./RestartTourButton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { getDict, normaliseLocale } from "../i18n";
import type { AffiliateDict } from "../i18n/types";

export const dynamic = "force-dynamic";

function buildFaq(s: AffiliateDict["support"]) {
  return [
    { q: s.faq_payment_q, a: s.faq_payment_a },
    { q: s.faq_cookie_q, a: s.faq_cookie_a },
    { q: s.faq_multi_link_q, a: s.faq_multi_link_a },
    { q: s.faq_best_channels_q, a: s.faq_best_channels_a },
    { q: s.faq_minimum_q, a: s.faq_minimum_a },
    { q: s.faq_subscriptions_q, a: s.faq_subscriptions_a },
    { q: s.faq_self_click_q, a: s.faq_self_click_a },
    { q: s.faq_paid_ads_q, a: s.faq_paid_ads_a },
    { q: s.faq_first_revenue_q, a: s.faq_first_revenue_a },
    { q: s.faq_taxes_q, a: s.faq_taxes_a },
    { q: s.faq_avg_earnings_q, a: s.faq_avg_earnings_a },
    { q: s.faq_missing_commission_q, a: s.faq_missing_commission_a },
  ];
}

export default async function SupportPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const FAQ = buildFaq(t.support);

  return (
    <>
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.support.page_title}</h1>
          <p className="text-muted-foreground mt-1">{t.support.page_subtitle}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              {t.support.contact_title}
            </CardTitle>
            <CardDescription>{t.support.contact_description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
            <Button asChild>
              <a
                href={`mailto:hello@tipote.com?subject=Support%20Affiliation%20-%20${encodeURIComponent(session.email)}`}
              >
                <Mail className="mr-2 h-4 w-4" />
                {t.support.contact_button}
              </a>
            </Button>
            <RestartTourButton />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              {t.support.faq_title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {FAQ.map((item, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-5">
            <p className="text-sm">
              <strong>{t.support.terms_card_title}</strong>
            </p>
            <Button variant="outline" asChild className="mt-3">
              <a
                href="https://www.tipote.fr/conditions-generales-affiliation"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.support.terms_card_button}
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
