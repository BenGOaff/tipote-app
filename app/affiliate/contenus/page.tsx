// app/affiliate/contenus/page.tsx
//
// Racine de l'espace Contenu : un dossier par produit à promouvoir.
// Chaque dossier contient les mêmes cinq rayons (emails, réseaux,
// articles, logos, générer), remplis avec le matériel du produit.

import { redirect } from "next/navigation";
import { GraduationCap, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { getDict, interpolate, normaliseLocale } from "../i18n";
import { FolderCard } from "../components/ContentNav";
import {
  contentHref,
  PRODUCT_NAME,
  PRODUCT_RATE,
} from "@/lib/affiliate/contentSpace";
import { ATELIER_EMAILS_FR } from "../promouvoir/content/atelier-emails-fr";
import { ATELIER_POSTS_FR } from "../promouvoir/content/atelier-posts-fr";
import { EMAILS_FR } from "../promouvoir/content/emails-fr";
import { POSTS_FR } from "../promouvoir/content/posts-fr";

export const dynamic = "force-dynamic";

export default async function ContenusHomePage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const isFr = normaliseLocale(session.locale) === "fr";

  const atelierMeta = interpolate(t.content_space.folder_meta, {
    emails: ATELIER_EMAILS_FR.length,
    posts: ATELIER_POSTS_FR.length,
  });
  const tiquizMeta = interpolate(t.content_space.folder_meta, {
    emails: EMAILS_FR.length,
    posts: POSTS_FR.length,
  });

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t.content_space.page_title}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t.content_space.page_subtitle}
        </p>
      </div>

      <div className={`grid gap-4 ${isFr ? "md:grid-cols-2" : ""}`}>
        {isFr && (
          <FolderCard
            href={contentHref("atelier")}
            icon={GraduationCap}
            title={interpolate(t.content_space.folder_promote, {
              product: PRODUCT_NAME.atelier,
            })}
            description={t.content_space.folder_atelier_desc}
            meta={atelierMeta}
            badge={PRODUCT_RATE.atelier}
            highlight
          />
        )}
        <FolderCard
          href={contentHref("tiquiz")}
          icon={Wrench}
          title={interpolate(t.content_space.folder_promote, {
            product: PRODUCT_NAME.tiquiz,
          })}
          description={t.content_space.folder_tiquiz_desc}
          meta={tiquizMeta}
          badge={PRODUCT_RATE.tiquiz}
        />
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {t.content_space.home_hint}
        </CardContent>
      </Card>
    </main>
  );
}
