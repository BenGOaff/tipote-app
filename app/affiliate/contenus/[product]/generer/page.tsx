// app/affiliate/contenus/[product]/generer/page.tsx
//
// Rayon "Générer du contenu" : l'atelier d'écriture assisté, cadré sur
// le produit du dossier courant. Les faits produits et les règles vivent
// côté serveur, l'affilié n'écrit jamais le prompt système.

import { notFound, redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { getDict, interpolate, normaliseLocale } from "../../../i18n";
import { ContentBreadcrumb } from "../../../components/ContentNav";
import { GeneratorClient } from "./GeneratorClient";
import {
  contentHref,
  isContentProduct,
  PRODUCT_NAME,
  productAffiliateLink,
} from "@/lib/affiliate/contentSpace";
import { resolveAffiliateMarket } from "@/lib/affiliate/contentLocales";

export const dynamic = "force-dynamic";

export default async function GenererSectionPage({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const { product } = await params;
  if (!isContentProduct(product)) notFound();

  const t = getDict(normaliseLocale(session.locale));
  const cs = t.content_space;
  const market =
    product === "atelier"
      ? "fr"
      : resolveAffiliateMarket(undefined, session.locale);
  const link = await productAffiliateLink(product, market, session.sa);
  const displayName = session.display_name ?? session.email.split("@")[0];

  return (
    <main className="space-y-6">
      <ContentBreadcrumb
        trail={[
          { label: cs.page_title, href: "/contenus" },
          { label: PRODUCT_NAME[product], href: contentHref(product) },
          { label: cs.section_generer },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {cs.section_generer}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {interpolate(cs.generer_subtitle, { product: PRODUCT_NAME[product] })}
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-5 text-sm leading-relaxed text-muted-foreground">
          {interpolate(cs.generer_help, { product: PRODUCT_NAME[product] })}
        </CardContent>
      </Card>

      <GeneratorClient
        product={product}
        affiliateLink={link}
        displayName={displayName}
      />
    </main>
  );
}
