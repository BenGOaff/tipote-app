// app/affiliate/admin/contenus/page.tsx
//
// Espace admin (Béné) : gérer les contenus affiliés en autonomie.
// V1 : les ARTICLES. Gated par isAdminEmail (independant du statut affilié).

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ContentAdmin, type ContentItem } from "./ContentAdmin";

export const dynamic = "force-dynamic";

export default async function AdminContenusPage() {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  const { data } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, kind, title, body, sort_order, published")
    .eq("kind", "article")
    .eq("locale", "fr")
    .order("sort_order", { ascending: true });
  const items = (data ?? []) as ContentItem[];

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin — Contenus</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Ajoute, édite et publie tes articles. Ils apparaissent dans l&apos;onglet Contenus des affiliés.
          </p>
        </div>
      </div>

      <ContentAdmin initial={items} kind="article" />
    </main>
  );
}
