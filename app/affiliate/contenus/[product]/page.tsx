// app/affiliate/contenus/[product]/page.tsx
//
// Dossier d'un produit : les cinq rayons, avec le compte réel de ce qu'il
// y a dedans (on n'annonce pas "articles" si le rayon est vide).

import { notFound, redirect } from "next/navigation";
import { Mail, Share2, FileText, Palette, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDict, interpolate, normaliseLocale } from "../../i18n";
import { ContentBreadcrumb, FolderCard } from "../../components/ContentNav";
import {
  contentHref,
  isContentProduct,
  PRODUCT_NAME,
  PRODUCT_RATE,
} from "@/lib/affiliate/contentSpace";
import { BRAND_KITS } from "@/lib/affiliate/brandKits";
import { ATELIER_EMAILS_FR } from "../../promouvoir/content/atelier-emails-fr";
import { ATELIER_POSTS_FR } from "../../promouvoir/content/atelier-posts-fr";
import { EMAILS_FR } from "../../promouvoir/content/emails-fr";
import { POSTS_FR } from "../../promouvoir/content/posts-fr";

export const dynamic = "force-dynamic";

export default async function ProductFolderPage({
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

  const emailCount =
    product === "atelier" ? ATELIER_EMAILS_FR.length : EMAILS_FR.length;
  const postCount =
    product === "atelier" ? ATELIER_POSTS_FR.length : POSTS_FR.length;
  const brandCount = BRAND_KITS[product].length;

  const { count } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id", { count: "exact", head: true })
    .eq("kind", "article")
    .eq("product", product)
    .eq("published", true);
  const articleCount = count ?? 0;

  return (
    <main className="space-y-6">
      <ContentBreadcrumb
        trail={[
          { label: cs.page_title, href: "/contenus" },
          { label: PRODUCT_NAME[product] },
        ]}
      />

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {interpolate(cs.folder_promote, { product: PRODUCT_NAME[product] })}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {interpolate(cs.folder_subtitle, { rate: PRODUCT_RATE[product] })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FolderCard
          href={contentHref(product, "emails")}
          icon={Mail}
          title={cs.section_emails}
          description={cs.section_emails_desc}
          meta={interpolate(cs.count_emails, { count: emailCount })}
        />
        <FolderCard
          href={contentHref(product, "reseaux")}
          icon={Share2}
          title={cs.section_reseaux}
          description={cs.section_reseaux_desc}
          meta={interpolate(cs.count_posts, { count: postCount })}
        />
        <FolderCard
          href={contentHref(product, "articles")}
          icon={FileText}
          title={cs.section_articles}
          description={cs.section_articles_desc}
          meta={
            articleCount > 0
              ? interpolate(cs.count_articles, { count: articleCount })
              : cs.count_articles_empty
          }
        />
        <FolderCard
          href={contentHref(product, "logos")}
          icon={Palette}
          title={cs.section_logos}
          description={cs.section_logos_desc}
          meta={interpolate(cs.count_assets, { count: brandCount })}
        />
        <FolderCard
          href={contentHref(product, "generer")}
          icon={Wand2}
          title={cs.section_generer}
          description={cs.section_generer_desc}
          meta={cs.count_generer}
          highlight
        />
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {interpolate(cs.folder_hint, { sa: session.sa })}
        </CardContent>
      </Card>
    </main>
  );
}
