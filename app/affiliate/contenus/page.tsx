// app/affiliate/contenus/page.tsx
//
// Onglet "Contenus" : tout le matériel prêt à copier-coller, regroupé et
// organisé pour être facile à lire, éditer et copier.
//   - Emails (templates avec lien tracké injecté)
//   - Posts réseaux sociaux (3 réseaux × N jours) + visuel généré attaché
//   - Articles (à venir — bientôt gérables depuis l'admin)
//   - Visuels (banque de PNG téléchargeables)
//
// Contenu FR pour la V1 (multilang au sprint multilang complet).

import { redirect } from "next/navigation";
import { Mail, Share2, Image as ImageIcon, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signedPlaybackUrl } from "@/lib/popquiz/playback";
import { EmailCard } from "../promouvoir/components/EmailCard";
import { PostDayCard } from "../promouvoir/components/PostDayCard";
import { VisualGallery } from "../promouvoir/components/VisualGallery";

import { EMAILS_FR } from "../promouvoir/content/emails-fr";
import { POSTS_FR } from "../promouvoir/content/posts-fr";
import { VISUELS_FR } from "../promouvoir/content/visuels-fr";
import { getDict, normaliseLocale } from "../i18n";

export const dynamic = "force-dynamic";

export default async function ContenusPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const baseLink = `https://www.tipote.fr/tiquiz/affiliation?sa=${session.sa}`;
  const displayName = session.display_name ?? session.email.split("@")[0];

  const { data: ov } = await supabaseAdmin
    .from("affiliates")
    .select("promo_overrides")
    .eq("sa", session.sa)
    .maybeSingle();
  const overrides = ((ov as { promo_overrides?: Record<string, string> } | null)?.promo_overrides) ?? {};

  // Visuels accrochés à un post : on a persisté les CHEMINS de stockage (TUS,
  // long terme) ; on re-signe une URL de lecture fraîche à chaque affichage
  // (les URLs signées expirent en 2 h, pas le fichier).
  const attachedFor = (dayId: string): { path: string; url: string }[] => {
    const raw = overrides[`post:${dayId}:visuals`];
    if (typeof raw !== "string") return [];
    try {
      const paths = JSON.parse(raw);
      if (!Array.isArray(paths)) return [];
      return paths
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .map((p) => {
          try {
            return { path: p, url: signedPlaybackUrl(p) };
          } catch {
            return null;
          }
        })
        .filter((v): v is { path: string; url: string } => v !== null);
    } catch {
      return [];
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contenus</h1>
        <p className="text-muted-foreground mt-1">
          Tes emails, posts, articles et visuels prêts à copier-coller. Édite, copie, publie.
        </p>
      </div>

      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="emails" className="gap-1.5">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">{t.promouvoir.tab_emails}</span>
          </TabsTrigger>
          <TabsTrigger value="posts" className="gap-1.5">
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t.promouvoir.tab_posts}</span>
          </TabsTrigger>
          <TabsTrigger value="articles" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Articles</span>
          </TabsTrigger>
          <TabsTrigger value="visuels" className="gap-1.5">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.promouvoir.tab_visuels}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emails" className="space-y-4 mt-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 text-sm">
              <p className="font-medium mb-2">{t.promouvoir.emails_info_title}</p>
              <p className="text-muted-foreground leading-relaxed">{t.promouvoir.emails_info_body}</p>
            </CardContent>
          </Card>
          <div className="space-y-3">
            {EMAILS_FR.map((email) => (
              <EmailCard
                key={email.id}
                email={email}
                affiliateLink={baseLink}
                displayName={displayName}
                overrides={overrides}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="posts" className="space-y-4 mt-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 text-sm">
              <p className="font-medium mb-2">{t.promouvoir.posts_info_title}</p>
              <p className="text-muted-foreground leading-relaxed">{t.promouvoir.posts_info_body}</p>
            </CardContent>
          </Card>
          <div className="space-y-3">
            {POSTS_FR.map((day) => (
              <PostDayCard
                key={day.id}
                day={day}
                affiliateLink={baseLink}
                overrides={overrides}
                attachedVisuals={attachedFor(day.id)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="articles" className="space-y-4 mt-6">
          <Card className="border-dashed">
            <CardContent className="pt-6 pb-6 text-center space-y-2">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="font-medium">Articles — bientôt</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Des articles prêts à publier (blog, newsletter) arrivent ici. Ils seront gérables et
                ajoutables depuis l&apos;espace admin.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visuels" className="space-y-4 mt-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 text-sm">
              <p className="font-medium mb-2">{t.promouvoir.visuels_info_title}</p>
              <p className="text-muted-foreground leading-relaxed">{t.promouvoir.visuels_info_body}</p>
            </CardContent>
          </Card>
          <VisualGallery singles={VISUELS_FR.singles} carrousel={VISUELS_FR.carrousel} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
