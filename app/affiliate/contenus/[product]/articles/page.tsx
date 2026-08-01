// app/affiliate/contenus/[product]/articles/page.tsx
//
// Rayon "Articles de blog". Deux sources : les articles publiés par
// l'admin pour ce produit, et les articles du blog Tipote que l'affilié
// peut promouvoir avec son propre lien tracké (côté Tiquiz uniquement,
// le blog parle de l'outil).

import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDict, interpolate, normaliseLocale } from "../../../i18n";
import { ContentBreadcrumb } from "../../../components/ContentNav";
import { ArticleCard } from "../../../promouvoir/components/ArticleCard";
import { BlogArticlesPicker } from "../../../components/BlogArticlesPicker";
import { fetchBlogArticles } from "@/lib/affiliate/blogFeed";
import {
  contentHref,
  isContentProduct,
  PRODUCT_NAME,
} from "@/lib/affiliate/contentSpace";
import {
  resolveAffiliateMarket,
  AFFILIATE_LIVE_LOCALES,
} from "@/lib/affiliate/contentLocales";
import { ContentLocalePicker } from "../../../components/ContentLocalePicker";

export const dynamic = "force-dynamic";

export default async function ArticlesSectionPage({
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
  const sp = await searchParams;
  const market =
    product === "atelier"
      ? "fr"
      : resolveAffiliateMarket(sp.locale, session.locale);

  const { data } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, title, body")
    .eq("kind", "article")
    .eq("product", product)
    .eq("locale", market)
    .eq("published", true)
    .order("sort_order", { ascending: true });
  const articles = (data ?? []) as {
    id: string;
    title: string | null;
    body: string | null;
  }[];

  // Le flux du blog est best-effort : s'il est down, la section disparaît.
  const blogMarket: "fr" | "en" = market === "en" ? "en" : "fr";
  const blogArticles =
    product === "tiquiz" ? await fetchBlogArticles(blogMarket, 20) : [];

  return (
    <main className="space-y-6">
      <ContentBreadcrumb
        trail={[
          { label: cs.page_title, href: "/contenus" },
          { label: PRODUCT_NAME[product], href: contentHref(product) },
          { label: cs.section_articles },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {cs.section_articles}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {interpolate(cs.articles_subtitle, {
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

      {articles.length > 0 ? (
        <div className="space-y-3">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="space-y-3 pb-6 pt-6 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{cs.articles_empty_title}</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {cs.articles_empty_body}
            </p>
            <Button asChild size="sm">
              <Link href={contentHref(product, "generer")}>
                {cs.articles_empty_cta}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {blogArticles.length > 0 && (
        <BlogArticlesPicker
          articles={blogArticles}
          sa={session.sa}
          market={blogMarket}
        />
      )}
    </main>
  );
}
