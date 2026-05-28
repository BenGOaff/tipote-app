// app/affiliate/admin/contenus/page.tsx
//
// Espace admin (Béné) : gérer les contenus affiliés en autonomie.
// Articles + Emails + Posts + Visuels, par langue. Gated isAdminEmail.
//
// La langue est portée par le query param `?locale=xx` (défaut "fr").
// Le picker en haut filtre TOUS les onglets : tu peux gérer FR, puis
// switcher pour gérer le contenu EN, ES, etc. de manière autonome.

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signedPlaybackUrl } from "@/lib/popquiz/playback";
import { normaliseContentLocale, localeLabel } from "@/lib/affiliate/contentLocales";
import { ContentLocalePicker } from "../../components/ContentLocalePicker";
import { ContentAdmin, type ContentItem } from "./ContentAdmin";
import { PostAdmin, type PostItem } from "./PostAdmin";
import { VisualAdmin, type VisualItem } from "./VisualAdmin";

export const dynamic = "force-dynamic";

async function load(kind: string, locale: string): Promise<ContentItem[]> {
  const { data } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, kind, title, body, meta, sort_order, published")
    .eq("kind", kind)
    .eq("locale", locale)
    .order("sort_order", { ascending: true });
  return (data ?? []) as ContentItem[];
}

export default async function AdminContenusPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  const sp = await searchParams;
  const locale = normaliseContentLocale(sp.locale);

  const [articles, emails, posts, visualRows] = await Promise.all([
    load("article", locale),
    load("email", locale),
    load("post", locale),
    load("visual", locale),
  ]);
  const visuals: VisualItem[] = visualRows.map((r) => {
    const path = (r.meta as Record<string, unknown> | null)?.storagePath;
    let signedUrl: string | undefined;
    if (typeof path === "string" && path) {
      try { signedUrl = signedPlaybackUrl(path); } catch { signedUrl = undefined; }
    }
    return { id: r.id, signedUrl, published: r.published };
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin — Contenus</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Ajoute, édite et publie tes contenus. Ils apparaissent dans l&apos;onglet Contenus des affiliés
              pour la langue <strong className="text-foreground">{localeLabel(locale)}</strong>.
            </p>
          </div>
        </div>
        <ContentLocalePicker current={locale} label="Langue du contenu" />
      </div>

      <Tabs defaultValue="articles" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="visuels">Visuels</TabsTrigger>
        </TabsList>
        <TabsContent value="articles" className="mt-5">
          <ContentAdmin initial={articles} kind="article" locale={locale} />
        </TabsContent>
        <TabsContent value="emails" className="mt-5">
          <ContentAdmin initial={emails} kind="email" locale={locale} seedable />
        </TabsContent>
        <TabsContent value="posts" className="mt-5">
          <PostAdmin initial={posts as PostItem[]} locale={locale} seedable />
        </TabsContent>
        <TabsContent value="visuels" className="mt-5">
          <VisualAdmin initial={visuals} locale={locale} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
