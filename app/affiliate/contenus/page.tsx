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
import { ArticleCard } from "../promouvoir/components/ArticleCard";

import { EMAILS_FR, type EmailTemplate } from "../promouvoir/content/emails-fr";
import { POSTS_FR, type PostDay, type SocialPost } from "../promouvoir/content/posts-fr";
import { VISUELS_FR } from "../promouvoir/content/visuels-fr";
import { getDict, normaliseLocale } from "../i18n";
import { normaliseContentLocale, localeLabel, AFFILIATE_LIVE_LOCALES } from "@/lib/affiliate/contentLocales";
import { buildAffiliateLink } from "@/lib/affiliate/links";
import { ContentLocalePicker } from "../components/ContentLocalePicker";

export const dynamic = "force-dynamic";

export default async function ContenusPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const baseLink = buildAffiliateLink(session.locale, "/tiquiz/affiliation", session.sa);
  const displayName = session.display_name ?? session.email.split("@")[0];

  // Langue du CONTENU (≠ langue d'interface). Priorité : query param explicite
  // > langue de l'affilié > "fr". Un affilié français qui veut shooter en
  // portugais peut activer le picker et lire son matériel en PT sans changer
  // l'UI. La fallback aux modèles FR codés en dur (EMAILS_FR / POSTS_FR /
  // VISUELS_FR) n'est activée que pour la locale "fr" — pas envie de servir
  // du FR par défaut à quelqu'un qui demande du PT.
  const sp = await searchParams;
  // On ne propose que les marchés ouverts (FR/EN). Une locale hors-liste
  // (vieux lien, query forgée) retombe sur le marché de l'affilié.
  const requested = normaliseContentLocale(sp.locale ?? session.locale);
  const contentLocale = (AFFILIATE_LIVE_LOCALES as readonly string[]).includes(requested)
    ? requested
    : normaliseContentLocale(session.locale, "fr");
  const isFrLocale = contentLocale === "fr";

  const { data: ov } = await supabaseAdmin
    .from("affiliates")
    .select("promo_overrides")
    .eq("sa", session.sa)
    .maybeSingle();
  const overrides = ((ov as { promo_overrides?: Record<string, string> } | null)?.promo_overrides) ?? {};

  // Articles publiés par l'admin (gérés depuis /affiliate/admin/contenus).
  const { data: articleRows } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, title, body")
    .eq("kind", "article")
    .eq("locale", contentLocale)
    .eq("published", true)
    .order("sort_order", { ascending: true });
  const articles = (articleRows ?? []) as { id: string; title: string | null; body: string | null }[];

  // Emails : gérés en base par l'admin. Tant que rien n'est importé, on
  // retombe sur les 8 modèles par défaut FR (aucune régression). Les autres
  // langues n'ont pas de fallback : si la banque est vide en PT, on affiche
  // un état vide plutôt que servir du FR.
  const { data: emailRows } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, title, body, meta")
    .eq("kind", "email")
    .eq("locale", contentLocale)
    .eq("published", true)
    .order("sort_order", { ascending: true });
  const dbEmails: EmailTemplate[] = (emailRows ?? []).map((r) => {
    const row = r as { id: string; title: string | null; body: string | null; meta: Record<string, unknown> | null };
    return {
      id: row.id,
      subject: row.title ?? "",
      preheader: (row.meta?.preheader as string) ?? "",
      body: row.body ?? "",
      notes: (row.meta?.notes as string) ?? undefined,
    };
  });
  const emailsToShow: EmailTemplate[] = dbEmails.length ? dbEmails : isFrLocale ? EMAILS_FR : [];

  // Posts : idem — gérés en base, repli sur la séquence par défaut si vide
  // (FR uniquement).
  const { data: postRows } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, title, meta")
    .eq("kind", "post")
    .eq("locale", contentLocale)
    .eq("published", true)
    .order("sort_order", { ascending: true });
  const dbPosts: PostDay[] = (postRows ?? []).map((r) => {
    const row = r as { id: string; title: string | null; meta: Record<string, unknown> | null };
    const m = row.meta ?? {};
    return {
      id: row.id,
      dayLabel: row.title ?? "",
      theme: String(m.theme ?? ""),
      hook: String(m.hook ?? ""),
      visualPath: String(m.visualPath ?? ""),
      posts: (Array.isArray(m.posts) ? m.posts : []) as SocialPost[],
    };
  });
  const postsToShow: PostDay[] = dbPosts.length ? dbPosts : isFrLocale ? POSTS_FR : [];

  // Visuels ajoutés par l'admin (uploadés, stockés TUS) — re-signés à l'affichage.
  const { data: visualRows } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id, meta")
    .eq("kind", "visual")
    .eq("locale", contentLocale)
    .eq("published", true)
    .order("sort_order", { ascending: true });
  const adminVisuals: { id: string; url: string }[] = (visualRows ?? [])
    .map((r) => {
      const path = (r as { meta: Record<string, unknown> | null }).meta?.storagePath;
      if (typeof path !== "string" || !path) return null;
      try {
        return { id: (r as { id: string }).id, url: signedPlaybackUrl(path) };
      } catch {
        return null;
      }
    })
    .filter((v): v is { id: string; url: string } => v !== null);

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contenus</h1>
          <p className="text-muted-foreground mt-1">
            Tes emails, posts, articles et visuels prêts à copier-coller.{" "}
            <span className="text-foreground">{localeLabel(contentLocale)}</span> —
            change la langue si tu vises une autre audience.
          </p>
        </div>
        <ContentLocalePicker current={contentLocale} label="Langue du contenu" locales={AFFILIATE_LIVE_LOCALES} />
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
          {emailsToShow.length > 0 ? (
            <div className="space-y-3">
              {emailsToShow.map((email) => (
                <EmailCard
                  key={email.id}
                  email={email}
                  affiliateLink={baseLink}
                  displayName={displayName}
                  overrides={overrides}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-6 text-center space-y-2">
                <Mail className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="font-medium">
                  Aucun email en <strong>{localeLabel(contentLocale)}</strong>
                </p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Cette langue n&apos;a pas encore d&apos;emails publiés. Repasse en français ou choisis une autre langue.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="posts" className="space-y-4 mt-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 text-sm">
              <p className="font-medium mb-2">{t.promouvoir.posts_info_title}</p>
              <p className="text-muted-foreground leading-relaxed">{t.promouvoir.posts_info_body}</p>
            </CardContent>
          </Card>
          {postsToShow.length > 0 ? (
            <div className="space-y-3">
              {postsToShow.map((day) => (
                <PostDayCard
                  key={day.id}
                  day={day}
                  affiliateLink={baseLink}
                  overrides={overrides}
                  attachedVisuals={attachedFor(day.id)}
                />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-6 text-center space-y-2">
                <Share2 className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="font-medium">
                  Aucun post en <strong>{localeLabel(contentLocale)}</strong>
                </p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Cette langue n&apos;a pas encore de posts publiés. Repasse en français ou choisis une autre langue.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="articles" className="space-y-4 mt-6">
          {articles.length > 0 ? (
            <div className="space-y-3">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-6 text-center space-y-2">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="font-medium">
                  Aucun article en <strong>{localeLabel(contentLocale)}</strong>
                </p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Cette langue n&apos;a pas encore d&apos;articles publiés. Repasse en français ou choisis une autre langue.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="visuels" className="space-y-4 mt-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-5 text-sm">
              <p className="font-medium mb-2">{t.promouvoir.visuels_info_title}</p>
              <p className="text-muted-foreground leading-relaxed">{t.promouvoir.visuels_info_body}</p>
            </CardContent>
          </Card>
          {adminVisuals.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Visuels ajoutés</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {adminVisuals.map((v) => (
                  <a key={v.id} href={v.url} download className="group relative rounded-md border border-border overflow-hidden bg-muted block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.url} alt="Visuel" className="w-full h-auto block" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {isFrLocale ? (
            <VisualGallery singles={VISUELS_FR.singles} carrousel={VISUELS_FR.carrousel} />
          ) : adminVisuals.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="pt-6 pb-6 text-center space-y-2">
                <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="font-medium">Aucun visuel disponible dans cette langue</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Ajoute des visuels depuis l&apos;admin pour la langue{" "}
                  <strong>{localeLabel(contentLocale)}</strong>, ou repasse en français.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>
    </main>
  );
}
