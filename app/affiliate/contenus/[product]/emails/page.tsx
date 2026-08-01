// app/affiliate/contenus/[product]/emails/page.tsx
//
// Rayon "Emails de vente" d'un produit. Le lien tracké du PRODUIT courant
// est injecté dans chaque email (celui de l'Atelier dans la campagne
// Atelier, celui de Tiquiz dans la campagne Tiquiz) : c'est la seule
// façon d'être payé sur ce qu'on promeut.

import { notFound, redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDict, interpolate, normaliseLocale } from "../../../i18n";
import { ContentBreadcrumb } from "../../../components/ContentNav";
import { EmailCard } from "../../../promouvoir/components/EmailCard";
import { AtelierEmailCard } from "../../../promouvoir/components/AtelierEmailCard";
import {
  contentHref,
  isContentProduct,
  PRODUCT_NAME,
  productAffiliateLink,
} from "@/lib/affiliate/contentSpace";
import {
  resolveAffiliateMarket,
  AFFILIATE_LIVE_LOCALES,
} from "@/lib/affiliate/contentLocales";
import { ContentLocalePicker } from "../../../components/ContentLocalePicker";
import { ATELIER_EMAILS_FR } from "../../../promouvoir/content/atelier-emails-fr";
import {
  ATELIER_EMAIL_PLAN_3,
  ATELIER_EMAIL_PLAN_7,
} from "../../../promouvoir/content/atelier-plans-fr";
import {
  EMAILS_FR,
  type EmailTemplate,
} from "../../../promouvoir/content/emails-fr";

export const dynamic = "force-dynamic";

export default async function EmailsSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ product: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const { product } = await params;
  if (!isContentProduct(product)) notFound();

  const t = getDict(normaliseLocale(session.locale));
  const cs = t.content_space;
  const displayName = session.display_name ?? session.email.split("@")[0];
  // L'Atelier n'est vendu qu'en France : son kit et ses liens restent sur
  // le marché FR quelle que soit la langue d'interface de l'affilié.
  const sp = await searchParams;
  const market =
    product === "atelier"
      ? "fr"
      : resolveAffiliateMarket(sp.locale, session.locale);
  const link = await productAffiliateLink(product, market, session.sa);

  const { data: ov } = await supabaseAdmin
    .from("affiliates")
    .select("promo_overrides")
    .eq("sa", session.sa)
    .maybeSingle();
  const overrides =
    (ov as { promo_overrides?: Record<string, string> } | null)
      ?.promo_overrides ?? {};

  // Emails Tiquiz : la banque admin prime, repli sur les modèles FR.
  let tiquizEmails: EmailTemplate[] = [];
  if (product === "tiquiz") {
    const { data } = await supabaseAdmin
      .from("affiliate_contents")
      .select("id, title, body, meta")
      .eq("kind", "email")
      .eq("product", "tiquiz")
      .eq("locale", market)
      .eq("published", true)
      .order("sort_order", { ascending: true });
    const rows = (data ?? []).map((r) => {
      const row = r as {
        id: string;
        title: string | null;
        body: string | null;
        meta: Record<string, unknown> | null;
      };
      return {
        id: row.id,
        subject: row.title ?? "",
        preheader: (row.meta?.preheader as string) ?? "",
        body: row.body ?? "",
        notes: (row.meta?.notes as string) ?? undefined,
      };
    });
    tiquizEmails = rows.length ? rows : market === "fr" ? EMAILS_FR : [];
  }

  const planLine = (label: string, plan: number[]) =>
    `${label} ${plan.map((n) => `#${n}`).join(" · ")}`;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <ContentBreadcrumb
        trail={[
          { label: cs.page_title, href: "/contenus" },
          { label: PRODUCT_NAME[product], href: contentHref(product) },
          { label: cs.section_emails },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {cs.section_emails}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {interpolate(cs.emails_subtitle, {
              product: PRODUCT_NAME[product],
            })}
          </p>
        </div>
        {product === "tiquiz" && (
          <ContentLocalePicker
            current={market}
            label={t.promouvoir.market_label}
            locales={AFFILIATE_LIVE_LOCALES}
          />
        )}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-2 pt-5 text-sm">
          <p className="font-medium">{t.promouvoir.emails_info_title}</p>
          <p className="leading-relaxed text-muted-foreground">
            {product === "atelier"
              ? cs.emails_atelier_help
              : t.promouvoir.emails_info_body}
          </p>
          {product === "atelier" && (
            <div className="space-y-1 border-t border-primary/20 pt-2 text-xs text-muted-foreground">
              <p>{planLine(cs.plan_7, ATELIER_EMAIL_PLAN_7)}</p>
              <p>{planLine(cs.plan_3, ATELIER_EMAIL_PLAN_3)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {product === "atelier" ? (
        <div className="space-y-3">
          {ATELIER_EMAILS_FR.map((email, i) => (
            <AtelierEmailCard
              key={email.id}
              email={email}
              index={i}
              affiliateLink={link}
              displayName={displayName}
              overrides={overrides}
            />
          ))}
        </div>
      ) : tiquizEmails.length > 0 ? (
        <div className="space-y-3">
          {tiquizEmails.map((email) => (
            <EmailCard
              key={email.id}
              email={email}
              affiliateLink={link}
              displayName={displayName}
              overrides={overrides}
            />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="space-y-2 pb-6 pt-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{cs.empty_emails}</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {cs.empty_generate_hint}
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
