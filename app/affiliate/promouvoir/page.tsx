// app/affiliate/promouvoir/page.tsx
//
// Onglet "Promouvoir" : tout le matos prêt à copier-coller pour les
// affiliés. 4 sections :
//   - Liens trackés (4 URLs avec destinations différentes, copie 1-clic)
//   - Emails (8 templates avec lien tracké injecté + bouton tout copier)
//   - Posts réseaux sociaux (24 versions, 3 réseaux × 8 jours)
//   - Visuels (18 PNG téléchargeables individuellement)
//
// Tout le contenu est en français pour la V1. Les contenus EN/ES/IT/PT/AR
// seront ajoutés au sprint 3 (multilang complet).

import { redirect } from "next/navigation";
import { Mail, Share2, Image as ImageIcon, Link2, FileText, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AffiliateLinkCopy from "../components/AffiliateLinkCopy";
import { EmailCard } from "./components/EmailCard";
import { PostDayCard } from "./components/PostDayCard";
import { VisualGallery } from "./components/VisualGallery";

import { EMAILS_FR } from "./content/emails-fr";
import { POSTS_FR } from "./content/posts-fr";
import { VISUELS_FR } from "./content/visuels-fr";
import { getDict, interpolate, normaliseLocale } from "../i18n";

export const dynamic = "force-dynamic";

const LINK_DESTINATIONS = [
  {
    label: "Page Tiquiz principale",
    description: "La page d'accueil affiliation Tiquiz, recommandée par défaut.",
    path: "/tiquiz/affiliation",
  },
  {
    label: "Tiquiz essai gratuit",
    description: "Compte gratuit à vie : 1 quiz, 10 réponses/mois, sans CB.",
    path: "/part-tiquiz-gratuit",
  },
  {
    label: "Tiquiz mensuel (9 €/mois)",
    description: "Quiz et réponses illimités, sans engagement.",
    path: "/part-tiquiz-mensuel",
  },
  {
    label: "Tiquiz annuel (90 €/an)",
    description: "2 mois offerts vs mensuel.",
    path: "/part-tiquiz-annuel",
  },
  {
    label: "Page Tipote principale",
    description: "Affiliation Tipote (l'extension de pod d'engagement LinkedIn).",
    path: "/affiliation",
  },
  {
    label: "Commande Tipote",
    description: "Page de commande directe Tipote.",
    path: "/commande",
  },
];

export default async function PromouvoirPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const baseLink = `https://www.tipote.fr/tiquiz/affiliation?sa=${session.sa}`;
  const displayName = session.display_name ?? session.email.split("@")[0];

  // Versions perso des textes promo (emails/posts) sauvegardées par
  // l'affilié. Vide = modèles d'origine. Cf. /affiliate/api/promo.
  const { data: ov } = await supabaseAdmin
    .from("affiliates")
    .select("promo_overrides")
    .eq("sa", session.sa)
    .maybeSingle();
  const overrides = ((ov as { promo_overrides?: Record<string, string> } | null)?.promo_overrides) ?? {};

  return (
    <>
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.promouvoir.page_title}</h1>
          <p className="text-muted-foreground mt-1">{t.promouvoir.page_subtitle}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              {t.promouvoir.main_link_title}
            </CardTitle>
            <CardDescription>{t.promouvoir.main_link_description}</CardDescription>
          </CardHeader>
          <CardContent>
            <AffiliateLinkCopy url={baseLink} />
          </CardContent>
        </Card>

        <Tabs defaultValue="links" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="links" className="gap-1.5">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t.promouvoir.tab_links}</span>
            </TabsTrigger>
            <TabsTrigger value="emails" className="gap-1.5">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">{t.promouvoir.tab_emails}</span>
            </TabsTrigger>
            <TabsTrigger value="posts" className="gap-1.5">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t.promouvoir.tab_posts}</span>
            </TabsTrigger>
            <TabsTrigger value="visuels" className="gap-1.5">
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.promouvoir.tab_visuels}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="links" className="space-y-4 mt-6">
            <div className="space-y-3">
              {LINK_DESTINATIONS.map((dest) => {
                const url = `https://www.tipote.fr${dest.path}?sa=${session.sa}`;
                return (
                  <Card key={dest.path}>
                    <CardContent className="pt-5 space-y-3">
                      <div>
                        <p className="font-medium">{dest.label}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {dest.description}
                        </p>
                      </div>
                      <AffiliateLinkCopy url={url} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Card className="border-dashed bg-muted/30">
              <CardContent className="pt-5 text-sm text-muted-foreground">
                {interpolate(t.promouvoir.links_info, { sa: session.sa })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="emails" className="space-y-4 mt-6">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-5 text-sm">
                <p className="font-medium mb-2">{t.promouvoir.emails_info_title}</p>
                <p className="text-muted-foreground leading-relaxed">
                  {t.promouvoir.emails_info_body}
                </p>
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
                <p className="text-muted-foreground leading-relaxed">
                  {t.promouvoir.posts_info_body}
                </p>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {POSTS_FR.map((day) => (
                <PostDayCard key={day.id} day={day} affiliateLink={baseLink} overrides={overrides} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="visuels" className="space-y-4 mt-6">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-5 text-sm">
                <p className="font-medium mb-2">{t.promouvoir.visuels_info_title}</p>
                <p className="text-muted-foreground leading-relaxed">
                  {t.promouvoir.visuels_info_body}
                </p>
              </CardContent>
            </Card>
            <VisualGallery
              singles={VISUELS_FR.singles}
              carrousel={VISUELS_FR.carrousel}
            />
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              {t.promouvoir.conditions_title}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>{t.promouvoir.conditions_cookie}</p>
            <p>{t.promouvoir.conditions_lasttouch}</p>
            <p>{t.promouvoir.conditions_tiers}</p>
            <Button variant="outline" asChild className="mt-2">
              <a
                href="https://www.tipote.fr/conditions-generales-affiliation"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.promouvoir.see_full_terms}
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
