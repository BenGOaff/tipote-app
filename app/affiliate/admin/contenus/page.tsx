// app/affiliate/admin/contenus/page.tsx
//
// Espace admin (Béné) : gérer les contenus affiliés en autonomie.
// Articles + Emails (posts & visuels à suivre). Gated isAdminEmail.

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ContentAdmin, type ContentItem } from "./ContentAdmin";
import { PostAdmin, type PostItem } from "./PostAdmin";

export const dynamic = "force-dynamic";

async function load(kind: string): Promise<ContentItem[]> {
  const { data } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, kind, title, body, meta, sort_order, published")
    .eq("kind", kind)
    .eq("locale", "fr")
    .order("sort_order", { ascending: true });
  return (data ?? []) as ContentItem[];
}

export default async function AdminContenusPage() {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  const [articles, emails, posts] = await Promise.all([load("article"), load("email"), load("post")]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin — Contenus</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Ajoute, édite et publie tes contenus. Ils apparaissent dans l&apos;onglet Contenus des affiliés.
          </p>
        </div>
      </div>

      <Tabs defaultValue="articles" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
        </TabsList>
        <TabsContent value="articles" className="mt-5">
          <ContentAdmin initial={articles} kind="article" />
        </TabsContent>
        <TabsContent value="emails" className="mt-5">
          <ContentAdmin initial={emails} kind="email" seedable />
        </TabsContent>
        <TabsContent value="posts" className="mt-5">
          <PostAdmin initial={posts as PostItem[]} seedable />
        </TabsContent>
      </Tabs>
    </main>
  );
}
