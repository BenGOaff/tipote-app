// app/affiliate/contenus/[product]/logos/page.tsx
//
// Rayon "Logo et branding" : les fichiers officiels du produit, en un
// clic. Objectif : qu'aucun affilié n'aille récupérer un logo pixelisé
// sur Google Images pour illustrer sa story.

import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { getDict, interpolate, normaliseLocale } from "../../../i18n";
import { ContentBreadcrumb } from "../../../components/ContentNav";
import {
  contentHref,
  isContentProduct,
  PRODUCT_NAME,
} from "@/lib/affiliate/contentSpace";
import { BRAND_KITS } from "@/lib/affiliate/brandKits";

export const dynamic = "force-dynamic";

export default async function LogosSectionPage({
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
  const assets = BRAND_KITS[product];

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <ContentBreadcrumb
        trail={[
          { label: cs.page_title, href: "/contenus" },
          { label: PRODUCT_NAME[product], href: contentHref(product) },
          { label: cs.section_logos },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {cs.section_logos}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {interpolate(cs.logos_subtitle, { product: PRODUCT_NAME[product] })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assets.map((asset) => (
          <Card key={asset.id}>
            <CardContent className="space-y-3 pt-6">
              <div
                className={`relative flex h-32 items-center justify-center overflow-hidden rounded-lg border border-border p-4 ${
                  asset.preview === "dark" ? "bg-neutral-900" : "bg-muted/40"
                }`}
              >
                <Image
                  src={asset.file}
                  alt={cs[`brand_${asset.labelKey}`]}
                  width={220}
                  height={110}
                  className="h-full w-auto object-contain"
                  unoptimized={asset.format === "SVG"}
                />
              </div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium leading-tight">
                  {cs[`brand_${asset.labelKey}`]}
                </p>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {asset.format}
                </Badge>
              </div>
              <Button size="sm" variant="outline" asChild className="w-full">
                <a href={asset.file} download>
                  <Download className="mr-1.5 h-4 w-4" />
                  {cs.brand_download}
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {cs.logos_rules}
        </CardContent>
      </Card>
    </main>
  );
}
